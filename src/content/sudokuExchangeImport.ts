// Exact-position import adapter and bookmarklet generator for Sudoku Exchange
// (https://sudokuexchange.com/play/).
//
// Preserves:
//   - Original puzzle givens (81 cells)
//   - Current player-entered digits (81 cells, distinct from givens)
//   - Outer (corner) pencil marks (9-bit masks per cell)
//   - Inner (centre) pencil marks (9-bit masks per cell)
//   - Explicit candidate exclusions (9-bit masks per cell, when present)
//   - Cell highlight colours (palette indices per cell)
//
// Distinguishes honest import fidelity:
//   - 'full': givens, player entries, and candidate pencil marks/exclusions preserved
//   - 'grid-only': givens and player entries preserved; no candidate notes were
//     present on the source board, so candidates are recalculated by the app

import { bit, emptyGrid, parseGrid, setValue, gridToString, UNITS, cellName } from '../engine/board';
import { solve, countSolutions } from '../engine/bruteForce';
import { ratePuzzle } from '../engine/humanSolver';
import type { Level } from '../engine/ratings';

export const POSITION_IMPORT_VERSION = 1;
export const POSITION_IMPORT_HASH_PARAM = 'import-position';
export const DEFAULT_PATTERN_LAB_ORIGIN = 'http://localhost:5173';
export const MAX_POSITION_PAYLOAD_LENGTH = 16_384;

export type PositionImportSource = 'sudokuexchange' | 'unknown';
export type PositionImportFidelity = 'full' | 'grid-only';

export interface PositionImportPayload {
  /** Schema version (must be 1) */
  v: number;
  /** Source adapter identifier */
  source: PositionImportSource;
  /**
   * Import fidelity declared by the extractor:
   * - 'full': candidate notes (corner/center pencil marks or exclusions) were captured
   * - 'grid-only': only givens and player-entered digits were present/captured
   */
  fidelity: PositionImportFidelity;
  /** 81-character string of original givens ('1'..'9' for givens, '0' or '.' for non-givens) */
  givens: string;
  /** 81-character string of current digits ('1'..'9' for givens + player entries, '0' or '.' for empty) */
  values: string;
  /** Optional 81-element array of 9-bit candidate masks (0..0x1ff) for corner / outer pencil marks */
  corner?: number[];
  /** Optional 81-element array of 9-bit candidate masks (0..0x1ff) for centre / inner pencil marks */
  center?: number[];
  /** Optional 81-element array of 9-bit candidate masks (0..0x1ff) for excluded candidates */
  excluded?: number[];
  /** Optional 81-element array of cell colour codes (0 = none, 1..9 = palette index + 1) */
  colors?: number[];
}

export interface ImportedCellState {
  given: boolean;
  value: number;
  corner: number;
  center: number;
  excluded: number;
  colors: number[];
}

export type PositionImportErrorCode =
  | 'empty-payload'
  | 'payload-too-large'
  | 'malformed-encoding'
  | 'invalid-schema'
  | 'unsupported-version'
  | 'invalid-source'
  | 'invalid-fidelity'
  | 'invalid-givens-format'
  | 'invalid-values-format'
  | 'given-mismatch'
  | 'invalid-candidates-length'
  | 'invalid-candidate-mask'
  | 'invalid-colors-length'
  | 'invalid-color-value'
  | 'invalid-puzzle'
  | 'conflicting-entries';

export interface ValidatedPositionImport {
  ok: true;
  payload: PositionImportPayload;
  /** Verified fidelity based on actual candidate presence on empty cells */
  fidelity: PositionImportFidelity;
  /** Normalized 81-char givens string ('.' for empty) */
  puzzle: string;
  /** Unique 81-char solution string */
  solution: string;
  /** HoDoKu rating score of the underlying puzzle */
  score: number;
  /** HoDoKu difficulty level */
  level: Level;
  /** Reconstructed 81 cell states */
  cells: ImportedCellState[];
  /** Number of original given clues */
  givenCount: number;
  /** Number of player-entered digits */
  entryCount: number;
  /** Number of empty cells carrying candidate pencil marks or exclusions */
  markedCellCount: number;
}

export interface InvalidPositionImport {
  ok: false;
  code: PositionImportErrorCode;
  detail?: {
    digit?: string;
    cellA?: string;
    cellB?: string;
    clues?: number;
    version?: unknown;
  };
}

export type PositionImportValidationResult = ValidatedPositionImport | InvalidPositionImport;

/** Encode a UTF-8 string into URL-safe base64 (no padding). */
export function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode a URL-safe base64 string back into UTF-8. */
export function fromBase64Url(encoded: string): string {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '==='.slice((b64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Serialize and base64url-encode a PositionImportPayload. */
export function encodePositionPayload(payload: PositionImportPayload): string {
  return toBase64Url(JSON.stringify(payload));
}

/** Build the local Pattern Lab URL with `#import-position=<encoded>` fragment. */
export function buildPositionImportUrl(
  payload: PositionImportPayload,
  targetOrigin: string = DEFAULT_PATTERN_LAB_ORIGIN
): string {
  const cleanOrigin = targetOrigin.replace(/\/+$/, '');
  return `${cleanOrigin}/#${POSITION_IMPORT_HASH_PARAM}=${encodePositionPayload(payload)}`;
}

/**
 * Extract the raw `#import-position=` parameter value from a full URL, hash
 * string, or raw payload string.
 */
export function extractPositionParamFromInput(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // Check if input is a full URL or hash containing import-position=
  const hashIdx = trimmed.indexOf('#');
  if (hashIdx >= 0) {
    const hashParams = new URLSearchParams(trimmed.slice(hashIdx + 1));
    const val = hashParams.get(POSITION_IMPORT_HASH_PARAM);
    if (val !== null) return val;
  }

  if (trimmed.startsWith(`${POSITION_IMPORT_HASH_PARAM}=`)) {
    const params = new URLSearchParams(trimmed);
    const val = params.get(POSITION_IMPORT_HASH_PARAM);
    if (val !== null) return val;
  }

  return null;
}

/**
 * True if a pasted string in the Import dialog looks like a Pattern Lab
 * position-import link, fragment, or JSON payload.
 */
export function looksLikePositionImport(rawInput: string): boolean {
  const trimmed = rawInput.trim();
  if (!trimmed) return false;
  if (extractPositionParamFromInput(trimmed) !== null) return true;
  if (trimmed.startsWith('{') && trimmed.endsWith('}') && trimmed.includes('"givens"') && trimmed.includes('"values"')) {
    return true;
  }
  return false;
}

/**
 * Decode a raw `#import-position=` payload string (supports base64url JSON,
 * percent-encoded JSON, or raw JSON).
 */
export function decodePositionPayload(
  raw: string
): { ok: true; payload: unknown } | { ok: false; code: PositionImportErrorCode } {
  const extracted = extractPositionParamFromInput(raw) ?? raw.trim();
  if (!extracted) return { ok: false, code: 'empty-payload' };
  if (extracted.length > MAX_POSITION_PAYLOAD_LENGTH) {
    return { ok: false, code: 'payload-too-large' };
  }

  // Try raw or percent-encoded JSON first if it starts with '{' or '%7B'
  if (extracted.startsWith('{') || /^%7b/i.test(extracted)) {
    try {
      const jsonText = extracted.startsWith('{') ? extracted : decodeURIComponent(extracted);
      return { ok: true, payload: JSON.parse(jsonText) };
    } catch {
      return { ok: false, code: 'malformed-encoding' };
    }
  }

  // Otherwise decode base64url JSON
  try {
    const jsonText = fromBase64Url(extracted);
    if (jsonText.length > MAX_POSITION_PAYLOAD_LENGTH) {
      return { ok: false, code: 'payload-too-large' };
    }
    return { ok: true, payload: JSON.parse(jsonText) };
  } catch {
    return { ok: false, code: 'malformed-encoding' };
  }
}

function isMaskArray(arr: unknown): arr is number[] {
  return Array.isArray(arr) && arr.length === 81;
}

/**
 * Validate a decoded PositionImportPayload object:
 * - Schema & version check
 * - 81-cell givens and values format check
 * - Givens preservation check (player values cannot erase or alter givens)
 * - Candidate bitmask and colour bounds check
 * - Honest fidelity determination ('full' vs 'grid-only')
 * - Original puzzle validation (17+ givens, no conflicting givens, unique solution, ratable)
 * - Player-entered digits conflict check (no duplicate digit in any row, column, or box)
 */
export function validatePositionPayload(rawPayload: unknown): PositionImportValidationResult {
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return { ok: false, code: 'invalid-schema' };
  }
  const obj = rawPayload as Record<string, unknown>;

  if (obj.v !== POSITION_IMPORT_VERSION) {
    return { ok: false, code: 'unsupported-version', detail: { version: obj.v } };
  }
  if (obj.source !== 'sudokuexchange' && obj.source !== 'unknown') {
    return { ok: false, code: 'invalid-source' };
  }
  if (obj.fidelity !== 'full' && obj.fidelity !== 'grid-only') {
    return { ok: false, code: 'invalid-fidelity' };
  }
  if (typeof obj.givens !== 'string' || obj.givens.length !== 81 || !/^[0-9.]{81}$/.test(obj.givens)) {
    return { ok: false, code: 'invalid-givens-format' };
  }
  if (typeof obj.values !== 'string' || obj.values.length !== 81 || !/^[0-9.]{81}$/.test(obj.values)) {
    return { ok: false, code: 'invalid-values-format' };
  }

  const givensNorm = obj.givens.replace(/0/g, '.');
  const valuesNorm = obj.values.replace(/0/g, '.');

  // Verify every original given is preserved in values
  for (let i = 0; i < 81; i++) {
    if (givensNorm[i] !== '.' && valuesNorm[i] !== givensNorm[i]) {
      return {
        ok: false,
        code: 'given-mismatch',
        detail: { cellA: cellName(i), digit: givensNorm[i] }
      };
    }
  }

  // Validate optional candidate arrays
  for (const key of ['corner', 'center', 'excluded'] as const) {
    const arr = obj[key];
    if (arr !== undefined) {
      if (!isMaskArray(arr)) return { ok: false, code: 'invalid-candidates-length' };
      for (let i = 0; i < 81; i++) {
        const m = arr[i];
        if (typeof m !== 'number' || !Number.isInteger(m) || m < 0 || m > 0x1ff) {
          return { ok: false, code: 'invalid-candidate-mask' };
        }
      }
    }
  }

  // Validate optional colors array
  if (obj.colors !== undefined) {
    if (!isMaskArray(obj.colors)) return { ok: false, code: 'invalid-colors-length' };
    for (let i = 0; i < 81; i++) {
      const c = obj.colors[i];
      if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c > 9) {
        return { ok: false, code: 'invalid-color-value' };
      }
    }
  }

  // Validate the starting givens as a proper unique-solution Sudoku
  const givenCount = [...givensNorm].filter((ch) => ch >= '1' && ch <= '9').length;
  if (givenCount < 17) {
    return { ok: false, code: 'invalid-puzzle', detail: { clues: givenCount } };
  }
  for (const unit of UNITS) {
    const seen = new Map<string, number>();
    for (const c of unit) {
      const ch = givensNorm[c];
      if (ch === '.') continue;
      if (seen.has(ch)) {
        return {
          ok: false,
          code: 'invalid-puzzle',
          detail: { digit: ch, cellA: cellName(seen.get(ch)!), cellB: cellName(c) }
        };
      }
      seen.set(ch, c);
    }
  }
  const givenGrid = parseGrid(givensNorm);
  if (!givenGrid) {
    return { ok: false, code: 'invalid-puzzle' };
  }
  const solCount = countSolutions(givenGrid, 2);
  if (solCount !== 1) {
    return { ok: false, code: 'invalid-puzzle' };
  }
  const solvedGrid = solve(parseGrid(givensNorm)!);
  const rating = ratePuzzle(parseGrid(givensNorm)!);
  if (!solvedGrid || !rating) {
    return { ok: false, code: 'invalid-puzzle' };
  }

  // Check current board (givens + player entries) for house conflicts
  for (const unit of UNITS) {
    const seen = new Map<string, number>();
    for (const c of unit) {
      const ch = valuesNorm[c];
      if (ch === '.') continue;
      if (seen.has(ch)) {
        return {
          ok: false,
          code: 'conflicting-entries',
          detail: { digit: ch, cellA: cellName(seen.get(ch)!), cellB: cellName(c) }
        };
      }
      seen.set(ch, c);
    }
  }

  // Compute canonical candidates for the current placed values (givens + entries)
  const currentGrid = emptyGrid();
  for (let i = 0; i < 81; i++) {
    const ch = valuesNorm[i];
    if (ch !== '.') {
      setValue(currentGrid, i, Number(ch));
      if (givensNorm[i] !== '.') currentGrid.given[i] = 1;
    }
  }

  const cornerArr = obj.corner as number[] | undefined;
  const centerArr = obj.center as number[] | undefined;
  const excludedArr = obj.excluded as number[] | undefined;
  const colorsArr = obj.colors as number[] | undefined;

  let entryCount = 0;
  let markedCellCount = 0;
  const cells: ImportedCellState[] = [];

  for (let i = 0; i < 81; i++) {
    const given = givensNorm[i] !== '.';
    const value = valuesNorm[i] !== '.' ? Number(valuesNorm[i]) : 0;
    if (!given && value !== 0) entryCount++;

    const colorCode = colorsArr?.[i] ?? 0;
    const colors = colorCode >= 1 && colorCode <= 9 ? [colorCode - 1] : [];

    if (value !== 0) {
      cells.push({
        given,
        value,
        corner: 0,
        center: 0,
        excluded: 0,
        colors
      });
    } else {
      const corner = cornerArr?.[i] ?? 0;
      const center = centerArr?.[i] ?? 0;
      let excluded = excludedArr?.[i] ?? 0;
      // When exhaustive centre pencil marks (innerPencils on Sudoku Exchange)
      // are present on an empty cell, also record any canonical candidates
      // omitted from `center` in `excluded` so both engineGrid and contractGrid
      // reflect the exact candidate state.
      if (center !== 0 && (currentGrid.cands[i] & center) !== 0) {
        excluded |= currentGrid.cands[i] & ~center;
      }
      if (corner !== 0 || center !== 0 || excluded !== 0) {
        markedCellCount++;
      }
      cells.push({
        given: false,
        value: 0,
        corner,
        center,
        excluded,
        colors
      });
    }
  }

  // Honest fidelity: never report 'full' when no candidate notes/exclusions exist on empty cells
  const effectiveFidelity: PositionImportFidelity =
    obj.fidelity === 'full' && markedCellCount > 0 ? 'full' : 'grid-only';

  const normalizedPayload: PositionImportPayload = {
    v: POSITION_IMPORT_VERSION,
    source: obj.source,
    fidelity: effectiveFidelity,
    givens: givensNorm,
    values: valuesNorm,
    ...(cornerArr ? { corner: cornerArr } : {}),
    ...(centerArr ? { center: centerArr } : {}),
    ...(excludedArr ? { excluded: excludedArr } : {}),
    ...(colorsArr ? { colors: colorsArr } : {})
  };

  return {
    ok: true,
    payload: normalizedPayload,
    fidelity: effectiveFidelity,
    puzzle: givensNorm,
    solution: gridToString(solvedGrid),
    score: rating.score,
    level: rating.level,
    cells,
    givenCount,
    entryCount,
    markedCellCount
  };
}

/** Decode and validate a raw `#import-position=` string or URL in one step. */
export function parseAndValidatePositionImport(rawInput: string): PositionImportValidationResult {
  const decoded = decodePositionPayload(rawInput);
  if (!decoded.ok) return decoded;
  return validatePositionPayload(decoded.payload);
}

/**
 * Parse Sudoku Exchange's compact `currentSnapshot` string alongside its
 * 81-character `initialDigits` string.
 *
 * Snapshot token format: `<row 1..9><col 1..9>[D<digit>][T<outerDigits>][N<innerDigits>][C<color 1..9>]`
 * joined by commas, e.g. `"11D4,12D5,16T48N17C3,18N78"`.
 */
export function parseSudokuExchangeSnapshot(
  initialDigits: string,
  snapshot: string
): PositionImportPayload | null {
  if (typeof initialDigits !== 'string' || !/^[0-9.]{81}$/.test(initialDigits)) return null;
  const givens = initialDigits.replace(/\./g, '0');
  const values = givens.split('');
  const corner = new Array<number>(81).fill(0);
  const center = new Array<number>(81).fill(0);
  const colors = new Array<number>(81).fill(0);

  if (snapshot && snapshot.trim().length > 0) {
    for (const part of snapshot.split(',')) {
      if (part.length < 3) continue;
      const r = Number(part[0]) - 1;
      const c = Number(part[1]) - 1;
      if (r < 0 || r >= 9 || c < 0 || c >= 9) continue;
      const idx = r * 9 + c;
      const isGiven = givens[idx] >= '1' && givens[idx] <= '9';
      let mode: 'T' | 'N' | null = null;
      for (let i = 2; i < part.length; i++) {
        const ch = part[i];
        if (ch === 'D') {
          const d = part[++i];
          if (!isGiven && d >= '1' && d <= '9') {
            values[idx] = d;
            corner[idx] = 0;
            center[idx] = 0;
          }
          mode = null;
        } else if (ch === 'C') {
          const cc = Number(part[++i]);
          if (cc >= 2 && cc <= 9) colors[idx] = cc - 1;
          mode = null;
        } else if (ch === 'T' || ch === 'N') {
          mode = ch;
        } else if (ch >= '1' && ch <= '9' && !isGiven && values[idx] === '0') {
          if (mode === 'T') corner[idx] |= bit(Number(ch));
          else if (mode === 'N') center[idx] |= bit(Number(ch));
        }
      }
    }
  }

  const hasCorner = corner.some((m) => m !== 0);
  const hasCenter = center.some((m) => m !== 0);
  const hasColors = colors.some((c) => c !== 0);
  const fidelity: PositionImportFidelity = hasCorner || hasCenter ? 'full' : 'grid-only';

  return {
    v: POSITION_IMPORT_VERSION,
    source: 'sudokuexchange',
    fidelity,
    givens,
    values: values.join(''),
    ...(hasCorner ? { corner } : {}),
    ...(hasCenter ? { center } : {}),
    ...(hasColors ? { colors } : {})
  };
}

/**
 * Extract the current Sudoku position from a Sudoku Exchange page (`doc`, `win`).
 * Uses a three-tier strategy:
 *   1. Active React Fiber tree (`#root` / `#main-grid`)
 *   2. `localStorage` saved state (`save-<initialDigits>`)
 *   3. Rendered SVG DOM (`#main-grid svg`)
 */
export function extractSudokuExchangePosition(
  doc: Document = document,
  win: Pick<Window, 'localStorage' | 'location'> = window
): PositionImportPayload | null {
  // Tier 1: Active React Fiber tree
  try {
    let activeGrid: any = null;
    const root = doc.getElementById('root') as any;
    if (root) {
      const rKey = Object.keys(root).find((k) => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'));
      if (rKey && root[rKey]) {
        const hostRoot = root[rKey]?.stateNode?.current || root[rKey];
        const stack = [hostRoot];
        while (stack.length > 0) {
          const node = stack.pop();
          if (!node) continue;
          if (node.memoizedProps?.grid?.toObject) {
            activeGrid = node.memoizedProps.grid.toObject();
            break;
          }
          if (node.sibling) stack.push(node.sibling);
          if (node.child) stack.push(node.child);
        }
      }
    }
    if (!activeGrid) {
      const gridEl = doc.getElementById('main-grid') as any;
      if (gridEl) {
        const fKey = Object.keys(gridEl).find((k) => k.startsWith('__reactFiber'));
        if (fKey && gridEl[fKey]) {
          const fA = gridEl[fKey];
          const fB = fA.alternate;
          const oA = fA?.return?.memoizedProps?.grid?.toObject?.();
          const oB = fB?.return?.memoizedProps?.grid?.toObject?.();
          if (oA && oB) {
            const uA = oA.undoList?.size ?? 0;
            const uB = oB.undoList?.size ?? 0;
            activeGrid = uB >= uA ? oB : oA;
          } else {
            activeGrid = oA || oB;
          }
        }
      }
    }
    if (activeGrid && activeGrid.cells) {
      const rawCells = activeGrid.cells.toArray ? activeGrid.cells.toArray() : Array.from(activeGrid.cells);
      if (rawCells.length === 81) {
        let givens = '';
        let values = '';
        const corner = new Array<number>(81).fill(0);
        const center = new Array<number>(81).fill(0);
        const colors = new Array<number>(81).fill(0);
        for (let i = 0; i < 81; i++) {
          const c = rawCells[i].toObject ? rawCells[i].toObject() : rawCells[i];
          const d = typeof c.digit === 'string' && c.digit >= '1' && c.digit <= '9' ? c.digit : '0';
          const isGiven = Boolean(c.isGiven) && d !== '0';
          givens += isGiven ? d : '0';
          values += d;
          if (d === '0') {
            const outer = c.outerPencils?.toArray
              ? c.outerPencils.toArray()
              : Array.isArray(c.outerPencils)
                ? c.outerPencils
                : Array.from(c.outerPencils || []);
            const inner = c.innerPencils?.toArray
              ? c.innerPencils.toArray()
              : Array.isArray(c.innerPencils)
                ? c.innerPencils
                : Array.from(c.innerPencils || []);
            for (const od of outer) {
              const n = Number(od);
              if (n >= 1 && n <= 9) corner[i] |= bit(n);
            }
            for (const id of inner) {
              const n = Number(id);
              if (n >= 1 && n <= 9) center[i] |= bit(n);
            }
          }
          const cc = Number(c.colorCode || '1');
          if (cc >= 2 && cc <= 9) colors[i] = cc - 1;
        }
        const hasCorner = corner.some((m) => m !== 0);
        const hasCenter = center.some((m) => m !== 0);
        const hasColors = colors.some((c) => c !== 0);
        return {
          v: POSITION_IMPORT_VERSION,
          source: 'sudokuexchange',
          fidelity: hasCorner || hasCenter ? 'full' : 'grid-only',
          givens,
          values,
          ...(hasCorner ? { corner } : {}),
          ...(hasCenter ? { center } : {}),
          ...(hasColors ? { colors } : {})
        };
      }
    }
  } catch {
    // Fall through to Tier 2
  }

  // Tier 2: localStorage save-<initialDigits>
  try {
    const storage = win?.localStorage;
    if (storage) {
      let bestSave: { initialDigits: string; currentSnapshot: string; lastUpdatedTime?: number } | null = null;
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key || !key.startsWith('save-')) continue;
        const raw = storage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.initialDigits === 'string' && parsed.initialDigits.length === 81) {
          if (!bestSave || (parsed.lastUpdatedTime ?? 0) >= (bestSave.lastUpdatedTime ?? 0)) {
            bestSave = parsed;
          }
        }
      }
      if (bestSave) {
        const fromSnap = parseSudokuExchangeSnapshot(bestSave.initialDigits, bestSave.currentSnapshot || '');
        if (fromSnap) return fromSnap;
      }
    }
  } catch {
    // Fall through to Tier 3
  }

  // Tier 3: Rendered SVG DOM (#main-grid svg)
  try {
    const bgs = doc.querySelectorAll('#main-grid svg g.cell-bg[data-cell-index]');
    if (bgs.length === 81) {
      const givenArr = new Array<boolean>(81).fill(false);
      const givens = new Array<string>(81).fill('0');
      const values = new Array<string>(81).fill('0');
      const corner = new Array<number>(81).fill(0);
      const center = new Array<number>(81).fill(0);
      const colors = new Array<number>(81).fill(0);
      let x0 = 50;
      let y0 = 50;
      let size = 100;

      bgs.forEach((g) => {
        const idx = Number(g.getAttribute('data-cell-index'));
        if (idx < 0 || idx >= 81) return;
        givenArr[idx] = g.classList.contains('given');
        const rect = g.querySelector('rect');
        if (rect) {
          if (idx === 0) {
            x0 = Number(rect.getAttribute('x')) || 50;
            y0 = Number(rect.getAttribute('y')) || 50;
            size = Number(rect.getAttribute('width')) || 100;
          }
          const m = (rect.getAttribute('class') || '').match(/color-code-(\d)/);
          if (m && Number(m[1]) >= 2 && Number(m[1]) <= 9) {
            colors[idx] = Number(m[1]) - 1;
          }
        }
      });

      const cellAt = (el: Element): number => {
        const x = Number(el.getAttribute('x'));
        const y = Number(el.getAttribute('y'));
        const col = Math.floor((x - x0) / size);
        const row = Math.floor((y - y0) / size);
        return row >= 0 && row < 9 && col >= 0 && col < 9 ? row * 9 + col : -1;
      };

      doc.querySelectorAll('#main-grid svg text.digit').forEach((t) => {
        const idx = cellAt(t);
        const d = (t.textContent || '').trim();
        if (idx >= 0 && d >= '1' && d <= '9') {
          values[idx] = d;
          if (t.classList.contains('given') || givenArr[idx]) givens[idx] = d;
        }
      });

      doc.querySelectorAll('#main-grid svg text.inner-pencil, #main-grid svg g.inner-pencil text').forEach((t) => {
        const idx = cellAt(t);
        if (idx >= 0 && values[idx] === '0') {
          for (const ch of (t.textContent || '').trim()) {
            if (ch >= '1' && ch <= '9') center[idx] |= bit(Number(ch));
          }
        }
      });

      doc.querySelectorAll('#main-grid svg g.outer-pencil text, #main-grid svg text.outer-pencil').forEach((t) => {
        const idx = cellAt(t);
        if (idx >= 0 && values[idx] === '0') {
          for (const ch of (t.textContent || '').trim()) {
            if (ch >= '1' && ch <= '9') corner[idx] |= bit(Number(ch));
          }
        }
      });

      const hasCorner = corner.some((m) => m !== 0);
      const hasCenter = center.some((m) => m !== 0);
      const hasColors = colors.some((c) => c !== 0);
      return {
        v: POSITION_IMPORT_VERSION,
        source: 'sudokuexchange',
        fidelity: hasCorner || hasCenter ? 'full' : 'grid-only',
        givens: givens.join(''),
        values: values.join(''),
        ...(hasCorner ? { corner } : {}),
        ...(hasCenter ? { center } : {}),
        ...(hasColors ? { colors } : {})
      };
    }
  } catch {
    // Nothing found
  }

  return null;
}

/**
 * Generate the self-contained `javascript:...` bookmarklet URL for
 * `Send to Pattern Lab`.
 *
 * The generated bookmarklet:
 *   1. Reads the current position from Sudoku Exchange (React Fiber -> localStorage -> SVG DOM).
 *   2. Preserves original givens, player entries, corner pencil marks, centre pencil marks, and colours.
 *   3. Encodes the versioned payload into `#import-position=<base64url>` and opens Pattern Lab in a new tab.
 *   4. Leaves the Sudoku Exchange tab open and unchanged.
 */
export function buildSudokuExchangeBookmarklet(
  targetOrigin: string = DEFAULT_PATTERN_LAB_ORIGIN
): string {
  const cleanOrigin = targetOrigin.replace(/\/+$/, '');
  const code = `(function(){try{var bit=function(d){return 1<<(d-1)};var p=null;var root=document.getElementById("root");var g=null;if(root){var rk=Object.keys(root).find(function(k){return k.indexOf("__reactContainer")===0||k.indexOf("__reactFiber")===0});if(rk&&root[rk]){var hr=root[rk].stateNode&&root[rk].stateNode.current||root[rk];var st=[hr];while(st.length){var n=st.pop();if(!n)continue;if(n.memoizedProps&&n.memoizedProps.grid&&n.memoizedProps.grid.toObject){g=n.memoizedProps.grid.toObject();break}if(n.sibling)st.push(n.sibling);if(n.child)st.push(n.child)}}}if(!g){var ge=document.getElementById("main-grid");if(ge){var fk=Object.keys(ge).find(function(k){return k.indexOf("__reactFiber")===0});if(fk&&ge[fk]){var fa=ge[fk],fb=fa.alternate;var oa=fa.return&&fa.return.memoizedProps&&fa.return.memoizedProps.grid&&fa.return.memoizedProps.grid.toObject();var ob=fb&&fb.return&&fb.return.memoizedProps&&fb.return.memoizedProps.grid&&fb.return.memoizedProps.grid.toObject();g=oa&&ob?((ob.undoList&&ob.undoList.size||0)>=(oa.undoList&&oa.undoList.size||0)?ob:oa):oa||ob}}}if(g&&g.cells){var ca=g.cells.toArray?g.cells.toArray():Array.from(g.cells);if(ca.length===81){var gv="",vl="",co=new Array(81).fill(0),ce=new Array(81).fill(0),cl=new Array(81).fill(0);for(var i=0;i<81;i++){var c=ca[i].toObject?ca[i].toObject():ca[i];var d=c.digit>="1"&&c.digit<="9"?c.digit:"0";gv+=c.isGiven&&d!=="0"?d:"0";vl+=d;if(d==="0"){var op=c.outerPencils&&c.outerPencils.toArray?c.outerPencils.toArray():Array.isArray(c.outerPencils)?c.outerPencils:Array.from(c.outerPencils||[]);var ip=c.innerPencils&&c.innerPencils.toArray?c.innerPencils.toArray():Array.isArray(c.innerPencils)?c.innerPencils:Array.from(c.innerPencils||[]);op.forEach(function(x){co[i]|=bit(+x)});ip.forEach(function(x){ce[i]|=bit(+x)})}var cc=+(c.colorCode||1);if(cc>=2&&cc<=9)cl[i]=cc-1}var hc=co.some(Boolean),hn=ce.some(Boolean),hl=cl.some(Boolean);p={v:1,source:"sudokuexchange",fidelity:hc||hn?"full":"grid-only",givens:gv,values:vl};if(hc)p.corner=co;if(hn)p.center=ce;if(hl)p.colors=cl}}if(!p&&window.localStorage){var bs=null;for(var k=0;k<localStorage.length;k++){var ky=localStorage.key(k);if(ky&&ky.indexOf("save-")===0){try{var sv=JSON.parse(localStorage.getItem(ky)||"{}");if(sv&&sv.initialDigits&&sv.initialDigits.length===81&&(!bs||(sv.lastUpdatedTime||0)>=(bs.lastUpdatedTime||0)))bs=sv}catch(_){}}}if(bs){var gvs=bs.initialDigits.replace(/\\./g,"0"),vls=gvs.split(""),cos=new Array(81).fill(0),ces=new Array(81).fill(0),cls=new Array(81).fill(0);(bs.currentSnapshot||"").split(",").forEach(function(pt){if(pt.length<3)return;var idx=(+pt[0]-1)*9+(+pt[1]-1);if(idx<0||idx>=81)return;var ig=gvs[idx]>="1"&&gvs[idx]<="9",md=null;for(var j=2;j<pt.length;j++){var ch=pt[j];if(ch==="D"){var dg=pt[++j];if(!ig&&dg>="1"&&dg<="9"){vls[idx]=dg;cos[idx]=0;ces[idx]=0}md=null}else if(ch==="C"){var c2=+pt[++j];if(c2>=2&&c2<=9)cls[idx]=c2-1;md=null}else if(ch==="T"||ch==="N"){md=ch}else if(ch>="1"&&ch<="9"&&!ig&&vls[idx]==="0"){if(md==="T")cos[idx]|=bit(+ch);else if(md==="N")ces[idx]|=bit(+ch)}}});var hcs=cos.some(Boolean),hns=ces.some(Boolean),hls=cls.some(Boolean);p={v:1,source:"sudokuexchange",fidelity:hcs||hns?"full":"grid-only",givens:gvs,values:vls.join("")};if(hcs)p.corner=cos;if(hns)p.center=ces;if(hls)p.colors=cls}}if(!p){var bgs=document.querySelectorAll("#main-grid svg g.cell-bg[data-cell-index]");if(bgs.length===81){var ga=new Array(81).fill(false),gv2=new Array(81).fill("0"),vl2=new Array(81).fill("0"),co2=new Array(81).fill(0),ce2=new Array(81).fill(0),cl2=new Array(81).fill(0),x0=50,y0=50,sz=100;bgs.forEach(function(el){var idx=+el.getAttribute("data-cell-index");ga[idx]=el.classList.contains("given");var r=el.querySelector("rect");if(r){if(idx===0){x0=+r.getAttribute("x")||50;y0=+r.getAttribute("y")||50;sz=+r.getAttribute("width")||100}var m=(r.getAttribute("class")||"").match(/color-code-(\\d)/);if(m&&+m[1]>=2)cl2[idx]=+m[1]-1}});var at=function(el){var c=Math.floor((+el.getAttribute("x")-x0)/sz),r=Math.floor((+el.getAttribute("y")-y0)/sz);return r>=0&&r<9&&c>=0&&c<9?r*9+c:-1};document.querySelectorAll("#main-grid svg text.digit").forEach(function(t){var idx=at(t),d=(t.textContent||"").trim();if(idx>=0&&d>="1"&&d<="9"){vl2[idx]=d;if(t.classList.contains("given")||ga[idx])gv2[idx]=d}});document.querySelectorAll("#main-grid svg text.inner-pencil").forEach(function(t){var idx=at(t);if(idx>=0&&vl2[idx]==="0")Array.from((t.textContent||"").trim()).forEach(function(ch){if(ch>="1"&&ch<="9")ce2[idx]|=bit(+ch)})});document.querySelectorAll("#main-grid svg g.outer-pencil text").forEach(function(t){var idx=at(t);if(idx>=0&&vl2[idx]==="0")Array.from((t.textContent||"").trim()).forEach(function(ch){if(ch>="1"&&ch<="9")co2[idx]|=bit(+ch)})});var hc2=co2.some(Boolean),hn2=ce2.some(Boolean),hl2=cl2.some(Boolean);p={v:1,source:"sudokuexchange",fidelity:hc2||hn2?"full":"grid-only",givens:gv2.join(""),values:vl2.join("")};if(hc2)p.corner=co2;if(hn2)p.center=ce2;if(hl2)p.colors=cl2}}if(!p){alert("Send to Pattern Lab: Could not find an active Sudoku Exchange board on this page.");return}var b64=btoa(JSON.stringify(p)).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");var url=${JSON.stringify(cleanOrigin)}+"/#import-position="+b64;var w=window.open(url,"_blank");if(!w)prompt("Popup blocked. Copy this Pattern Lab import link:",url)}catch(e){alert("Send to Pattern Lab error: "+(e&&e.message||e))}})();`;
  return `javascript:${code}`;
}
