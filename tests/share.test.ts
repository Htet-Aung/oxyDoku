/**
 * Position-link encoding: the #s= payload must survive a round trip for
 * arbitrary board states — entries, marks, exclusions, colours — and
 * reject corrupt payloads instead of producing garbage boards.
 */
import { describe, it, expect } from 'vitest';
import { encodePosition, decodePosition, CellState, useGame } from '../src/state/gameStore';
import { sudokuWikiUrl, sudokuWikiUrlFromPuzzle, makeSudokuWikiPackedString } from '../src/content/share';
import { bit } from '../src/engine/board';

const EASY =
  '..3.2.6..9..3.5..1..18.64....81.29..7.......8..67.82....26.95..8..2.3..9..5.1.3..';

function fuzzedCells(seed: number): CellState[] {
  // deterministic pseudo-random board state derived from the puzzle
  let s = seed;
  const rnd = (n: number) => {
    s = (s * 48271) % 2147483647;
    return s % n;
  };
  return Array.from({ length: 81 }, (_, i) => {
    const given = EASY[i] !== '.';
    const cell: CellState = {
      given,
      value: given ? Number(EASY[i]) : rnd(4) === 0 ? 1 + rnd(9) : 0,
      corner: 0,
      center: 0,
      excluded: 0,
      colors: rnd(5) === 0 ? [rnd(9), (rnd(9) + 3) % 9].filter((v, k, a) => a.indexOf(v) === k) : []
    };
    if (!given && cell.value === 0) {
      cell.corner = rnd(512);
      cell.center = rnd(512);
      cell.excluded = rnd(512);
    }
    return cell;
  });
}

describe('position links', () => {
  it('round-trips arbitrary positions exactly', () => {
    for (const seed of [1, 42, 999]) {
      const cells = fuzzedCells(seed);
      for (const auto of [true, false]) {
        const encoded = encodePosition(cells, auto);
        expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(encoded.length).toBeLessThan(600);
        const decoded = decodePosition(encoded)!;
        expect(decoded).not.toBeNull();
        expect(decoded.autoCandidates).toBe(auto);
        expect(decoded.cells).toEqual(
          cells.map((c) => ({ ...c, colors: [...c.colors].sort((a, b) => a - b) }))
        );
      }
    }
  });

  it('rejects corrupt payloads', () => {
    expect(decodePosition('not!valid!chars!')).toBeNull();
    expect(decodePosition('')).toBeNull();
    const good = encodePosition(fuzzedCells(7), true);
    // flipping the version nibble must invalidate it
    expect(decodePosition('z' + good.slice(1))).toBeNull();
  });
});

describe('what a game remembers for its share link', () => {
  it('writes a puzzle with dots whatever the string said, so it always equals its own address', () => {
    const zeros = EASY.replace(/\./g, '0');
    useGame.getState().startGame(zeros, 196, 'Easy');
    expect(useGame.getState().info?.puzzle).toBe(EASY);
    expect(useGame.getState().cells.filter((c) => c.given)).toHaveLength(EASY.replace(/\./g, '').length);
  });

  it('keeps a challenger’s time through a restart, and drops it with a new puzzle', () => {
    useGame.getState().startGame(EASY, 196, 'Easy');
    useGame.setState((s) => ({ info: s.info && { ...s.info, challenge: 552 } }));
    useGame.getState().restart();
    expect(useGame.getState().info?.challenge).toBe(552);
    useGame.getState().startGame(EASY.replace('..3', '4.3'), 196, 'Easy');
    expect(useGame.getState().info?.challenge).toBeUndefined();
  });

  it('marks a game opened from a position link as begun part-way, until it restarts', () => {
    useGame.getState().startGame(EASY, 196, 'Easy');
    const encoded = encodePosition(fuzzedCells(3), true);
    expect(useGame.getState().loadPosition(encoded)).toBe(true);
    expect(useGame.getState().info?.fromPosition).toBe(true);
    useGame.getState().restart();
    expect(useGame.getState().info?.fromPosition).toBeUndefined();
  });
});

describe('a published daily on the board', () => {
  it('stays that daily through a restart', () => {
    useGame.getState().startGame(EASY, 196, 'Easy', null, '2026-10-07');
    useGame.setState((s) => ({ info: s.info && { ...s.info, dailyNo: 1 } }));
    useGame.getState().restart();
    expect(useGame.getState().info?.dailyNo).toBe(1);
    expect(useGame.getState().info?.dailyKey).toBe('2026-10-07');
  });
});

describe('SudokuWiki solver export URL', () => {
  it('formats initial puzzle with 0 for empty cells', () => {
    const url = sudokuWikiUrlFromPuzzle(EASY);
    expect(url).toMatch(/^https:\/\/www\.sudokuwiki\.org\/sudoku\.htm\?bd=\d{81}$/);
    const bd = new URL(url).searchParams.get('bd');
    expect(bd).toHaveLength(81);
    expect(bd).toBe(EASY.replace(/\./g, '0'));
  });

  it('exports board cells: givens only when includeEntries is false', () => {
    useGame.getState().startGame(EASY, 196, 'Easy');
    useGame.getState().setMode('digit');
    const emptyIndex = useGame.getState().cells.findIndex((c) => !c.given);
    useGame.getState().select([emptyIndex], false);
    useGame.getState().input(7);

    const cells = useGame.getState().cells;
    expect(cells[emptyIndex].value).toBe(7);

    const urlWithoutEntries = sudokuWikiUrl(cells, false);
    const bdWithout = new URL(urlWithoutEntries).searchParams.get('bd')!;
    expect(bdWithout[emptyIndex]).toBe('0');
    expect(bdWithout).toBe(EASY.replace(/\./g, '0'));
  });

  it('exports board cells: includes player entries when includeEntries is true', () => {
    useGame.getState().startGame(EASY, 196, 'Easy');
    useGame.getState().setMode('digit');
    const emptyIndex = useGame.getState().cells.findIndex((c) => !c.given);
    useGame.getState().select([emptyIndex], false);
    useGame.getState().input(7);

    const cells = useGame.getState().cells;
    const urlWithEntries = sudokuWikiUrl(cells, true);
    const bdWith = new URL(urlWithEntries).searchParams.get('bd')!;
    expect(bdWith[emptyIndex]).toBe('7');
    expect(bdWith).not.toBe(EASY.replace(/\./g, '0'));
  });

  it('exports notes in S9B packed format when candidate marks are present', () => {
    useGame.getState().startGame(EASY, 196, 'Easy');
    const emptyIndex = useGame.getState().cells.findIndex((c) => !c.given);
    useGame.getState().select([emptyIndex], false);
    useGame.getState().setMode('corner');
    useGame.getState().input(2);
    useGame.getState().input(5);

    const cells = useGame.getState().cells;
    expect(cells[emptyIndex].corner & bit(2)).not.toBe(0);
    expect(cells[emptyIndex].corner & bit(5)).not.toBe(0);

    const urlWithNotes = sudokuWikiUrl(cells, true);
    expect(urlWithNotes).toMatch(/^https:\/\/www\.sudokuwiki\.org\/sudoku\.htm\?bd=S9B[0-9a-z]{162}$/);
    const bd = new URL(urlWithNotes).searchParams.get('bd')!;
    expect(bd).toHaveLength(165);

    const cellEncoded = bd.slice(3 + emptyIndex * 2, 3 + emptyIndex * 2 + 2);
    const expectedMask = bit(2) | bit(5);
    const expectedValue = expectedMask + 18;
    expect(cellEncoded).toBe(expectedValue.toString(36).padStart(2, '0'));
  });

  it('excludes eliminated notes in S9B packed format when autoCandidates has exclusions', () => {
    useGame.getState().startGame(EASY, 196, 'Easy');
    const emptyIndex = useGame.getState().cells.findIndex((c) => !c.given);
    useGame.getState().toggleAutoCandidates();

    useGame.setState((s) => {
      const cells = s.cells.map((c, i) => (i === emptyIndex ? { ...c, excluded: bit(4) } : c));
      return { cells };
    });

    const cells = useGame.getState().cells;
    const url = sudokuWikiUrl(cells, true, { autoCandidates: true });
    expect(url).toMatch(/^https:\/\/www\.sudokuwiki\.org\/sudoku\.htm\?bd=S9B[0-9a-z]{162}$/);
    const bd = new URL(url).searchParams.get('bd')!;
    const cellEncoded = bd.slice(3 + emptyIndex * 2, 3 + emptyIndex * 2 + 2);
    const decodedNum = parseInt(cellEncoded, 36);
    const mask = decodedNum - 18;
    expect(mask & bit(4)).toBe(0);
  });

  it('encodes givens as 01..09 and player entries as 0a..0i in S9B packed format', () => {
    useGame.getState().startGame(EASY, 196, 'Easy');
    useGame.getState().setMode('digit');
    const givenIndex = useGame.getState().cells.findIndex((c) => c.given);
    const emptyIndex = useGame.getState().cells.findIndex((c) => !c.given);
    useGame.getState().select([emptyIndex], false);
    useGame.getState().input(7);

    const otherEmpty = useGame.getState().cells.findIndex((c, i) => !c.given && i !== emptyIndex);
    useGame.getState().select([otherEmpty], false);
    useGame.getState().setMode('center');
    useGame.getState().input(3);

    const cells = useGame.getState().cells;
    const url = sudokuWikiUrl(cells, true);
    const bd = new URL(url).searchParams.get('bd')!;

    const givenVal = cells[givenIndex].value;
    const givenEncoded = bd.slice(3 + givenIndex * 2, 3 + givenIndex * 2 + 2);
    expect(givenEncoded).toBe('0' + givenVal);

    const entryEncoded = bd.slice(3 + emptyIndex * 2, 3 + emptyIndex * 2 + 2);
    expect(entryEncoded).toBe((7 + 9).toString(36).padStart(2, '0'));
  });

  it('reverts to 81-character puzzle string when includeEntries is false even if notes exist', () => {
    useGame.getState().startGame(EASY, 196, 'Easy');
    const emptyIndex = useGame.getState().cells.findIndex((c) => !c.given);
    useGame.getState().select([emptyIndex], false);
    useGame.getState().setMode('corner');
    useGame.getState().input(2);

    const cells = useGame.getState().cells;
    const urlWithoutEntries = sudokuWikiUrl(cells, false);
    const bdWithout = new URL(urlWithoutEntries).searchParams.get('bd')!;
    expect(bdWithout).toHaveLength(81);
    expect(bdWithout).toBe(EASY.replace(/\./g, '0'));
  });
});
