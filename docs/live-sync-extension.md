# Sudoku Exchange Live Sync Bridge

This document details the local-only live synchronization bridge connecting [Sudoku Exchange](https://sudokuexchange.com/play/) with **sudokUI Pattern Lab**.

---

## 1. Architectural Overview

```
 ┌─────────────────────────────────────────────────────────┐
 │                   Sudoku Exchange Tab                   │
 │               (https://sudokuexchange.com)              │
 │                                                         │
 │   Player makes move: places digit / pencil mark / color │
 │                      │                                  │
 │                      ▼                                  │
 │        `data-current-snapshot` / SVG DOM mutated        │
 └──────────────────────┬──────────────────────────────────┘
                        │ (DOM MutationObserver / 100ms debounce)
                        ▼
 ┌─────────────────────────────────────────────────────────┐
 │   Content Script: `extension/content-sudokuexchange.js`  │
 │   - Extracts snapshot (givens, values, corner, center)  │
 │   - Computes state signature for deduplication         │
 └──────────────────────┬──────────────────────────────────┘
                        │ (port.postMessage: SOURCE_POSITION_UPDATE)
                        ▼
 ┌─────────────────────────────────────────────────────────┐
 │       Service Worker: `extension/background.js`         │
 │   - Caches latest position in memory & local storage   │
 │   - Broadcasts update to all open sudokUI tabs         │
 └──────────────────────┬──────────────────────────────────┘
                        │ (port.postMessage: LIVE_SYNC_POSITION)
                        ▼
 ┌─────────────────────────────────────────────────────────┐
 │      Content Script: `extension/content-sudokui.js`     │
 │   - Bridges extension to page via DOM CustomEvent       │
 └──────────────────────┬──────────────────────────────────┘
                        │ (window.dispatchEvent: 'sudokui:live-sync')
                        ▼
 ┌─────────────────────────────────────────────────────────┐
 │                  sudokUI Pattern Lab                    │
 │               (http://localhost:5173/)                  │
 │                                                         │
 │   `useLiveSync` Store:                                  │
 │   - Validates position payload schema                   │
 │   - Compares fingerprint (deduplication)                │
 │   - In-place board update in `useGame`                  │
 │   - Scanner staleness flagged (NO auto-scan!)           │
 │   - Compact header indicator updated (dot & timestamp)  │
 └─────────────────────────────────────────────────────────┘
```

---

## 2. Invariants & Solving Philosophy

1. **Strictly Non-Mutating Pattern Scanning:**
   Live synchronization and pattern scanning are strictly decoupled. When a board update arrives from Sudoku Exchange:
   - The board updates in place.
   - If scanner results were previously present, they are immediately marked as **stale** (`isStale: true`), and an unmistakable notice banner appears with a **Scan current position** button.
   - The scanner **never runs automatically** on synced moves. The user retains complete control over when to inspect deductions.
2. **100% Local & Privacy-Preserving:**
   - No remote API endpoints, third-party analytics, cloud accounts, or telemetry.
   - Host permissions in `extension/manifest.json` are strictly scoped to `https://sudokuexchange.com/*` and local development origins (`http://localhost:5173/*`, `http://127.0.0.1:5173/*`, `http://localhost:4173/*`, `http://127.0.0.1:4173/*`).
3. **One-Way Synchronization:**
   - Sudoku Exchange is the source of truth for puzzle solving.
   - The extension only observes and reads state from Sudoku Exchange. It never writes to or alters the Sudoku Exchange board.
4. **Seamless In-Place Transitions:**
   - Routine moves do not trigger full page reloads, prompt confirmation dialogs, or reset the puzzle timer.
   - When a completely new puzzle is started on Sudoku Exchange, sudokUI initializes the new puzzle cleanly and resets stale scanner results.
5. **Fallbacks Preserved:**
   - If the extension is not installed or enabled, the bookmarklet (`Send to Pattern Lab`) and manual import modal remain 100% functional.

---

## 3. Extension Installation Guide

### For Chrome, Brave, and Chromium Browsers

1. Open `chrome://extensions` (or `brave://extensions` in Brave).
2. Toggle **Developer mode** on (top-right corner).
3. Click **Load unpacked** (top-left corner).
4. Browse to this repository and select the `extension` folder:
   ```
   <path-to-sudokui>/extension
   ```
5. The extension **sudokUI Live Sync for Sudoku Exchange** will appear in the installed list.

### For Microsoft Edge

1. Open `edge://extensions`.
2. Turn on the **Developer mode** toggle in the left sidebar.
3. Click **Load unpacked**.
4. Select the `extension` folder inside this repository.

---

## 4. Verifying the Live Sync Workflow

1. Start the sudokUI development server:
   ```powershell
   npm.cmd run dev
   ```
2. Open `http://localhost:5173/` in your browser.
3. Inspect the header:
   - When the extension is detected, the Live Sync badge displays `Waiting for Sudoku Exchange` (with an amber dot `◌`).
4. In another tab (or side-by-side window), open `https://sudokuexchange.com/play/`.
5. The Live Sync badge changes to `● Live Sync active` (or `● Synced just now` with a green pulsing dot).
6. Enter a pencil mark or place a digit on Sudoku Exchange — the cell updates immediately in sudokUI.
7. Click **Scan Patterns** in sudokUI to inspect available deductions.
8. Make an elimination on Sudoku Exchange — sudokUI shows the updated board and flags the previous scan as stale:
   > *"Board position changed since this scan. [Scan current position]"*

---

## 5. UI Controls & Options

Clicking the **Live Sync** pill in the topbar opens the Live Sync popover:

- **Extension Bridge Status**: Shows whether the local browser extension is detected.
- **Sudoku Exchange Status**: Shows whether an active Sudoku Exchange tab is communicating.
- **Last Synced**: Displays relative time ("just now", "12s ago") and exact wall-clock timestamp.
- **Board Details & Fidelity**: Reports the number of givens, entered values, and marked cells, as well as whether corner and centre notes were captured (`Full`).
- **Auto-sync Toggle**: Checkbox allowing the player to temporarily pause or resume automatic board synchronization.
- **Check for Updates Button**: Manually requests the latest position snapshot from the extension cache.

---

## 6. Troubleshooting

- **Badge shows "Live Sync offline"**:
  Ensure the extension is loaded in `chrome://extensions` and that Developer mode is active.
- **Badge shows "Waiting for Sudoku Exchange"**:
  Open `https://sudokuexchange.com/play/` in another tab in the same browser profile.
- **Auto-sync was paused**:
  Click the badge and check the "Enable automatic board synchronization" box.
