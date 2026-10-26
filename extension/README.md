# sudokUI Live Sync Extension

A lightweight, local-only Chromium Manifest V3 extension that automatically synchronizes your active Sudoku board from [Sudoku Exchange](https://sudokuexchange.com/play/) to the locally running **sudokUI Pattern Lab** (`http://localhost:5173/`).

---

## Quick Setup (Chrome, Brave, Edge)

### 1. Load the extension
1. Open your browser's extensions page:
   - **Chrome**: `chrome://extensions`
   - **Brave**: `brave://extensions`
   - **Edge**: `edge://extensions`
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** (or click the reload button 🔄 if already loaded).
4. Select the `extension/` folder inside this repository:
   ```
   <repo-root>/extension
   ```

### 2. Connect the tabs
1. **Refresh your Sudoku Exchange tab once (`F5` / `Ctrl+R`)**:
   > *Crucial*: When you first load or reload an unpacked extension in Chrome, Chrome will only attach to pages that are refreshed after the extension is active.
2. Open **sudokUI** (`http://localhost:5173/`).
3. In the sudokUI topbar, you will see the **Live Sync** indicator:
   - `● Live Sync active` (or `● Synced just now`): Both tabs are connected.
   - Click the indicator at any time to open the status popover or click **Check for Updates**.

---

## Solving Workflow

1. Play normally on Sudoku Exchange.
2. Every time you enter a digit, add a corner/centre pencil mark, or color a cell, the board in sudokUI updates in place automatically.
3. When you get stuck, click **Scan Patterns** in sudokUI.
4. Live synchronization is strictly separate from scanning: moves made on Sudoku Exchange will update the board in sudokUI and flag the old scan as stale, but will **never** automatically run the scanner without your command.
