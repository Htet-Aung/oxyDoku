/**
 * Enhanced educational guides, pitfalls, and structural logic for Sudoku techniques.
 *
 * Expands upon techniqueDocs.ts to address Phase 5 requirements:
 * 1. What the pattern is.
 * 2. How to recognise it on a candidate grid.
 * 3. Why the deduction is valid.
 * 4. Which candidates or digits are affected.
 * 5. What similar-looking configurations should not be confused with it (pitfalls & false friends).
 * 6. How the technique relates to other techniques.
 */

import { Tech, TECHS } from '../engine/ratings';
import { TECHNIQUE_TAXONOMY, getTechniqueConcept, ReasoningConceptId } from './concepts';

export interface TechniqueGuide {
  tech: Tech;
  /** Summary of structural components (e.g. "2 base rows, 2 cover columns", "1 pivot cell, 2 pincers") */
  structuralRoles: string;
  /** Digits and candidate types affected by the elimination */
  affectedCandidates: string;
  /** Common pitfalls and configurations that look similar but do NOT form a valid pattern */
  pitfalls: string[];
  /** How this technique differs from closely related kin or generalizations */
  distinctions: string;
}

/** Comprehensive educational guide entries for key human solving techniques */
export const TECHNIQUE_GUIDES: Partial<Record<Tech, TechniqueGuide>> = {
  // --- Basic Singles & Subsets ---
  FULL_HOUSE: {
    tech: 'FULL_HOUSE',
    structuralRoles: '8 placed digits in a single row, column, or 3×3 box + exactly 1 empty cell.',
    affectedCandidates: 'Places the single remaining digit (1–9) in the empty cell.',
    pitfalls: [
      'Counting already-placed digits incorrectly and placing a duplicate.',
      'Assuming an empty cell has only 1 candidate before verifying all 8 other cells in the house are filled.'
    ],
    distinctions: 'A Full House is a trivial special case of Naked Single where the constraint comes entirely from a single house.'
  },
  NAKED_SINGLE: {
    tech: 'NAKED_SINGLE',
    structuralRoles: '1 cell whose candidates have all been ruled out except for one single digit.',
    affectedCandidates: 'Places the remaining candidate in that cell.',
    pitfalls: [
      'Overlooking a hidden peer that already contains one of the candidates.',
      'Confusing a Naked Single (only 1 candidate in this cell) with a Hidden Single (a digit that can only go in 1 cell of a unit).'
    ],
    distinctions: 'Naked Single looks at a single cell across all its 20 peers; Hidden Single looks across a whole house (9 cells) for a specific digit.'
  },
  HIDDEN_SINGLE: {
    tech: 'HIDDEN_SINGLE',
    structuralRoles: '1 house (row, column, or box) where a specific digit appears as a candidate in only 1 cell.',
    affectedCandidates: 'Places that digit in the unique cell, clearing all other candidates in that cell.',
    pitfalls: [
      'Scanning only rows and columns while forgetting to check 3×3 boxes.',
      'Missing that another empty cell in the same house can also hold the digit.'
    ],
    distinctions: 'The cell may contain multiple candidate notes; it is the exclusivity within the house that forces the placement.'
  },
  LOCKED_CANDIDATES_1: {
    tech: 'LOCKED_CANDIDATES_1',
    structuralRoles: 'Pointing: A candidate in a box is confined entirely to one row or column.',
    affectedCandidates: 'Eliminates that candidate from all other cells in the same row or column outside the box.',
    pitfalls: [
      'Confusing pointing (box forces line) with claiming (line forces box).',
      'Eliminating candidates inside the box instead of outside in the pointing line.'
    ],
    distinctions: 'Pointing originates in a box and projects outwards into a line.'
  },
  LOCKED_CANDIDATES_2: {
    tech: 'LOCKED_CANDIDATES_2',
    structuralRoles: 'Claiming / Box-Line Reduction: A candidate in a row or column is confined entirely to one box.',
    affectedCandidates: 'Eliminates that candidate from all other cells in that box outside the line.',
    pitfalls: [
      'Failing to notice an extra candidate cell in the line that lies in a different box.',
      'Eliminating candidates from the line rather than the rest of the box.'
    ],
    distinctions: 'Claiming originates in a line (row or column) and projects into the intersecting box.'
  },
  NAKED_PAIR: {
    tech: 'NAKED_PAIR',
    structuralRoles: '2 cells in the same house that both contain only the exact same two candidates {X, Y}.',
    affectedCandidates: 'Eliminates X and Y from all other cells in that house.',
    pitfalls: [
      'Selecting cells that contain a third candidate (e.g. {X, Y} and {X, Y, Z} do NOT form a naked pair).',
      'Eliminating other candidates from the pair cells themselves.'
    ],
    distinctions: 'Naked Pair isolates candidates by cell capacity; Hidden Pair isolates cells by candidate frequency.'
  },
  HIDDEN_PAIR: {
    tech: 'HIDDEN_PAIR',
    structuralRoles: '2 digits {X, Y} that appear as candidates in only 2 cells of a house, among other candidates.',
    affectedCandidates: 'Eliminates all other candidates (not X or Y) from those two cells.',
    pitfalls: [
      'Missing that one of the two digits can also appear in a third cell of the house.',
      'Treating it like a Naked Pair and trying to eliminate X and Y from the rest of the house.'
    ],
    distinctions: 'In a Hidden Pair, the elimination happens inside the pair cells, stripping them down to a naked pair.'
  },

  // --- Fish Patterns ---
  X_WING: {
    tech: 'X_WING',
    structuralRoles: '2 base lines (rows or cols) where a digit X appears in only 2 cells each, aligning in 2 cover lines.',
    affectedCandidates: 'Eliminates digit X from all other cells in the 2 cover lines.',
    pitfalls: [
      'Selecting base lines that contain a third candidate for digit X (must be strictly 2 cells in each base line).',
      'Base lines not being parallel (e.g. one row and one column is NOT an X-Wing).',
      'Eliminating from the base lines rather than the cover lines.'
    ],
    distinctions: 'An X-Wing is a 2-Fish (size 2), the base member of the fish family that generalizes to Swordfish (size 3) and Jellyfish (size 4); also equivalent to a 4-node alternating conjugate cycle.'
  },
  SWORDFISH: {
    tech: 'SWORDFISH',
    structuralRoles: '3 base lines where digit X appears in cells that span at most 3 cover lines.',
    affectedCandidates: 'Eliminates digit X from all other cells in the 3 cover lines.',
    pitfalls: [
      'Assuming each base line must have 3 candidates (base lines may have 2 or 3 candidates as long as all span ≤ 3 cover lines).',
      'Spanning 4 cover lines instead of 3 (which would be invalid unless expanded to Jellyfish).'
    ],
    distinctions: 'A 3-Fish. Can have 6 to 9 candidate cells across the 3 base units.'
  },
  JELLYFISH: {
    tech: 'JELLYFISH',
    structuralRoles: '4 base lines where digit X appears in cells that span at most 4 cover lines.',
    affectedCandidates: 'Eliminates digit X from all other cells in the 4 cover lines.',
    pitfalls: [
      'Spanning 5 cover lines.',
      'Overlooking that a 4-Fish in rows is mathematically complementary to a 5-Fish (Squirmbag) in columns.'
    ],
    distinctions: 'A 4-Fish. In standard solving, larger fish (5, 6, 7) are rarely needed because their complementary smaller fish detect the same moves.'
  },
  FINNED_X_WING: {
    tech: 'FINNED_X_WING',
    structuralRoles: 'An X-Wing where one base line has 1 or 2 extra candidate cells (fins) located in the same box.',
    affectedCandidates: 'Eliminates digit X from cover-line cells that also see all fin cells in that box.',
    pitfalls: [
      'Fins spanning multiple boxes (fins must reside within a single box to preserve the restricted elimination zone).',
      'Eliminating from cover cells that do not see the fin cells.'
    ],
    distinctions: 'Unlike a regular X-Wing which eliminates along entire cover lines, a finned fish restricts eliminations to the intersection of the cover line and the fin box.'
  },

  // --- Single-Digit Patterns (Turbot & Chains) ---
  SKYSCRAPER: {
    tech: 'SKYSCRAPER',
    structuralRoles: '2 parallel lines with conjugate pairs on digit X. One end shares a unit (the base), while the opposite ends (the roofs) do not.',
    affectedCandidates: 'Eliminates digit X from any cell that sees both roof cells.',
    pitfalls: [
      'Both ends sharing cross-units (that would be a regular X-Wing, which eliminates more).',
      'Base cells not seeing each other in a common line or box.',
      'The base line containing more than 2 candidate cells for digit X.'
    ],
    distinctions: 'A Skyscraper is a 4-node single-digit chain (Turbot Fish). It differs from a 2-String Kite where the base cells meet in a box.'
  },
  TWO_STRING_KITE: {
    tech: 'TWO_STRING_KITE',
    structuralRoles: '1 row and 1 column each having a conjugate pair on digit X, with one cell from each meeting in the same 3×3 box.',
    affectedCandidates: 'Eliminates digit X from the cell at the intersection of the other two ends.',
    pitfalls: [
      'The two base cells in the box being the exact same cell (must be two distinct cells in the box).',
      'The row or column having more than 2 candidate cells for digit X.'
    ],
    distinctions: 'A dual-line Turbot chain where the connection is made via box proximity rather than parallel lines.'
  },
  TURBOT_FISH: {
    tech: 'TURBOT_FISH',
    structuralRoles: 'A 5-link single-digit chain on digit X connecting strong links via weak links across different houses.',
    affectedCandidates: 'Eliminates digit X from cells seeing both endpoints of the chain.',
    pitfalls: [
      'Using a weak link where a strong link was required.',
      'Endpoints not having mutually visible candidate cells to eliminate.'
    ],
    distinctions: 'The general 4-to-5 node single-digit chain form that generalizes both Skyscraper and 2-String Kite.'
  },

  // --- Wings ---
  XY_WING: {
    tech: 'XY_WING',
    structuralRoles: '1 bivalue pivot cell {X, Y} seeing two bivalue pincer cells {X, Z} and {Y, Z}.',
    affectedCandidates: 'Eliminates digit Z from any cell that sees both pincer cells.',
    pitfalls: [
      'The two pincers seeing each other (if all 3 cells see each other, it is a Naked Triple, not a bent wing).',
      'Pincers having a mismatched candidate (both pincers must share the exact same third candidate Z).',
      'The pivot cell having 3 candidates (must be strictly bivalue {X, Y}).'
    ],
    distinctions: 'Also known as a Y-Wing. Operates as an Almost Locked Set interaction where Z is eliminated by mutual pincer sight. Differs from XYZ-Wing where the pivot contains all three candidates {X, Y, Z}.'
  },
  XYZ_WING: {
    tech: 'XYZ_WING',
    structuralRoles: '1 trivalue pivot cell {X, Y, Z} seeing two bivalue pincers {X, Z} and {Y, Z}, where the pivot and one pincer share a box.',
    affectedCandidates: 'Eliminates digit Z from cells that see the pivot AND both pincers (in the shared box).',
    pitfalls: [
      'Eliminating outside the box of the pivot (the pivot itself holds Z, so eliminations must see the pivot too).',
      'Pincers not sharing the common Z digit with the pivot.'
    ],
    distinctions: 'Unlike XY-Wing, the XYZ pivot contains the target digit Z, constraining eliminations to cells seeing all three wing cells.'
  },
  W_WING: {
    tech: 'W_WING',
    structuralRoles: '2 identical bivalue cells {X, Y} that do not see each other, linked by a conjugate pair on digit X.',
    affectedCandidates: 'Eliminates digit Y from any cell seeing both bivalue cells.',
    pitfalls: [
      'The link on X not being strong (if X has 3+ positions in that unit, the wing collapses).',
      'Eliminating digit X instead of digit Y (the link is on X, so the deduction is on Y).'
    ],
    distinctions: 'Combines bivalue cell logic with single-digit conjugate links; does not require a single pivot cell.'
  },

  // --- Coloring & AIC ---
  SIMPLE_COLORS: {
    tech: 'SIMPLE_COLORS',
    structuralRoles: 'A single-digit network of conjugate pairs partitioned into two alternating colors (e.g. blue and green).',
    affectedCandidates: 'Eliminates: (1) candidates seeing opposite colors; (2) all cells of a color if that color appears twice in one unit.',
    pitfalls: [
      'Treating a weak link as a color toggle (only strictly conjugate pairs can toggle parity).',
      'Coloring across multiple digits without multi-coloring or AIC rules.'
    ],
    distinctions: 'Pure 2-color parity search on a single digit. Foundation for Medusa 3D and X-Chains.'
  },
  REMOTE_PAIR: {
    tech: 'REMOTE_PAIR',
    structuralRoles: 'An even-length chain of identical bivalue cells {X, Y} linked by weak links.',
    affectedCandidates: 'Eliminates both X and Y from cells seeing both ends of the chain.',
    pitfalls: [
      'Chain having an odd number of cells (ends would have the same parity, eliminating nothing from mutual peers).',
      'Using a cell that has candidates other than X and Y.'
    ],
    distinctions: 'Equivalent to a 2-digit alternating inference chain of bivalue cells.'
  },

  // --- Uniqueness ---
  UNIQUENESS_1: {
    tech: 'UNIQUENESS_1',
    structuralRoles: 'Unique Rectangle Type 1: 4 cells in 2 rows, 2 columns, and 2 boxes with candidates {X, Y}, where one cell has extra candidates.',
    affectedCandidates: 'Eliminates X and Y from the fourth cell, leaving only its extra candidates.',
    pitfalls: [
      'Rectangle spanning 4 boxes or 1 box (must strictly span exactly 2 boxes to form a deadly pattern).',
      'Any of the 4 cells being an original given (an original given prevents deadly pattern swap, making it an Avoidable Rectangle instead).'
    ],
    distinctions: 'Type 1 is the simplest UR: three cells are strictly {X, Y}, forcing the fourth cell to take one of its other candidates.'
  },
  BUG_PLUS_1: {
    tech: 'BUG_PLUS_1',
    structuralRoles: 'Bivalue Universal Grave + 1: Every unsolved cell has 2 candidates except 1 cell with 3 candidates, and every candidate appears twice in each unit except one candidate appearing 3 times.',
    affectedCandidates: 'Places the candidate that appears 3 times in the trivalue cell.',
    pitfalls: [
      'Applying when the board is not almost entirely bivalue.',
      'Placing one of the candidates that only appears twice.'
    ],
    distinctions: 'A global uniqueness deduction that instantly resolves an unsolved grid near the end of a puzzle.'
  },

  // --- Almost Locked Sets ---
  ALS_XZ: {
    tech: 'ALS_XZ',
    structuralRoles: 'Two Almost Locked Sets (ALS A and ALS B) sharing a restricted common candidate (RCC) X.',
    affectedCandidates: 'Singly linked: eliminates common digit Z from cells seeing all Zs in both ALS. Doubly linked: eliminates other candidates in both ALS.',
    pitfalls: [
      'RCC X appearing in cells across A and B that do not see each other (the RCC must strictly see all copies in the other ALS).',
      'Eliminating candidate Z from cells that only see one of the two ALS sets.'
    ],
    distinctions: 'The fundamental building block of advanced ALS logic, generalizing XY-Wing and XYZ-Wing.'
  }
};

/** Get the detailed educational guide for a technique, falling back to taxonomy metadata if specific guide is not authored */
export function getTechniqueGuide(tech: Tech): TechniqueGuide {
  const existing = TECHNIQUE_GUIDES[tech];
  if (existing) return existing;

  const tax = TECHNIQUE_TAXONOMY[tech];
  const concept = getTechniqueConcept(tech);
  const info = TECHS[tech] as { category?: string } | undefined;

  return {
    tech,
    structuralRoles: `Pattern operating under ${concept.name}: ${concept.summary}`,
    affectedCandidates: `Eliminates or places candidate digits consistent with ${tax?.explanation ?? concept.summary}.`,
    pitfalls: [
      `Confusing this pattern with related techniques in ${concept.name}.`,
      'Ensure all candidate restrictions and conjugate links are strictly satisfied before concluding.'
    ],
    distinctions: tax?.aliases.length
      ? `Also known as ${tax.aliases.join(', ')}. Categorized under ${info?.category ?? concept.name}.`
      : `Categorized under ${info?.category ?? 'Advanced'} (${concept.name}).`
  };
}
