import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  POSITION_IMPORT_VERSION,
  POSITION_IMPORT_HASH_PARAM,
  MAX_POSITION_PAYLOAD_LENGTH,
  encodePositionPayload,
  decodePositionPayload,
  buildPositionImportUrl,
  extractPositionParamFromInput,
  looksLikePositionImport,
  validatePositionPayload,
  parseAndValidatePositionImport,
  parseSudokuExchangeSnapshot,
  extractSudokuExchangePosition,
  buildSudokuExchangeBookmarklet,
  type PositionImportPayload
} from '../src/content/sudokuExchangeImport';
import { useGame, contractGrid, engineGrid } from '../src/state/gameStore';
import { findAllPatternInstances } from '../src/engine/humanSolver';
import { bit } from '../src/engine/board';
import { puzzleFromLink } from '../src/content/importLinks';
import { parsePencilGrid, formatPencilGrid } from '../src/content/textGrid';

const SAMPLE_GIVENS =
  '003020600900305001001806400008102900700000008006708200002609500800203009005010300';

// Same puzzle with player entries at r1c1=4 (idx 0), r1c2=8 (idx 1), r1c4=9 (idx 3)
const SAMPLE_VALUES =
  '483920600900305001001806400008102900700000008006708200002609500800203009005010300';

function resetGameStore() {
  useGame.setState({
    info: null,
    cells: Array.from({ length: 81 }, () => ({
      given: false,
      value: 0,
      corner: 0,
      center: 0,
      excluded: 0,
      colors: []
    })),
    custom: false,
    customBackup: null,
    selection: [],
    armedDigit: null,
    pendingAssist: null,
    mode: 'digit',
    tempMode: null,
    activeColor: 0,
    autoCandidates: false,
    history: [],
    future: [],
    startedAt: Date.now(),
    elapsedBefore: 0,
    paused: false,
    won: false,
    counted: false,
    solved: false,
    assisted: false,
    hint: null,
    hintWith: null,
    hintStage: 'hidden',
    walkIndex: 0,
    markContract: 'unknown',
    contractPrompt: false,
    contractFor: 'hint',
    errors: [],
    proofs: [],
    notice: null,
    multiSelect: false,
    revertIndex: null,
    practiceTarget: null,
    practiceFound: false,
    chain: null,
    chainNote: '',
    scanPreview: null,
    scanDoubts: [],
    chainGoal: null,
    chainSuggest: false,
    pendingPositionImport: null,
    lastImportFidelity: null
  });
}

describe('Phase 1.5 — Exact Position Import from Sudoku Exchange', () => {
  beforeEach(() => {
    resetGameStore();
  });

  it('1 & 2. imports a complete position payload preserving givens separately from player entries', () => {
    const corner = new Array<number>(81).fill(0);
    const center = new Array<number>(81).fill(0);
    const colors = new Array<number>(81).fill(0);

    // Add corner marks {1, 7} on empty cell r1c6 (idx 5)
    corner[5] = bit(1) | bit(7);
    // Add centre marks {5, 7} on empty cell r1c8 (idx 7, true solution is 5)
    center[7] = bit(5) | bit(7);
    // Add colour code 3 (palette index 2) on cell r1c1 (idx 0)
    colors[0] = 3;

    const payload: PositionImportPayload = {
      v: POSITION_IMPORT_VERSION,
      source: 'sudokuexchange',
      fidelity: 'full',
      givens: SAMPLE_GIVENS,
      values: SAMPLE_VALUES,
      corner,
      center,
      colors
    };

    const encoded = encodePositionPayload(payload);
    const outcome = useGame.getState().importPositionPayload(encoded);

    expect(outcome).toEqual({
      ok: true,
      status: 'imported',
      fidelity: 'full'
    });

    const state = useGame.getState();
    expect(state.lastImportFidelity).toBe('full');
    expect(state.info?.fromPosition).toBe(true);
    expect(state.info?.puzzle).toBe(SAMPLE_GIVENS.replace(/0/g, '.'));
    expect(state.notice).toContain('Full position imported from Sudoku Exchange');

    // Original givens are marked given: true
    expect(state.cells[2].given).toBe(true);
    expect(state.cells[2].value).toBe(3);
    expect(state.cells[4].given).toBe(true);
    expect(state.cells[4].value).toBe(2);

    // Player-entered digits are marked given: false with their entered value
    expect(state.cells[0].given).toBe(false);
    expect(state.cells[0].value).toBe(4);
    expect(state.cells[0].colors).toEqual([2]);
    expect(state.cells[1].given).toBe(false);
    expect(state.cells[1].value).toBe(8);
    expect(state.cells[3].given).toBe(false);
    expect(state.cells[3].value).toBe(9);

    // Empty cells preserve corner and centre pencil marks
    expect(state.cells[5].given).toBe(false);
    expect(state.cells[5].value).toBe(0);
    expect(state.cells[5].corner).toBe(bit(1) | bit(7));
    expect(state.cells[7].given).toBe(false);
    expect(state.cells[7].value).toBe(0);
    expect(state.cells[7].center).toBe(bit(5) | bit(7));
  });

  it('3. preserves candidate notes and exclusions for non-mutating pattern scanning', () => {
    const center = new Array<number>(81).fill(0);
    const excluded = new Array<number>(81).fill(0);
    // In SAMPLE_VALUES, r1c8 (idx 7) canonically allows {5, 7}. Narrow it via centre mark to {5, 7}
    // and in r1c9 (idx 8, canonical {5, 7}), exclude candidate 5 via `excluded` so only {7} remains
    center[7] = bit(5) | bit(7);
    excluded[8] = bit(5);

    const payload: PositionImportPayload = {
      v: POSITION_IMPORT_VERSION,
      source: 'sudokuexchange',
      fidelity: 'full',
      givens: SAMPLE_GIVENS,
      values: SAMPLE_VALUES,
      center,
      excluded
    };

    const res = useGame.getState().importPositionPayload(payload);
    expect(res.ok).toBe(true);

    const state = useGame.getState();
    const cg = contractGrid(state.cells, state.autoCandidates, state.markContract);
    expect(cg.cands[7]).toBe(bit(5) | bit(7));
    expect(cg.cands[8] & bit(5)).toBe(0);

    // Scanning the imported position finds pattern instances without mutating the board
    const cellsBefore = JSON.stringify(state.cells);
    const scan = findAllPatternInstances(cg);
    expect(scan.instances.length).toBeGreaterThan(0);
    expect(JSON.stringify(useGame.getState().cells)).toBe(cellsBefore);
  });

  it('4. handles grid-only positions honestly when candidate notes are absent (even if payload claims full)', () => {
    // Payload claims fidelity: 'full' but supplies no candidate notes on empty cells
    const payload: PositionImportPayload = {
      v: POSITION_IMPORT_VERSION,
      source: 'sudokuexchange',
      fidelity: 'full',
      givens: SAMPLE_GIVENS,
      values: SAMPLE_VALUES
    };

    const validated = validatePositionPayload(payload);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    // Honest fidelity check downgrades 'full' to 'grid-only' when 0 empty cells have candidate notes
    expect(validated.fidelity).toBe('grid-only');
    expect(validated.markedCellCount).toBe(0);
    expect(validated.entryCount).toBe(3);

    const outcome = useGame.getState().importPositionPayload(payload);
    expect(outcome).toEqual({
      ok: true,
      status: 'imported',
      fidelity: 'grid-only'
    });

    const state = useGame.getState();
    expect(state.lastImportFidelity).toBe('grid-only');
    expect(state.autoCandidates).toBe(true);
    expect(state.notice).toContain('Grid imported from Sudoku Exchange');
    expect(state.notice).toContain('candidates recalculated');
    expect(state.cells[0].value).toBe(4);
    expect(state.cells[0].given).toBe(false);
    expect(state.cells[2].value).toBe(3);
    expect(state.cells[2].given).toBe(true);
  });

  it('5. rejects malformed, incomplete, or conflicting payloads with clear error codes', () => {
    // Empty payload
    expect(parseAndValidatePositionImport('')).toEqual({
      ok: false,
      code: 'empty-payload'
    });

    // Oversized payload
    expect(parseAndValidatePositionImport('a'.repeat(MAX_POSITION_PAYLOAD_LENGTH + 10))).toEqual({
      ok: false,
      code: 'payload-too-large'
    });

    // Malformed base64 / JSON
    expect(parseAndValidatePositionImport('!!!not-base64!!!')).toEqual({
      ok: false,
      code: 'malformed-encoding'
    });

    // Unsupported version
    expect(
      validatePositionPayload({
        v: 99,
        source: 'sudokuexchange',
        fidelity: 'grid-only',
        givens: SAMPLE_GIVENS,
        values: SAMPLE_VALUES
      })
    ).toMatchObject({ ok: false, code: 'unsupported-version' });

    // Wrong cell count (80 chars instead of 81)
    expect(
      validatePositionPayload({
        v: 1,
        source: 'sudokuexchange',
        fidelity: 'grid-only',
        givens: SAMPLE_GIVENS.slice(0, 80),
        values: SAMPLE_VALUES
      })
    ).toEqual({ ok: false, code: 'invalid-givens-format' });

    // Player values altering an original given (r1c3 is given '3', changed to '9')
    const alteredGivenValues = '489' + SAMPLE_VALUES.slice(3);
    expect(
      validatePositionPayload({
        v: 1,
        source: 'sudokuexchange',
        fidelity: 'grid-only',
        givens: SAMPLE_GIVENS,
        values: alteredGivenValues
      })
    ).toMatchObject({ ok: false, code: 'given-mismatch' });

    // Invalid candidate mask (outside 0..0x1ff)
    const badMasks = new Array<number>(81).fill(0);
    badMasks[5] = 0x200;
    expect(
      validatePositionPayload({
        v: 1,
        source: 'sudokuexchange',
        fidelity: 'full',
        givens: SAMPLE_GIVENS,
        values: SAMPLE_VALUES,
        center: badMasks
      })
    ).toEqual({ ok: false, code: 'invalid-candidate-mask' });

    // Conflicting player-entered digits (r1c1=3 conflicts with given r1c3=3 in Row 1)
    const conflictingValues = '3' + SAMPLE_GIVENS.slice(1);
    const conflictRes = useGame.getState().importPositionPayload({
      v: 1,
      source: 'sudokuexchange',
      fidelity: 'grid-only',
      givens: SAMPLE_GIVENS,
      values: conflictingValues
    });
    expect(conflictRes.ok).toBe(false);
    if (!conflictRes.ok) {
      expect(conflictRes.code).toBe('conflicting-entries');
      expect(conflictRes.reason).toContain('Conflicting entries');
    }
  });

  it('6. does not overwrite an active in-progress game without confirmation or on invalid import', () => {
    // Start an initial game and make a player move so playedOn(state) is true
    useGame.getState().startGame(SAMPLE_GIVENS, 100, 'Easy');
    useGame.getState().select([0], false);
    useGame.getState().input(4, 'digit');

    const snapshotBefore = JSON.stringify(useGame.getState().cells);
    expect(useGame.getState().cells[0].value).toBe(4);

    // 6a. Attempt an invalid import — board must remain completely unchanged
    const badRes = useGame.getState().importPositionPayload('corrupted-payload-%%%%');
    expect(badRes.ok).toBe(false);
    expect(JSON.stringify(useGame.getState().cells)).toBe(snapshotBefore);
    expect(useGame.getState().pendingPositionImport).toBeNull();

    // 6b. Attempt a valid import while game is in progress — must stage in pendingPositionImport
    const newValues = '083' + SAMPLE_GIVENS.slice(3);
    const validRes = useGame.getState().importPositionPayload({
      v: 1,
      source: 'sudokuexchange',
      fidelity: 'grid-only',
      givens: SAMPLE_GIVENS,
      values: newValues
    });
    expect(validRes).toEqual({
      ok: true,
      status: 'pending-confirmation',
      fidelity: 'grid-only'
    });
    // Board still untouched before confirmation!
    expect(JSON.stringify(useGame.getState().cells)).toBe(snapshotBefore);
    expect(useGame.getState().pendingPositionImport).not.toBeNull();

    // Dismissing keeps the original game untouched
    useGame.getState().dismissPendingPositionImport();
    expect(useGame.getState().pendingPositionImport).toBeNull();
    expect(JSON.stringify(useGame.getState().cells)).toBe(snapshotBefore);

    // Stage again and confirm — now the board updates to the imported position
    useGame.getState().importPositionPayload({
      v: 1,
      source: 'sudokuexchange',
      fidelity: 'grid-only',
      givens: SAMPLE_GIVENS,
      values: newValues
    });
    expect(useGame.getState().confirmPendingPositionImport()).toBe(true);
    expect(useGame.getState().pendingPositionImport).toBeNull();
    expect(useGame.getState().cells[0].value).toBe(0);
    expect(useGame.getState().cells[1].value).toBe(8);
  });

  it('7. preserves existing puzzle link and pencil-mark text grid imports', () => {
    // Existing Sudoku Exchange starting-puzzle share link import
    const linkRes = puzzleFromLink(
      `https://sudokuexchange.com/play/?s=${SAMPLE_GIVENS}`
    );
    expect(linkRes).toEqual({
      ok: true,
      puzzle: SAMPLE_GIVENS.replace(/0/g, '.'),
      source: 'sudokuexchange'
    });

    // Existing pencil-mark text grid import
    useGame.getState().startGame(SAMPLE_GIVENS, 100, 'Easy');
    const formattedGrid = formatPencilGrid(useGame.getState().cells, true, 'exhaustive');
    const textPos = parsePencilGrid(formattedGrid);
    expect(textPos).not.toBeNull();
    expect(useGame.getState().importText(textPos!)).toBeNull();
    expect(useGame.getState().cells[2].given).toBe(true);
    expect(useGame.getState().cells[2].value).toBe(3);
  });

  it('8. handles URL fragment routing (#import-position=<payload>) and bookmarklet generation', () => {
    const payload: PositionImportPayload = {
      v: 1,
      source: 'sudokuexchange',
      fidelity: 'grid-only',
      givens: SAMPLE_GIVENS,
      values: SAMPLE_VALUES
    };
    const url = buildPositionImportUrl(payload, 'http://localhost:5173');
    expect(url.startsWith(`http://localhost:5173/#${POSITION_IMPORT_HASH_PARAM}=`)).toBe(true);
    expect(looksLikePositionImport(url)).toBe(true);

    const param = extractPositionParamFromInput(url);
    expect(param).toBeTruthy();

    const decoded = decodePositionPayload(url);
    expect(decoded).toEqual({ ok: true, payload });

    const bookmarklet = buildSudokuExchangeBookmarklet('http://localhost:5173');
    expect(bookmarklet.startsWith('javascript:(function(){')).toBe(true);
    expect(bookmarklet).toContain('http://localhost:5173');
    expect(bookmarklet).toContain('#import-position=');
  });

  it('9. extracts givens, player entries, corner/centre pencil marks, and colours from Sudoku Exchange DOM/Storage/Fiber with zero network calls', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // 9a. Test snapshot parser (used by localStorage Tier 2)
    // r1c1=D4, r1c2=D8, r1c4=D9, r1c6=T17N49C3, r1c8=N57
    const snapshot = '11D4,12D8,14D9,16T17N49C3,18N57';
    const parsedSnap = parseSudokuExchangeSnapshot(SAMPLE_GIVENS, snapshot);
    expect(parsedSnap).not.toBeNull();
    expect(parsedSnap!.fidelity).toBe('full');
    expect(parsedSnap!.givens).toBe(SAMPLE_GIVENS);
    expect(parsedSnap!.values.slice(0, 6)).toBe('483920');
    expect(parsedSnap!.corner![5]).toBe(bit(1) | bit(7));
    expect(parsedSnap!.center![5]).toBe(bit(4) | bit(9));
    expect(parsedSnap!.colors![5]).toBe(2); // C3 -> color index 2
    expect(parsedSnap!.center![7]).toBe(bit(5) | bit(7));

    // 9b. Test SVG DOM extraction (Tier 3) using a representative Sudoku Exchange SVG board
    const bgElements = Array.from({ length: 81 }, (_, i) => {
      const row0 = Math.floor(i / 9);
      const col0 = i % 9;
      const x = String(50 + col0 * 100);
      const y = String(50 + row0 * 100);
      const isGiven = SAMPLE_GIVENS[i] !== '0';
      const colorCode = i === 5 ? 3 : 1;
      return {
        getAttribute: (attr: string) => (attr === 'data-cell-index' ? String(i) : null),
        classList: { contains: (cls: string) => cls === 'given' && isGiven },
        querySelector: (sel: string) =>
          sel === 'rect'
            ? {
                getAttribute: (a: string) =>
                  a === 'x'
                    ? x
                    : a === 'y'
                      ? y
                      : a === 'width'
                        ? '100'
                        : a === 'class'
                          ? `color-code-${colorCode}`
                          : null
              }
            : null
      };
    });
    const digitElements = Array.from({ length: 81 }, (_, i) => {
      const val = SAMPLE_VALUES[i];
      if (val === '0') return null;
      const row0 = Math.floor(i / 9);
      const col0 = i % 9;
      const isGiven = SAMPLE_GIVENS[i] !== '0';
      return {
        getAttribute: (a: string) =>
          a === 'x' ? String(100 + col0 * 100) : a === 'y' ? String(125 + row0 * 100) : null,
        classList: { contains: (cls: string) => cls === 'given' && isGiven },
        textContent: val
      };
    }).filter(Boolean);
    const innerPencilElements = [
      {
        getAttribute: (a: string) => (a === 'x' ? '599' : a === 'y' ? '111' : null),
        textContent: '49'
      },
      {
        getAttribute: (a: string) => (a === 'x' ? '799' : a === 'y' ? '111' : null),
        textContent: '57'
      }
    ];
    const outerPencilElements = [
      {
        getAttribute: (a: string) => (a === 'x' ? '568' : a === 'y' ? '80' : null),
        textContent: '1'
      },
      {
        getAttribute: (a: string) => (a === 'x' ? '630' : a === 'y' ? '80' : null),
        textContent: '7'
      }
    ];

    const fakeDoc = {
      getElementById: () => null,
      querySelectorAll: (sel: string) => {
        if (sel.includes('g.cell-bg')) return bgElements as any;
        if (sel.includes('text.digit')) return digitElements as any;
        if (sel.includes('text.inner-pencil')) return innerPencilElements as any;
        if (sel.includes('g.outer-pencil text')) return outerPencilElements as any;
        return [] as any;
      }
    };

    const extractedFromDom = extractSudokuExchangePosition(
      fakeDoc as unknown as Document,
      { localStorage: { length: 0 } as unknown as Storage, location: {} as Location }
    );
    expect(extractedFromDom).toEqual(parsedSnap);

    // Also test Tier 1 (React Fiber mock) & Tier 2 (localStorage mock)
    const mockStorage = {
      length: 1,
      key: (i: number) => (i === 0 ? `save-${SAMPLE_GIVENS}` : null),
      getItem: (k: string) =>
        k === `save-${SAMPLE_GIVENS}`
          ? JSON.stringify({
              initialDigits: SAMPLE_GIVENS,
              currentSnapshot: snapshot,
              lastUpdatedTime: 1000
            })
          : null
    };

    const extractedFromStorage = extractSudokuExchangePosition(
      fakeDoc as unknown as Document,
      { localStorage: mockStorage as unknown as Storage, location: {} as Location }
    );
    expect(extractedFromStorage).toEqual(parsedSnap);

    // Tier 1 React Fiber mock
    const fiberCells = Array.from({ length: 81 }, (_, i) => ({
      toObject: () => ({
        index: i,
        isGiven: SAMPLE_GIVENS[i] !== '0',
        digit: SAMPLE_VALUES[i],
        outerPencils: { toArray: () => (i === 5 ? ['1', '7'] : []) },
        innerPencils: { toArray: () => (i === 5 ? ['4', '9'] : i === 7 ? ['5', '7'] : []) },
        colorCode: i === 5 ? '3' : '1'
      })
    }));
    const fiberRoot = {
      __reactContainer$xyz: {
        memoizedProps: {
          grid: {
            toObject: () => ({
              initialDigits: SAMPLE_GIVENS,
              cells: { toArray: () => fiberCells }
            })
          }
        }
      }
    };
    const extractedFromFiber = extractSudokuExchangePosition(
      {
        getElementById: (id: string) => (id === 'root' ? fiberRoot : null),
        querySelectorAll: () => []
      } as unknown as Document,
      { localStorage: { length: 0 } as unknown as Storage, location: {} as Location }
    );
    expect(extractedFromFiber).toEqual(parsedSnap);

    // Zero remote network calls during extraction, encoding, validation, and import
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
