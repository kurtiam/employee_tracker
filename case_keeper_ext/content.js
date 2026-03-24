// Elastic Case Search Extension
console.log('[ELASTIC CASE SEARCH] Extension loaded');

let currentCaseNumber = '';
let currentCaseId = '';
let detectCurrentPageCaseFn = null; // set inside createSearchBar; called by SPA observer
const followStatusCache = new Map(); // caseId → true (following) | false (not following)

function createSearchBar() {
  // Prevent duplicate injection
  if (document.getElementById('elastic-case-search-ext')) {
    console.log('[ELASTIC CASE SEARCH] Already exists, skipping');
    return;
  }

  console.log('[ELASTIC CASE SEARCH] Creating search bar');

  // UI constants
  const Z_INDEX_CONTAINER = 999;
  const Z_INDEX_NOTE_MODAL = 2000;
  const MAX_STORED_CASES = 20;

  // Detect background color and text color
  const bodyBg = window.getComputedStyle(document.body).backgroundColor;
  const rootBg = document.getElementById('root') ? window.getComputedStyle(document.getElementById('root')).backgroundColor : bodyBg;
  const detectedBg = rootBg !== 'rgba(0, 0, 0, 0)' ? rootBg : bodyBg;
  
  // Detect the page's text color
  const bodyTextColor = window.getComputedStyle(document.body).color;
  const rootTextColor = document.getElementById('root') ? window.getComputedStyle(document.getElementById('root')).color : bodyTextColor;
  const detectedTextColor = rootTextColor || bodyTextColor || '#FFF';
  
  // Determine if light mode by checking brightness of text color
  // Extract RGB values and calculate brightness
  const rgbMatch = detectedTextColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  let isLightMode = false;
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);
    const brightness = (r + g + b) / 3;
    // If text is dark (brightness < 128), it's light mode
    isLightMode = brightness < 128;
  }
  
  console.log('[ELASTIC CASE SEARCH] Text color:', detectedTextColor, '| isLightMode:', isLightMode);

  // Theme color constants (light/dark mode pairs)
  const THEME = {
    modalBg:       isLightMode ? '#ffffff'               : '#1f2933',
    modalText:     isLightMode ? '#111827'               : '#e5e7eb',
    modalBorder:   isLightMode ? '#e5e7eb'               : '#374151',
    inputBorder:   isLightMode ? '#d1d5db'               : '#4b5563',
    inputBg:       isLightMode ? '#f9fafb'               : '#111827',
    subscribeColor:isLightMode ? '#2563EB'               : '#93C5FD',
    noteColor:     isLightMode ? '#0A7C4A'               : '#7CF29C',
    infoBoxBg:     isLightMode ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.35)',
    infoBoxBorder: isLightMode ? 'rgba(0,0,0,0.15)'     : 'rgba(255,255,255,0.15)',
  };

  // Create container
  const container = document.createElement('div');
  container.id = 'elastic-case-search-ext';
  container.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    background: ${detectedBg};
    padding: 8px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    z-index: ${Z_INDEX_CONTAINER};
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
  `;

  // Label (removed)
  // const label = document.createElement('span');
  // label.textContent = 'Case:';
  // label.style.cssText = `
  //   color: #DFE5EF;
  //   font-size: 13px;
  //   font-weight: 500;
  //   white-space: nowrap;
  // `;

  // Show/Hide toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.innerHTML = '+';
  toggleBtn.title = 'Show search bar';
  toggleBtn.style.cssText = `
    padding: 4px 8px;
    background: rgba(76, 175, 80, 0.3);
    color: #4CAF50;
    border: 1px solid rgba(76, 175, 80, 0.5);
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
    display: none;
    transition: all 0.2s ease;
  `;

  toggleBtn.addEventListener('mouseover', () => {
    toggleBtn.style.background = 'rgba(76, 175, 80, 0.5)';
    toggleBtn.style.color = '#fff';
  });

  toggleBtn.addEventListener('mouseout', () => {
    toggleBtn.style.background = 'rgba(76, 175, 80, 0.3)';
    toggleBtn.style.color = '#4CAF50';
  });

  // Case info display
  const infoBox = document.createElement('div');
  infoBox.id = 'case-info-display';
  infoBox.style.cssText = `
    color: #FFF;
    font-size: 12px;
    display: none;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: ${THEME.infoBoxBg};
    border: 1px solid ${THEME.infoBoxBorder};
    border-radius: 10px;
    padding: 8px;
    backdrop-filter: blur(6px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  `;

  // Current-page auto-detected case section (shown above manual cases)
  const currentPageCaseDiv = document.createElement('div');
  currentPageCaseDiv.id = 'elastic-current-page-case-section';
  currentPageCaseDiv.style.cssText = `
    display: none;
    flex-direction: column;
    gap: 4px;
    background: ${THEME.infoBoxBg};
    border: 1px solid rgba(14, 165, 233, 0.3);
    border-radius: 10px;
    padding: 6px 8px;
    backdrop-filter: blur(6px);
    box-shadow: 0 4px 16px rgba(14,165,233,0.12);
  `;

  let currentPageEntry = null;        // not persisted to localStorage
  let currentPageMinimized = true;    // collapse details (subject/status/owner) by default
  let viewingCaseSectionHidden = false; // collapse entire Viewing Case section
  let caseVaultSectionHidden = false;   // collapse entire Case Vault section

  // Toggle button to hide/show the result box
  const toggleResultsBtn = document.createElement('button');
  toggleResultsBtn.textContent = '▼';
  toggleResultsBtn.title = 'Hide results';
  toggleResultsBtn.style.cssText = `
    padding: 6px 8px;
    background: transparent;
    color: ${isLightMode ? '#1d4ed8' : '#93c5fd'};
    border: none;
    border-left: 1px solid ${isLightMode ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'};
    border-radius: 0;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
    line-height: 1;
    white-space: nowrap;
    transition: opacity 0.2s ease;
    box-shadow: none;
    margin: 0;
    outline: none;
    flex-shrink: 0;
    opacity: 0.75;
  `;
  toggleResultsBtn.addEventListener('mouseover', () => { toggleResultsBtn.style.opacity = '1'; });
  toggleResultsBtn.addEventListener('mouseout',  () => { toggleResultsBtn.style.opacity = '0.75'; });

  // Hide entire bar button — same effect as right-clicking the input container
  const hideBarBtn = document.createElement('button');
  hideBarBtn.textContent = '—';
  hideBarBtn.title = 'Hide search bar';
  hideBarBtn.style.cssText = `
    padding: 6px 8px;
    background: transparent;
    color: ${isLightMode ? '#b91c1c' : '#fca5a5'};
    border: none;
    border-left: 1px solid ${isLightMode ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'};
    border-radius: 0;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
    line-height: 1;
    white-space: nowrap;
    transition: opacity 0.2s ease;
    box-shadow: none;
    margin: 0;
    outline: none;
    flex-shrink: 0;
    opacity: 0.75;
  `;
  hideBarBtn.addEventListener('click', () => {
    wrapper.style.display = 'none';
    toggleBtn.style.display = 'block';
    barIsHidden = true;
    saveBarState();
  });
  hideBarBtn.addEventListener('mouseover', () => { hideBarBtn.style.opacity = '1'; });
  hideBarBtn.addEventListener('mouseout',  () => { hideBarBtn.style.opacity = '0.8'; });

  const RESULTS_VISIBILITY_KEY = 'elastic-case-search-results-visible';

  const showResults = () => {
    if (currentPageEntry) currentPageCaseDiv.style.display = 'flex';
    infoBox.style.display = 'flex';
    toggleResultsBtn.textContent = '▼';
    toggleResultsBtn.title = 'Hide results';
    localStorage.setItem(RESULTS_VISIBILITY_KEY, 'true');
  };

  const hideResults = () => {
    currentPageCaseDiv.style.display = 'none';
    infoBox.style.display = 'none';
    toggleResultsBtn.textContent = '▲';
    toggleResultsBtn.title = 'Show results';
    localStorage.setItem(RESULTS_VISIBILITY_KEY, 'false');
  };

  const loadResultsVisibility = () => {
    try {
      const saved = localStorage.getItem(RESULTS_VISIBILITY_KEY);
      if (saved === 'false') {
        hideResults();
      } else {
        showResults();
      }
    } catch (err) {
      console.warn('[ELASTIC CASE SEARCH] Failed to load results visibility:', err);
    }
  };

  toggleResultsBtn.addEventListener('click', () => {
    const infoHidden = infoBox.style.display === 'none' || infoBox.style.display === '';
    const cpHidden   = currentPageCaseDiv.style.display === 'none' || currentPageCaseDiv.style.display === '';
    if (infoHidden && cpHidden) {
      showResults();
    } else {
      hideResults();
    }
  });

  // Persisted results helpers
  const STORAGE_KEY = 'elastic-case-search-results';
  const BAR_STATE_KEY = 'elastic-case-search-bar-state';
  let storedResults = [];
  let barIsHidden = false;

  const loadStoredResults = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      storedResults = Array.isArray(parsed)
        ? parsed.map((r) => ({ ...r, note: r.note || '', hidden: r.hidden || false }))
        : [];
    } catch (err) {
      console.warn('[ELASTIC CASE SEARCH] Failed to load stored results:', err);
      storedResults = [];
    }
  };

  const saveStoredResults = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedResults.slice(-MAX_STORED_CASES)));
    } catch (err) {
      console.warn('[ELASTIC CASE SEARCH] Failed to save results:', err);
    }
  };

  const loadBarState = () => {
    try {
      const saved = localStorage.getItem(BAR_STATE_KEY);
      barIsHidden = saved ? JSON.parse(saved) : false;
    } catch (err) {
      console.warn('[ELASTIC CASE SEARCH] Failed to load bar state:', err);
      barIsHidden = false;
    }
  };

  const saveBarState = () => {
    try {
      localStorage.setItem(BAR_STATE_KEY, JSON.stringify(barIsHidden));
    } catch (err) {
      console.warn('[ELASTIC CASE SEARCH] Failed to save bar state:', err);
    }
  };

  const renderResults = () => {
    infoBox.innerHTML = '';

    infoBox.style.display = 'flex';
    infoBox.style.flexDirection = 'column';

    // ── Case Vault header ──────────────────────────────────────────────────────
    const vaultHeader = document.createElement('div');
    vaultHeader.style.cssText = `display:flex;align-items:center;gap:6px;padding:0 4px 4px;`;

    const vaultLabel = document.createElement('span');
    vaultLabel.textContent = 'Case Vault';
    vaultLabel.style.cssText = `font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${detectedTextColor};opacity:0.55;flex:1;`;

    // Adjust top border-radius: flatten when Viewing Case is directly above
    const vaultHasViewingAbove = !!currentPageEntry;
    infoBox.style.borderTopLeftRadius  = vaultHasViewingAbove ? '0' : '10px';
    infoBox.style.borderTopRightRadius = vaultHasViewingAbove ? '0' : '10px';

    const btnStyle = `background:transparent;border:none;cursor:pointer;padding:1px 3px;font-size:11px;font-weight:bold;flex-shrink:0;opacity:0.5;transition:opacity 0.15s;`;

    const hideAllBtn = document.createElement('button');
    hideAllBtn.textContent = '◀';
    hideAllBtn.title = 'Hide all';
    hideAllBtn.style.cssText = `${btnStyle}color:#14B8A6;` + (caseVaultSectionHidden ? 'display:none;' : '');
    hideAllBtn.addEventListener('mouseover', () => { hideAllBtn.style.opacity = '1'; });
    hideAllBtn.addEventListener('mouseout',  () => { hideAllBtn.style.opacity = '0.5'; });
    hideAllBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      storedResults = storedResults.map(r => ({ ...r, hidden: true }));
      saveStoredResults();
      renderResults();
    });

    const expandAllBtn = document.createElement('button');
    expandAllBtn.textContent = '▶';
    expandAllBtn.title = 'Expand all';
    expandAllBtn.style.cssText = `${btnStyle}color:#14B8A6;` + (caseVaultSectionHidden ? 'display:none;' : '');
    expandAllBtn.addEventListener('mouseover', () => { expandAllBtn.style.opacity = '1'; });
    expandAllBtn.addEventListener('mouseout',  () => { expandAllBtn.style.opacity = '0.5'; });
    expandAllBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      storedResults = storedResults.map(r => ({ ...r, hidden: false }));
      saveStoredResults();
      renderResults();
    });

    const closeAllBtn = document.createElement('button');
    closeAllBtn.textContent = '✕';
    closeAllBtn.title = 'Empty vault';
    closeAllBtn.style.cssText = `${btnStyle}color:#FF6B6B;` + (caseVaultSectionHidden ? 'display:none;' : '');
    closeAllBtn.addEventListener('mouseover', () => { closeAllBtn.style.opacity = '1'; });
    closeAllBtn.addEventListener('mouseout',  () => { closeAllBtn.style.opacity = '0.5'; });
    closeAllBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      storedResults = [];
      saveStoredResults();
      renderResults();
    });

    // — / ▲ — hide/show entire Case Vault section
    const vaultSectionToggle = document.createElement('button');
    vaultSectionToggle.textContent = caseVaultSectionHidden ? '▲' : '—';
    vaultSectionToggle.title   = caseVaultSectionHidden ? 'Show section' : 'Hide section';
    vaultSectionToggle.style.cssText = `${btnStyle}color:${detectedTextColor};`;
    vaultSectionToggle.addEventListener('mouseover', () => { vaultSectionToggle.style.opacity = '1'; });
    vaultSectionToggle.addEventListener('mouseout',  () => { vaultSectionToggle.style.opacity = '0.5'; });
    vaultSectionToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      caseVaultSectionHidden = !caseVaultSectionHidden;
      renderResults();
      // Also update adjacent border-radius on the Viewing Case section
      if (currentPageEntry) renderCurrentPageCase();
    });

    // Export button
    const exportBtn = document.createElement('button');
    exportBtn.textContent = '↓';
    exportBtn.title = 'Export vault to JSON file';
    exportBtn.style.cssText = `${btnStyle}color:#14B8A6;` + (caseVaultSectionHidden ? 'display:none;' : '');
    exportBtn.addEventListener('mouseover', () => { exportBtn.style.opacity = '1'; });
    exportBtn.addEventListener('mouseout',  () => { exportBtn.style.opacity = '0.5'; });
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const json = JSON.stringify(storedResults, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `case-vault-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Import button + hidden file input
    const importBtn = document.createElement('button');
    importBtn.textContent = '↑';
    importBtn.title = 'Import vault from JSON file';
    importBtn.style.cssText = `${btnStyle}color:#14B8A6;` + (caseVaultSectionHidden ? 'display:none;' : '');
    importBtn.addEventListener('mouseover', () => { importBtn.style.opacity = '1'; });
    importBtn.addEventListener('mouseout',  () => { importBtn.style.opacity = '0.5'; });

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const imported = JSON.parse(ev.target.result);
          if (!Array.isArray(imported)) throw new Error('Expected an array');
          // Merge: imported cases replace existing ones with the same case number; new ones are appended
          const merged = [...storedResults];
          for (const c of imported) {
            if (!c.caseNumber) continue;
            const idx = merged.findIndex(r => r.caseNumber === c.caseNumber);
            if (idx >= 0) merged[idx] = c;
            else merged.push(c);
          }
          storedResults = merged.slice(-MAX_STORED_CASES);
          saveStoredResults();
          renderResults();
          showResults();
          // Refresh each imported case with latest API data
          for (const c of imported) {
            if (c.caseNumber) refreshSingleCase(c.caseNumber);
          }
        } catch (err) {
          alert('Import failed: ' + err.message);
        }
        fileInput.value = '';
      };
      reader.readAsText(file);
    });
    importBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    vaultHeader.appendChild(vaultLabel);
    vaultHeader.appendChild(exportBtn);
    vaultHeader.appendChild(importBtn);
    vaultHeader.appendChild(hideAllBtn);
    vaultHeader.appendChild(expandAllBtn);
    vaultHeader.appendChild(closeAllBtn);
    vaultHeader.appendChild(vaultSectionToggle);
    vaultHeader.appendChild(fileInput);
    infoBox.appendChild(vaultHeader);
    // ──────────────────────────────────────────────────────────────────────────

    if (caseVaultSectionHidden) return; // show only header when section is collapsed

    if (!storedResults.length) {
      const emptyMsg = document.createElement('span');
      emptyMsg.textContent = 'Vault is empty — use ↑ to import or add a case';
      emptyMsg.style.cssText = `font-size:11px;opacity:0.4;padding:4px 8px;color:${detectedTextColor};`;
      infoBox.appendChild(emptyMsg);
      return;
    }

    let draggedItem = null;

    // Left-click on infoBox background to hide all results
    infoBox.addEventListener('click', (evt) => {
      if (evt.target === infoBox) {
        storedResults = storedResults.map((r) => ({ ...r, hidden: true }));
        saveStoredResults();
        renderResults();
      }
    });

    // Right-click on infoBox background to show all results
    infoBox.addEventListener('contextmenu', (evt) => {
      if (evt.target === infoBox) {
        evt.preventDefault();
        storedResults = storedResults.map((r) => ({ ...r, hidden: false }));
        saveStoredResults();
        renderResults();
      }
    });

    storedResults.forEach((entry) => {
      const resultItem = document.createElement('div');
      resultItem.dataset.caseNumber = entry.caseNumber;
      resultItem.draggable = true;
      resultItem.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        background: rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(8px);
        border-radius: 8px;
        white-space: nowrap;
        border: 1px solid rgba(150, 150, 150, 0.3);
        cursor: grab;
        transition: all 0.15s ease;
      `;

      // Subtly mark the row that is currently being viewed
      const isViewing = currentPageEntry && currentPageEntry.caseNumber === entry.caseNumber;
      if (isViewing && !entry.hidden) {
        resultItem.style.background = 'rgba(14,165,233,0.08)';
        resultItem.style.borderColor = 'rgba(14,165,233,0.5)';
        resultItem.style.borderLeftWidth = '3px';
        resultItem.style.paddingLeft = '8px';
      }

      // Apply hidden state from storage
      if (entry.hidden) {
        resultItem.dataset.hidden = 'true';
        resultItem.style.border = 'none';
        resultItem.style.padding = '0';
        resultItem.style.background = 'none';
        resultItem.style.backdropFilter = 'none';
        resultItem.style.borderRadius = '0';
      }

      resultItem.addEventListener('mouseover', () => {
        if (resultItem.dataset.hidden !== 'true') {
          resultItem.style.background = 'rgba(255, 255, 255, 0.12)';
        }
      });

      resultItem.addEventListener('mouseout', () => {
        if (resultItem.dataset.hidden !== 'true') {
          resultItem.style.background = 'rgba(255, 255, 255, 0.08)';
        }
      });

      // Salesforce button for result item
      const sfBtn = document.createElement('button');
      sfBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(135, 206, 235, 0.7)"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>';
      sfBtn.title = 'Open in Salesforce';
      sfBtn.style.cssText = `
        padding: 2px;
        background: transparent;
        color: inherit;
        border: none;
        border-radius: 0;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        white-space: nowrap;
        transition: all 0.2s ease;
        margin: 0;
        flex-shrink: 0;
        display: flex;
        align-items: center;
      `;
      
      sfBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const sfUrl = `https://elastic.my.salesforce.com/console#/${entry.caseId}`;
        window.open(sfUrl, '_blank');
      });

      sfBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const sfUrl = `https://elastic.my.salesforce.com/console#/${entry.caseId}`;
        navigator.clipboard.writeText(sfUrl).then(() => {
          sfBtn.innerHTML = '✓';
          setTimeout(() => {
            sfBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>';
          }, 1200);
        }).catch(err => {
          console.error('[ELASTIC CASE SEARCH] Copy failed:', err);
        });
      });

      sfBtn.addEventListener('mouseover', () => {
        sfBtn.style.opacity = '1';
      });

      sfBtn.addEventListener('mouseout', () => {
        sfBtn.style.opacity = '0.6';
      });

      // Subscribe button (opens VF helper page with the button server-side)
      const subscribeBtn = document.createElement('button');
      const followIcon = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
      subscribeBtn.innerHTML = followIcon;
      subscribeBtn.title = 'Follow case';
      subscribeBtn.dataset.followCaseId = entry.caseId;
      subscribeBtn.style.cssText = `padding:2px;background:transparent;color:${THEME.subscribeColor};border:none;border-radius:0;cursor:pointer;font-size:12px;line-height:1;white-space:nowrap;transition:all 0.2s ease;margin:0;flex-shrink:0;display:flex;align-items:center;`;

      const vfUrl = `https://elastic--c.vf.force.com/apex/SupportConsoleSidebarButtons?id=${entry.caseId}&isdtp=vw&cn=${encodeURIComponent(entry.caseNumber || '')}`;

      subscribeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) { window.open(vfUrl, '_blank'); return; }
        window.open(vfUrl, e.shiftKey ? '' : '', 'width=480,height=240,left=220,top=240,resizable=yes,scrollbars=yes');
      });
      subscribeBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        navigator.clipboard.writeText(vfUrl).then(() => {
          subscribeBtn.textContent = '✓';
          setTimeout(() => { subscribeBtn.innerHTML = followIcon; }, 1200);
        }).catch(err => console.error('[ELASTIC CASE SEARCH] Copy failed:', err));
      });
      subscribeBtn.addEventListener('mouseover', () => { subscribeBtn.style.opacity = '1'; });
      subscribeBtn.addEventListener('mouseout',  () => {
        subscribeBtn.style.opacity = followStatusCache.get(entry.caseId) === true ? '1' : '0.45';
      });
      checkFollowStatus(entry.caseId, subscribeBtn);

      const caseLink = document.createElement('a');
      caseLink.textContent = entry.caseNumber;
      caseLink.href = entry.url;
      caseLink.style.cssText = `color: #0EA5E9; text-decoration: underline; cursor: pointer; font-weight: 600; min-width: 60px; display: inline-block;`;
      caseLink.addEventListener('click', (e) => {
        // Shift + Click opens in new floating window
        if (e.shiftKey) {
          e.preventDefault();
          window.open(entry.url, '', 'width=1200,height=800,left=100,top=100,resizable=yes,scrollbars=yes');
        }
        // Command + Click on Mac or Ctrl + Click on Windows/Linux opens in new tab
        else if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          window.open(entry.url, '_blank');
        } else {
          e.preventDefault();
          window.location.href = entry.url;
        }
      });
      caseLink.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        window.open(entry.url, '_blank');
      });

      const textSpan = document.createElement('span');
      textSpan.dataset.text = 'true';
      textSpan.textContent = ` | ${entry.subject} | ${entry.status} | ${entry.owner}`;
      textSpan.style.cssText = `flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${detectedTextColor};`;

      const rowRefreshBtn = document.createElement('span');
      rowRefreshBtn.textContent = '↻';
      rowRefreshBtn.title = 'Refresh case';
      rowRefreshBtn.style.cssText = `color: #14B8A6; opacity: 0.5; font-weight: bold; cursor: pointer; flex-shrink: 0;`;
      rowRefreshBtn.addEventListener('mouseover', () => { rowRefreshBtn.style.opacity = '1'; });
      rowRefreshBtn.addEventListener('mouseout',  () => { rowRefreshBtn.style.opacity = '0.5'; });
      rowRefreshBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        rowRefreshBtn.textContent = '⌛';
        rowRefreshBtn.style.pointerEvents = 'none';
        await refreshSingleCase(entry.caseNumber);
        rowRefreshBtn.textContent = '↻';
        rowRefreshBtn.style.pointerEvents = 'auto';
      });

      const copyBtn = document.createElement('span');
      copyBtn.textContent = '⧉';
      copyBtn.title = 'Copy case details';
      copyBtn.style.cssText = `color:${detectedTextColor};opacity:0.5;font-weight:bold;cursor:pointer;flex-shrink:0;font-size:12px;`;
      copyBtn.addEventListener('mouseover', () => { copyBtn.style.opacity = '1'; });
      copyBtn.addEventListener('mouseout',  () => { copyBtn.style.opacity = '0.5'; });
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = `Case Number: [${entry.caseNumber}](${entry.url})\nSubject: ${entry.subject}\nStatus: ${entry.status}\nOwner: ${entry.owner}\nPriority: ${entry.priority}\nSupport Level: ${entry.supportLevel}\nSupport Region: ${entry.supportRegion}\nNote: ${entry.note || 'None'}`;
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.textContent = '✓';
          setTimeout(() => { copyBtn.textContent = '⧉'; }, 1200);
        }).catch(err => console.error('[ELASTIC CASE SEARCH] Copy failed:', err));
      });

      resultItem.appendChild(subscribeBtn);
      resultItem.appendChild(sfBtn);
      resultItem.appendChild(rowRefreshBtn);
      resultItem.appendChild(copyBtn);
      resultItem.appendChild(caseLink);
      resultItem.appendChild(makeCaseLinkCopyBtn(entry.caseNumber, entry.url));
      resultItem.appendChild(textSpan);
      let notePreview = null;
      if (entry.note) {
        notePreview = document.createElement('span');
        notePreview.textContent = `📝 ${entry.note}`;
        notePreview.style.cssText = 'max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: #B6C2D2;';
        notePreview.title = entry.note;
        resultItem.appendChild(notePreview);
      }

      const noteBtn = document.createElement('span');
      noteBtn.textContent = '+';
      noteBtn.title = 'Add note';
      noteBtn.style.cssText = `color: ${THEME.noteColor}; font-weight: bold; cursor: pointer; flex-shrink: 0; margin-left: auto;`;
      noteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentNote = entry.note || '';
        openNoteEditor(noteBtn, currentNote, (cleaned) => {
          storedResults = storedResults.map((r) =>
            r.caseNumber === entry.caseNumber ? { ...r, note: cleaned } : r
          );
          saveStoredResults();
          renderResults();
          if (currentPageEntry && currentPageEntry.caseNumber === entry.caseNumber) {
            currentPageEntry = { ...currentPageEntry, note: cleaned };
            renderCurrentPageCase();
          }
        });
      });

      const hideBtn = document.createElement('span');
      hideBtn.textContent = entry.hidden ? '▶' : '◀';
      hideBtn.title = entry.hidden ? 'Show' : 'Hide (keeps in storage)';
      hideBtn.style.cssText = `color: #14B8A6; opacity: 0.3; font-weight: bold; cursor: pointer; flex-shrink: 0;`;
      hideBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = resultItem.dataset.hidden === 'true';
        if (isHidden) {
          // Restore full view
          resultItem.dataset.hidden = 'false';
          resultItem.style.border = '1px solid rgba(150, 150, 150, 0.3)';
          resultItem.style.padding = '6px 10px';
          resultItem.style.background = 'rgba(255, 255, 255, 0.08)';
          resultItem.style.backdropFilter = 'blur(8px)';
          resultItem.style.borderRadius = '8px';
          textSpan.style.display = '';
          if (notePreview) notePreview.style.display = '';
          noteBtn.style.display = '';
          deleteNoteBtn.style.display = '';
          closeBtn.style.display = '';
          deleteHiddenBtn.style.display = 'none';
          hideBtn.textContent = '◀';
          hideBtn.title = 'Hide (keeps in storage)';
          // Update storage
          storedResults = storedResults.map((r) =>
            r.caseNumber === entry.caseNumber ? { ...r, hidden: false } : r
          );
        } else {
          // Hide to just case number
          resultItem.dataset.hidden = 'true';
          resultItem.style.border = 'none';
          resultItem.style.padding = '0';
          resultItem.style.background = 'none';
          resultItem.style.backdropFilter = 'none';
          resultItem.style.borderRadius = '0';
          textSpan.style.display = 'none';
          if (notePreview) notePreview.style.display = 'none';
          noteBtn.style.display = 'none';
          deleteNoteBtn.style.display = 'none';
          closeBtn.style.display = 'none';
          deleteHiddenBtn.style.display = '';
          hideBtn.textContent = '▶';
          hideBtn.title = 'Show';
          // Update storage
          storedResults = storedResults.map((r) =>
            r.caseNumber === entry.caseNumber ? { ...r, hidden: true } : r
          );
        }
        saveStoredResults();
      });

      const deleteHiddenBtn = document.createElement('span');
      deleteHiddenBtn.textContent = '✕';
      deleteHiddenBtn.title = 'Remove case';
      deleteHiddenBtn.style.cssText = `color: #FF6B6B; opacity: 0.5; font-weight: bold; cursor: pointer; flex-shrink: 0; margin-left: 4px; ${!entry.hidden ? 'display: none;' : ''}`;
      deleteHiddenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        storedResults = storedResults.filter((r) => r.caseNumber !== entry.caseNumber);
        saveStoredResults();
        renderResults();
        if (currentPageEntry && currentPageEntry.caseNumber === entry.caseNumber) renderCurrentPageCase();
      });

      const deleteNoteBtn = document.createElement('span');
      deleteNoteBtn.textContent = '−';
      deleteNoteBtn.title = 'Delete note';
      deleteNoteBtn.style.cssText = `color: #FF6B6B; font-weight: bold; cursor: pointer; flex-shrink: 0; ${!entry.note ? 'opacity: 0.4; pointer-events: none;' : ''}`;
      deleteNoteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        storedResults = storedResults.map((r) =>
          r.caseNumber === entry.caseNumber ? { ...r, note: '' } : r
        );
        saveStoredResults();
        renderResults();
        if (currentPageEntry && currentPageEntry.caseNumber === entry.caseNumber) {
          currentPageEntry = { ...currentPageEntry, note: '' };
          renderCurrentPageCase();
        }
      });

      const closeBtn = document.createElement('span');
      closeBtn.textContent = '✕';
      closeBtn.title = 'Remove case';
      closeBtn.style.cssText = `color: #FF6B6B; opacity: 0.5; font-weight: bold; cursor: pointer; flex-shrink: 0;`;
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        storedResults = storedResults.filter((r) => r.caseNumber !== entry.caseNumber);
        saveStoredResults();
        renderResults();
        if (currentPageEntry && currentPageEntry.caseNumber === entry.caseNumber) renderCurrentPageCase();
      });

      // Right-click on close button to hide (collapse) instead of delete
      closeBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        storedResults = storedResults.map((r) =>
          r.caseNumber === entry.caseNumber ? { ...r, hidden: true } : r
        );
        saveStoredResults();
        renderResults();
      });

      resultItem.appendChild(noteBtn);
      resultItem.appendChild(deleteNoteBtn);
      resultItem.appendChild(deleteHiddenBtn);
      resultItem.appendChild(closeBtn);
      resultItem.appendChild(hideBtn);

      // Right-click anywhere on the result item (except the case link) to hide/collapse it
      resultItem.addEventListener('contextmenu', (e) => {
        if (caseLink.contains(e.target)) return; // allow link right-click
        e.preventDefault();
        e.stopPropagation();
        storedResults = storedResults.map((r) =>
          r.caseNumber === entry.caseNumber ? { ...r, hidden: true } : r
        );
        saveStoredResults();
        renderResults();
      });

      // Apply hidden styles to child elements if needed
      if (entry.hidden) {
        textSpan.style.display = 'none';
        if (notePreview) notePreview.style.display = 'none';
        noteBtn.style.display = 'none';
        deleteNoteBtn.style.display = 'none';
        closeBtn.style.display = 'none';
        deleteHiddenBtn.style.display = '';
      } else {
        deleteHiddenBtn.style.display = 'none';
      }

      resultItem.title = `Case Number: ${entry.caseNumber}\nSubject: ${entry.subject}\nStatus: ${entry.status}\nOwner: ${entry.owner}\nPriority: ${entry.priority}\nSupport Level: ${entry.supportLevel}\nSupport Region: ${entry.supportRegion}\nNote: ${entry.note || 'None'}`;

      if (isViewing) {
        const viewingBadge = document.createElement('span');
        viewingBadge.textContent = entry.hidden ? '👁' : '👁 viewing';
        viewingBadge.title = 'Currently viewing this case';
        viewingBadge.style.cssText = `font-size:9px;opacity:0.5;color:#0ea5e9;flex-shrink:0;font-weight:600;letter-spacing:0.03em;white-space:nowrap;cursor:default;`;
        resultItem.appendChild(viewingBadge);
      }

      // Drag and drop event handlers
      let draggedOverIndex = null;

      resultItem.addEventListener('dragstart', (e) => {
        draggedItem = entry.caseNumber;
        resultItem.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', entry.caseNumber);
      });

      resultItem.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        // Highlight the drop zone
        if (resultItem.dataset.hidden !== 'true') {
          resultItem.style.borderTop = '2px solid #0EA5E9';
        }
      });

      resultItem.addEventListener('dragleave', (e) => {
        if (resultItem.dataset.hidden !== 'true') {
          resultItem.style.borderTop = '1px solid rgba(150, 150, 150, 0.3)';
        }
      });

      resultItem.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const draggedCaseNumber = e.dataTransfer.getData('text/plain');
        if (draggedCaseNumber === entry.caseNumber) return;

        // Find indices in storedResults
        const draggedIndex = storedResults.findIndex((r) => r.caseNumber === draggedCaseNumber);
        const targetIndex = storedResults.findIndex((r) => r.caseNumber === entry.caseNumber);

        if (draggedIndex !== -1 && targetIndex !== -1) {
          // Reorder array: remove dragged item and insert before target
          const [draggedItem] = storedResults.splice(draggedIndex, 1);
          const insertIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
          storedResults.splice(insertIndex, 0, draggedItem);
          
          // Save and re-render
          saveStoredResults();
          renderResults();
        }

        resultItem.style.borderTop = '1px solid rgba(150, 150, 150, 0.3)';
      });

      resultItem.addEventListener('dragend', (e) => {
        draggedItem = null;
        resultItem.style.opacity = '1';
        resultItem.style.borderTop = '1px solid rgba(150, 150, 150, 0.3)';
      });

      infoBox.appendChild(resultItem);
    });
  };

  const addOrUpdateResult = (entry, isRefresh = false) => {
    const existing = storedResults.find((r) => r.caseNumber === entry.caseNumber);
    const existingNote = existing?.note || '';
    const existingHidden = existing?.hidden || false;
    const hadExisting = !!existing;

    storedResults = storedResults.filter((r) => r.caseNumber !== entry.caseNumber);
    // New cases default to hidden; existing cases keep their prior hidden state
    const nextHidden = entry.hidden !== undefined ? entry.hidden : (hadExisting ? existingHidden : true);
    storedResults.push({ ...entry, note: entry.note ?? existingNote, hidden: nextHidden });
    saveStoredResults();

    // If this case is currently in Viewing Case, keep it in sync
    if (currentPageEntry && currentPageEntry.caseNumber === entry.caseNumber) {
      currentPageEntry = { ...entry, note: entry.note ?? existingNote };
      renderCurrentPageCase();
    }

    if (!isRefresh) {
      renderResults();
      // Auto-show results when new cases are added
      showResults();
    } else {
      // For refresh: update in-place by finding the DOM element and updating its content
      const resultItems = document.querySelectorAll('[data-case-number]');
      for (const item of resultItems) {
        if (item.dataset.caseNumber === entry.caseNumber) {
          // Update subject, status, owner text
          const textSpan = item.querySelector('[data-text]');
          if (textSpan) {
            textSpan.textContent = ` | ${entry.subject} | ${entry.status} | ${entry.owner}`;
          }
          // Update tooltip
          item.title = `Case Number: ${entry.caseNumber}\nSubject: ${entry.subject}\nStatus: ${entry.status}\nOwner: ${entry.owner}\nPriority: ${entry.priority}\nSupport Level: ${entry.supportLevel}\nSupport Region: ${entry.supportRegion}\nNote: ${existingNote || 'None'}`;
          break;
        }
      }
    }
  };

  const applyFollowStyle = (btn, following) => {
    if (following === true) {
      btn.style.color  = '#22c55e';
      btn.style.opacity = '1';
      btn.title = 'Unfollow';
    } else if (following === false) {
      btn.style.color   = THEME.subscribeColor;
      btn.style.opacity = '0.45';
      btn.title = 'Not following — click to follow';
    } else {
      btn.style.color   = THEME.subscribeColor;
      btn.style.opacity = '0.8';
      btn.title = 'Follow case (status unknown)';
    }
  };

  // Load persisted follow statuses from localStorage into the in-memory cache
  const FOLLOW_STATUS_KEY = 'elastic-case-follow-status';
  try {
    const stored = JSON.parse(localStorage.getItem(FOLLOW_STATUS_KEY) || '{}');
    for (const [id, val] of Object.entries(stored)) followStatusCache.set(id, val);
  } catch (_) {}

  const saveFollowStatus = () => {
    const obj = {};
    for (const [id, val] of followStatusCache.entries()) obj[id] = val;
    localStorage.setItem(FOLLOW_STATUS_KEY, JSON.stringify(obj));
  };

  const setFollowStatus = (caseId, following) => {
    followStatusCache.set(caseId, following);
    saveFollowStatus();
    // Update any rendered follow buttons for this case
    document.querySelectorAll(`[data-follow-case-id="${caseId}"]`).forEach(btn => {
      applyFollowStyle(btn, following);
    });
  };

  // Listen for status messages posted back from the VF popup (vf_subscribe.js)
  window.addEventListener('message', (e) => {
    if (e.origin !== 'https://elastic--c.vf.force.com') return;
    if (e.data?.type !== 'case-keeper-follow-status') return;
    setFollowStatus(e.data.caseId, e.data.following);
  });

  const checkFollowStatus = (caseId, btn) => {
    if (followStatusCache.has(caseId)) {
      applyFollowStyle(btn, followStatusCache.get(caseId));
    }
    // No fetch — status is updated via postMessage from the popup
  };

  const makeCaseLinkCopyBtn = (caseNumber, url) => {
    const wrap = document.createElement('span');
    wrap.style.cssText = `display:inline-flex;align-items:center;gap:2px;flex-shrink:0;`;

    const btnStyle = `cursor:pointer;font-size:9px;font-weight:600;padding:1px 3px;border-radius:3px;opacity:0.5;line-height:1.4;flex-shrink:0;border:1px solid ${isLightMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)'};background:transparent;color:${detectedTextColor};transition:opacity 0.15s;`;

    const urlBtn = document.createElement('span');
    urlBtn.textContent = 'url';
    urlBtn.title = 'Copy URL';
    urlBtn.style.cssText = btnStyle;
    urlBtn.addEventListener('mouseover', () => { urlBtn.style.opacity = '1'; });
    urlBtn.addEventListener('mouseout',  () => { urlBtn.style.opacity = '0.5'; });
    urlBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(url).then(() => {
        urlBtn.textContent = '✓';
        setTimeout(() => { urlBtn.textContent = 'url'; }, 1200);
      }).catch(err => console.error('[ELASTIC CASE SEARCH] Copy failed:', err));
    });

    const mdBtn = document.createElement('span');
    mdBtn.textContent = 'md';
    mdBtn.title = 'Copy Markdown link';
    mdBtn.style.cssText = btnStyle;
    mdBtn.addEventListener('mouseover', () => { mdBtn.style.opacity = '1'; });
    mdBtn.addEventListener('mouseout',  () => { mdBtn.style.opacity = '0.5'; });
    mdBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const md = `[${caseNumber}](${url})`;
      navigator.clipboard.writeText(md).then(() => {
        mdBtn.textContent = '✓';
        setTimeout(() => { mdBtn.textContent = 'md'; }, 1200);
      }).catch(err => console.error('[ELASTIC CASE SEARCH] Copy failed:', err));
    });

    wrap.appendChild(urlBtn);
    wrap.appendChild(mdBtn);
    return wrap;
  };

  const openNoteEditor = (anchorEl, currentNote, onSave) => {
    const existing = document.getElementById('elastic-note-popover');
    if (existing) existing.remove();

    const rect = anchorEl?.getBoundingClientRect?.();
    const popoverHeight = 200; // approximate for placement
    let topPos = window.innerHeight / 2 - popoverHeight / 2;
    let leftPos = window.innerWidth / 2 - 160;

    if (rect) {
      const wouldOverflow = rect.bottom + popoverHeight + 16 > window.innerHeight;
      topPos = wouldOverflow
        ? Math.max(12, rect.top - popoverHeight - 8)
        : rect.bottom + 8;
      leftPos = Math.min(rect.left, window.innerWidth - 360);
    }

    const popover = document.createElement('div');
    popover.id = 'elastic-note-popover';
    popover.style.cssText = `
      position: fixed;
      top: ${topPos}px;
      left: ${leftPos}px;
      z-index: ${Z_INDEX_NOTE_MODAL};
      min-width: 300px;
      max-width: 340px;
      background: ${THEME.modalBg};
      color: ${THEME.modalText};
      border-radius: 10px;
      box-shadow: 0 12px 28px rgba(0,0,0,0.28);
      padding: 12px 14px;
      border: 1px solid ${THEME.modalBorder};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const title = document.createElement('div');
    title.textContent = 'Add note';
    title.style.cssText = 'font-weight: 600; font-size: 14px; margin-bottom: 6px;';

    const textarea = document.createElement('textarea');
    textarea.value = currentNote;
    textarea.placeholder = 'Type your note...';
    textarea.style.cssText = `
      width: 100%;
      min-height: 90px;
      border-radius: 8px;
      border: 1px solid ${THEME.inputBorder};
      background: ${THEME.inputBg};
      color: ${THEME.modalText};
      padding: 8px 10px;
      resize: vertical;
      outline: none;
      font-size: 13px;
    `;

    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      padding: 6px 10px;
      border-radius: 8px;
      border: 1px solid ${THEME.inputBorder};
      background: transparent;
      color: ${THEME.modalText};
      cursor: pointer;
    `;

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.cssText = `
      padding: 6px 12px;
      border-radius: 8px;
      border: none;
      background: linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%);
      color: white;
      cursor: pointer;
      font-weight: 600;
      box-shadow: 0 4px 10px rgba(14,165,233,0.35);
    `;

    const closeEditor = () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeys);
      popover.remove();
    };

    const handleOutsideClick = (e) => {
      if (!popover.contains(e.target)) closeEditor();
    };

    const handleKeys = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeEditor();
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveBtn.click();
      }
    };

    cancelBtn.addEventListener('click', closeEditor);
    saveBtn.addEventListener('click', () => {
      onSave(textarea.value.trim());
      closeEditor();
    });

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeys);

    popover.appendChild(title);
    popover.appendChild(textarea);
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    popover.appendChild(actions);
    document.body.appendChild(popover);

    setTimeout(() => textarea.focus(), 10);
  };

  // ── Current-page case rendering ─────────────────────────────────────────────

  const renderCurrentPageCase = () => {
    currentPageCaseDiv.innerHTML = '';
    if (!currentPageEntry) {
      currentPageCaseDiv.style.display = 'none';
      return;
    }

    const entry = currentPageEntry;

    // Header row: "Viewing case" label + detail-expand toggle + section-hide toggle
    const header = document.createElement('div');
    header.style.cssText = `display:flex;align-items:center;gap:4px;padding:0 4px 3px;`;

    const headerLabel = document.createElement('span');
    headerLabel.textContent = 'Viewing case';
    headerLabel.style.cssText = `font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${detectedTextColor};opacity:0.55;flex:1;`;

    const iconStyle = `color:${detectedTextColor};opacity:0.4;cursor:pointer;font-size:10px;flex-shrink:0;padding:0 1px;`;

    // ▶/▼ — expand/collapse detail (subject/status/owner), only useful when section is visible
    const expandToggle = document.createElement('span');
    expandToggle.textContent = currentPageMinimized ? '▶' : '▼';
    expandToggle.title   = currentPageMinimized ? 'Expand details' : 'Collapse details';
    expandToggle.style.cssText = iconStyle + (viewingCaseSectionHidden ? 'visibility:hidden;' : '');
    expandToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      currentPageMinimized = !currentPageMinimized;
      renderCurrentPageCase();
    });

    // — / ▲ — hide/show entire section
    const sectionToggle = document.createElement('span');
    sectionToggle.textContent = viewingCaseSectionHidden ? '▲' : '—';
    sectionToggle.title   = viewingCaseSectionHidden ? 'Show section' : 'Hide section';
    sectionToggle.style.cssText = iconStyle;
    sectionToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      viewingCaseSectionHidden = !viewingCaseSectionHidden;
      renderCurrentPageCase();
    });

    header.appendChild(headerLabel);
    header.appendChild(expandToggle);
    header.appendChild(sectionToggle);
    currentPageCaseDiv.appendChild(header);

    // Adjust bottom border-radius: flatten when Case Vault is directly below
    const cpHasVaultBelow = storedResults.length > 0 && !caseVaultSectionHidden;
    currentPageCaseDiv.style.borderBottomLeftRadius  = cpHasVaultBelow ? '0' : '10px';
    currentPageCaseDiv.style.borderBottomRightRadius = cpHasVaultBelow ? '0' : '10px';
    currentPageCaseDiv.style.borderBottom            = cpHasVaultBelow ? 'none' : '';

    if (viewingCaseSectionHidden) {
      currentPageCaseDiv.style.display = 'flex';
      return; // show only the compact header
    }

    // Case row
    const resultItem = document.createElement('div');
    resultItem.dataset.caseNumber = entry.caseNumber;
    resultItem.style.cssText = `
      display:flex;align-items:center;gap:8px;padding:6px 10px;
      background:rgba(14,165,233,0.07);backdrop-filter:blur(8px);
      border-radius:8px;white-space:nowrap;
      border:1px solid rgba(14,165,233,0.2);
    `;

    const followIcon = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
    const vfUrl = `https://elastic--c.vf.force.com/apex/SupportConsoleSidebarButtons?id=${entry.caseId}&isdtp=vw&cn=${encodeURIComponent(entry.caseNumber || '')}`;

    const subscribeBtn = document.createElement('button');
    subscribeBtn.innerHTML = followIcon;
    subscribeBtn.title = 'Follow case';
    subscribeBtn.dataset.followCaseId = entry.caseId;
    subscribeBtn.style.cssText = `padding:2px;background:transparent;color:${THEME.subscribeColor};border:none;cursor:pointer;line-height:1;transition:all 0.2s ease;flex-shrink:0;display:flex;align-items:center;`;
    subscribeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.open(vfUrl, '', 'width=480,height=240,left=220,top=240,resizable=yes,scrollbars=yes');
    });
    subscribeBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      navigator.clipboard.writeText(vfUrl).then(() => {
        subscribeBtn.textContent = '✓';
        setTimeout(() => { subscribeBtn.innerHTML = followIcon; }, 1200);
      }).catch(err => console.error('[ELASTIC CASE SEARCH] Copy failed:', err));
    });
    subscribeBtn.addEventListener('mouseover', () => { subscribeBtn.style.opacity = '1'; });
    subscribeBtn.addEventListener('mouseout',  () => {
      subscribeBtn.style.opacity = followStatusCache.get(entry.caseId) === true ? '1' : '0.45';
    });
    checkFollowStatus(entry.caseId, subscribeBtn);

    const sfBtn = document.createElement('button');
    sfBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(135,206,235,0.7)"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>';
    sfBtn.title = 'Open in Salesforce';
    sfBtn.style.cssText = `padding:2px;background:transparent;color:inherit;border:none;cursor:pointer;line-height:1;transition:all 0.2s ease;flex-shrink:0;display:flex;align-items:center;`;
    sfBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.open(`https://elastic.my.salesforce.com/console#/${entry.caseId}`, '_blank');
    });
    sfBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const sfUrl = `https://elastic.my.salesforce.com/console#/${entry.caseId}`;
      navigator.clipboard.writeText(sfUrl).then(() => {
        sfBtn.innerHTML = '✓';
        setTimeout(() => { sfBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(135,206,235,0.7)"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>'; }, 1200);
      }).catch(err => console.error('[ELASTIC CASE SEARCH] Copy failed:', err));
    });

    const caseLink = document.createElement('a');
    caseLink.textContent = entry.caseNumber;
    caseLink.href = entry.url;
    caseLink.style.cssText = `color:#0EA5E9;text-decoration:underline;cursor:pointer;font-weight:600;min-width:60px;display:inline-block;`;
    caseLink.addEventListener('click', (e) => {
      if (e.shiftKey) { e.preventDefault(); window.open(entry.url, '', 'width=1200,height=800,left=100,top=100,resizable=yes,scrollbars=yes'); }
      else if (e.metaKey || e.ctrlKey) { e.preventDefault(); window.open(entry.url, '_blank'); }
      else { e.preventDefault(); window.location.href = entry.url; }
    });
    caseLink.addEventListener('contextmenu', (e) => { e.preventDefault(); window.open(entry.url, '_blank'); });

    const cpRefreshBtn = document.createElement('span');
    cpRefreshBtn.textContent = '↻';
    cpRefreshBtn.title = 'Refresh case';
    cpRefreshBtn.style.cssText = `color:#14B8A6;opacity:0.5;font-weight:bold;cursor:pointer;flex-shrink:0;`;
    cpRefreshBtn.addEventListener('mouseover', () => { cpRefreshBtn.style.opacity = '1'; });
    cpRefreshBtn.addEventListener('mouseout',  () => { cpRefreshBtn.style.opacity = '0.5'; });
    cpRefreshBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      cpRefreshBtn.textContent = '⌛';
      cpRefreshBtn.style.pointerEvents = 'none';
      if (detectCurrentPageCaseFn) await detectCurrentPageCaseFn();
      cpRefreshBtn.textContent = '↻';
      cpRefreshBtn.style.pointerEvents = 'auto';
    });

    const alreadyVaulted = storedResults.some(r => r.caseNumber === entry.caseNumber);
    const vaultBtn = document.createElement('span');
    vaultBtn.textContent = alreadyVaulted ? '★' : '☆';
    vaultBtn.title = alreadyVaulted ? 'Already in Case Vault' : 'Add to Case Vault';
    vaultBtn.style.cssText = `color:${isLightMode ? '#b45309' : '#fbbf24'};opacity:${alreadyVaulted ? '0.9' : '0.5'};font-weight:bold;cursor:pointer;flex-shrink:0;font-size:13px;`;
    vaultBtn.addEventListener('mouseover', () => { vaultBtn.style.opacity = '1'; });
    vaultBtn.addEventListener('mouseout',  () => { vaultBtn.style.opacity = alreadyVaulted ? '0.9' : '0.5'; });
    vaultBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!storedResults.some(r => r.caseNumber === entry.caseNumber)) {
        addOrUpdateResult({ ...entry, hidden: true });
        vaultBtn.textContent = '★';
        vaultBtn.title = 'Already in Case Vault';
        vaultBtn.style.opacity = '0.9';
      }
    });

    const cpCopyBtn = document.createElement('span');
    cpCopyBtn.textContent = '⧉';
    cpCopyBtn.title = 'Copy case details';
    cpCopyBtn.style.cssText = `color:${detectedTextColor};opacity:0.5;font-weight:bold;cursor:pointer;flex-shrink:0;font-size:12px;`;
    cpCopyBtn.addEventListener('mouseover', () => { cpCopyBtn.style.opacity = '1'; });
    cpCopyBtn.addEventListener('mouseout',  () => { cpCopyBtn.style.opacity = '0.5'; });
    cpCopyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = `Case Number: [${entry.caseNumber}](${entry.url})\nSubject: ${entry.subject}\nStatus: ${entry.status}\nOwner: ${entry.owner}\nPriority: ${entry.priority}\nSupport Level: ${entry.supportLevel}\nSupport Region: ${entry.supportRegion}\nNote: ${entry.note || 'None'}`;
      navigator.clipboard.writeText(text).then(() => {
        cpCopyBtn.textContent = '✓';
        setTimeout(() => { cpCopyBtn.textContent = '⧉'; }, 1200);
      }).catch(err => console.error('[ELASTIC CASE SEARCH] Copy failed:', err));
    });

    resultItem.appendChild(subscribeBtn);
    resultItem.appendChild(sfBtn);
    resultItem.appendChild(cpRefreshBtn);
    resultItem.appendChild(vaultBtn);
    resultItem.appendChild(cpCopyBtn);
    resultItem.appendChild(caseLink);
    resultItem.appendChild(makeCaseLinkCopyBtn(entry.caseNumber, entry.url));

    // Details — only visible when expanded
    if (!currentPageMinimized) {
      const textSpan = document.createElement('span');
      textSpan.dataset.text = 'true';
      textSpan.textContent = ` | ${entry.subject} | ${entry.status} | ${entry.owner}`;
      textSpan.style.cssText = `flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${detectedTextColor};`;
      resultItem.appendChild(textSpan);
    }

    if (entry.note) {
      const notePreview = document.createElement('span');
      notePreview.textContent = `📝 ${entry.note}`;
      notePreview.style.cssText = 'max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#B6C2D2;';
      notePreview.title = entry.note;
      resultItem.appendChild(notePreview);
    }

    const noteBtn = document.createElement('span');
    noteBtn.textContent = '+';
    noteBtn.title = 'Add note';
    noteBtn.style.cssText = `color:${THEME.noteColor};font-weight:bold;cursor:pointer;flex-shrink:0;margin-left:auto;`;
    noteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openNoteEditor(noteBtn, entry.note || '', (cleaned) => {
        currentPageEntry = { ...currentPageEntry, note: cleaned };
        storedResults = storedResults.map(r => r.caseNumber === entry.caseNumber ? { ...r, note: cleaned } : r);
        saveStoredResults();
        renderCurrentPageCase();
        renderResults();
      });
    });

    const deleteNoteBtn = document.createElement('span');
    deleteNoteBtn.textContent = '−';
    deleteNoteBtn.title = 'Delete note';
    deleteNoteBtn.style.cssText = `color:#FF6B6B;font-weight:bold;cursor:pointer;flex-shrink:0;${!entry.note ? 'opacity:0.4;pointer-events:none;' : ''}`;
    deleteNoteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentPageEntry = { ...currentPageEntry, note: '' };
      storedResults = storedResults.map(r => r.caseNumber === entry.caseNumber ? { ...r, note: '' } : r);
      saveStoredResults();
      renderCurrentPageCase();
      renderResults();
    });

    resultItem.appendChild(noteBtn);
    resultItem.appendChild(deleteNoteBtn);

    const closeBtn = document.createElement('span');
    closeBtn.textContent = '✕';
    closeBtn.title = 'Dismiss';
    closeBtn.style.cssText = `color:#FF6B6B;opacity:0.5;font-weight:bold;cursor:pointer;flex-shrink:0;`;
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentPageEntry = null;
      renderCurrentPageCase();
    });
    resultItem.appendChild(closeBtn);

    resultItem.title = `Case Number: ${entry.caseNumber}\nSubject: ${entry.subject}\nStatus: ${entry.status}\nOwner: ${entry.owner}\nPriority: ${entry.priority}\nSupport Level: ${entry.supportLevel}\nSupport Region: ${entry.supportRegion}\nNote: ${entry.note || 'None'}`;

    currentPageCaseDiv.appendChild(resultItem);
    currentPageCaseDiv.style.display = 'flex';
  };

  // ── Auto-detect case from current page URL ─────────────────────────────────

  const detectCurrentPageCase = async () => {
    const caseIdMatch = location.pathname.match(/\/cases\/([A-Za-z0-9]{15,18})(?:[/?#]|$)/);

    if (!caseIdMatch) {
      if (currentPageEntry !== null) {
        currentPageEntry = null;
        renderCurrentPageCase();
        renderResults();
      }
      return;
    }

    const caseId = caseIdMatch[1];
    if (currentPageEntry && currentPageEntry.caseId === caseId) return;

    // New case — reset display state and clear stale entry
    currentPageMinimized     = true;
    viewingCaseSectionHidden = false;
    currentPageEntry = null;
    renderCurrentPageCase();
    renderResults();

    // Fast path: case already in stored results
    const fromStored = storedResults.find(r => r.caseId === caseId);
    if (fromStored) {
      currentPageEntry = { ...fromStored };
      renderCurrentPageCase();
      renderResults();
      showResults();
      return;
    }

    // Fetch directly by Salesforce ID — no DOM scan needed
    const fetchByCaseId = async (id) => {
      const res = await fetch('https://support.elastic.co/api/cases/_list', {
        method: 'POST',
        headers: {
          'accept': '*/*',
          'content-type': 'application/json',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
        },
        body: JSON.stringify({
          filters: [{ type: 'field', field: 'id', value: id, match: 'must', operator: 'eq' }],
          page: 1, per_page: 1, sorting: [], view_id: 'cases-by-engineer-view',
        }),
        mode: 'cors',
        credentials: 'include',
        referrer: 'https://support.elastic.co/cases',
      });
      const data = await res.json();
      return data.data?.cases || [];
    };

    // Fallback: look up by case_number extracted from DOM
    const fetchByCaseNumber = async (caseNumber) => {
      const res = await fetch('https://support.elastic.co/api/cases/_list', {
        method: 'POST',
        headers: {
          'accept': '*/*',
          'content-type': 'application/json',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
        },
        body: JSON.stringify({
          filters: [{ type: 'field', field: 'case_number', value: caseNumber, match: 'must', operator: 'eq' }],
          page: 1, per_page: 1, sorting: [], view_id: 'cases-by-engineer-view',
        }),
        mode: 'cors',
        credentials: 'include',
        referrer: 'https://support.elastic.co/cases',
      });
      const data = await res.json();
      return data.data?.cases || [];
    };

    const applyCase = (c) => {
      const existingNote = storedResults.find(r => r.caseNumber === c.case_number)?.note || '';
      currentPageEntry = {
        caseNumber:    c.case_number   || '',
        subject:       c.subject       || 'No subject',
        status:        c.status        || '',
        owner:         c.owner         || '',
        priority:      c.priority      || '',
        supportLevel:  c.support_level  || '',
        supportRegion: c.support_region || '',
        url:    `https://support.elastic.co/cases/${c.id}`,
        caseId: c.id,
        note:   existingNote,
        hidden: false,
      };
      renderCurrentPageCase();
      renderResults();
      showResults();
      console.log('[ELASTIC CASE SEARCH] Viewing case set:', c.case_number, c.id);
    };

    try {
      // Primary: search by Salesforce ID directly
      let cases = await fetchByCaseId(caseId);

      // Fallback: if API doesn't support id filter, scan DOM for case number and search by that
      if (!cases.length) {
        let caseNumber = (document.title || '').match(/\b(\d{5,8})\b/)?.[1] || '';
        if (!caseNumber) {
          await new Promise(r => setTimeout(r, 1000));
          const candidates = document.querySelectorAll('h1, h2, [class*="case-number"], [class*="caseNumber"], [class*="subject"]');
          for (const el of candidates) {
            const m = (el.textContent || '').match(/\b(\d{5,8})\b/);
            if (m) { caseNumber = m[1]; break; }
          }
        }
        if (caseNumber) cases = await fetchByCaseNumber(caseNumber);
      }

      if (cases.length > 0 && cases[0].id) applyCase(cases[0]);
      else console.log('[ELASTIC CASE SEARCH] Could not resolve case for id:', caseId);
    } catch (err) {
      console.error('[ELASTIC CASE SEARCH] Error detecting current page case:', err);
    }
  };

  loadStoredResults();
  renderResults();
  loadBarState();
  loadResultsVisibility();

  // Retry detection at increasing delays — used on both initial load and SPA navigation
  const tryDetect = async () => {
    await detectCurrentPageCase();
    if (!currentPageEntry && location.pathname.match(/\/cases\/[A-Za-z0-9]{15,18}/)) {
      setTimeout(async () => {
        await detectCurrentPageCase();
        if (!currentPageEntry) {
          setTimeout(detectCurrentPageCase, 2000);
        }
      }, 1000);
    }
  };
  detectCurrentPageCaseFn = tryDetect;
  tryDetect();

  // Input wrapper
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  `;

  // Row container for search box + toggle button
  const searchRow = document.createElement('div');
  searchRow.style.cssText = `
    display: flex;
    align-items: center;
    gap: 0px;
  `;
  
  // Input container (search box)
  const inputContainer = document.createElement('div');
  const borderColor = isLightMode ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.5)';
  const inputBg = isLightMode ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.08)';
  
  console.log('[ELASTIC CASE SEARCH] isLightMode:', isLightMode);
  console.log('[ELASTIC CASE SEARCH] detectedTextColor:', detectedTextColor);
  
  const searchBoxBorder = isLightMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.3)';
  inputContainer.style.cssText = `
    display: flex;
    align-items: center;
    background: ${inputBg};
    border: 1px solid ${searchBoxBorder};
    border-radius: 24px;
    max-width: 400px;
    backdrop-filter: blur(8px);
    transition: all 0.2s ease;
    overflow: hidden;
  `;

  // Input field
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Case number';
  input.id = 'case-search-input-ext';
  input.autocomplete = 'off'; // Disable autocomplete to prevent white background
  input.style.cssText = `
    width: 200px;
    padding: 6px 12px 6px 4px;
    border: none;
    background: transparent !important;
    color: ${detectedTextColor};
    font-size: 13px;
    outline: none;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  
  // Add a style element to override autofill styles
  const style = document.createElement('style');
  style.textContent = `
    #case-search-input-ext:-webkit-autofill,
    #case-search-input-ext:-webkit-autofill:hover,
    #case-search-input-ext:-webkit-autofill:focus,
    #case-search-input-ext:-webkit-autofill:active {
      -webkit-box-shadow: 0 0 0 1000px transparent inset !important;
      -webkit-text-fill-color: ${detectedTextColor} !important;
      transition: background-color 5000s ease-in-out 0s;
    }
  `;
  if (!document.getElementById('case-search-autofill-override')) {
    style.id = 'case-search-autofill-override';
    document.head.appendChild(style);
  }

  // Home button
  const homeBtn = document.createElement('button');
  homeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>';
  homeBtn.title = 'Cases Home';
  homeBtn.style.cssText = `
    padding: 6px 4px;
    background: transparent;
    color: inherit;
    border: none;
    border-radius: 0;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    white-space: nowrap;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: none;
    font-weight: 500;
    margin: 0 4px 0 6px;
    outline: none;
    opacity: 0.7;
    display: flex;
    align-items: center;
  `;

  homeBtn.addEventListener('click', (e) => {
    // Shift + Click opens in new floating window
    if (e.shiftKey) {
      e.preventDefault();
      window.open('https://support.elastic.co/cases', '', 'width=1200,height=800,left=100,top=100,resizable=yes,scrollbars=yes');
    }
    // Command + Click on Mac or Ctrl + Click on Windows/Linux opens in new tab
    else if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      window.open('https://support.elastic.co/cases', '_blank');
    } else {
      e.preventDefault();
      window.location.href = 'https://support.elastic.co/cases';
    }
  });

  homeBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    window.open('https://support.elastic.co/cases', '_blank');
  });

  homeBtn.addEventListener('mouseover', () => {
    homeBtn.style.opacity = '1';
  });

  homeBtn.addEventListener('mouseout', () => {
    homeBtn.style.opacity = '0.7';
  });

  // Search button
  const button = document.createElement('button');
  button.innerHTML = '<svg width="16" height="16" viewBox="0 0 50 50" fill="currentColor"><path d="M 21 3 C 11.601563 3 4 10.601563 4 20 C 4 29.398438 11.601563 37 21 37 C 24.355469 37 27.460938 36.015625 30.09375 34.34375 L 42.375 46.625 L 46.625 42.375 L 34.5 30.28125 C 36.679688 27.421875 38 23.878906 38 20 C 38 10.601563 30.398438 3 21 3 Z M 21 7 C 28.199219 7 34 12.800781 34 20 C 34 27.199219 28.199219 33 21 33 C 13.800781 33 8 27.199219 8 20 C 8 12.800781 13.800781 7 21 7 Z"/></svg>';
  button.title = 'Search';
  button.style.cssText = `
    padding: 6px 4px;
    background: transparent;
    color: inherit;
    border: none;
    border-radius: 0;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    white-space: nowrap;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: none;
    font-weight: 500;
    margin: 0;
    outline: none;
    opacity: 0.7;
  `;

  // Copy all button
  const copyAllBtn = document.createElement('button');
  copyAllBtn.innerHTML = '⧉';
  copyAllBtn.title = 'Copy all';
  copyAllBtn.style.cssText = `
    padding: 6px 4px;
    background: transparent;
    color: inherit;
    border: none;
    border-radius: 0;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    white-space: nowrap;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: none;
    font-weight: 500;
    margin: 0 8px 0 0;
    outline: none;
    opacity: 0.7;
  `;

  copyAllBtn.addEventListener('click', () => {
    if (storedResults.length === 0) {
      alert('No cases to copy');
      return;
    }
    const allInfo = storedResults.map(r =>
      `Case Number: [${r.caseNumber}](${r.url})\nSubject: ${r.subject}\nStatus: ${r.status}\nOwner: ${r.owner}\nPriority: ${r.priority}\nSupport Level: ${r.supportLevel}\nSupport Region: ${r.supportRegion}\nNote: ${r.note || 'None'}\n`
    ).join('\n');
    navigator.clipboard.writeText(allInfo).then(() => {
      copyAllBtn.innerHTML = '✓';
      setTimeout(() => {
        copyAllBtn.innerHTML = '⧉';
      }, 1200);
    }).catch(err => {
      console.error('[ELASTIC CASE SEARCH] Copy failed:', err);
      alert('Failed to copy case information');
    });
  });

  copyAllBtn.addEventListener('mouseover', () => {
    copyAllBtn.style.opacity = '1';
  });

  copyAllBtn.addEventListener('mouseout', () => {
    copyAllBtn.style.opacity = '0.7';
  });

  // Refresh button
  const refreshBtn = document.createElement('button');
  refreshBtn.innerHTML = '↻';
  refreshBtn.title = 'Refresh all cases';
  refreshBtn.style.cssText = `
    padding: 6px 4px;
    background: transparent;
    color: inherit;
    border: none;
    border-radius: 0;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    white-space: nowrap;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: none;
    font-weight: 500;
    margin: 0;
    outline: none;
    opacity: 0.7;
  `;

  refreshBtn.addEventListener('click', async () => {
    if (storedResults.length === 0) {
      alert('No cases to refresh');
      return;
    }
    
    const caseNumbers = storedResults.map(r => r.caseNumber).join(' ');
    input.value = caseNumbers;
    refreshBtn.innerHTML = '⌛';
    refreshBtn.style.opacity = '0.6';
    refreshBtn.style.pointerEvents = 'none';
    
    try {
      await searchCase(true);
    } finally {
      input.value = '';
      refreshBtn.innerHTML = '↻';
      refreshBtn.style.opacity = '1';
      refreshBtn.style.pointerEvents = 'auto';
    }
  });

  refreshBtn.addEventListener('mouseover', () => {
    refreshBtn.style.opacity = '1';
  });

  refreshBtn.addEventListener('mouseout', () => {
    refreshBtn.style.opacity = '0.7';
  });
  
  // Add right-click to hide search bar (only on input container, not on the input field itself)
  inputContainer.addEventListener('contextmenu', (e) => {
    // Allow context menu on the input field for copy/paste
    if (e.target === input) {
      return;
    }
    e.preventDefault();
    wrapper.style.display = 'none';
    toggleBtn.style.display = 'block';
    barIsHidden = true;
    saveBarState();
  });

  button.addEventListener('mouseover', () => {
    button.style.opacity = '1';
  });

  button.addEventListener('mouseout', () => {
    button.style.opacity = '0.7';
  });

  // Search function
  let isSearching = false;

  async function searchCase(isRefresh = false) {
    if (isSearching) return;
    isSearching = true;

    const input_value = input.value.trim();
    
    console.log('[ELASTIC CASE SEARCH] Raw input.value:', input.value);
    console.log('[ELASTIC CASE SEARCH] Trimmed input_value:', input_value);
    
    if (!input_value) {
      if (!isRefresh) {
        alert('Please enter a case number');
      }
      return;
    }

    // Split by comma or space and trim whitespace
    const caseNumbers = input_value.split(/[,\s]+/).filter(num => num);
    
    if (caseNumbers.length === 0) {
      if (!isRefresh) {
        alert('Please enter a case number');
      }
      return;
    }

    console.log('[ELASTIC CASE SEARCH] Searching for:', caseNumbers);

    // Show loading state
    button.innerHTML = '<svg width="16" height="16" viewBox="0 0 50 50" fill="currentColor"><path d="M 21 3 C 11.601563 3 4 10.601563 4 20 C 4 29.398438 11.601563 37 21 37 C 24.355469 37 27.460938 36.015625 30.09375 34.34375 L 42.375 46.625 L 46.625 42.375 L 34.5 30.28125 C 36.679688 27.421875 38 23.878906 38 20 C 38 10.601563 30.398438 3 21 3 Z M 21 7 C 28.199219 7 34 12.800781 34 20 C 34 27.199219 28.199219 33 21 33 C 13.800781 33 8 27.199219 8 20 C 8 12.800781 13.800781 7 21 7 Z"/></svg>';
    button.style.opacity = '0.6';
    button.style.pointerEvents = 'none';

    try {
      // Search for each case number
      for (const caseNumber of caseNumbers) {
        const response = await fetch('https://support.elastic.co/api/cases/_list', {
          method: 'POST',
          headers: {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.9',
            'content-type': 'application/json',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin'
          },
          body: JSON.stringify({
            filters: [{
              type: 'field',
              field: 'case_number',
              value: caseNumber,
              match: 'must',
              operator: 'eq'
            }],
            page: 1,
            per_page: 3,
            sorting: [],
            view_id: 'cases-by-engineer-view'
          }),
          mode: 'cors',
          credentials: 'include',
          referrer: 'https://support.elastic.co/cases'
      });

      const data = await response.json();
      console.log('[ELASTIC CASE SEARCH] Response:', data);

      // Extract cases from the correct nested path: data.cases
      const cases = data.data?.cases || [];
      
      if (cases.length > 0 && cases[0].id) {
        const caseData = cases[0];
        const caseId = caseData.id;
        const url = `https://support.elastic.co/cases/${caseId}`;
        console.log('[ELASTIC CASE SEARCH] Found case:', caseId);
        
        // Show case info in the info box
        const subject = caseData.subject || 'No subject';
        const status = caseData.status || '';
        const owner = caseData.owner || '';
        const priority = caseData.priority || '';
        const supportLevel = caseData.support_level || '';
        const supportRegion = caseData.support_region || '';
        const caseNumber = caseData.case_number || '';
        
        // Update current case number for Salesforce button
        currentCaseNumber = caseNumber;
        currentCaseId = caseId;
        
        addOrUpdateResult({
          caseNumber,
          subject,
          status,
          owner,
          priority,
          supportLevel,
          supportRegion,
          url,
          caseId
        }, isRefresh);  // pass through the refresh flag
      } else {
        console.log('[ELASTIC CASE SEARCH] No case found for:', caseNumber);
      }
      }
    } catch (error) {
      console.error('[ELASTIC CASE SEARCH] Error:', error);
      alert(`Error searching for cases: ${error.message}`);
    } finally {
      isSearching = false;
      button.innerHTML = '<svg width="16" height="16" viewBox="0 0 50 50" fill="currentColor"><path d="M 21 3 C 11.601563 3 4 10.601563 4 20 C 4 29.398438 11.601563 37 21 37 C 24.355469 37 27.460938 36.015625 30.09375 34.34375 L 42.375 46.625 L 46.625 42.375 L 34.5 30.28125 C 36.679688 27.421875 38 23.878906 38 20 C 38 10.601563 30.398438 3 21 3 Z M 21 7 C 28.199219 7 34 12.800781 34 20 C 34 27.199219 28.199219 33 21 33 C 13.800781 33 8 27.199219 8 20 C 8 12.800781 13.800781 7 21 7 Z"/></svg>';
      button.style.opacity = '1';
      button.style.pointerEvents = 'auto';
      button.style.borderRadius = '6px';
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = '0 2px 8px rgba(0, 119, 204, 0.25)';
      if (!isRefresh) {
        input.value = '';
      }
    }
  }

  async function refreshSingleCase(caseNumber) {
    try {
      const response = await fetch('https://support.elastic.co/api/cases/_list', {
        method: 'POST',
        headers: {
          'accept': '*/*',
          'content-type': 'application/json',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin'
        },
        body: JSON.stringify({
          filters: [{ type: 'field', field: 'case_number', value: caseNumber, match: 'must', operator: 'eq' }],
          page: 1,
          per_page: 3,
          sorting: [],
          view_id: 'cases-by-engineer-view'
        }),
        mode: 'cors',
        credentials: 'include',
        referrer: 'https://support.elastic.co/cases'
      });
      const data = await response.json();
      const cases = data.data?.cases || [];
      if (cases.length > 0 && cases[0].id) {
        const d = cases[0];
        addOrUpdateResult({
          caseNumber: d.case_number || caseNumber,
          subject: d.subject || '',
          status: d.status || '',
          owner: d.owner || '',
          priority: d.priority || '',
          supportLevel: d.support_level || '',
          supportRegion: d.support_region || '',
          url: `https://support.elastic.co/cases/${d.id}`,
          caseId: d.id
        }, true);
      }
    } catch (err) {
      console.error('[ELASTIC CASE SEARCH] Single refresh failed:', err);
    }
  }

  // Event listeners
  button.addEventListener('click', () => searchCase());
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      searchCase();
    }
  });

  // Assemble elements
  inputContainer.appendChild(homeBtn);
  inputContainer.appendChild(input);
  inputContainer.appendChild(button);
  inputContainer.appendChild(refreshBtn);
  inputContainer.appendChild(copyAllBtn);
  inputContainer.appendChild(toggleResultsBtn);
  inputContainer.appendChild(hideBarBtn);
  searchRow.appendChild(inputContainer);
  // Wrap both result sections in a container so they sit flush against each other
  const resultsContainer = document.createElement('div');
  resultsContainer.style.cssText = `display:inline-flex;flex-direction:column;`;
  resultsContainer.appendChild(currentPageCaseDiv);
  resultsContainer.appendChild(infoBox);

  wrapper.appendChild(searchRow);
  wrapper.appendChild(resultsContainer);
  // container.appendChild(label); // Removed "Case:" label
  container.appendChild(wrapper);
  container.appendChild(toggleBtn);
  
  // Toggle button shows/hides entire wrapper
  toggleBtn.addEventListener('click', () => {
    wrapper.style.display = 'flex';
    toggleBtn.style.display = 'none';
    barIsHidden = false;
    saveBarState();
  });

  // Insert at the bottom of the body
  document.body.appendChild(container);

  // Apply saved bar state
  if (barIsHidden) {
    wrapper.style.display = 'none';
    toggleBtn.style.display = 'block';
  }

  // Push content up to make room
  const root = document.getElementById('root') || document.body;
  const currentMargin = parseInt(window.getComputedStyle(root).marginBottom) || 0;
  root.style.marginBottom = (currentMargin + 40) + 'px';

  console.log('[ELASTIC CASE SEARCH] Search bar created successfully');
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createSearchBar);
} else {
  createSearchBar();
}

// Handle SPA navigation (React Router)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log('[ELASTIC CASE SEARCH] Navigation detected, re-checking search bar');
    setTimeout(() => {
      createSearchBar();
      if (detectCurrentPageCaseFn) detectCurrentPageCaseFn();
    }, 500);
  }
}).observe(document, { subtree: true, childList: true });
