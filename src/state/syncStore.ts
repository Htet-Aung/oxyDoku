// sudokUI Live Sync state store
// Manages real-time position updates from Sudoku Exchange via the local extension bridge.
// Keeps synchronization strictly separated from automatic scanning (user controls when to scan).

import { create } from 'zustand';
import {
  useGame,
  hasManualMarks,
  markSlip,
  cloneCells,
  type MarkContract,
  type CellState
} from './gameStore';
import { usePatternScanner } from './scannerStore';
import {
  validatePositionPayload,
  type PositionImportPayload,
  type PositionImportFidelity
} from '../content/sudokuExchangeImport';

export interface PositionSummary {
  givenCount: number;
  entryCount: number;
  markedCellCount: number;
}

export interface LiveSyncStore {
  /** Whether the sudokUI live sync extension bridge is detected on this page */
  isExtensionDetected: boolean;
  /** Whether an active Sudoku Exchange source tab is currently open and communicating */
  isSourceConnected: boolean;
  /** Whether automatic synchronization is enabled by the user */
  enabled: boolean;
  /** Timestamp (ms) of the last successful position sync */
  lastSyncTime: number | null;
  /** Total count of board syncs applied in this session */
  syncCount: number;
  /** Last error message if any sync failed */
  lastError: string | null;
  /** Signature of the last applied position for deduplication */
  lastSignature: string | null;
  /** Fidelity of the last imported position */
  lastImportFidelity: PositionImportFidelity | null;
  /** Summary of cells in the last imported position */
  lastPositionSummary: PositionSummary | null;

  setExtensionDetected: (detected: boolean) => void;
  setSourceConnected: (connected: boolean) => void;
  setEnabled: (enabled: boolean) => void;
  applyLiveSync: (
    payload: PositionImportPayload,
    timestamp?: number
  ) => { ok: boolean; status?: 'applied' | 'unchanged'; reason?: string };
  requestLatest: () => void;
  clearError: () => void;
}

export function computePositionSignature(p: PositionImportPayload): string {
  return (
    (p.givens || '') +
    ':' +
    (p.values || '') +
    ':' +
    (p.corner ? p.corner.join(',') : '') +
    ':' +
    (p.center ? p.center.join(',') : '') +
    ':' +
    (p.excluded ? p.excluded.join(',') : '') +
    ':' +
    (p.colors ? p.colors.join(',') : '')
  );
}

function getStoredEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const val = localStorage.getItem('sudokui-live-sync-enabled');
    return val !== 'false';
  } catch (_) {
    return true;
  }
}

function getStoredSignature(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem('sudokui-live-sync-last-sig');
  } catch (_) {
    return null;
  }
}

function setStoredSignature(sig: string | null) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (sig) localStorage.setItem('sudokui-live-sync-last-sig', sig);
    else localStorage.removeItem('sudokui-live-sync-last-sig');
  } catch (_) {}
}

export const useLiveSync = create<LiveSyncStore>((set, get) => ({
  isExtensionDetected: false,
  isSourceConnected: false,
  enabled: getStoredEnabled(),
  lastSyncTime: null,
  syncCount: 0,
  lastError: null,
  lastSignature: getStoredSignature(),
  lastImportFidelity: null,
  lastPositionSummary: null,

  setExtensionDetected: (detected) => set({ isExtensionDetected: detected }),
  setSourceConnected: (connected) => set({ isSourceConnected: connected }),
  setEnabled: (enabled) => {
    try {
      localStorage.setItem('sudokui-live-sync-enabled', String(enabled));
    } catch (_) {}
    set({ enabled });
  },
  clearError: () => set({ lastError: null }),

  requestLatest: () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sudokui:request-latest'));
    }
  },

  applyLiveSync: (payload, timestamp) => {
    if (!get().enabled) {
      return { ok: false, reason: 'Live sync is disabled' };
    }

    const res = validatePositionPayload(payload);
    if (!res.ok) {
      set({ lastError: res.code });
      return { ok: false, reason: res.code };
    }

    const sig = computePositionSignature(res.payload);
    if (sig === get().lastSignature) {
      return { ok: true, status: 'unchanged' };
    }

    const gameState = useGame.getState();
    const currentInfo = gameState.info;
    const isSamePuzzle = !!currentInfo && currentInfo.puzzle === res.puzzle;

    const cells = cloneCells(res.cells as CellState[]);
    const manualMarks = hasManualMarks(cells);
    const hasCenter = cells.some((c) => !c.value && c.center !== 0);
    const autoCandidates = res.fidelity === 'grid-only' || !manualMarks;
    const markContract: MarkContract =
      res.fidelity === 'full'
        ? hasCenter
          ? markSlip(cells, res.solution) === -1
            ? 'exhaustive'
            : 'open'
          : 'open'
        : 'unknown';

    if (isSamePuzzle) {
      // Check if local oxyDoku board has moves that are ahead of or conflict with the incoming sync
      const localEntries = gameState.cells.filter((c) => !c.given && c.value !== 0);
      const incomingEntries = cells.filter((c) => !c.given && c.value !== 0);
      const localHasEntriesNotOnSource = gameState.cells.some(
        (c, idx) => !c.given && c.value !== 0 && c.value !== cells[idx].value
      );

      // If local oxyDoku board has entered digits not on Sudoku Exchange, and local has at least as many entries:
      if (localHasEntriesNotOnSource && localEntries.length >= incomingEntries.length) {
        // Protect local progress: do not overwrite local moves with older/stale source board
        return {
          ok: false,
          status: 'conflict' as any,
          reason: 'Local oxyDoku board has newer moves than Sudoku Exchange'
        };
      }

      // In-place board update: keep timer, preserve game info, do not prompt with confirmation dialog
      useGame.setState((s) => ({
        cells,
        autoCandidates,
        markContract,
        lastImportFidelity: res.fidelity,
        info: s.info ? { ...s.info, fromPosition: true } : null,
        errors: []
      }));

      // Mark scanner results stale if scanner was open; do NOT auto-run scan
      const scannerState = usePatternScanner.getState();
      scannerState.checkStaleness();

      // Dismiss any active hint highlight on the board so outdated steps don't clash with new cells
      if (gameState.hint) {
        gameState.dismissHint();
      }
      if (scannerState.selectedInstanceId) {
        usePatternScanner.setState({ selectedInstanceId: null });
      }
    } else {
      // User switched to a new puzzle on Sudoku Exchange
      gameState.startGame(res.puzzle, res.score, res.level);
      useGame.setState((s) => ({
        cells,
        autoCandidates,
        markContract,
        lastImportFidelity: res.fidelity,
        info: s.info ? { ...s.info, fromPosition: true } : null
      }));

      // Reset scanner for the new puzzle
      usePatternScanner.setState({
        scanResult: null,
        selectedInstanceId: null,
        isStale: false,
        boardFingerprintAtScan: null
      });
    }

    const now = timestamp || Date.now();
    setStoredSignature(sig);
    set({
      lastSignature: sig,
      lastSyncTime: now,
      syncCount: get().syncCount + 1,
      lastError: null,
      isSourceConnected: true,
      lastImportFidelity: res.fidelity,
      lastPositionSummary: {
        givenCount: res.givenCount,
        entryCount: res.entryCount,
        markedCellCount: res.markedCellCount
      }
    });

    return { ok: true, status: 'applied' };
  }
}));

// Wire window events when running in browser
if (typeof window !== 'undefined') {
  window.addEventListener('sudokui:extension-ready', () => {
    useLiveSync.getState().setExtensionDetected(true);
  });

  window.addEventListener('sudokui:sync-status', (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail) {
      useLiveSync.getState().setExtensionDetected(true);
      useLiveSync.getState().setSourceConnected(Boolean(detail.connected));
      if (detail.lastSyncTime) {
        useLiveSync.setState({ lastSyncTime: detail.lastSyncTime });
      }
    }
  });

  window.addEventListener('sudokui:live-sync', (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail && detail.payload) {
      useLiveSync.getState().setExtensionDetected(true);
      useLiveSync.getState().applyLiveSync(detail.payload, detail.timestamp);
    }
  });

  if (
    typeof document !== 'undefined' &&
    document.documentElement?.getAttribute('data-sudokui-live-sync-extension') === 'true'
  ) {
    useLiveSync.getState().setExtensionDetected(true);
  }

  // Request latest on startup
  setTimeout(() => {
    useLiveSync.getState().requestLatest();
  }, 100);
}
