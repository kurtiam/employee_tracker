# Architecture

> Technical reference for developers. For usage, see [README.md](README.md).

---

## Files

```
case-keeper-extension/
├── manifest.json        Chrome extension config (Manifest V3)
├── content.js           All toolbar logic (~2100+ lines)
├── vf_subscribe.js      Injected into the Salesforce follow popup
├── vf_subscribe.css     Styles for the follow popup
└── icon16/48/128.png    Extension icons
```

---

## How it works

### Injection points

`manifest.json` declares two content scripts:

| Match | Script |
|-------|--------|
| `https://support.elastic.co/*` | `content.js` |
| `https://elastic--c.vf.force.com/apex/SupportConsoleSidebarButtons*` | `vf_subscribe.js` + `vf_subscribe.css` |

### Entry point

```
if (document.readyState === 'loading')
  → DOMContentLoaded → createSearchBar()
else
  → createSearchBar() immediately

tryDetect() called once on load (with +1s and +3s retries)

MutationObserver watches for SPA (React Router) URL changes
  → re-calls createSearchBar() + detectCurrentPageCaseFn?.() after 500 ms
```

`createSearchBar()` is guarded against double-injection by checking for the container element's `id` before running.

---

## DOM layout

```
#elastic-case-search-ext  (container, position:fixed bottom:0)
  wrapper  (flex column, align-items:flex-start)
    searchRow
      inputContainer  (home · search input · search · refresh · copy · ▼/▲ · —)
    resultsContainer  (inline-flex column, no gap between children)
      #elastic-current-page-case-section   ← Viewing Case
      #case-info-display                   ← Case Vault
  toggleBtn  (green +, shown when toolbar is hidden)
```

Note: `toggleResultsBtn` (▼/▲) and `hideBarBtn` (—) are inside `inputContainer` as styled pill buttons, not outside the search row.

---

## Key functions

All live inside `createSearchBar()` as closures unless marked *module-level*.

| Function | Purpose |
|----------|---------|
| `loadStoredResults()` | Read `storedResults` from `localStorage` |
| `saveStoredResults()` | Write `storedResults` to `localStorage` (max 20 cases) |
| `renderResults()` | Rebuild Case Vault DOM; includes vault header with bulk actions |
| `addOrUpdateResult(entry, isRefresh)` | Add/update a case in vault; syncs `currentPageEntry` if case matches |
| `renderCurrentPageCase()` | Rebuild Viewing Case DOM from `currentPageEntry` |
| `detectCurrentPageCase()` | Parse URL, fetch case by Salesforce ID, populate `currentPageEntry` |
| `tryDetect()` | Wraps `detectCurrentPageCase` with +1s and +3s retries for slow page loads |
| `refreshSingleCase(caseNumber)` | Fetch latest data for one case and call `addOrUpdateResult` |
| `makeCaseLinkCopyBtn(caseNumber, url)` | Return `url` + `md` pill button pair for inline copy |
| `applyFollowStyle(btn, following)` | Set follow button colour/opacity/title based on follow state |
| `checkFollowStatus(caseId, btn)` | Read `followStatusCache`, apply style (no network call) |
| `setFollowStatus(caseId, following)` | Update cache + localStorage + all matching `[data-follow-case-id]` buttons |
| `openNoteEditor(anchor, note, onSave)` | Show floating textarea popover |
| `searchCase(isRefresh)` | Fetch one or more cases from the API; guarded by `isSearching` flag |
| `showResults()` / `hideResults()` | Toggle visibility of both result sections |

---

## State

All state is inside the `createSearchBar()` closure unless noted.

| Variable | Persisted | Purpose |
|----------|-----------|---------|
| `storedResults` | `localStorage` | Array of manually searched cases (max 20) |
| `currentPageEntry` | no | Auto-detected case for the current page |
| `currentPageMinimized` | no | Whether Viewing Case row is collapsed to icons-only |
| `viewingCaseSectionHidden` | no | Whether Viewing Case section content is hidden |
| `caseVaultSectionHidden` | no | Whether Case Vault list is hidden |
| `barIsHidden` | `localStorage` | Whether the entire toolbar is hidden |
| `isSearching` | no | Debounce guard for `searchCase()` |
| `detectCurrentPageCaseFn` | no *(module-level)* | SPA observer calls this; set to `tryDetect` so retries apply on navigation |
| `followStatusCache` | no *(module-level Map)* | `caseId → boolean`; populated from localStorage on load and updated via postMessage |

### localStorage keys

| Key | Value |
|-----|-------|
| `elastic-case-search-results` | JSON array of case objects |
| `elastic-case-search-bar-state` | `true` / `false` |
| `elastic-case-search-results-visible` | `"true"` / `"false"` |
| `elastic-case-follow-status` | JSON object `{ [caseId]: boolean }` |

### Case object shape

```js
{
  caseNumber:    string,   // "00123456"
  subject:       string,
  status:        string,
  owner:         string,
  priority:      string,
  supportLevel:  string,
  supportRegion: string,
  url:           string,   // https://support.elastic.co/cases/<id>
  caseId:        string,   // Salesforce 18-char ID
  note:          string,
  hidden:        boolean,  // collapsed in vault
}
```

---

## API

`searchCase()`, `detectCurrentPageCase()`, and `refreshSingleCase()` all call the same endpoint:

```
POST https://support.elastic.co/api/cases/_list
Content-Type: application/json
credentials: include   ← relies on the user's active session cookie
```

`searchCase()` filters by `case_number`.
`detectCurrentPageCase()` filters by `id` (Salesforce ID from the URL), falling back to `case_number` via DOM scan if the `id` filter is unsupported.
`refreshSingleCase()` filters by `case_number` for a single case.

---

## Follow status

Follow status cannot be determined via a direct fetch (VF page blocks CORS). Instead:

1. The user clicks 👁 which opens `elastic--c.vf.force.com/apex/SupportConsoleSidebarButtons` in a popup
2. `vf_subscribe.js` runs inside that popup, detects Subscribe/Unsubscribe buttons, and calls:
   ```js
   window.opener.postMessage(
     { type: 'case-keeper-follow-status', caseId, following },
     'https://support.elastic.co'
   );
   ```
3. `content.js` listens for this message and calls `setFollowStatus(caseId, following)`
4. `setFollowStatus` updates `followStatusCache`, saves to `elastic-case-follow-status` in localStorage, and updates all `[data-follow-case-id="<caseId>"]` buttons without a full re-render

Follow buttons use `data-follow-case-id` attribute so they can be targeted without rebuilding the DOM.

`applyFollowStyle` styles:
- `true` → green `#22c55e`, opacity 1, title "Unfollow"
- `false` → theme subscribe colour, opacity 0.45, title "Not following — click to follow"
- `null` → theme subscribe colour, opacity 0.8, title "Follow case (status unknown)"

---

## vf_subscribe.js

Runs inside the Salesforce follow popup. It:

1. Finds the Subscribe / Unsubscribe button in the VF page DOM
2. Immediately sends `postMessage(following: true)` if Unsubscribe is shown (user is already following)
3. Shows an alert after the action (Already following / Successfully following / Not following)
4. Sends the updated follow state via `postMessage` to the opener
5. Calls `window.opener.location.reload()` to refresh the support portal (wrapped in try/catch)
6. Closes the popup

---

## Bidirectional sync

When a case appears in both Viewing Case and Case Vault:

- **Note edits** in either section call the other's render function to stay in sync
- **Refresh** (`addOrUpdateResult` with `isRefresh=true`) checks if the refreshed case matches `currentPageEntry` and calls `renderCurrentPageCase()` if so
- **Vault remove** calls `renderCurrentPageCase()` to update the ★/☆ vault button
- **Vault add** from Viewing Case inserts the case minimised (`hidden: true`) and calls `renderResults()`

The "👁 viewing" badge on vault rows is set by checking `currentPageEntry.caseNumber === entry.caseNumber` in `renderResults()`. The fast path in `detectCurrentPageCase()` (case already in storedResults) also calls `renderResults()` so the badge appears without a full page refresh.

---

## Import / Export

- **Export**: serialises `storedResults` to JSON and downloads as `case-vault-YYYY-MM-DD.json`
- **Import**: reads a JSON file, merges (same `caseNumber` = update, new = append, capped at `MAX_STORED_CASES`), saves, re-renders, then calls `refreshSingleCase` for each imported case to fetch latest API data

---

## Theme detection

At startup, `createSearchBar()` reads the computed `color` of `document.body` / `#root`, calculates brightness `(r+g+b)/3`, and sets `isLightMode = brightness < 128`. All colours are then derived from a `THEME` object built from that flag.

---

## SPA navigation handling

```js
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(() => {
      createSearchBar();            // no-op if bar already exists
      detectCurrentPageCaseFn?.();  // tryDetect — includes retries
    }, 500);
  }
}).observe(document, { subtree: true, childList: true });
```

The 500 ms delay gives React time to commit the new route. `detectCurrentPageCaseFn` is set to `tryDetect` (not the raw `detectCurrentPageCase`) so SPA navigation also benefits from the +1s and +3s retry logic.
