(function () {
  const subscribeBtn = document.querySelector('input[type="submit"][value="Subscribe"], input[name="j_id0:j_id3:j_id10"]');
  const unsubscribeBtn = document.querySelector('input[type="submit"][value*="Unsubscribe" i], input[type="submit"][value*="Remove" i], input[name="j_id0:j_id3:j_id6"]');
  if (!subscribeBtn && !unsubscribeBtn) return;

  const params = new URLSearchParams(window.location.search);
  const caseNumber = params.get('cn') || params.get('caseNumber') || '';
  const caseId = params.get('id') || '';
  const label = caseNumber || caseId || 'case';

  const postStatus = (following) => {
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          { type: 'case-keeper-follow-status', caseId, following },
          'https://support.elastic.co'
        );
      }
    } catch (_err) {}
  };

  const refreshOpener = () => {
    try {
      if (!window.opener || window.opener.closed) return;
      const openerHref = (() => {
        try { return window.opener.location && window.opener.location.href; } catch (_err) { return null; }
      })();
      if (openerHref && openerHref.startsWith('https://support.elastic.co/')) {
        window.opener.location.reload();
      }
    } catch (_err) {
      // Cross-origin or no access; ignore silently.
    }
  };

  const messageEl = document.getElementById('j_id0:j_id3:showMessage') || document.querySelector('#j_id0\\:j_id3\\:showMessage');

  if (unsubscribeBtn) {
    // Page shows unsubscribe — user is currently following
    postStatus(true);
    alert(`Already following ${label}`);
    unsubscribeBtn.addEventListener('click', () => {
      setTimeout(() => {
        postStatus(false);
        alert(`Not following ${label}`);
        refreshOpener();
        if (window.self !== window.top) return;
        try { window.close(); } catch (err) { console.warn('[ELASTIC SUBSCRIBE] Close failed:', err); }
      }, 1200);
    });
  }

  if (subscribeBtn) {
    subscribeBtn.addEventListener('click', () => {
      setTimeout(() => {
        const msg = (messageEl && messageEl.innerText || '').trim();
        const lower = msg.toLowerCase();
        if (msg) {
          if (lower.includes('already')) {
            postStatus(true);
            alert(`Already following ${label}`);
          } else {
            postStatus(true);
            alert(msg);
          }
        } else {
          postStatus(true);
          alert(`Successfully following ${label}`);
        }
        refreshOpener();
        if (window.self !== window.top) return;
        try { window.close(); } catch (err) { console.warn('[ELASTIC SUBSCRIBE] Close failed:', err); }
      }, 1400);
    });
  }
})();
