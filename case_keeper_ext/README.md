# Case Keeper

A Chrome / Edge extension that adds a persistent toolbar to [support.elastic.co](https://support.elastic.co) so you can track, follow, and navigate cases without losing your place.

---

## Installation

1. Open `chrome://extensions/` (or `edge://extensions/`)
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the folder that contains `manifest.json`
5. Visit [support.elastic.co](https://support.elastic.co) — the toolbar appears at the bottom of every page

---

## The Toolbar

The toolbar lives at the **bottom of the screen** and has two independent sections stacked below the search row.

```
[ 🏠  case number…  🔍  ↻  ⧉  ▼  — ]
┌─────────────────────────────────────────────────────┐  ← Viewing Case
│ Viewing case                             ▶  —        │
│ 👁 ☁️ ↻ ★ ⧉  00123456  url md  + −    ✕            │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐  ← Case Vault
│ Case Vault    ↓  ↑  ◀  ▶  ✕  —                     │
│ 👁 ☁️ ↻ ⧉  00123456  url md  | Subject | Status  …  │
│ 👁 ☁️ ↻ ⧉  00123457  url md  | Subject | Status  …  │
└─────────────────────────────────────────────────────┘
```

### Search row buttons

| Button | Action |
|--------|--------|
| 🏠 | Go to support.elastic.co/cases (Shift = float window, Ctrl/Cmd = new tab) |
| Search box | Type one or more case numbers (space or comma separated), press **Enter** |
| 🔍 | Search |
| ↻ | Refresh all vaulted cases with latest API data |
| ⧉ | Copy all case details to clipboard |
| ▼ / ▲ | Show / hide both result sections |
| — | Hide the entire toolbar (click the green **+** to bring it back) |

> **Tip:** Right-click (or Ctrl+click on a single-button mouse / Mac) the search box border (not the input itself) also hides the toolbar.

---

## Viewing Case

When you open a case page (`/cases/<id>`), the extension **automatically detects it** and shows the case at the top of the toolbar — no searching required.

- Starts **minimized** (case number + action icons only)
- Click **▶** in the header to expand full details (subject, status, owner)
- Click **▼** to collapse back to minimized
- Click **—** to hide the section; click **▲** to bring it back
- Click **✕** to dismiss tracking for this case
- Navigating to a different case automatically updates this section

The section resets to minimized each time you land on a new case page.

### Viewing Case controls

| Control | Action |
|---------|--------|
| 👁 | Open follow popup (right-click = copy follow URL) |
| ☁️ | Open in Salesforce console (right-click = copy URL) |
| ↻ | Refresh case with latest API data |
| ★ / ☆ | Add to Case Vault (★ = already vaulted) |
| ⧉ | Copy case details to clipboard |
| Case number | Navigate to case |
| `url` | Copy plain URL |
| `md` | Copy Markdown link `[caseNumber](url)` |
| + | Add / edit note |
| − | Delete note |
| ✕ | Dismiss (stop tracking this case) |

> If the case is also in the Case Vault, notes and refresh updates sync between both sections automatically.

---

## Case Vault

A persisted list of cases you have manually searched for (up to 20, stored in `localStorage`).

### Searching

Type one or more case numbers into the search box and press **Enter** or click 🔍.

```
01234567
01234567, 01234568
01234567 01234568 01234569
```

### Vault header buttons

| Button | Action |
|--------|--------|
| ↓ | Export vault to a JSON file (backup / share) |
| ↑ | Import cases from a JSON file (merges with existing vault, then refreshes from API) |
| ◀ | Collapse all cases to minimized state |
| ▶ | Expand all cases to full detail |
| ✕ | Empty vault (remove all cases) |
| — / ▲ | Hide / show the vault content |

When the vault is empty the header stays visible so you can still import.

### Per-case controls

| Control | Action |
|---------|--------|
| 👁 | Open follow popup — **green** = following, **dim** = not following (right-click = copy URL) |
| ☁️ | Open in Salesforce console (right-click = copy URL) |
| ↻ | Refresh this case with latest API data |
| ⧉ | Copy case details to clipboard (visible even when minimized) |
| Case number | Open case (Shift = float window, Ctrl/Cmd = new tab, right-click = new tab) |
| `url` | Copy plain URL |
| `md` | Copy Markdown link `[caseNumber](url)` |
| Subject / Status / Owner | Shown when expanded |
| 📝 note preview | Visible when a note exists |
| + | Add or edit note |
| − | Delete note |
| ◀ | Collapse this case (keeps it in vault) |
| ▶ | Expand this case |
| ✕ | Remove from vault (right-click = collapse instead) |
| Drag handle | Drag case row to reorder |
| 👁 viewing | Appears on the row when that case is currently in Viewing Case |

> **Tip:** Right-click anywhere on a case row (not the case link) to quickly collapse that case.

### Notes

- Notes are **per case number** and survive refreshes and re-searches
- If a case is in both **Viewing Case** and **Case Vault**, editing the note in either place syncs to both instantly

### Copy format

All copy actions (per-case ⧉ and copy-all) use the same format:

```
Case Number: [02049578](https://support.elastic.co/cases/<id>)
Subject: ...
Status: ...
Owner: ...
Priority: ...
Support Level: ...
Support Region: ...
Note: ...
```

---

## Follow Popup

Clicking 👁 opens a compact Salesforce popup.

| Message | Meaning |
|---------|---------|
| Already following | You are currently subscribed |
| Successfully following | You just subscribed |
| Not following | You just unsubscribed |

The popup auto-closes and refreshes the support portal page after each action. The 👁 button colour updates immediately — **green** when following, **dim** when not.

---

## Import / Export

Use the **↓** and **↑** buttons in the Case Vault header to back up or share your vault.

- **Export** downloads `case-vault-YYYY-MM-DD.json`
- **Import** merges the file into your vault (existing cases updated, new ones appended) then refreshes all imported cases from the API for the latest data
- The JSON format is the raw case object array — safe to share with a colleague

---

## Hiding & Showing the Toolbar

| Method | Effect |
|--------|--------|
| Click **—** (inside search box) | Hide entire toolbar, show green **+** |
| Right-click (or Ctrl+click) the search box border | Same as above |
| Click green **+** | Restore the toolbar |
| Click **▼** | Hide both result sections only |
| Click **—** in Viewing Case header | Hide Viewing Case section only |
| Click **—** in Case Vault header | Hide Case Vault section only |

---

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config (Manifest V3) |
| `content.js` | Main script — toolbar, search, Viewing Case, Case Vault |
| `vf_subscribe.js` | Script that runs inside the follow popup |
| `vf_subscribe.css` | Styles for the follow popup |
| `icon16/48/128.png` | Extension icons |
