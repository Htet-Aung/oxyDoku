import { describe, it, expect } from 'vitest';
import { computePeerHighlights } from '../src/ui/Grid';

describe('computePeerHighlights', () => {
  const emptyBoard = Array.from({ length: 81 }, () => ({ value: 0 }));

  const makeBoard = (placements: Record<number, number>) => {
    return Array.from({ length: 81 }, (_, i) => ({
      value: placements[i] ?? 0
    }));
  };

  it('returns empty set if highlightPeers is false', () => {
    const board = makeBoard({ 0: 1, 80: 1 });
    expect(computePeerHighlights(board, [0], false).size).toBe(0);
    expect(computePeerHighlights(board, [0, 80], false).size).toBe(0);
  });

  it('returns empty set if selection is empty', () => {
    const board = makeBoard({ 0: 1 });
    expect(computePeerHighlights(board, [], true).size).toBe(0);
  });

  it('highlights 21 peer cells for a single empty cell (cursor crosshair)', () => {
    // Cell 0: row 0 (9 cells), col 0 (9 cells), box 0 (9 cells)
    // Overlap: cell 0 (in row, col, box), cells (0,1), (0,2) in row+box, cells (1,0), (2,0) in col+box
    // Unique cells: 9 (row) + 8 (other cells in col) + 4 (remaining in box) = 21 cells
    const peers = computePeerHighlights(emptyBoard, [0], true);
    expect(peers.size).toBe(21);
    expect(peers.has(0)).toBe(true);
    expect(peers.has(8)).toBe(true); // row 0 end
    expect(peers.has(72)).toBe(true); // col 0 end
    expect(peers.has(20)).toBe(true); // box 0 bottom-right (r2, c2 -> 2*9+2=20)
    expect(peers.has(21)).toBe(false); // r2, c3 -> not in box 0, not in row 0, not in col 0
  });

  it('highlights 21 peer cells for a single filled cell', () => {
    const board = makeBoard({ 40: 5 }); // center cell (r4, c4)
    const peers = computePeerHighlights(board, [40], true);
    expect(peers.size).toBe(21);
    expect(peers.has(40)).toBe(true);
    expect(peers.has(36)).toBe(true); // row 4 start
    expect(peers.has(4)).toBe(true); // col 4 top
  });

  it('highlights the union of covered squares when selecting two cells of the same number', () => {
    // Top-left 1 at cell 0 (r0, c0, b0) and bottom-right 1 at cell 80 (r8, c8, b8)
    const board = makeBoard({ 0: 1, 80: 1 });
    const peers = computePeerHighlights(board, [0, 80], true);

    // Should cover all peers of cell 0 AND all peers of cell 80
    expect(peers.has(0)).toBe(true);
    expect(peers.has(8)).toBe(true); // cell 0's row
    expect(peers.has(72)).toBe(true); // cell 0's col
    expect(peers.has(20)).toBe(true); // cell 0's box

    expect(peers.has(80)).toBe(true);
    expect(peers.has(79)).toBe(true); // cell 80's row
    expect(peers.has(8)).toBe(true); // cell 80's col top
    expect(peers.has(60)).toBe(true); // cell 80's box top-left (r6, c6 -> 6*9+6=60)

    // Cell 0 and cell 80 do not share box, row, or col.
    // Row 0 has col 8 (cell 8) and Col 0 has row 8 (cell 72) which intersect cell 80's sightlines.
    // Total unique cells: 21 (cell 0) + 21 (cell 80) - 2 (intersections at cell 8 and 72) = 40 cells.
    expect(peers.size).toBe(40);
  });

  it('highlights the union of covered squares for three cells of the same number', () => {
    // Cells 0 (r0, c0), 40 (r4, c4), 80 (r8, c8) all with digit 7
    const board = makeBoard({ 0: 7, 40: 7, 80: 7 });
    const peers = computePeerHighlights(board, [0, 40, 80], true);

    expect(peers.has(0)).toBe(true);
    expect(peers.has(40)).toBe(true);
    expect(peers.has(80)).toBe(true);
    expect(peers.size).toBeGreaterThan(40);
  });

  it('does NOT highlight when multiple selected cells contain different numbers', () => {
    // Cell 0 is 1, Cell 10 is 2
    const board = makeBoard({ 0: 1, 10: 2 });
    const peers = computePeerHighlights(board, [0, 10], true);
    expect(peers.size).toBe(0);
  });

  it('does NOT highlight when multiple empty cells are selected (for note entry)', () => {
    const peers = computePeerHighlights(emptyBoard, [0, 1, 2, 9, 10, 11], true);
    expect(peers.size).toBe(0);
  });

  it('does NOT highlight when one filled cell and one empty cell are selected', () => {
    const board = makeBoard({ 0: 1 });
    const peers = computePeerHighlights(board, [0, 1], true);
    expect(peers.size).toBe(0);
  });
});
