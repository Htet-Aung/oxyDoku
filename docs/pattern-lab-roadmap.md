# Pattern Lab — Architecture Audit & Implementation Roadmap

This document records the technical audit of `AImenes/sudokUI` and the implementation plan for **Pattern Lab**: extending `sudokUI` into a local-first Sudoku pattern-discovery and learning environment that finds and explores **every** applicable pattern instance in the current board position.

---

## 1. Existing Architecture and Relevant Entry Points

The codebase enforces a strict one-way dependency graph (`src/ui/ -> src/state/ -> src/engine/`), with shared static learning/localisation data in `src/content/`.

### 1.1 Engine Layer (`src/engine/`) — Pure TypeScript, Zero React/DOM Imports
- **`src/engine/board.ts`**:
  - `Grid`: `{ values: Uint8Array(81), cands: Uint16Array(81), given: Uint8Array(81) }`.
  - Candidate bitmasks use bits `1 << (d - 1)` for digits `1..9` (`0x1ff` = all 9 digits).
  - Precomputed topology tables: `UNITS` (27 houses: rows `0..8`, cols `9..17`, boxes `18..26`), `CELL_UNITS`, `PEERS` (20 peers per cell), `sees(a, b)`.
- **`src/engine/steps.ts`**:
  - `Step`: Uniform output of every finder:
    - `tech: Tech`
    - `placements: CellDigit[]`, `eliminations: CellDigit[]`
    - `primary?: CellDigit[]` (blue), `secondary?: CellDigit[]` (amber/gold), `fins?: CellDigit[]` (purple)
    - `labels?: { primary?: string; secondary?: string; fins?: string }`
    - `units?: UnitBand[]` (`role: 'primary' | 'secondary'`)
    - `chainCells?: number[]`, `links?: ChainLink[]` (`from`, `to`, `strong`, `undirected?`, `text?`)
    - `description: string`
- **`src/engine/ratings.ts`**:
  - `TECHS`: Catalogue of **80 keys** (79 human techniques + `BRUTE_FORCE`), with HoDoKu difficulty `level`, `score`, `index`, `category`, `implemented`, `enabled`, `summary`, and `example`.
  - `SOLVE_ORDER`: 73 techniques (`72` enabled human techniques + `BRUTE_FORCE`), ordered by `index`.
  - `NO_UNIQUENESS_ORDER`: 62 techniques (`SOLVE_ORDER` minus the 11 `'Uniqueness'` techniques).
  - `PRACTICE_TECHS`: 61 techniques (`SOLVE_ORDER` minus `'Last Resort'` and `NOT_PRACTISABLE`).
- **`src/engine/humanSolver.ts` & `src/engine/scanner.ts`**:
  - `Finder = (g: Grid) => Step | null`.
  - `FINDERS`: Maps 76 `Tech` keys to their single-step finder functions (`AIC_ALS` is emitted by `FINDERS.AIC_GROUPED` in legacy single-step solving).
  - `findNextStep(g, order)`: Returns the first non-null `Step` in `order`.
  - `findStep(tech, g)`: Runs the single finder for `tech`.
  - `findAllSteps(g, order)`: Calls each `FINDERS[tech](g)` once and returns at most **one** `Step` per technique.
  - `applyStep(g, step)` & `ratePuzzle(puzzle, order, limit)`: Mutates a cloned `Grid` step-by-step to compute a solve path and HoDoKu score.
  - `findAllPatternInstances(g, options)` / `scanPosition(g, options)` (`src/engine/scanner.ts`): Enumerates **all** distinct pattern instances across the selected techniques on the unchanged board `g`.
- **`src/engine/hintFrames.ts`**:
  - `walkFrames(step)` & `describe(step)`: Turns any `Step` (whether link/chain-based or colour/role-based) into an ordered sequence of visual reveal frames (`Frame[]`) with per-frame narration.
- **`src/engine/justify.ts` & `src/engine/chainTrainer.ts`**:
  - `justify(g, move)`: Finds the easiest technique path that justifies a player's placement or candidate removal.
  - `chainTrainer.ts`: Interactive candidate-by-candidate AIC/loop builder.
- **`src/engine/generator.ts` & `src/engine/worker.ts`**:
  - Generates and rates minimal proper puzzles; Web Worker (`src/engine/worker.ts`) handles background pool generation and off-thread `justify` checks.

### 1.2 Content Layer (`src/content/`)
- **`src/content/intuition.ts`**: The "Intuition" guide explaining the 3 core logical engines (Locked Sets, Almost Locked Sets, Chains) + Uniqueness and Set Logic (`Truths and Links`), plus naming history.
- **`src/content/kin.ts`**: `KIN: Partial<Record<Tech, Kin>>` — maps techniques to their logical relatives (`also` prose + clickable `techs` chips) shown in `HintPanel` and `Learn`.
- **`src/content/categories.ts` & `src/content/path.ts`**: Category descriptions and the 8-step scanning habit guide.
- **`src/content/examples.ts` & `src/content/practicePuzzles.ts`**: Pre-computed real-board examples for every implemented technique and curated seed puzzles for hard-to-generate practice techniques.

### 1.3 State Layer (`src/state/`)
- **`src/state/gameStore.ts`**:
  - Zustand store persisted to `sudokui-game-v1`.
  - Bridges UI cell state (`CellState[]` with `value`, `given`, `corner`, `center`, `excluded`, `colors`) to engine `Grid`:
    - `engineGrid(cells)`: Full legal candidate masks minus `cells[i].excluded` (auto-candidate strike-throughs).
    - `contractGrid(cells, autoCandidates, markContract)`: When `!autoCandidates && markContract === 'exhaustive'`, intersects `g.cands[i]` with `cells[i].corner | cells[i].center` on marked cells.
    - `markSlip(cells, solution)` & `stepMatchesSolution(step, solution)`: Guard against false deductions caused by user pencil-mark mistakes.
  - `showStep(step)`: Sets `hint: step, hintStage: 'full', assisted: true`.
- **`src/state/settings.ts`**: Persisted to `sudokui-settings-v1` (`useUniqueness`, `practiceFastForward`, `dontCount`, visual highlight flags).
- **`src/state/stats.ts`**: Persisted to `sudokui-stats-v1` (solve counts/times and `techniques` map tracking `seen`, `spotted`, `practised` per `Tech`).
- **`src/state/pools.ts`**: Persisted to `sudokui-pools-v12`; manages urgent and background Web Workers.

### 1.4 UI Layer (`src/ui/`)
- **`src/ui/Grid.tsx`**: Renders the 9×9 SVG board, candidate marks, unit bands (`hint.units`), coloured candidate circles (`primary`, `secondary`, `fins`, `elim`, `place`), rings on eliminated coloured candidates, and HoDoKu-style curved `ChainArrows` (`hint.links`).
- **`src/ui/HintPanel.tsx`**: Renders the active `hint` (`stage: 'tech' | 'full' | 'walk'`), colour legend, `walkFrames` stepper, `KIN` related-technique links, HoDoKu/Eureka `Copy`, and `Apply` / `Dismiss`.
- **`src/ui/Dialogs.tsx`**: Contains `ScanDialog` (lines 483–565), `StepsDialog`, `NewGameDialog`, `VictoryDialog`, `CheckModal`, `ContractModal`, `CustomBar`, `ChainBar`.
- **`src/ui/Learn.tsx` & `src/ui/Progress.tsx`**: Technique guide, Intuition tab, How-to-solve tab, and personal technique catalogue/practice launcher.

---

## 2. Existing Next-Step Solver vs. New All-Instance Scanner

| Dimension | Existing Solver (`findNextStep` / `findAllSteps`) | New Pattern Lab Scanner (`findAllPatternInstances` / `scanPosition`) |
| :--- | :--- | :--- |
| **Primary Goal** | Advance or rate the puzzle along a single canonical path (`SOLVE_ORDER`). | Discover and study **all** valid pattern instances in the **current** position. |
| **Instances per Technique** | At most **1** (`Finder` returns `Step \| null` at the first `return`). | **All distinct instances** (`PatternInstance[]`) of each scanned technique on the current board. |
| **Board Mutation** | `ratePuzzle` clones and mutates `Grid` via `applyStep`; `applyHint` mutates `cells`. | **Strictly non-mutating.** Analyses `Grid` as-is; never applies steps during scanning. |
| **Overlapping Eliminations** | Hidden once an earlier technique or earlier loop iteration returns. | **Preserved.** Multiple techniques (or multiple instances of one technique) explaining the same elimination are all returned and cross-indexed in `byConclusion`. |
| **Disabled/Redundant Techs** | `SQUIRMBAG`, `WHALE`, `LEVIATHAN`, `DOUBLE_EXOCET` are skipped (`enabled: false`). | Available on demand via `includeDisabled: true` or explicit `techniques: [...]`. |
| **`AIC_GROUPED` vs `AIC_ALS`** | Share one slot (`FINDERS.AIC_GROUPED`); only one step of either kind can be returned. | Cleanly separated (`iterGroupedAic(g, 'grouped_only')` vs `iterGroupedAic(g, 'als_only')`) so both `AIC_GROUPED` and `AIC_ALS` instances are enumerated independently. |
| **UI Interaction** | Clicking a step in `ScanDialog` immediately closes the dialog and replaces `hint`. | **Pattern Explorer** lets the user browse, filter, compare, and walk through multiple instances without losing the scan list. |

---

## 3. Implemented API and Data Flow for Pattern Enumeration (`src/engine/scanner.ts`)

### 3.1 Core Types (`src/engine/scanner.ts`, re-exported from `src/engine/humanSolver.ts`)

```ts
export type ScannerCoverage = 'exhaustive' | 'bounded' | 'unimplemented';
export type TruncationReason = 'instance-cap' | 'search-budget' | 'template-overflow';

export interface ScanOptions {
  /** Explicit list of techniques to scan. Defaults to enabled human techniques (+ disabled if includeDisabled is true). */
  techniques?: readonly Tech[];
  /** Include implemented techniques disabled by default in SOLVE_ORDER (SQUIRMBAG, WHALE, LEVIATHAN, DOUBLE_EXOCET). */
  includeDisabled?: boolean;
  /** Include uniqueness-based techniques (defaults to true). */
  useUniqueness?: boolean;
  /** Maximum instances to collect per technique before truncating (defaults to 50). */
  maxInstancesPerTech?: number;
  /** Filter out reducible supersets within the same family (e.g. Swordfish containing an X-Wing) (defaults to true). */
  irreducibleOnly?: boolean;
}

export interface PatternInstance {
  /** Stable canonical identifier within the current position (`${tech}:${patternKey}`). */
  id: string;
  /** Technique identifier. */
  tech: Tech;
  /** Localised display name of the technique. */
  techName: string;
  /** Full underlying Step preserving primary/secondary/fins, units, links, chainCells, placements, eliminations, description. */
  step: Step;
  /** Sorted digits involved in the pattern or its conclusions (1..9). */
  digits: number[];
  /** Sorted cell indices (0..80) establishing the pattern (primary, secondary, fins, chainCells, link endpoints). */
  patternCells: number[];
  /** Sorted cell indices (0..80) where candidates are eliminated or digits are placed. */
  conclusionCells: number[];
  /** Canonical signature of all placements and eliminations produced by this instance. */
  conclusionKey: string;
}

export interface TechScanSummary {
  tech: Tech;
  implemented: boolean;
  enabledByDefault: boolean;
  coverage: ScannerCoverage;
  instances: PatternInstance[];
  truncated: boolean;
  truncationReason?: TruncationReason;
}

export interface ScanResult {
  instances: PatternInstance[];
  byTech: Partial<Record<Tech, TechScanSummary>>;
  byConclusion: Record<string, PatternInstance[]>;
  scannedTechniques: Tech[];
  unimplementedTechniques: Tech[];
  truncatedTechniques: Tech[];
}
```

### 3.2 Canonical Deduplication Rules
To ensure the scanner reports **every distinct logical instance** without flooding the user with trivial traversal duplicates (e.g., the same chain read left-to-right and right-to-left):

1. **Pattern Signature (`patternInstanceKey(step: Step)`):**
   - **Fixed-shape & Set/Fish patterns** (`Singles`, `Intersections`, `Subsets`, `Basic/Finned/Sashimi/Franken Fish`, `Wings`, `Uniqueness`, `Extended Rectangle`, `Sue de Coq`, `Fireworks`, `Tridagon`, `Exocet`, `Aligned Pair Exclusion`, `Coloring`, `3D Medusa`, `Pattern Overlay`):
     - Defined by `(step.tech, sortedUnits(step.units), sortedCellDigits(step.primary), sortedCellDigits(step.secondary), sortedCellDigits(step.fins), sortedConclusions(step))`.
     - `NAKED_PAIR` / `NAKED_TRIPLE` / `NAKED_QUADRUPLE` (`iterNakedSubset` in `src/engine/techniques/subsets.ts`): Deduplicated by `combo.join(',')` across row/col and box overlap, with `irreducibleOnly` filtering out subsets containing a proper smaller naked subset.
     - `FRANKEN_X_WING` / `FRANKEN_SWORDFISH` (`src/engine/techniques/complexFish.ts`): Deduplicated by `(d, base.join(','), cover.join(','))` with `irreducibleOnly` filtering out basic/finned fish and smaller Franken fish.
     - `ALS_XZ` (`src/engine/techniques/als.ts`): Deduplicated by `(A.cells, B.cells, x, z)` and excludes 4-cell/4-digit `WXYZ_WING` shapes when `irreducibleOnly` is true.
   - **Open Chains** (`SKYSCRAPER`, `TWO_STRING_KITE`, `TURBOT_FISH`, `REMOTE_PAIR`, `CHUTE_REMOTE_PAIR`, `X_CHAIN`, `XY_CHAIN`, `AIC`, `AIC_GROUPED`, `AIC_ALS`, `ALS_XY_WING`, `ALS_XY_CHAIN`):
     - Canonicalises forward vs. reverse traversal and deduplicates by `(unorderedEndpoints, elimSignature)` (while `X_CHAIN` starts at 6+ nodes and `XY_CHAIN` starts at 4+ cells when `irreducibleOnly` is true so 4-node Turbot family patterns and 3-cell XY-Wings are not re-emitted as generic chains).
   - **Closed Loops** (`X_CYCLES`, `GROUPED_X_CYCLES`, `NICE_LOOP`, `GROUPED_NICE_LOOP`):
     - Canonicalises continuous loops (Rule 1) across all $2k$ cycle rotations/reflections and discontinuous loops (Rule 2/3) by `(startNode, conclusionSignature, canonicalLoopCellDigits)`.
   - **Forcing Chains & Nets** (`NISHIO_FORCING_CHAIN`, `DIGIT_FORCING_CHAIN`, `CELL_FORCING_CHAIN`, `UNIT_FORCING_CHAIN`, `FORCING_NET`):
     - Enumerates every assumption origin `(cell, d)` / `cell` / `(unit, d)`, excluding plain single-only Nishio contradictions from `FORCING_NET`.

---

## 4. Coverage Across All 76 Implemented Human Techniques (`25` Finder Modules)

All **76 implemented human techniques** across the **25 finder modules** in `src/engine/techniques/` export multi-instance `iterXxx` generators while preserving single-result `findXxx` wrappers:

- **Exhaustive coverage (`55` techniques):**
  - `FULL_HOUSE`, `NAKED_SINGLE`, `HIDDEN_SINGLE` (`src/engine/techniques/singles.ts`)
  - `LOCKED_CANDIDATES_1`, `LOCKED_CANDIDATES_2` (`src/engine/techniques/intersections.ts`)
  - `LOCKED_PAIR`, `LOCKED_TRIPLE`, `NAKED_PAIR`, `HIDDEN_PAIR`, `NAKED_TRIPLE`, `HIDDEN_TRIPLE`, `NAKED_QUADRUPLE`, `HIDDEN_QUADRUPLE` (`src/engine/techniques/subsets.ts`)
  - `X_WING`, `SWORDFISH`, `JELLYFISH`, `SQUIRMBAG`, `WHALE`, `LEVIATHAN`, `FINNED_X_WING`, `SASHIMI_X_WING`, `FINNED_SWORDFISH`, `SASHIMI_SWORDFISH`, `FINNED_JELLYFISH`, `SASHIMI_JELLYFISH` (`src/engine/techniques/fish.ts`)
  - `SKYSCRAPER`, `TWO_STRING_KITE`, `TURBOT_FISH`, `EMPTY_RECTANGLE` (`src/engine/techniques/singleDigit.ts`)
  - `XY_WING`, `XYZ_WING`, `W_WING` (`src/engine/techniques/wings.ts`), `WXYZ_WING` (`src/engine/techniques/als.ts`)
  - `SIMPLE_COLORS`, `MULTI_COLORS` (`src/engine/techniques/coloring.ts`), `MEDUSA_3D` (`src/engine/techniques/medusa.ts`)
  - `REMOTE_PAIR` (`src/engine/techniques/chains.ts`), `CHUTE_REMOTE_PAIR` (`src/engine/techniques/chuteRemotePair.ts`)
  - `UNIQUENESS_1..6`, `HIDDEN_RECTANGLE`, `AVOIDABLE_RECTANGLE_1..2`, `BUG_PLUS_1` (`src/engine/techniques/uniqueness.ts`), `EXTENDED_RECTANGLE` (`src/engine/techniques/extendedRectangle.ts`)
  - `SUE_DE_COQ` (`src/engine/techniques/sueDeCoq.ts`), `ALIGNED_PAIR_EXCLUSION` (`src/engine/techniques/ape.ts`), `FIREWORKS` (`src/engine/techniques/fireworks.ts`), `TRIDAGON` (`src/engine/techniques/tridagon.ts`), `EXOCET`, `DOUBLE_EXOCET` (`src/engine/techniques/exocet.ts`)
- **Bounded coverage (`21` techniques, documented in `TECH_SCANNER_META`):**
  - `FRANKEN_X_WING`, `FRANKEN_SWORDFISH` (`src/engine/techniques/complexFish.ts`)
  - `X_CHAIN`, `XY_CHAIN` (`src/engine/techniques/chains.ts`), `X_CYCLES` (`src/engine/techniques/xCycles.ts`), `GROUPED_X_CYCLES` (`src/engine/techniques/groupedXCycles.ts`)
  - `AIC`, `NICE_LOOP` (`src/engine/techniques/aic.ts`), `AIC_GROUPED`, `AIC_ALS`, `GROUPED_NICE_LOOP` (`src/engine/techniques/groupedAic.ts`)
  - `ALS_XZ`, `ALS_XY_WING`, `ALS_XY_CHAIN`, `DEATH_BLOSSOM` (`src/engine/techniques/als.ts`)
  - `PATTERN_OVERLAY` (`src/engine/techniques/templates.ts`)
  - `NISHIO_FORCING_CHAIN`, `DIGIT_FORCING_CHAIN`, `CELL_FORCING_CHAIN`, `UNIT_FORCING_CHAIN`, `FORCING_NET` (`src/engine/techniques/forcing.ts`)
- **Unimplemented catalogue entries (`3` human techniques + `BRUTE_FORCE`):**
  - `TWINNED_XY_CHAIN`, `SK_LOOP`, `FORCING_CHAIN` (explicitly marked `implemented: false, coverage: 'unimplemented'`).

---

## 5. Phased Implementation Sequence

- **Phase 0 (Complete):** Repository audit, baseline test & build verification, `docs/pattern-lab-project-brief.md`, `docs/pattern-lab-roadmap.md`, and `AGENTS.md`.
- **Phase 1 (Complete) — All-Instance Scanner Engine & Canonical Deduplication:**
  - Refactored all 25 finder modules in `src/engine/techniques/` to export multi-instance `iterXxx` generators while preserving `findXxx` single-result wrappers.
  - Implemented `src/engine/scanner.ts` (`findAllPatternInstances`, `scanPosition`, `findPatternInstancesForTech`, `TECH_SCANNER_META`) and re-exported from `src/engine/humanSolver.ts`.
  - Separated `AIC_GROUPED` and `AIC_ALS` in the scanner and added `tests/scanner.test.ts` (18 test suites covering multi-instance detection, overlapping deductions, finned/sashimi fish, disabled techniques, canonical deduplication, candidate-state contract, non-mutation, and oracle soundness).
- **Phase 2 — "My Techniques" Personal Mastery Store & Privacy Hardening:**
  - Implement `src/state/mastery.ts` (`known` / `learning` / `unfamiliar`), default local privacy (`dontCount: true`), and build the **My Techniques** configuration UI.
- **Phase 3 — Pattern Scanner & Interactive Pattern Explorer UI (Completed):**
  - Built `PatternScannerPanel` (`src/ui/PatternScannerPanel.tsx`) and `scannerStore` (`src/state/scannerStore.ts`) providing non-mutating on-demand board scanning, grouping by technique/category/digit/house/conclusion, board highlighting, step-by-step walkthroughs, overlapping explanation comparisons, and optional user-initiated move application.
- **Phase 4 — My Techniques: Knowledge Settings & Logic-Aware Filtering (Completed):**
  - Built `mastery.ts` (`src/content/mastery.ts`), `concepts.ts` (`src/content/concepts.ts`), and `MyTechniquesPanel` (`src/ui/MyTechniquesPanel.tsx`) with `known` / `learning` / `unfamiliar` familiarity states, quick-start presets, Discovery mode, and logic-family taxonomy across all 10 reasoning concepts.
- **Phase 5 — Turn Pattern Lab into a Learning and Practice Tool (Completed):**
  - Built `techniqueGuides.ts` (`src/content/techniqueGuides.ts`), `progressiveHints.ts` (`src/engine/progressiveHints.ts`), `practiceVerifier.ts` (`src/engine/practiceVerifier.ts`), `practiceStore.ts` (`src/state/practiceStore.ts`), and `PracticePanel.tsx` (`src/ui/PracticePanel.tsx`) providing 6-part learning guides, 4-stage progressive hints, focused & mixed practice, interactive answer verification, and non-competitive local progress tracking.
- **Phase 6 — Final Validation, Offline Behaviour, Privacy & Project Polish (Completed):**
  - Added storage sanitization (`sanitizeMasterySettings`, `sanitizePracticePersistedState`) with `safeLocalStorage` resilience, end-to-end validation suite (`tests/phase6Validation.test.ts`), and complete developer maintenance documentation.

---

## 6. Maintenance & Developer Reference

### 6.1 How the Scanning API Works

The multi-instance scanner in [`src/engine/scanner.ts`](../src/engine/scanner.ts) exposes two pure, non-mutating functions (re-exported from [`src/engine/humanSolver.ts`](../src/engine/humanSolver.ts)):

1. **`findAllPatternInstances(g: Grid, options?: ScanOptions): ScanResult`**
   - Clones `g` before invoking any detector and verifies that the caller's `Grid` (`values`, `cands`, `given`) is never mutated.
   - Evaluates requested techniques in order without applying any placement or elimination between detectors.
   - Returns:
     - `instances`: flat list of `PatternInstance` items with deterministic `id`, `tech`, `step`, `digits`, `patternCells`, `conclusionCells`, and `conclusionKey`.
     - `byTech`: per-technique `TechScanSummary` containing `instances`, `coverage` (`'exhaustive' | 'bounded' | 'unimplemented'`), `truncated`, and `truncationReason` (`'instance-cap' | 'search-budget' | 'template-overflow'`).
     - `byConclusion`: instances indexed by individual conclusion key (`P:<cell>:<digit>` or `E:<cell>:<digit>`) so overlapping explanations for the same deduction remain inspectable side by side.
     - `scannedTechniques`, `unimplementedTechniques`, and `truncated`.
2. **`findPatternInstancesForTech(tech: Tech, g: Grid, options?: TechScanOptions): TechScanSummary`**
   - Runs a single technique's multi-instance generator against an unmodified clone of `g`.

### 6.2 Detector Coverage & Search Limitations

Full per-technique details are maintained in [`docs/pattern-scanner-coverage.md`](pattern-scanner-coverage.md):

- **76 Implemented Human Techniques** (`IMPLEMENTED_TECHS`):
  - **55 Exhaustive (`coverage: 'exhaustive'`):** All Singles, Intersections, Naked/Hidden Subsets, Basic/Finned/Sashimi/Franken Fish (sizes 2–7), Single-Digit Patterns, Wings, Colouring, Uniqueness (UR 1–6, Hidden/Avoidable/Extended Rectangles, BUG+1), ALS-XZ, ALS-XY-Wing, Sue de Coq, Death Blossom, Aligned Pair Exclusion, Fireworks, and Tridagon.
  - **21 Bounded (`coverage: 'bounded'`):**
    - Chain & loop detectors (`REMOTE_PAIRS`, `CHUTE_REMOTE_PAIRS`, `X_CHAIN`, `X_CYCLES`, `GROUPED_X_CYCLES`, `XY_CHAIN`, `AIC`, `GROUPED_AIC`, `AIC_ALS`, `NICE_LOOP`, `GROUPED_NICE_LOOP`, `CONTINUOUS_NICE_LOOP`, `GROUPED_CONTINUOUS_NICE_LOOP`, `ALS_XY_CHAIN`) enforce depth bounds (`maxDepth: 6..10`) and shortest-per-conclusion pruning (`BOUNDED_TECH_BOUNDS`).
    - Template detectors (`EXOCET`, `DOUBLE_EXOCET`, `PATTERN_OVERLAY`) enforce `maxTemplates: 20000` per digit; if exceeded, `truncated: true` and `truncationReason: 'template-overflow'` are reported.
    - Forcing detectors (`NISHIO_FORCING`, `DIGIT_FORCING_CHAIN`, `CELL_FORCING_CHAIN`, `UNIT_FORCING_CHAIN`, `FORCING_NET`) enforce branch-size (`maxBranchSize: 4`) or node-budget (`maxNodes: 2000`) limits.
- **3 Unimplemented Catalogue Entries** (`UNIMPLEMENTED_TECHS`: `TWINNED_XY_CHAIN`, `SK_LOOP`, `FORCING_CHAIN`) and **1 Solver Fallback** (`BRUTE_FORCE`):
  - Explicitly return `{ implemented: false, coverage: 'unimplemented', instances: [] }`.

### 6.3 Local Persistence & Privacy Model

All Pattern Lab features operate 100% locally in the browser with zero network calls:

| `localStorage` Key | Store / Module | Contents & Sanitization |
| --- | --- | --- |
| `sudokui-settings-v1` | `src/state/settings.ts` | Theme, display preferences, and `mastery` (`My Techniques` status map, `includeLearning`, `setupCompleted`, `activePreset`). Sanitized on load by `sanitizeMasterySettings`. |
| `sudokui-practice-v1` | `src/state/practiceStore.ts` | Local practice progress (`attempts`, `successes`, `hintsUsed` per technique), recent session history (capped at 50 entries), and `trackingEnabled`. Sanitized on load by `sanitizePracticePersistedState`. |
| `sudokui-game-v1` | `src/state/gameStore.ts` | Active board state, given/entered digits, candidate marks, exclusions, undo/redo history, and candidate contract. |
| `sudokui-stats-v1` | `src/state/stats.ts` | Local solve history, per-technique usage counts, and daily records. |
| `sudokui-pools-v12` | `src/state/pools.ts` | Pre-generated local puzzle pools for instant offline game and practice startup. |

> **Note on inherited upstream network modules:** Upstream `sudokUI` includes optional daily leaderboard stats (`src/state/dailyStats.ts`), opt-in play counting (`src/state/telemetry.ts`, disabled by default via `countPlays: false`), and user-submitted bug reports (`src/state/report.ts`). None of these are invoked by Pattern Scanner, My Techniques, Sudoku Exchange position import, or Practice Lab.

### 6.4 How to Add a New Technique to the Scanner

When implementing a new technique or promoting one of the 3 unimplemented catalogue entries:

1. **Engine Detector (`src/engine/techniques/<family>.ts`):**
   - Implement a generator `export function* iterNewTech(g: Grid): Generator<Step>` that yields every distinct valid `Step` on `g` without mutating `g`, plus `export function findNewTech(g: Grid): Step | null` returning `iterNewTech(g).next().value ?? null`.
2. **Catalogue & Solver Registration (`src/engine/ratings.ts`, `src/engine/humanSolver.ts`):**
   - Set `implemented: true` (and `enabled: true` if part of default `SOLVE_ORDER`) in `TECHS` in `src/engine/ratings.ts`, and wire `findNewTech` into `FINDERS` in `src/engine/humanSolver.ts`.
3. **Scanner Registration (`src/engine/scanner.ts`):**
   - Register `iterNewTech` in `SCAN_GEN_MAP`.
   - If the search is depth-, branch-, or template-bounded, add its bounds to `BOUNDED_TECH_BOUNDS` so `TECH_SCANNER_META` classifies it as `'bounded'`; otherwise it is automatically classified as `'exhaustive'`.
   - Add a canonical pattern key rule in `canonicalPatternKey(step)` if the technique has symmetric representations (e.g., bidirectional chains or interchangeable base sets).
4. **Concept Taxonomy & Learning Guide (`src/content/concepts.ts`, `src/content/techniqueGuides.ts`, `src/content/techniqueDocs.ts`):**
   - Ensure `TECHNIQUE_TAXONOMY[tech]`, `TECH_DOCS[tech]`, and `TECHNIQUE_GUIDES[tech]` (or family template) cover the technique's structural roles, affected candidates, look-alike pitfalls, and related techniques.
5. **Tests:**
   - Add synthetic multi-instance and soundness tests in `tests/scannerCoverage.test.ts` and `tests/phase6Validation.test.ts`, then run `npm.cmd test` and `npm.cmd run build`.

### 6.5 GPL-3.0 Licence Obligations

This project is a derivative work of [`AImenes/sudokUI`](https://github.com/AImenes/sudokUI), which is licensed under the **GNU General Public License v3.0 (GPL-3.0)** (see [`LICENSE`](../LICENSE)):

- **Local / Private Use:** Under GPL-3.0 §2, you may run, modify, and use this application privately on your own machine without restriction.
- **Redistribution Obligations:** If you distribute copies or modified versions of this application (or host it publicly as a downloadable web/mobile bundle), you must:
  1. Preserve all upstream copyright, attribution, and licence notices (`LICENSE`, `README.md`, and source headers).
  2. License the complete derived work under **GPL-3.0** (no proprietary sublicensing or additional restrictions).
  3. State clearly that you modified the software and provide the date/summary of changes (GPL-3.0 §5(a)).
  4. Make the complete Corresponding Source code (including build scripts) available to all recipients under GPL-3.0 (GPL-3.0 §6).
  5. Preserve the MIT licence notice in `src/content/lzString.ts` (copyright 2013 pieroxy).

