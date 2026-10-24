/**
 * Verified conceptual taxonomy and relationships across Sudoku solving techniques.
 *
 * Grounded in:
 * - docs/concepts_description.md (Historical nomenclature & logical frameworks)
 * - src/content/kin.ts (Cross-family relationships & aliases)
 * - src/engine/ratings.ts (Technique catalogue & categories)
 *
 * Many named Sudoku techniques represent specialized patterns of a broader
 * underlying logical mechanism (e.g. Skyscraper and 2-String Kite are 4-node
 * Turbot chains; XY-Wing and XYZ-Wing are small Almost Locked Set interactions).
 * This taxonomy enables logic-aware knowledge modelling ("what kind of logic I understand")
 * rather than treating every historical name as an isolated skill.
 */

import { Tech, TECHS, Category } from '../engine/ratings';

export type ReasoningConceptId =
  | 'subsets_locked_sets'
  | 'fish_logic'
  | 'single_digit_patterns'
  | 'wing_logic'
  | 'coloring_aic'
  | 'als_logic'
  | 'uniqueness_logic'
  | 'contradiction_forcing'
  | 'advanced_patterns';

export interface ReasoningConcept {
  id: ReasoningConceptId;
  name: string;
  summary: string;
  description: string;
  category: Category | 'Multiple';
  techniques: Tech[];
}

export interface TechniqueTaxonomyEntry {
  tech: Tech;
  conceptId: ReasoningConceptId;
  aliases: string[];
  specialCaseOf?: Tech[];
  generalizes?: Tech[];
  related?: Tech[];
  explanation: string;
}

export const REASONING_CONCEPTS: Record<ReasoningConceptId, ReasoningConcept> = {
  subsets_locked_sets: {
    id: 'subsets_locked_sets',
    name: 'Locked Sets & Subsets',
    summary: 'N candidates locked into N cells within a house, or confined to a box/line intersection.',
    description:
      'The foundational logic of Sudoku. When N cells in a row, column or box can only hold N digits between them, those digits are locked into those cells and eliminated from the rest of the unit (naked subset). Complementarily, when N digits in a house can only appear in N cells, all other candidates in those cells are eliminated (hidden subset). Locked candidates occur at the intersection of a box and a line.',
    category: 'Subsets',
    techniques: [
      'FULL_HOUSE',
      'NAKED_SINGLE',
      'HIDDEN_SINGLE',
      'LOCKED_CANDIDATES_1',
      'LOCKED_CANDIDATES_2',
      'LOCKED_PAIR',
      'LOCKED_TRIPLE',
      'NAKED_PAIR',
      'HIDDEN_PAIR',
      'NAKED_TRIPLE',
      'HIDDEN_TRIPLE',
      'NAKED_QUADRUPLE',
      'HIDDEN_QUADRUPLE'
    ]
  },
  fish_logic: {
    id: 'fish_logic',
    name: 'Fish Logic & Transposition',
    summary: 'One digit constrained to N base lines whose candidates lie in N cover lines.',
    description:
      'Fish logic applies subset reasoning in the transposed row-digit or column-digit view of the grid. If a digit in N rows can only appear in the same N columns, those rows will use up that digit in those columns, eliminating it from all other cells in those columns. Finned and sashimi fish permit extra candidates in one box, yielding eliminations only where cells see both the fish cover and all fins.',
    category: 'Basic Fish',
    techniques: [
      'X_WING',
      'SWORDFISH',
      'JELLYFISH',
      'SQUIRMBAG',
      'WHALE',
      'LEVIATHAN',
      'FINNED_X_WING',
      'SASHIMI_X_WING',
      'FINNED_SWORDFISH',
      'SASHIMI_SWORDFISH',
      'FINNED_JELLYFISH',
      'SASHIMI_JELLYFISH',
      'FRANKEN_X_WING',
      'FRANKEN_SWORDFISH'
    ]
  },
  single_digit_patterns: {
    id: 'single_digit_patterns',
    name: 'Single-Digit Chains & Turbot Patterns',
    summary: 'Strong and weak links tracking a single digit across houses and boxes.',
    description:
      'Patterns that follow one candidate digit using strong links (houses where the digit has exactly two possible positions). Chaining two strong links with a weak link creates a 4-node X-Chain (Turbot Fish). Specific geometries include Skyscrapers (parallel strong links sharing one line) and 2-String Kites (row and column strong links joined in a box).',
    category: 'Single Digit Patterns',
    techniques: [
      'TURBOT_FISH',
      'SKYSCRAPER',
      'TWO_STRING_KITE',
      'EMPTY_RECTANGLE',
      'X_CHAIN',
      'X_CYCLES',
      'GROUPED_X_CYCLES'
    ]
  },
  wing_logic: {
    id: 'wing_logic',
    name: 'Wing & Bent Subset Logic',
    summary: 'A pivot cell branching into bivalue pincers that force a shared elimination.',
    description:
      'Wings are small, non-collinear groups of bivalue cells that behave like bent subsets. In an XY-Wing, a pivot {X,Y} sees pincers {X,Z} and {Y,Z}; whichever value the pivot takes, one pincer must be Z, eliminating Z from any cell seeing both pincers. XYZ-Wings and WXYZ-Wings generalize this logic to larger pivots and pincers under the Almost Locked Set XZ rule.',
    category: 'Wings',
    techniques: [
      'XY_WING',
      'XYZ_WING',
      'W_WING',
      'WXYZ_WING'
    ]
  },
  coloring_aic: {
    id: 'coloring_aic',
    name: 'Coloring & Alternating Inference Chains',
    summary: 'Inferences propagated along alternating strong and weak links or conjugate clusters.',
    description:
      'Alternating Inference Chains (AICs) link candidates using alternating strong ("if false, then true") and weak ("if true, then false") inferences. If a chain opens and closes on the same digit, any cell seeing both ends loses that digit. Closed loops (Nice Loops) eliminate candidates along every weak link in the cycle. Two-coloring tracks parity across strong links on one digit (Simple/Multi Colors) or all digits (3D Medusa).',
    category: 'Chains and Loops',
    techniques: [
      'SIMPLE_COLORS',
      'MULTI_COLORS',
      'MEDUSA_3D',
      'REMOTE_PAIR',
      'CHUTE_REMOTE_PAIR',
      'XY_CHAIN',
      'AIC',
      'AIC_GROUPED',
      'NICE_LOOP',
      'GROUPED_NICE_LOOP'
    ]
  },
  als_logic: {
    id: 'als_logic',
    name: 'Almost Locked Sets (ALS)',
    summary: 'Sets of N cells with N+1 candidates linked by restricted common digits.',
    description:
      'An Almost Locked Set is a group of N cells in a house holding N+1 candidates (one elimination away from being a locked subset). A single bivalue cell is the simplest ALS. When two ALSs share a restricted common candidate (RCC) that cannot be true in both, any other candidate shared between them can be eliminated from cells seeing all occurrences in both sets (ALS-XZ rule). Chains and trees of ALSs extend this principle.',
    category: 'Almost Locked Sets',
    techniques: [
      'ALS_XZ',
      'ALS_XY_WING',
      'ALS_XY_CHAIN',
      'AIC_ALS',
      'DEATH_BLOSSOM',
      'SUE_DE_COQ',
      'ALIGNED_PAIR_EXCLUSION'
    ]
  },
  uniqueness_logic: {
    id: 'uniqueness_logic',
    name: 'Uniqueness Deadly Patterns',
    summary: 'Deductions that prevent configurations that would produce multiple solutions.',
    description:
      'In a valid Sudoku puzzle with exactly one solution, no pattern can arise that would allow digits to be swapped without affecting the rest of the board (a deadly pattern). A Unique Rectangle consists of 4 cells across 2 rows, 2 columns and 2 boxes with candidates {X,Y}; candidates must be eliminated to prevent this deadly pattern from closing.',
    category: 'Uniqueness',
    techniques: [
      'UNIQUENESS_1',
      'UNIQUENESS_2',
      'UNIQUENESS_3',
      'UNIQUENESS_4',
      'UNIQUENESS_5',
      'UNIQUENESS_6',
      'HIDDEN_RECTANGLE',
      'AVOIDABLE_RECTANGLE_1',
      'AVOIDABLE_RECTANGLE_2',
      'EXTENDED_RECTANGLE',
      'BUG_PLUS_1'
    ]
  },
  contradiction_forcing: {
    id: 'contradiction_forcing',
    name: 'Contradiction & Forcing Chains',
    summary: 'Assuming a candidate state and propagating implications to a contradiction or shared outcome.',
    description:
      'Trial-and-implication reasoning. A candidate is hypothesized to be true (or false) and logical deductions are propagated through singles and intersections. If a hypothesis leads to a cell with zero remaining candidates or a digit missing from a house, that hypothesis is proven false (Nishio). If all candidates in a cell or unit force the same deduction, that deduction is confirmed.',
    category: 'Last Resort',
    techniques: [
      'NISHIO_FORCING_CHAIN',
      'DIGIT_FORCING_CHAIN',
      'CELL_FORCING_CHAIN',
      'UNIT_FORCING_CHAIN',
      'FORCING_NET'
    ]
  },
  advanced_patterns: {
    id: 'advanced_patterns',
    name: 'Overlays & Exotic Patterns',
    summary: 'Global digit template overlays and specialized multi-house constraint patterns.',
    description:
      'Advanced patterns that examine all possible valid placements of a digit at once (Pattern Overlay / Template analysis) or specialized multi-house configurations like Tridagon, Fireworks, and Exocet.',
    category: 'Miscellaneous',
    techniques: [
      'PATTERN_OVERLAY',
      'FIREWORKS',
      'TRIDAGON',
      'EXOCET',
      'DOUBLE_EXOCET'
    ]
  }
};

/**
 * Detailed taxonomy entries for each supported technique, documenting verified aliases,
 * concept associations, special-case / generalization links, and explanations.
 */
export const TECHNIQUE_TAXONOMY: Record<Tech, TechniqueTaxonomyEntry> = {
  // --- Singles & Subsets ---
  FULL_HOUSE: {
    tech: 'FULL_HOUSE',
    conceptId: 'subsets_locked_sets',
    aliases: ['Last Digit in House'],
    explanation: 'A house with 8 filled cells leaving exactly 1 empty cell. Both a naked and hidden single at once.'
  },
  NAKED_SINGLE: {
    tech: 'NAKED_SINGLE',
    conceptId: 'subsets_locked_sets',
    aliases: ['Sole Candidate', 'Last Value'],
    specialCaseOf: ['NAKED_PAIR'],
    explanation: 'A cell with only 1 possible candidate remaining. Size-1 case of a naked subset.'
  },
  HIDDEN_SINGLE: {
    tech: 'HIDDEN_SINGLE',
    conceptId: 'subsets_locked_sets',
    aliases: ['Unique Candidate', '1-Fish'],
    specialCaseOf: ['HIDDEN_PAIR', 'X_WING'],
    explanation: 'A digit that can only appear in 1 cell of a row, column or box. Size-1 case of a hidden subset and basic fish.'
  },
  LOCKED_CANDIDATES_1: {
    tech: 'LOCKED_CANDIDATES_1',
    conceptId: 'subsets_locked_sets',
    aliases: ['Pointing Pair', 'Pointing Triple'],
    related: ['LOCKED_CANDIDATES_2'],
    explanation: 'Candidates for a digit in a box all lie on one row or column, clearing that digit from the rest of that line.'
  },
  LOCKED_CANDIDATES_2: {
    tech: 'LOCKED_CANDIDATES_2',
    conceptId: 'subsets_locked_sets',
    aliases: ['Box/Line Reduction', 'Claiming'],
    related: ['LOCKED_CANDIDATES_1'],
    explanation: 'Candidates for a digit in a row or column all lie within one box, clearing that digit from the rest of that box.'
  },
  LOCKED_PAIR: {
    tech: 'LOCKED_PAIR',
    conceptId: 'subsets_locked_sets',
    aliases: ['Pointing Pair in Box'],
    specialCaseOf: ['NAKED_PAIR'],
    explanation: 'A Naked Pair confined to the intersection of a box and line, clearing both the rest of the box and the rest of the line.'
  },
  LOCKED_TRIPLE: {
    tech: 'LOCKED_TRIPLE',
    conceptId: 'subsets_locked_sets',
    aliases: ['Pointing Triple in Box'],
    specialCaseOf: ['NAKED_TRIPLE'],
    explanation: 'A Naked Triple confined to a box/line intersection.'
  },
  NAKED_PAIR: {
    tech: 'NAKED_PAIR',
    conceptId: 'subsets_locked_sets',
    aliases: ['Disjoint Subset of 2', 'Locked Pair'],
    generalizes: ['NAKED_SINGLE'],
    related: ['HIDDEN_PAIR', 'X_WING'],
    explanation: 'Two cells in a house sharing the exact same two candidates. Transposed view of an X-Wing in a line.'
  },
  HIDDEN_PAIR: {
    tech: 'HIDDEN_PAIR',
    conceptId: 'subsets_locked_sets',
    aliases: ['Hidden Subset of 2'],
    related: ['NAKED_PAIR'],
    explanation: 'Two digits that appear only in two cells of a house, locking out all other candidates from those two cells.'
  },
  NAKED_TRIPLE: {
    tech: 'NAKED_TRIPLE',
    conceptId: 'subsets_locked_sets',
    aliases: ['Disjoint Subset of 3'],
    generalizes: ['NAKED_PAIR'],
    related: ['HIDDEN_TRIPLE', 'SWORDFISH'],
    explanation: 'Three cells in a house containing at most three digits in combination. Transposed view of a Swordfish in a line.'
  },
  HIDDEN_TRIPLE: {
    tech: 'HIDDEN_TRIPLE',
    conceptId: 'subsets_locked_sets',
    aliases: ['Hidden Subset of 3'],
    related: ['NAKED_TRIPLE'],
    explanation: 'Three digits appearing only in three cells of a house, clearing all other candidates from those cells.'
  },
  NAKED_QUADRUPLE: {
    tech: 'NAKED_QUADRUPLE',
    conceptId: 'subsets_locked_sets',
    aliases: ['Disjoint Subset of 4'],
    generalizes: ['NAKED_TRIPLE'],
    related: ['HIDDEN_QUADRUPLE', 'JELLYFISH'],
    explanation: 'Four cells in a house holding four digits between them. Transposed view of a Jellyfish in a line.'
  },
  HIDDEN_QUADRUPLE: {
    tech: 'HIDDEN_QUADRUPLE',
    conceptId: 'subsets_locked_sets',
    aliases: ['Hidden Subset of 4'],
    related: ['NAKED_QUADRUPLE'],
    explanation: 'Four digits appearing in only four cells of a house, clearing all other candidates from those cells.'
  },

  // --- Fish Patterns ---
  X_WING: {
    tech: 'X_WING',
    conceptId: 'fish_logic',
    aliases: ['2-Fish'],
    generalizes: ['HIDDEN_SINGLE'],
    related: ['NAKED_PAIR', 'SWORDFISH', 'X_CYCLES'],
    explanation: 'A digit appearing in only two cells in two rows (or columns) sharing the same columns. Equivalent to a continuous X-Cycle of length 4.'
  },
  SWORDFISH: {
    tech: 'SWORDFISH',
    conceptId: 'fish_logic',
    aliases: ['3-Fish'],
    generalizes: ['X_WING'],
    related: ['JELLYFISH', 'NAKED_TRIPLE'],
    explanation: 'A digit appearing in 3 rows constrained to 3 columns (or the reverse), clearing that digit from the rest of those columns.'
  },
  JELLYFISH: {
    tech: 'JELLYFISH',
    conceptId: 'fish_logic',
    aliases: ['4-Fish'],
    generalizes: ['SWORDFISH'],
    related: ['NAKED_QUADRUPLE'],
    explanation: 'A digit appearing in 4 rows constrained to 4 columns, clearing the rest of those columns.'
  },
  SQUIRMBAG: {
    tech: 'SQUIRMBAG',
    conceptId: 'fish_logic',
    aliases: ['5-Fish', 'Starfish'],
    generalizes: ['JELLYFISH'],
    explanation: '5-fish. In standard 9x9 Sudoku, always complemented by a smaller fish (size <= 4) across the opposite axis.'
  },
  WHALE: {
    tech: 'WHALE',
    conceptId: 'fish_logic',
    aliases: ['6-Fish'],
    generalizes: ['SQUIRMBAG'],
    explanation: '6-fish. Always complemented by a basic fish of size <= 3 in the opposite axis.'
  },
  LEVIATHAN: {
    tech: 'LEVIATHAN',
    conceptId: 'fish_logic',
    aliases: ['7-Fish'],
    generalizes: ['WHALE'],
    explanation: '7-fish. Always complemented by an X-Wing or single in the opposite axis.'
  },
  FINNED_X_WING: {
    tech: 'FINNED_X_WING',
    conceptId: 'fish_logic',
    aliases: ['Finned 2-Fish'],
    specialCaseOf: ['AIC'],
    related: ['X_WING', 'SASHIMI_X_WING'],
    explanation: 'An X-Wing with extra candidates (fin) in one box. Eliminations occur in cells that see both the fish cover and all fin cells.'
  },
  SASHIMI_X_WING: {
    tech: 'SASHIMI_X_WING',
    conceptId: 'fish_logic',
    aliases: ['Skinny X-Wing'],
    specialCaseOf: ['AIC'],
    related: ['FINNED_X_WING', 'SKYSCRAPER'],
    explanation: 'A finned X-Wing where removing the fin would leave a line with only 1 candidate. Two Sashimi X-Wings form a Skyscraper.'
  },
  FINNED_SWORDFISH: {
    tech: 'FINNED_SWORDFISH',
    conceptId: 'fish_logic',
    aliases: ['Finned 3-Fish'],
    related: ['SWORDFISH', 'SASHIMI_SWORDFISH'],
    explanation: 'A Swordfish with fin candidates in one box.'
  },
  SASHIMI_SWORDFISH: {
    tech: 'SASHIMI_SWORDFISH',
    conceptId: 'fish_logic',
    aliases: ['Skinny Swordfish'],
    related: ['FINNED_SWORDFISH'],
    explanation: 'A Swordfish with fin candidates where a base line would degenerate without the fin.'
  },
  FINNED_JELLYFISH: {
    tech: 'FINNED_JELLYFISH',
    conceptId: 'fish_logic',
    aliases: ['Finned 4-Fish'],
    related: ['JELLYFISH', 'SASHIMI_JELLYFISH'],
    explanation: 'A Jellyfish with fin candidates in one box.'
  },
  SASHIMI_JELLYFISH: {
    tech: 'SASHIMI_JELLYFISH',
    conceptId: 'fish_logic',
    aliases: ['Skinny Jellyfish'],
    related: ['FINNED_JELLYFISH'],
    explanation: 'A Jellyfish with fin candidates where a base line would degenerate without the fin.'
  },
  FRANKEN_X_WING: {
    tech: 'FRANKEN_X_WING',
    conceptId: 'fish_logic',
    aliases: ['Complex 2-Fish'],
    related: ['X_WING'],
    explanation: 'A fish where one of the base or cover units is a box rather than a row or column.'
  },
  FRANKEN_SWORDFISH: {
    tech: 'FRANKEN_SWORDFISH',
    conceptId: 'fish_logic',
    aliases: ['Complex 3-Fish'],
    related: ['SWORDFISH'],
    explanation: 'A 3-fish incorporating box units into base or cover sets.'
  },

  // --- Single-Digit Patterns ---
  TURBOT_FISH: {
    tech: 'TURBOT_FISH',
    conceptId: 'single_digit_patterns',
    aliases: ['4-Node X-Chain', 'Fishy Cycle'],
    specialCaseOf: ['X_CHAIN'],
    generalizes: ['SKYSCRAPER', 'TWO_STRING_KITE'],
    explanation: 'A 4-node single-digit chain (two strong links connected by a weak link). The umbrella pattern for Skyscrapers and 2-String Kites.'
  },
  SKYSCRAPER: {
    tech: 'SKYSCRAPER',
    conceptId: 'single_digit_patterns',
    aliases: ['Parallel Turbot Fish'],
    specialCaseOf: ['TURBOT_FISH', 'X_CHAIN'],
    related: ['TWO_STRING_KITE', 'SASHIMI_X_WING'],
    explanation: 'A Turbot Fish formed by two parallel strong links in rows (or columns) sharing one base line. Can also be viewed as two Sashimi X-Wings.'
  },
  TWO_STRING_KITE: {
    tech: 'TWO_STRING_KITE',
    conceptId: 'single_digit_patterns',
    aliases: ['2-String Kite', 'Kite'],
    specialCaseOf: ['TURBOT_FISH', 'X_CHAIN'],
    related: ['SKYSCRAPER'],
    explanation: 'A Turbot Fish where one row strong link and one column strong link connect through a shared box.'
  },
  EMPTY_RECTANGLE: {
    tech: 'EMPTY_RECTANGLE',
    conceptId: 'single_digit_patterns',
    aliases: ['ER', 'Hinge'],
    specialCaseOf: ['GROUPED_NICE_LOOP', 'X_CHAIN'],
    related: ['TURBOT_FISH', 'FRANKEN_X_WING'],
    explanation: 'A box where a digit is confined to one row and column, connected via a conjugate pair in an intersecting line. Can be seen as a Grouped Nice Loop.'
  },
  X_CHAIN: {
    tech: 'X_CHAIN',
    conceptId: 'single_digit_patterns',
    aliases: ['Single-Digit AIC'],
    specialCaseOf: ['AIC'],
    generalizes: ['TURBOT_FISH', 'SKYSCRAPER', 'TWO_STRING_KITE'],
    related: ['X_CYCLES', 'SIMPLE_COLORS'],
    explanation: 'An alternating inference chain of arbitrary length tracking a single digit across conjugate pairs.'
  },
  X_CYCLES: {
    tech: 'X_CYCLES',
    conceptId: 'single_digit_patterns',
    aliases: ['Single-Digit Nice Loop'],
    specialCaseOf: ['NICE_LOOP'],
    generalizes: ['X_WING'],
    related: ['X_CHAIN', 'GROUPED_X_CYCLES'],
    explanation: 'A closed loop of alternating strong and weak inferences on a single digit. A length-4 continuous X-Cycle is an X-Wing.'
  },
  GROUPED_X_CYCLES: {
    tech: 'GROUPED_X_CYCLES',
    conceptId: 'single_digit_patterns',
    aliases: ['Grouped Single-Digit Loop'],
    specialCaseOf: ['GROUPED_NICE_LOOP'],
    generalizes: ['X_CYCLES'],
    explanation: 'An X-Cycle where some nodes are groups of cells (e.g. mini-lines in a box) acting collectively as a conjugate unit.'
  },

  // --- Wings ---
  XY_WING: {
    tech: 'XY_WING',
    conceptId: 'wing_logic',
    aliases: ['Y-Wing', 'Bent Triple'],
    specialCaseOf: ['XY_CHAIN', 'ALS_XZ'],
    related: ['XYZ_WING', 'W_WING'],
    explanation: 'Three bivalue cells: pivot {X,Y} seeing pincers {X,Z} and {Y,Z}. One pincer must be Z, clearing Z from cells seeing both pincers. Size-3 XY-Chain and 2-ALS interaction.'
  },
  XYZ_WING: {
    tech: 'XYZ_WING',
    conceptId: 'wing_logic',
    aliases: ['Bent Triple with Shared Pivot'],
    specialCaseOf: ['ALS_XZ', 'ALIGNED_PAIR_EXCLUSION'],
    generalizes: ['XY_WING'],
    related: ['WXYZ_WING'],
    explanation: 'Pivot {X,Y,Z} seeing pincers {X,Z} and {Y,Z}. Z is eliminated from cells seeing all three cells. Special case of ALS-XZ.'
  },
  W_WING: {
    tech: 'W_WING',
    conceptId: 'wing_logic',
    aliases: ['Two-Bivalue Discontinuous Loop'],
    specialCaseOf: ['AIC'],
    related: ['XY_WING'],
    explanation: 'Two identical bivalue cells {X,Y} connected by a strong link on Y. Forces at least one cell to be X, clearing X from shared peers.'
  },
  WXYZ_WING: {
    tech: 'WXYZ_WING',
    conceptId: 'wing_logic',
    aliases: ['Bent Quad', 'XYZW-Wing'],
    specialCaseOf: ['ALS_XZ'],
    generalizes: ['XYZ_WING'],
    explanation: 'Four cells with four candidates in an ALS configuration (a 3-cell ALS and a bivalue cell). Special case of the ALS-XZ rule.'
  },

  // --- Coloring & Chains ---
  SIMPLE_COLORS: {
    tech: 'SIMPLE_COLORS',
    conceptId: 'coloring_aic',
    aliases: ['Simple Colouring'],
    specialCaseOf: ['X_CHAIN', 'AIC'],
    related: ['MULTI_COLORS', 'X_CYCLES'],
    explanation: 'Two-coloring the conjugate pair graph of a single digit. Cells seeing both colours cannot hold the digit; two cells of the same colour in one house eliminate that colour.'
  },
  MULTI_COLORS: {
    tech: 'MULTI_COLORS',
    conceptId: 'coloring_aic',
    aliases: ['Multi-Colouring'],
    specialCaseOf: ['AIC'],
    generalizes: ['SIMPLE_COLORS'],
    related: ['MEDUSA_3D'],
    explanation: 'Colouring multiple disconnected conjugate link clusters of a single digit and linking them across intersecting houses.'
  },
  MEDUSA_3D: {
    tech: 'MEDUSA_3D',
    conceptId: 'coloring_aic',
    aliases: ['3D Medusa', 'Advanced Coloring'],
    specialCaseOf: ['AIC'],
    generalizes: ['MULTI_COLORS'],
    explanation: 'Two-coloring alternating conjugate links across ALL digits simultaneously (bivalue cells and bilocal units).'
  },
  REMOTE_PAIR: {
    tech: 'REMOTE_PAIR',
    conceptId: 'coloring_aic',
    aliases: ['Remote Pairs'],
    specialCaseOf: ['XY_CHAIN'],
    related: ['CHUTE_REMOTE_PAIR'],
    explanation: 'A chain of identical bivalue cells {X,Y}. Any cell seeing an even-length chain with opposite parity loses both X and Y.'
  },
  CHUTE_REMOTE_PAIR: {
    tech: 'CHUTE_REMOTE_PAIR',
    conceptId: 'coloring_aic',
    aliases: ['Chute Remote Pairs'],
    specialCaseOf: ['REMOTE_PAIR'],
    explanation: 'Remote pairs aligned across parallel lines in a single 3-box chute.'
  },
  XY_CHAIN: {
    tech: 'XY_CHAIN',
    conceptId: 'coloring_aic',
    aliases: ['Y-Chain'],
    specialCaseOf: ['AIC'],
    generalizes: ['XY_WING', 'REMOTE_PAIR'],
    related: ['AIC'],
    explanation: 'A chain formed exclusively of bivalue cells where each adjacent pair shares a digit. XY-Wing is the 3-cell case.'
  },
  AIC: {
    tech: 'AIC',
    conceptId: 'coloring_aic',
    aliases: ['Alternating Inference Chain'],
    specialCaseOf: ['FORCING_NET'],
    generalizes: ['X_CHAIN', 'XY_CHAIN', 'W_WING'],
    related: ['NICE_LOOP', 'AIC_GROUPED'],
    explanation: 'The universal chain umbrella: alternating strong and weak inferences across any combination of candidate links.'
  },
  AIC_GROUPED: {
    tech: 'AIC_GROUPED',
    conceptId: 'coloring_aic',
    aliases: ['Grouped AIC'],
    specialCaseOf: ['AIC'],
    generalizes: ['EMPTY_RECTANGLE'],
    explanation: 'An AIC where some nodes represent locked groups of candidates within box-line intersections.'
  },
  NICE_LOOP: {
    tech: 'NICE_LOOP',
    conceptId: 'coloring_aic',
    aliases: ['Continuous / Discontinuous Nice Loop'],
    specialCaseOf: ['AIC'],
    generalizes: ['X_CYCLES'],
    related: ['GROUPED_NICE_LOOP'],
    explanation: 'A closed alternating inference loop. Continuous loops make all weak links strong; discontinuous loops confirm or eliminate the start candidate.'
  },
  GROUPED_NICE_LOOP: {
    tech: 'GROUPED_NICE_LOOP',
    conceptId: 'coloring_aic',
    aliases: ['Grouped Nice Loop'],
    specialCaseOf: ['NICE_LOOP'],
    generalizes: ['GROUPED_X_CYCLES', 'EMPTY_RECTANGLE'],
    explanation: 'A Nice Loop with grouped candidate nodes.'
  },

  // --- Almost Locked Sets ---
  ALS_XZ: {
    tech: 'ALS_XZ',
    conceptId: 'als_logic',
    aliases: ['Almost Locked Set XZ Rule'],
    specialCaseOf: ['ALS_XY_CHAIN'],
    generalizes: ['XY_WING', 'XYZ_WING', 'WXYZ_WING'],
    related: ['ALS_XY_WING'],
    explanation: 'Two Almost Locked Sets connected by a restricted common candidate X. Any other candidate Z common to both sets is eliminated from peers seeing all Zs.'
  },
  ALS_XY_WING: {
    tech: 'ALS_XY_WING',
    conceptId: 'als_logic',
    aliases: ['ALS XY-Wing'],
    specialCaseOf: ['ALS_XY_CHAIN'],
    generalizes: ['XY_WING'],
    related: ['ALS_XZ'],
    explanation: 'Three Almost Locked Sets configured as an XY-Wing, where each cell is upgraded to an Almost Locked Set.'
  },
  ALS_XY_CHAIN: {
    tech: 'ALS_XY_CHAIN',
    conceptId: 'als_logic',
    aliases: ['ALS Chain'],
    specialCaseOf: ['AIC_ALS'],
    generalizes: ['ALS_XZ', 'ALS_XY_WING'],
    explanation: 'A chain of Almost Locked Sets connected sequentially by restricted common candidates.'
  },
  AIC_ALS: {
    tech: 'AIC_ALS',
    conceptId: 'als_logic',
    aliases: ['AIC with ALS'],
    specialCaseOf: ['AIC'],
    generalizes: ['ALS_XY_CHAIN'],
    explanation: 'An Alternating Inference Chain that incorporates Almost Locked Sets as nodes alongside individual candidate links.'
  },
  DEATH_BLOSSOM: {
    tech: 'DEATH_BLOSSOM',
    conceptId: 'als_logic',
    aliases: ['Aligned ALS Exclusion'],
    related: ['ALIGNED_PAIR_EXCLUSION', 'ALS_XZ'],
    explanation: 'A stem cell with N candidates, each connected via a restricted common candidate to an ALS petal. Eliminates digits shared by all petals.'
  },
  SUE_DE_COQ: {
    tech: 'SUE_DE_COQ',
    conceptId: 'als_logic',
    aliases: ['Two-Sector Disjoint Subsets', 'SDC'],
    related: ['ALS_XZ'],
    explanation: 'Intersection of a box and line containing N+2 candidates, paired with an ALS in the box and an ALS in the line.'
  },
  ALIGNED_PAIR_EXCLUSION: {
    tech: 'ALIGNED_PAIR_EXCLUSION',
    conceptId: 'als_logic',
    aliases: ['APE'],
    generalizes: ['XYZ_WING'],
    related: ['DEATH_BLOSSOM'],
    explanation: 'Two cells sharing units whose candidate combinations are ruled out by subsets in their common houses.'
  },

  // --- Uniqueness ---
  UNIQUENESS_1: {
    tech: 'UNIQUENESS_1',
    conceptId: 'uniqueness_logic',
    aliases: ['Unique Rectangle Type 1'],
    related: ['UNIQUENESS_2', 'BUG_PLUS_1'],
    explanation: 'A 4-cell rectangle with candidates {X,Y} where 3 cells are bivalue {X,Y}. The 4th cell cannot contain X or Y.'
  },
  UNIQUENESS_2: {
    tech: 'UNIQUENESS_2',
    conceptId: 'uniqueness_logic',
    aliases: ['Unique Rectangle Type 2'],
    related: ['UNIQUENESS_1'],
    explanation: 'Two cells in the rectangle have the same extra candidate Z; Z can be eliminated from common peers.'
  },
  UNIQUENESS_3: {
    tech: 'UNIQUENESS_3',
    conceptId: 'uniqueness_logic',
    aliases: ['Unique Rectangle Type 3'],
    related: ['NAKED_PAIR'],
    explanation: 'Two cells share extra candidates that form a locked subset with other cells in their shared line.'
  },
  UNIQUENESS_4: {
    tech: 'UNIQUENESS_4',
    conceptId: 'uniqueness_logic',
    aliases: ['Unique Rectangle Type 4'],
    related: ['LOCKED_CANDIDATES_1'],
    explanation: 'One of {X,Y} has a conjugate pair across the rectangle, eliminating the other digit from those cells.'
  },
  UNIQUENESS_5: {
    tech: 'UNIQUENESS_5',
    conceptId: 'uniqueness_logic',
    aliases: ['Unique Rectangle Type 5'],
    related: ['UNIQUENESS_2'],
    explanation: 'Diagonal cells of the rectangle contain extra candidate Z.'
  },
  UNIQUENESS_6: {
    tech: 'UNIQUENESS_6',
    conceptId: 'uniqueness_logic',
    aliases: ['Unique Rectangle Type 6'],
    related: ['UNIQUENESS_4'],
    explanation: 'Both digits have conjugate pairs across opposing edges, forcing placement.'
  },
  HIDDEN_RECTANGLE: {
    tech: 'HIDDEN_RECTANGLE',
    conceptId: 'uniqueness_logic',
    aliases: ['UR with Strong Links'],
    related: ['UNIQUENESS_1'],
    explanation: 'A Unique Rectangle where conjugate links force one corner to eliminate extra candidates.'
  },
  AVOIDABLE_RECTANGLE_1: {
    tech: 'AVOIDABLE_RECTANGLE_1',
    conceptId: 'uniqueness_logic',
    aliases: ['Avoidable Rectangle Type 1'],
    related: ['UNIQUENESS_1'],
    explanation: 'A Unique Rectangle where some corners are already solved non-given cells.'
  },
  AVOIDABLE_RECTANGLE_2: {
    tech: 'AVOIDABLE_RECTANGLE_2',
    conceptId: 'uniqueness_logic',
    aliases: ['Avoidable Rectangle Type 2'],
    related: ['UNIQUENESS_2'],
    explanation: 'An Avoidable Rectangle with shared extra candidates in unsolved corners.'
  },
  EXTENDED_RECTANGLE: {
    tech: 'EXTENDED_RECTANGLE',
    conceptId: 'uniqueness_logic',
    aliases: ['Unique Rectangle Extension (6 or 8 cells)'],
    related: ['UNIQUENESS_1'],
    explanation: 'A 6-cell or 8-cell deadly pattern extending across three houses.'
  },
  BUG_PLUS_1: {
    tech: 'BUG_PLUS_1',
    conceptId: 'uniqueness_logic',
    aliases: ['Bivalue Universal Grave + 1'],
    related: ['UNIQUENESS_1'],
    explanation: 'All unsolved cells have 2 candidates except 1 cell with 3 candidates. The digit appearing 3 times in that cell’s houses must be placed.'
  },

  // --- Contradiction & Forcing ---
  NISHIO_FORCING_CHAIN: {
    tech: 'NISHIO_FORCING_CHAIN',
    conceptId: 'contradiction_forcing',
    aliases: ['Nishio', 'Single-Candidate Contradiction'],
    specialCaseOf: ['FORCING_NET'],
    explanation: 'Testing whether setting candidate (cell, digit) to true forces an immediate contradiction through singles propagation.'
  },
  DIGIT_FORCING_CHAIN: {
    tech: 'DIGIT_FORCING_CHAIN',
    conceptId: 'contradiction_forcing',
    aliases: ['Digit Forcing Chain'],
    specialCaseOf: ['FORCING_NET'],
    explanation: 'Testing all positions of a digit in a house; any candidate eliminated in all branches is proven false.'
  },
  CELL_FORCING_CHAIN: {
    tech: 'CELL_FORCING_CHAIN',
    conceptId: 'contradiction_forcing',
    aliases: ['Cell Forcing Chain'],
    specialCaseOf: ['FORCING_NET'],
    explanation: 'Testing all remaining candidates of a cell; deductions shared by all branches are confirmed.'
  },
  UNIT_FORCING_CHAIN: {
    tech: 'UNIT_FORCING_CHAIN',
    conceptId: 'contradiction_forcing',
    aliases: ['Unit Forcing Chain', 'House Forcing Chain'],
    specialCaseOf: ['FORCING_NET'],
    explanation: 'Testing all positions of all digits in a house to verify convergent deductions.'
  },
  FORCING_NET: {
    tech: 'FORCING_NET',
    conceptId: 'contradiction_forcing',
    aliases: ['Dynamic Forcing Net'],
    generalizes: ['NISHIO_FORCING_CHAIN', 'CELL_FORCING_CHAIN', 'DIGIT_FORCING_CHAIN'],
    explanation: 'Full multi-branch forcing network propagating through singles and intersections.'
  },

  // --- Overlays & Exotic ---
  PATTERN_OVERLAY: {
    tech: 'PATTERN_OVERLAY',
    conceptId: 'advanced_patterns',
    aliases: ['POM', 'Template Analysis'],
    explanation: 'Computing all globally valid solution templates for one digit. Candidates appearing in no template are eliminated; candidates in all templates are placed.'
  },
  FIREWORKS: {
    tech: 'FIREWORKS',
    conceptId: 'advanced_patterns',
    aliases: ['Fireworks Pattern'],
    explanation: 'A specialized interaction of box-line locked candidates and intersecting bivalue cells.'
  },
  TRIDAGON: {
    tech: 'TRIDAGON',
    conceptId: 'advanced_patterns',
    aliases: ['Tridagon Pattern'],
    explanation: 'A rare 8-cell deadly pattern involving two digits across four boxes.'
  },
  EXOCET: {
    tech: 'EXOCET',
    conceptId: 'advanced_patterns',
    aliases: ['Junior Exocet (JE)'],
    related: ['DOUBLE_EXOCET'],
    explanation: 'A multi-house pattern featuring two base cells and two cross-line target cells with companion mirror and companion lines.'
  },
  DOUBLE_EXOCET: {
    tech: 'DOUBLE_EXOCET',
    conceptId: 'advanced_patterns',
    aliases: ['Double Exocet', 'Senior Exocet'],
    related: ['EXOCET'],
    explanation: 'A dual-direction Exocet pattern with four base cells.'
  },

  // --- Unimplemented Catalogue Entries & Brute Force ---
  TWINNED_XY_CHAIN: {
    tech: 'TWINNED_XY_CHAIN',
    conceptId: 'coloring_aic',
    aliases: ['Twinned XY-Chain'],
    specialCaseOf: ['XY_CHAIN'],
    explanation: 'Two parallel XY-Chains sharing endpoint dependencies. Unimplemented in engine; subsumed by general AIC.'
  },
  SK_LOOP: {
    tech: 'SK_LOOP',
    conceptId: 'coloring_aic',
    aliases: ['Domino Loop'],
    specialCaseOf: ['NICE_LOOP'],
    explanation: 'A 16-cell loop formed by domino pairs in four intersecting boxes. Unimplemented in engine; subsumed by general AIC loops.'
  },
  FORCING_CHAIN: {
    tech: 'FORCING_CHAIN',
    conceptId: 'contradiction_forcing',
    aliases: ['General Forcing Chain'],
    specialCaseOf: ['FORCING_NET'],
    explanation: 'Catalogue placeholder for general forcing chains, implemented via Digit/Cell/Unit Forcing and Forcing Nets.'
  },
  BRUTE_FORCE: {
    tech: 'BRUTE_FORCE',
    conceptId: 'contradiction_forcing',
    aliases: ['Guess & Backtrack'],
    explanation: 'Recursive backtracking search. Last resort in the solver; excluded from human pattern scanning.'
  }
};

/** Get the concept a technique belongs to */
export function getTechniqueConcept(tech: Tech): ReasoningConcept {
  const entry = TECHNIQUE_TAXONOMY[tech];
  const conceptId = entry ? entry.conceptId : 'subsets_locked_sets';
  return REASONING_CONCEPTS[conceptId];
}

/** Get list of techniques related to this technique by special-case, generalization, or kin */
export function getRelatedTechniques(tech: Tech): Tech[] {
  const entry = TECHNIQUE_TAXONOMY[tech];
  if (!entry) return [];
  const set = new Set<Tech>();
  if (entry.specialCaseOf) entry.specialCaseOf.forEach((t) => set.add(t));
  if (entry.generalizes) entry.generalizes.forEach((t) => set.add(t));
  if (entry.related) entry.related.forEach((t) => set.add(t));
  return [...set];
}
