# Pattern Lab — Project Brief & Permanent Specification

## 1. Purpose and Core Goal

**Pattern Lab** is a personal Sudoku learning and pattern-discovery application built on top of the open-source [`AImenes/sudokUI`](https://github.com/AImenes/sudokUI) codebase.

- **Not a new solver from scratch:** We reuse and extend the existing `sudokUI` human-technique solving engine (`src/engine/`), candidate model (`src/state/gameStore.ts`), SVG board & chain/highlight renderer (`src/ui/Grid.tsx`, `src/ui/HintPanel.tsx`), and technique explanations (`src/content/`, `src/engine/hintFrames.ts`).
- **From next-move solver to all-instance position scanner:** Instead of only reporting the single next step in `SOLVE_ORDER` (or at most one step per technique as the current `findAllSteps` does), the engine is extended to find and display **every relevant pattern instance** present in the **current** Sudoku position simultaneously.
- **Personal pattern recognition over speed:** The goal is to sit with a difficult puzzle, explore the current position, and improve personal ability to spot and understand challenging Sudoku patterns—such as discovering that a single board currently contains two X-Wings, a Swordfish, three Skyscrapers, and an XY-Wing at the same time.
- **Not a route-optimiser or search-tree visualiser:** The application only needs to analyse the **current board state** accurately. It does not predict or branch through future solving paths.

---

## 2. Intended Product Pillars

Pattern Lab connects six features around the existing `sudokUI` workspace:

1. **Pattern Scanner**
   - Scans the current board position as it stands and reports **all** applicable instances of supported techniques.
   - Groups and filters results by technique, underlying logical family, affected candidate/elimination, or personal mastery status ("My Techniques").
   - Never mutates the board, candidates, or pencil marks during scanning.

2. **My Techniques (Personal Knowledge Settings)**
   - Explicit, user-controlled settings where the user marks each technique's personal familiarity status:
     - **Known (`known`):** Techniques the user already understands and wants included in normal scanning.
     - **Learning (`learning`):** Techniques the user is actively studying or practising.
     - **Unfamiliar (`unfamiliar`):** Techniques the user has not yet studied (hidden by default in normal scanning to prevent overwhelm, but optionally surfaced in Discovery / Learning modes).
   - **No automatic assumptions:** Asking about, viewing, or stumbling across a technique never silently marks it as `known`. Only explicit user action changes knowledge settings.

3. **Pattern Explorer**
   - Allows selecting any scanned pattern instance (and switching freely between multiple instances in the current position without losing context or closing the scanner).
   - Highlights participating cells, candidates, house bands (`units`), fins, and chain/link arrows (`links`) on the board.
   - Shows candidate eliminations and placements, supports the interactive step-by-step walk (`walkFrames`), and lets the user compare multiple patterns before deciding which deduction (if any) to apply.

4. **Learn**
   - Builds on the existing `Learn` modal (`src/ui/Learn.tsx`), `Intuition` guide (`src/content/intuition.ts`), `Kin` cross-references (`src/content/kin.ts`), and interactive examples (`src/content/examples.ts`).
   - Connects unfamiliar techniques to concepts and techniques the user already knows, distinguishing the **underlying logical deduction** (locked sets, almost-locked sets, alternating inference chains, uniqueness, contradiction/forcing propagation) from the historical label assigned to a specific shape.

5. **Practice**
   - Extends the existing practice system (`src/engine/generator.ts`, `src/state/pools.ts`, `src/content/practicePuzzles.ts`) so the user can practise recognising either:
     - A **single selected technique**, or
     - A **mixture of techniques** the user is currently studying (`learning` or a custom selection), without knowing in advance which specific technique from the mixture is on the board.

6. **Local Progress**
   - Persists personal knowledge settings ("My Techniques") and optional, relaxed practice/recognition history in local storage (`localStorage` via Zustand `persist`) on the user's PC.

---

## 3. Core Principles and Constraints

### 3.1 Non-Mutating, Current-Position Scanning
- Scanning is strictly read-only on the current board state (`Grid`).
- Finding a pattern must **never** automatically apply placements, strip candidates, or advance the puzzle.
- Respects the user's current candidate view via `contractGrid(cells, autoCandidates, markContract)` (`src/state/gameStore.ts`), while keeping `stepMatchesSolution(step, solution)` available as a soundness guard against corrupted manual pencil marks (with an explicit option to scan raw marks or canonical candidates).

### 3.2 Complete Instance Coverage & Overlapping Deductions
- **All instances per technique:** If a position contains three distinct X-Wings and four Skyscrapers, all three X-Wings and all four Skyscrapers must be reported—not just the first one encountered in loop iteration order.
- **No cross-technique suppression:** Different techniques that eliminate the same candidate(s) must **both** be reported. A Skyscraper, a 2-String Kite, and an Empty Rectangle that all eliminate `7` from `r4c6` are three distinct learning opportunities in the current position.
- **Explicit canonicalisation & bounded search:**
  - Symmetric or re-ordered traversal of the same logical structure (e.g., an AIC or X-Chain read forward vs. backward, or a continuous Nice Loop started at each of its $2k$ nodes) must be canonicalised so each distinct logical pattern is reported once rather than duplicated $2\times$ or $2k\times$.
  - Where advanced chain or forcing searches require a complexity cap (node length or expansion budget), the scanner must **explicitly document** what constitutes a distinct instance and surface metadata when a search cap is reached—**never** silently claim exhaustive coverage when results are truncated.

### 3.3 Underlying Logic vs. Terminology
- Many named Sudoku techniques overlap or represent special cases of a shared mechanism:
  - *Single-digit 4-node AICs:* `SKYSCRAPER`, `TWO_STRING_KITE`, `TURBOT_FISH`.
  - *Bent subsets / 2-ALS restricted common:* `XY_WING`, `XYZ_WING`, `WXYZ_WING`, `ALS_XZ`.
  - *Single-digit colouring vs. chains:* `SIMPLE_COLORS`, `MULTI_COLORS`, `X_CHAIN`, `X_CYCLES`.
  - *Contradiction / propagation:* `NISHIO_FORCING_CHAIN` (singles propagation to contradiction), `DIGIT_FORCING_CHAIN`, `CELL_FORCING_CHAIN`, `UNIT_FORCING_CHAIN`, `FORCING_NET` (singles + intersections propagation).
- The UI and explanations should help the user see **why** a deduction works (e.g., contradiction via forced singles vs. alternating strong/weak links) without forcing memorisation of every niche label, while remaining mathematically accurate about when two techniques are equivalent vs. when one is a strict special case of another.

### 3.4 Local-First Execution & Privacy
- **100% Local Runtime:** All solving, pattern scanning, highlighting, learning, mastery settings, and practice generation run locally in the browser/PC environment. No remote solver API, backend server, external AI call, or user account may be introduced.
- **Zero Data Transmission:** Boards, candidate notes, "My Techniques" settings, and practice history must never leave the device.
- **Audit of Upstream Networking (Verified from Source):**
  The inherited `sudokUI` codebase contains three small `/api/*` endpoints intended for the upstream hosted website (`sudokui.org`):
  1. `src/state/telemetry.ts`: Sends anonymous game start/completion/share beacons to `POST /api/t` when online, unless `settings.dontCount` ("Leave this device out of the counts") is `true`.
  2. `src/state/dailyStats.ts`: Fetches `GET /api/daily/:n/stats` on daily puzzle completion and posts solve time to `POST /api/daily/:n/result` only when the user clicks "Send my time and compare".
  3. `src/ui/ReportDialog.tsx` & `src/ui/report.ts`: Posts user-submitted feedback/bug reports to `POST /api/feedback`.
  - **Pattern Lab Policy:** All new Pattern Lab features make **zero** network requests. In addition, for local-first privacy, `dontCount` should default to `true` (or telemetry/daily network calls should be disabled/no-op in local mode) so the app never attempts background `/api/t` beacons.

### 3.5 Relaxed, Non-Competitive Experience
- Pattern Lab is a contemplative study tool, not a speed sport.
- Do **not** add countdown timers, recognition speed targets, leaderboards, streaks, or competitive rankings to Pattern Lab features.
- Keep the interface calm, legible, and focused on the board and the reasoning.

---

## 4. Verified Repository Baseline (Phase 0 & Phase 1 Audit)

### 4.1 Tech Stack & Build/Test Health
- **Framework:** React 18 + TypeScript 5.6 + Zustand 5 (with `persist` middleware) + Vite 5 (`vite-plugin-pwa`).
- **Zero runtime UI/solver dependencies** beyond `react`, `react-dom`, and `zustand`.
- **Licence:** GNU General Public License v3.0 (`LICENSE`), with `src/content/lzString.ts` under MIT.
- **Test Suite (`npm.cmd test` / `vitest run`):**
  - **63 test files passed (63/63), 1,066 tests passed (1,066/1,066)** (`0` failures).
  - Includes formal soundness verification (`tests/soundness.test.ts`, `tests/soundnessNoUniqueness.test.ts`, `tests/scanner.test.ts`) checking every step produced by the engine and all-instance scanner against an all-solutions bitmask oracle (`tests/solutionOracle.ts`).
- **Production Build (`npm.cmd run build`):**
  - Runs `tsc -b && vite build && vite-node scripts/build-learn.ts`.
  - Succeeds cleanly (`0` errors), producing the PWA bundle in `dist/` plus 267 static localized learn pages and 80 SVG diagrams.

### 4.2 Catalogue Audit (`src/engine/ratings.ts`, `src/engine/humanSolver.ts`, `src/engine/scanner.ts`)
The `TECHS` catalogue in `src/engine/ratings.ts` defines **80 keys** (79 human techniques across 13 human categories + `BRUTE_FORCE` in `'Last Resort'`):
- **76 human techniques have `implemented: true`** (`IMPLEMENTED_TECHS` in `src/engine/scanner.ts`, spanning 55 exhaustive and 21 bounded techniques):
  - **72 human techniques** have `implemented: true, enabled: true` and (together with `BRUTE_FORCE`) form the 73-entry `SOLVE_ORDER`.
  - **4 human techniques** have `implemented: true, enabled: false` (`DISABLED_IMPLEMENTED_TECHS`) because they are provably redundant in standard next-step solving, though their finders are fully implemented and wired in both `FINDERS` and `src/engine/scanner.ts`:
    1. `SQUIRMBAG` (5-fish, `iterBasicFish(g, 5)`)
    2. `WHALE` (6-fish, `iterBasicFish(g, 6)`)
    3. `LEVIATHAN` (7-fish, `iterBasicFish(g, 7)`)
    4. `DOUBLE_EXOCET` (`iterDoubleExocet(g)`)
- **3 human techniques have `implemented: false`** (`UNIMPLEMENTED_TECHS` — catalogued in `TECHS`, explicitly reported as `coverage: 'unimplemented'` by `src/engine/scanner.ts`):
  1. `TWINNED_XY_CHAIN` (Index 48)
  2. `SK_LOOP` (Index 71)
  3. `FORCING_CHAIN` (Index 76)
- **`AIC_GROUPED` vs `AIC_ALS` Separation:**
  - `FINDERS` in `src/engine/humanSolver.ts` preserves legacy solver behaviour for `findNextStep`/`ratePuzzle`, while `src/engine/scanner.ts` invokes `iterGroupedAic(g, 'grouped_only')` for `AIC_GROUPED` and `iterGroupedAic(g, 'als_only')` for `AIC_ALS` so both techniques are enumerated independently.
