import { describe, it, expect, beforeEach } from 'vitest';
import { useGame, validatePuzzle, rateImport } from '../src/state/gameStore';
import { usePatternScanner } from '../src/state/scannerStore';
import { findAllPatternInstances } from '../src/engine/scanner';
import { parseGrid } from '../src/engine/board';

describe('Custom Games & Imported Levels: HoDoKu Rating & Pattern Scanning', () => {
  beforeEach(() => {
    // Reset stores to a clean initial state
    useGame.setState({
      info: null,
      custom: false,
      customBackup: null,
      scanPreview: null,
      scanDoubts: [],
      hint: null,
      hintStage: 'hidden'
    });
    usePatternScanner.setState({
      isOpen: false,
      isScanning: false,
      scanResult: null,
      selectedInstanceId: null
    });
  });

  const SAMPLE_PUZZLE = '..3.2.6..9..3.5..1..18.64....81.29..7.......8..67.82....26.95..8..2.3..9..5.1.3..';

  describe('HoDoKu Rating & Puzzle Validation', () => {
    it('rates and validates a proper custom/imported puzzle with unique solution', () => {
      const v = validatePuzzle(SAMPLE_PUZZLE);
      expect(v.ok).toBe(true);
      if (v.ok) {
        expect(v.score).toBeGreaterThan(0);
        expect(['Easy', 'Medium', 'Hard', 'Unfair', 'Extreme']).toContain(v.level);
      }
    });

    it('rejects invalid puzzles with conflicting givens', () => {
      // Create conflict: two '3's in row 1
      const broken = '3.3.2.6..9..3.5..1..18.64....81.29..7.......8..67.82....26.95..8..2.3..9..5.1.3..';
      const v = validatePuzzle(broken);
      expect(v.ok).toBe(false);
      if (!v.ok) {
        expect(v.reason).toMatch(/conflicting|share a row/i);
      }
    });

    it('rejects puzzles with fewer than 17 givens', () => {
      const fewGivens = '123456789' + '.'.repeat(72);
      const v = validatePuzzle(fewGivens);
      expect(v.ok).toBe(false);
      if (!v.ok) {
        expect(v.reason).toMatch(/at least 17/i);
      }
    });

    it('rateImport wrapper returns score and level for valid puzzle', () => {
      const rating = rateImport(SAMPLE_PUZZLE);
      expect(rating).not.toBeNull();
      expect(rating!.score).toBeGreaterThan(0);
      expect(['Easy', 'Medium', 'Hard', 'Unfair', 'Extreme']).toContain(rating!.level);
    });
  });

  describe('Custom Entry Flow', () => {
    it('initializes custom entry, accepts givens, and calculates rating upon finish', () => {
      const game = useGame.getState();
      game.startCustomEntry();
      expect(useGame.getState().custom).toBe(true);

      // Populate cells from sample puzzle
      const cells = useGame.getState().cells.map((c, i) => {
        const ch = SAMPLE_PUZZLE[i];
        return {
          ...c,
          value: ch !== '.' && ch !== '0' ? Number(ch) : 0
        };
      });
      useGame.setState({ cells });

      // Live validation during custom entry
      const puzzleStr = useGame.getState().cells.map((c) => (c.value ? String(c.value) : '.')).join('');
      const preview = validatePuzzle(puzzleStr);
      expect(preview.ok).toBe(true);

      // Finish custom entry
      const err = game.finishCustomEntry();
      expect(err).toBeNull();

      const finalState = useGame.getState();
      expect(finalState.custom).toBe(false);
      expect(finalState.info).not.toBeNull();
      expect(finalState.info?.puzzle).toBe(SAMPLE_PUZZLE);
      expect(finalState.info?.score).toBe(preview.ok ? preview.score : 0);
      expect(finalState.info?.level).toBe(preview.ok ? preview.level : 'Easy');
    });

    it('allows pattern scanning on a puzzle started from custom entry', () => {
      const game = useGame.getState();
      game.startCustomEntry();

      const cells = useGame.getState().cells.map((c, i) => {
        const ch = SAMPLE_PUZZLE[i];
        return {
          ...c,
          value: ch !== '.' && ch !== '0' ? Number(ch) : 0
        };
      });
      useGame.setState({ cells });

      const err = game.finishCustomEntry();
      expect(err).toBeNull();

      // Run pattern scan on the custom game
      const grid = parseGrid(SAMPLE_PUZZLE);
      expect(grid).not.toBeNull();
      const scanResult = findAllPatternInstances(grid!);
      expect(scanResult.instances.length).toBeGreaterThan(0);

      // Store-level scanner open
      usePatternScanner.getState().openScanner({ autoScan: true });
      expect(usePatternScanner.getState().isOpen).toBe(true);
    });
  });

  describe('Photo Scan Flow', () => {
    it('loads digits into custom entry, preserves doubts, and allows check & scan', () => {
      const digits = Array.from({ length: 81 }, (_, i) => {
        const ch = SAMPLE_PUZZLE[i];
        return ch !== '.' ? Number(ch) : 0;
      });
      const doubts = [2, 10]; // Doubtful cells from scanner
      const previewDataUri = 'data:image/png;base64,fake';

      useGame.getState().loadScan(digits, doubts, previewDataUri);

      const state = useGame.getState();
      expect(state.custom).toBe(true);
      expect(state.scanPreview).toBe(previewDataUri);
      expect(state.scanDoubts).toEqual(doubts);

      // Verify doubtful cells have color highlight
      expect(state.cells[2].colors).toEqual([0]);
      expect(state.cells[10].colors).toEqual([0]);

      // Finish custom entry
      const err = state.finishCustomEntry();
      expect(err).toBeNull();

      const started = useGame.getState();
      expect(started.custom).toBe(false);
      expect(started.info?.score).toBeGreaterThan(0);
      expect(started.info?.level).toBeDefined();
    });
  });

  describe('Import Flow', () => {
    it('importPuzzle validates, starts game, and assigns HoDoKu rating', () => {
      const err = useGame.getState().importPuzzle(SAMPLE_PUZZLE, 'Sudoku Exchange');
      expect(err).toBeNull();

      const info = useGame.getState().info;
      expect(info).not.toBeNull();
      expect(info?.score).toBeGreaterThan(0);
      expect(info?.level).toBeDefined();

      // Ensure pattern scanner runs cleanly on the imported puzzle
      const grid = parseGrid(info!.puzzle);
      const scan = findAllPatternInstances(grid!);
      expect(scan.instances.length).toBeGreaterThan(0);
    });

    it('importText validates text position, preserves candidates, and rates puzzle', () => {
      const values = Array.from({ length: 81 }, (_, i) => {
        const ch = SAMPLE_PUZZLE[i];
        return ch !== '.' ? Number(ch) : 0;
      });
      const position = {
        values,
        given: values.map((v) => v > 0),
        cands: null
      };

      const err = useGame.getState().importText(position);
      expect(err).toBeNull();

      const info = useGame.getState().info;
      expect(info).not.toBeNull();
      expect(info?.score).toBeGreaterThan(0);
      expect(info?.level).toBeDefined();
    });
  });
});
