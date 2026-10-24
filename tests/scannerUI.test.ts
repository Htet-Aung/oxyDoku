import { describe, it, expect, beforeEach } from 'vitest';
import { useGame } from '../src/state/gameStore';
import { usePatternScanner, getBoardFingerprint } from '../src/state/scannerStore';
import { bit } from '../src/engine/board';

// A puzzle with multiple techniques available at once
const HARD_PUZZLE =
  '...6..9.1..95....4....4985..241....5....3....9....546..7549....3....12..1.2..3...';

describe('Pattern Scanner UI & Store', () => {
  beforeEach(() => {
    // Start fresh game with auto candidates
    useGame.getState().startGame(HARD_PUZZLE, 1348, 'Hard');
    useGame.setState({ autoCandidates: true });

    // Reset scanner store to default closed state
    usePatternScanner.setState({
      isOpen: false,
      isScanning: false,
      scanResult: null,
      selectedInstanceId: null,
      boardFingerprintAtScan: null,
      isStale: false,
      groupBy: 'technique'
    });
    usePatternScanner.getState().resetFilter();
  });

  it('starts closed and opens on openScanner()', async () => {
    expect(usePatternScanner.getState().isOpen).toBe(false);

    usePatternScanner.getState().openScanner({ autoScan: true });
    expect(usePatternScanner.getState().isOpen).toBe(true);

    // Wait for the deferred scan to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    const state = usePatternScanner.getState();
    expect(state.scanResult).not.toBeNull();
    expect(state.scanResult!.instances.length).toBeGreaterThan(0);
    expect(state.isScanning).toBe(false);
  });

  it('is strictly non-mutating on scan and selection', async () => {
    const cellsBefore = JSON.stringify(useGame.getState().cells);

    usePatternScanner.getState().openScanner();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Cells must not be modified by scanning
    const cellsAfterScan = JSON.stringify(useGame.getState().cells);
    expect(cellsAfterScan).toBe(cellsBefore);

    const result = usePatternScanner.getState().scanResult;
    expect(result).not.toBeNull();
    expect(result!.instances.length).toBeGreaterThan(0);

    // Select the first instance
    const first = result!.instances[0];
    usePatternScanner.getState().selectInstance(first.id);

    // Highlighting sets hint in useGame, but does NOT mutate cells
    expect(useGame.getState().hint).not.toBeNull();
    expect(useGame.getState().hint?.tech).toBe(first.tech);
    expect(JSON.stringify(useGame.getState().cells)).toBe(cellsBefore);

    // Deselecting clears hint
    usePatternScanner.getState().selectInstance(null);
    expect(useGame.getState().hint).toBeNull();
    expect(JSON.stringify(useGame.getState().cells)).toBe(cellsBefore);
  });

  it('supports grouping by technique and grouping by outcome', async () => {
    usePatternScanner.getState().openScanner();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const result = usePatternScanner.getState().scanResult!;
    expect(Object.keys(result.byTech).length).toBeGreaterThan(0);
    expect(Object.keys(result.byConclusion).length).toBeGreaterThan(0);

    // Toggle groupBy
    usePatternScanner.getState().setGroupBy('outcome');
    expect(usePatternScanner.getState().groupBy).toBe('outcome');

    usePatternScanner.getState().setGroupBy('technique');
    expect(usePatternScanner.getState().groupBy).toBe('technique');
  });

  it('detects staleness when the board changes and refreshes on rescan', async () => {
    usePatternScanner.getState().openScanner();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(usePatternScanner.getState().isStale).toBe(false);

    // Change a cell value on the board
    const currentCells = useGame.getState().cells;
    const newCells = currentCells.map((c, i) =>
      i === 0 ? { ...c, value: 5, corner: 0, center: 0 } : { ...c }
    );
    useGame.setState({ cells: newCells });

    // Check staleness
    usePatternScanner.getState().checkStaleness();
    expect(usePatternScanner.getState().isStale).toBe(true);

    // Rescanning updates the fingerprint and clears staleness
    usePatternScanner.getState().runScan();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(usePatternScanner.getState().isStale).toBe(false);
  });

  it('filters instances by query and category', async () => {
    usePatternScanner.getState().openScanner();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const allInstances = usePatternScanner.getState().scanResult!.instances;
    expect(allInstances.length).toBeGreaterThan(0);

    // Filter by category
    usePatternScanner.getState().setFilter({ category: 'Singles' });
    expect(usePatternScanner.getState().filter.category).toBe('Singles');

    // Filter by query
    usePatternScanner.getState().setFilter({ query: 'naked' });
    expect(usePatternScanner.getState().filter.query).toBe('naked');

    // Reset filter
    usePatternScanner.getState().resetFilter();
    expect(usePatternScanner.getState().filter.category).toBe('all');
    expect(usePatternScanner.getState().filter.query).toBe('');
  });

  it('allows applying deduction explicitly and updating board history', async () => {
    usePatternScanner.getState().openScanner();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const result = usePatternScanner.getState().scanResult!;
    // Find an instance with eliminations or placements
    const inst = result.instances.find(
      (i) => i.step.eliminations.length > 0 || i.step.placements.length > 0
    );
    expect(inst).toBeDefined();

    usePatternScanner.getState().selectInstance(inst!.id);
    const historyLenBefore = useGame.getState().history.length;

    // Explicitly apply deduction
    const applied = usePatternScanner.getState().applySelectedDeduction();
    expect(applied).toBe(true);
    expect(useGame.getState().history.length).toBe(historyLenBefore + 1);

    // After applying, wait for auto-rescan
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(usePatternScanner.getState().scanResult).not.toBeNull();

    // Undo restores previous board state
    useGame.getState().undo();
    expect(useGame.getState().history.length).toBe(historyLenBefore);
  });

  it('closing scanner clears board highlight', async () => {
    usePatternScanner.getState().openScanner();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const first = usePatternScanner.getState().scanResult!.instances[0];
    usePatternScanner.getState().selectInstance(first.id);
    expect(useGame.getState().hint).not.toBeNull();

    usePatternScanner.getState().closeScanner();
    expect(usePatternScanner.getState().isOpen).toBe(false);
    expect(usePatternScanner.getState().selectedInstanceId).toBeNull();
    expect(useGame.getState().hint).toBeNull();
  });
});
