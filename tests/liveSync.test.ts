import { describe, it, expect, beforeEach } from 'vitest';
import { useGame } from '../src/state/gameStore';
import { usePatternScanner } from '../src/state/scannerStore';
import {
  useLiveSync,
  computePositionSignature
} from '../src/state/syncStore';
import {
  parseSudokuExchangeSnapshot,
  validatePositionPayload,
  type PositionImportPayload
} from '../src/content/sudokuExchangeImport';
import { bit } from '../src/engine/board';

const storage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, String(v)),
  removeItem: (k: string) => storage.delete(k),
  clear: () => storage.clear()
};

describe('Sudoku Exchange Live Sync', () => {
  const PUZZLE_A =
    '000000000000003085001020000000507000004000100090000000500000073002010000000040009';
  const PUZZLE_B =
    '003020600900305001001806400008102900700000008006708200002609500800203009005010300';

  beforeEach(() => {
    localStorage.removeItem('sudokui-live-sync-last-sig');
    useGame.getState().startGame(PUZZLE_A, 500, 'Hard');

    // Reset stores to a known state
    useLiveSync.setState({
      isExtensionDetected: false,
      isSourceConnected: false,
      enabled: true,
      lastSyncTime: null,
      syncCount: 0,
      lastError: null,
      lastSignature: null,
      lastImportFidelity: null,
      lastPositionSummary: null
    });

    usePatternScanner.setState({
      isOpen: false,
      isScanning: false,
      scanResult: null,
      selectedInstanceId: null,
      boardFingerprintAtScan: null,
      isStale: false
    });
  });

  describe('Deduplication and Signatures', () => {
    it('computes distinct signatures for different positions and note types', () => {
      const p1: PositionImportPayload = {
        v: 1,
        source: 'sudokuexchange',
        fidelity: 'full',
        givens: PUZZLE_A,
        values: PUZZLE_A,
        corner: new Array(81).fill(0)
      };
      const p2: PositionImportPayload = {
        ...p1,
        corner: [bit(4), ...new Array(80).fill(0)]
      };
      const p3: PositionImportPayload = {
        ...p1,
        center: [bit(4), ...new Array(80).fill(0)]
      };

      const sig1 = computePositionSignature(p1);
      const sig2 = computePositionSignature(p2);
      const sig3 = computePositionSignature(p3);

      expect(sig1).not.toBe(sig2);
      expect(sig2).not.toBe(sig3);
      expect(sig1).not.toBe(sig3);
    });

    it('returns unchanged and skips re-render when identical payload is sent twice', () => {
      const payload: PositionImportPayload = {
        v: 1,
        source: 'sudokuexchange',
        fidelity: 'grid-only',
        givens: PUZZLE_A,
        values: PUZZLE_A
      };

      const first = useLiveSync.getState().applyLiveSync(payload);
      expect(first.ok).toBe(true);
      expect(first.status).toBe('applied');
      expect(useLiveSync.getState().syncCount).toBe(1);

      const second = useLiveSync.getState().applyLiveSync(payload);
      expect(second.ok).toBe(true);
      expect(second.status).toBe('unchanged');
      expect(useLiveSync.getState().syncCount).toBe(1);
    });
  });

  describe('In-place Board Update Fidelity', () => {
    it('updates board in place preserving timer and without prompt when same puzzle is played', () => {
      // Initialize with PUZZLE_A
      useGame.getState().startGame(PUZZLE_A, 500, 'Hard');
      const originalStartedAt = useGame.getState().startedAt;

      // Player makes moves on Sudoku Exchange: places a digit at cell 0
      const newValues = '4' + PUZZLE_A.slice(1);
      const payload: PositionImportPayload = {
        v: 1,
        source: 'sudokuexchange',
        fidelity: 'full',
        givens: PUZZLE_A,
        values: newValues,
        corner: new Array(81).fill(0),
        center: new Array(81).fill(0)
      };

      const res = useLiveSync.getState().applyLiveSync(payload);
      expect(res.ok).toBe(true);

      const current = useGame.getState();
      expect(current.cells[0].value).toBe(4);
      expect(current.cells[0].given).toBe(false);
      // Preserves original timer
      expect(current.startedAt).toBe(originalStartedAt);
      // Does NOT set pendingPositionImport (no confirmation dialog prompt)
      expect(current.pendingPositionImport).toBeNull();
    });

    it('strictly preserves corner and centre notes distinctly in live synced positions', () => {
      const cornerArr = new Array(81).fill(0);
      const centerArr = new Array(81).fill(0);
      const colorsArr = new Array(81).fill(0);

      // Cell 0 has corner 2 & 7
      cornerArr[0] = bit(2) | bit(7);
      // Cell 1 has centre 3 & 8
      centerArr[1] = bit(3) | bit(8);
      // Cell 2 has both corner 1 and centre 9
      cornerArr[2] = bit(1);
      centerArr[2] = bit(9);
      // Cell 3 has color code 2 (maps to 0-based palette index 1)
      colorsArr[3] = 2;

      const payload: PositionImportPayload = {
        v: 1,
        source: 'sudokuexchange',
        fidelity: 'full',
        givens: PUZZLE_A,
        values: PUZZLE_A,
        corner: cornerArr,
        center: centerArr,
        colors: colorsArr
      };

      const res = useLiveSync.getState().applyLiveSync(payload);
      expect(res.ok).toBe(true);

      const cells = useGame.getState().cells;
      expect(cells[0].corner).toBe(bit(2) | bit(7));
      expect(cells[0].center).toBe(0);

      expect(cells[1].corner).toBe(0);
      expect(cells[1].center).toBe(bit(3) | bit(8));

      expect(cells[2].corner).toBe(bit(1));
      expect(cells[2].center).toBe(bit(9));

      // Color code 2 is converted to palette index 1
      expect(cells[3].colors).toEqual([1]);
    });
  });

  describe('Scanner Staleness & Non-Mutating Isolation', () => {
    it('marks scanner as stale on live-sync updates but NEVER auto-triggers pattern scanner', () => {
      // 1. Start puzzle and open scanner without autoScan
      useGame.getState().startGame(PUZZLE_A, 500, 'Hard');
      const scanner = usePatternScanner.getState();
      scanner.openScanner({ autoScan: false });

      // Simulate a completed scan with results
      const fakeResult = {
        board: [] as any,
        instances: [],
        byTech: {},
        byOutcome: {},
        categories: [],
        techCounts: {},
        summary: { totalInstances: 2, totalPlacements: 0, totalEliminations: 2, techniqueCount: 1 },
        durationMs: 15,
        truncated: false
      };
      usePatternScanner.setState({
        scanResult: fakeResult as any,
        boardFingerprintAtScan: 'fingerprint-at-initial-state',
        isStale: false,
        isScanning: false
      });

      expect(usePatternScanner.getState().isStale).toBe(false);
      expect(usePatternScanner.getState().isScanning).toBe(false);

      // 2. User makes a move on Sudoku Exchange: place digit 4 at cell 0
      const newValues = '4' + PUZZLE_A.slice(1);
      const syncPayload: PositionImportPayload = {
        v: 1,
        source: 'sudokuexchange',
        fidelity: 'full',
        givens: PUZZLE_A,
        values: newValues
      };

      // 3. Live sync applies update
      const syncRes = useLiveSync.getState().applyLiveSync(syncPayload);
      expect(syncRes.ok).toBe(true);

      // Scanner must be marked stale
      expect(usePatternScanner.getState().isStale).toBe(true);

      // CRITICAL: Pattern scanner MUST NOT run automatically!
      // The result should still be the fakeResult (not re-scanned or replaced in the background)
      expect(usePatternScanner.getState().scanResult).toBe(fakeResult);
      expect(usePatternScanner.getState().isScanning).toBe(false);
    });

    it('dismisses active step hint on board when position changes to prevent phantom overlays', () => {
      useGame.getState().startGame(PUZZLE_A, 500, 'Hard');

      // Suppose user clicked a pattern and a hint is active
      const fakeStep = {
        tech: 'NakedSingle' as any,
        cell: 0,
        digit: 4,
        placements: [{ cell: 0, digit: 4 }],
        eliminations: []
      };
      useGame.getState().showStep(fakeStep as any);
      expect(useGame.getState().hint).not.toBeNull();

      // Live sync updates the board
      const newValues = '4' + PUZZLE_A.slice(1);
      const syncPayload: PositionImportPayload = {
        v: 1,
        source: 'sudokuexchange',
        fidelity: 'full',
        givens: PUZZLE_A,
        values: newValues
      };
      useLiveSync.getState().applyLiveSync(syncPayload);

      // Hint must be dismissed
      expect(useGame.getState().hint).toBeNull();
      expect(usePatternScanner.getState().selectedInstanceId).toBeNull();
    });
  });

  describe('New Puzzle Transition', () => {
    it('seamlessly loads new puzzle and clears old scanner results when puzzle givens change', () => {
      // Currently playing PUZZLE_A with active scanner results
      useGame.getState().startGame(PUZZLE_A, 500, 'Hard');
      usePatternScanner.setState({
        scanResult: { instances: [] } as any,
        isStale: false
      });

      // User opens a new puzzle (PUZZLE_B) on Sudoku Exchange
      const newPuzzlePayload: PositionImportPayload = {
        v: 1,
        source: 'sudokuexchange',
        fidelity: 'grid-only',
        givens: PUZZLE_B,
        values: PUZZLE_B
      };

      const res = useLiveSync.getState().applyLiveSync(newPuzzlePayload);
      expect(res.ok).toBe(true);

      const gameState = useGame.getState();
      expect(gameState.info?.puzzle).toBe(PUZZLE_B.replace(/0/g, '.'));
      // Scanner results reset for the new puzzle
      expect(usePatternScanner.getState().scanResult).toBeNull();
      expect(usePatternScanner.getState().isStale).toBe(false);
    });
  });

  describe('Control Options & Error Handling', () => {
    it('rejects sync when live sync is disabled by user', () => {
      useLiveSync.getState().setEnabled(false);

      const payload: PositionImportPayload = {
        v: 1,
        source: 'sudokuexchange',
        fidelity: 'grid-only',
        givens: PUZZLE_A,
        values: PUZZLE_A
      };

      const res = useLiveSync.getState().applyLiveSync(payload);
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('Live sync is disabled');
    });

    it('handles conflicting givens or invalid payload gracefully without breaking game state', () => {
      useGame.getState().startGame(PUZZLE_A, 500, 'Hard');

      // Conflicting entries in row 1: two '4's in row 1
      const badValues = '44' + PUZZLE_A.slice(2);
      const badPayload: PositionImportPayload = {
        v: 1,
        source: 'sudokuexchange',
        fidelity: 'grid-only',
        givens: PUZZLE_A,
        values: badValues
      };

      const res = useLiveSync.getState().applyLiveSync(badPayload);
      expect(res.ok).toBe(false);
      expect(useLiveSync.getState().lastError).toBe('conflicting-entries');
    });

    it('protects local oxyDoku moves from being overwritten when Sudoku Exchange is behind', () => {
      // Initialize with PUZZLE_A
      useGame.getState().startGame(PUZZLE_A, 500, 'Hard');

      // User makes moves directly on oxyDoku: places digit 4 at cell 0 and 7 at cell 1
      useGame.setState((s) => {
        const cells = s.cells.map((c, i) => {
          if (i === 0) return { ...c, value: 4, given: false };
          if (i === 1) return { ...c, value: 7, given: false };
          return c;
        });
        return { cells };
      });

      // Sudoku Exchange sends an older/lagging snapshot with only cell 0 = 4 (missing cell 1 = 7)
      const olderPayload: PositionImportPayload = {
        v: 1,
        source: 'sudokuexchange',
        fidelity: 'full',
        givens: PUZZLE_A,
        values: '40' + PUZZLE_A.slice(2),
        corner: new Array(81).fill(0),
        center: new Array(81).fill(0)
      };

      const res = useLiveSync.getState().applyLiveSync(olderPayload);
      expect(res.ok).toBe(false);
      expect(res.status).toBe('conflict');

      // Local oxyDoku progress must be completely preserved!
      const cells = useGame.getState().cells;
      expect(cells[0].value).toBe(4);
      expect(cells[1].value).toBe(7);
    });

    it('persists lastSignature across sessions and recognizes unchanged position on reload', () => {
      const payload: PositionImportPayload = {
        v: 1,
        source: 'sudokuexchange',
        fidelity: 'grid-only',
        givens: PUZZLE_A,
        values: PUZZLE_A
      };

      const res = useLiveSync.getState().applyLiveSync(payload);
      expect(res.ok).toBe(true);

      const savedSig = localStorage.getItem('sudokui-live-sync-last-sig');
      expect(savedSig).toBeTruthy();

      // Sending the same payload again (as happens when extension reconnects on page reload)
      const reloadSync = useLiveSync.getState().applyLiveSync(payload);
      expect(reloadSync.ok).toBe(true);
      expect(reloadSync.status).toBe('unchanged');
    });
  });

  describe('Snapshot String Extraction', () => {
    it('correctly parses Sudoku Exchange snapshot string tokens', () => {
      // 11D4: cell (0,0) has digit 4
      // 12T27: cell (0,1) has corner/outer marks 2, 7
      // 13N38: cell (0,2) has inner/center marks 3, 8
      // 14C3: cell (0,3) has color 2
      const snapshot = '11D4,12T27,13N38,14C3';
      const parsed = parseSudokuExchangeSnapshot(PUZZLE_A, snapshot);

      expect(parsed).not.toBeNull();
      expect(parsed!.values[0]).toBe('4');
      expect(parsed!.corner![1]).toBe(bit(2) | bit(7));
      expect(parsed!.center![2]).toBe(bit(3) | bit(8));
      expect(parsed!.colors![3]).toBe(2);
    });
  });
});
