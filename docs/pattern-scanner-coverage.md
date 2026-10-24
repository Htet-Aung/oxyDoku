# Pattern Scanner Coverage Matrix (`sudokUI` — Pattern Lab)

This developer-facing document records the exact pattern-enumeration status, search bounds, canonical deduplication rules, and test verification for every technique entry in [`src/engine/ratings.ts`](../src/engine/ratings.ts) (`TECHS`) and [`src/engine/scanner.ts`](../src/engine/scanner.ts) (`TECH_SCANNER_SPECS`).

---

## 1. Catalogue Summary (80 Total `Tech` Entries)

| Group | Count | Scanner Status | Notes |
| --- | ---: | --- | --- |
| **Implemented & Enabled in `SOLVE_ORDER`** | **72** | **Scannable by default** (`findAllPatternInstances(g)`) | 55 `exhaustive` + 17 `bounded` |
| **Implemented & Disabled in `SOLVE_ORDER` by Default** | **4** | **Scannable on demand** (`includeDisabled: true` or explicit `techniques: [...]`) | `SQUIRMBAG` (`exhaustive`), `WHALE` (`exhaustive`), `LEVIATHAN` (`exhaustive`), `DOUBLE_EXOCET` (`bounded`) |
| **Total Implemented Human Techniques** | **76** | **Scannable** (`getScannableTechniques({ includeDisabled: true })`) | 58 `exhaustive` + 18 `bounded` |
| **Solver-Only Fallback (`BRUTE_FORCE`)** | **1** | **Excluded from human pattern scanning** (`coverage: 'unimplemented'`) | Used only by `ratePuzzle()` when human techniques stall |
| **Unimplemented Catalogue-Only Entries** | **3** | **Not implemented** (`implemented: false`, `coverage: 'unimplemented'`) | `TWINNED_XY_CHAIN`, `SK_LOOP`, `FORCING_CHAIN` |

> **Honesty invariant:** Catalogue-only entries (`TWINNED_XY_CHAIN`, `SK_LOOP`, `FORCING_CHAIN`) and `BRUTE_FORCE` have `implemented: false` (or `coverage: 'unimplemented'`) in `TECH_SCANNER_SPECS` and are never claimed as supported human pattern detectors.

---

## 2. Coverage & Deduplication Architecture

### 2.1 Strictly Non-Mutating Snapshot Analysis
- `findAllPatternInstances(g, options)` and `findPatternInstancesForTech(tech, g, options)` in [`src/engine/scanner.ts`](../src/engine/scanner.ts) operate on a single consistent snapshot of `g: Grid` (`values`, `cands`, `given`).
- Neither the scanner nor any `iter*` generator applies placements or eliminations to `g` during scanning.
- Even contradiction/propagation finders (`forcing.ts`) clone `g` internally (`cloneGrid(g)`) for each trial branch and never mutate the caller's `Grid`.

### 2.2 Overlapping Explanations vs. Redundant Representations
Pattern Lab distinguishes two cases that must never be conflated:

1. **Distinct patterns with overlapping conclusions (PRESERVED):**
   - Two different techniques (e.g., `LOCKED_CANDIDATES_1` and `X_WING`, or `SKYSCRAPER` and `X_CHAIN`) eliminating the same candidate `(cell, digit)` are **both preserved** in `ScanResult.instances`.
   - Two structurally distinct instances of the **same** technique (e.g., two different `XY_WING` pivots/pincers, two different `W_WING` strong links, two different `UNIQUENESS_1` rectangles, two different `ALS_XZ` set pairs, or two `CELL_FORCING_CHAIN` deductions originating from different cells) that eliminate the same candidate are **both preserved** because their `patternInstanceKey(step)` includes the participating pattern structure (`primary`, `secondary`, `fins`, `units`, or chain endpoints) in addition to `conclusionSignature(step)`.
   - `ScanResult.byConclusion` indexes all matching `Step[]` by each individual placement (`P:<cell>:<digit>`) and elimination (`E:<cell>:<digit>`), allowing the explorer to show every independent reason for a given candidate elimination.

2. **Symmetrically or combinatorially equivalent proofs of the same pattern (DEDUPLICATED):**
   - **Subsets / Fish / UR / SDC:** Canonical ascending cell/unit/digit combinations (`c1 < c2 < ...`) ensure each set is visited once; `patternInstanceKey` canonicalizes `primary`, `secondary`, `fins`, and `units`.
   - **Irreducibility filters:**
     - `NAKED_TRIPLE`, `NAKED_QUADRUPLE`, `LOCKED_TRIPLE`, `HIDDEN_TRIPLE`, `HIDDEN_QUADRUPLE`: `isIrreducibleNakedSubset` / `isIrreducibleHiddenSubset` in [`src/engine/techniques/subsets.ts`](../src/engine/techniques/subsets.ts) reject composite subsets that contain a smaller proper naked/hidden subset.
     - `SWORDFISH`, `JELLYFISH`, `SQUIRMBAG`, `WHALE`, `LEVIATHAN` and Finned/Sashimi/Franken variants: `isIrreducibleBasicFish`, `isIrreducibleFinnedFish`, and `isIrreducibleFrankenFish` reject degenerate fish containing a smaller base/cover fish.
     - `UNIQUENESS_3`: `iterUniqueness3` in [`src/engine/techniques/uniqueness.ts`](../src/engine/techniques/uniqueness.ts) rejects reducible helper sets `S` that contain a standalone naked subset or a smaller proper subset `S' ⊂ S` that already locks with the roof pseudo-cell.
   - **Open Chains (`X_CHAIN`, `XY_CHAIN`, `AIC`, `AIC_GROUPED`, `AIC_ALS`):**
     - Reversing a chain `A -> ... -> B` into `B -> ... -> A` or routing through alternative intermediate weak/strong hops between the same unordered endpoint pair `{A, B}` with the same elimination set is canonicalized via `${tech}|chain|${min(A,B)}<->${max(A,B)}|${conclusionSignature}`.
     - Because BFS explores shortest paths first, the shortest representative chain for each `(unordered endpoint pair, conclusion set)` is emitted.
   - **Closed Loops (`X_CYCLES`, `GROUPED_X_CYCLES`, `NICE_LOOP`, `GROUPED_NICE_LOOP`):**
     - **Continuous loops (Rule 1):** Canonicalized by the sorted set of loop candidate nodes + conclusion set (`${tech}|loop1|${canonicalCds(step.primary)}|${conc}`), collapsing cyclic rotations (`2 * L` starting nodes/directions).
     - **Discontinuous loops (Rule 2 / Rule 3):** Canonicalized by the focal start node (`links[0].from`) + conclusion (`${tech}|loop2|${startSig}|${conc}`).
   - **Coloring (`SIMPLE_COLORS`, `MULTI_COLORS`, `MEDUSA_3D`):**
     - Swapping parity colours (Blue `0` vs Gold `1`) is canonicalized by sorting the two colour sets (`min(c0, c1)~max(c0, c1)`).
   - **Forcing Chains & Nets (`DIGIT_FORCING_CHAIN`, `NISHIO_FORCING_CHAIN`, `CELL_FORCING_CHAIN`, `UNIT_FORCING_CHAIN`, `FORCING_NET`):**
     - Each forcing step is keyed by its hypothesis origin (`primary`: the assumed candidate `(cell, d)`, the source cell's candidates, or the source unit's spots for `d`) + its full fixpoint conclusion set.

### 2.3 Honest Truncation Reporting
Whenever a bounded search hits its internal node expansion budget, ALS collection cap, template enumeration cap, or caller-supplied `maxInstancesPerTech` / `maxTotalInstances`, the scanner sets:
- `TechScanResult.truncated = true` and `TechScanResult.truncationReason` (`'instance-cap' | 'search-budget' | 'als-cap' | 'template-overflow'`)
- `ScanResult.truncated = true` and includes the technique in `ScanResult.truncatedTechniques: Tech[]`.

---

## 3. Complete Per-Technique Coverage Matrix

### 3.1 Basic Techniques (Singles, Intersections, Subsets) — 13 Implemented (`exhaustive`)

| `Tech` ID | Index | Level | Category | Module & Generator / Finder | Enabled by Default | Coverage Mode | Enumeration & Deduplication Behaviour | Verification Tests |
| --- | ---: | --- | --- | --- | :---: | :---: | --- | --- |
| `FULL_HOUSE` | 100 | Easy | Singles | `singles.ts`: `iterFullHouse` / `findFullHouse` | Yes | `exhaustive` | Scans all 27 units (`0..26`); deduplicates cells that are simultaneously the sole empty cell in multiple units via `seenCells`. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `NAKED_SINGLE` | 200 | Easy | Singles | `singles.ts`: `iterNakedSingle` / `findNakedSingle` | Yes | `exhaustive` | Scans all 81 cells (`0..80`) with `popcount(cands[c]) === 1`. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `HIDDEN_SINGLE` | 300 | Easy | Singles | `singles.ts`: `iterHiddenSingle` / `findHiddenSingle` | Yes | `exhaustive` | Scans all 27 units (boxes `18..26`, rows `0..8`, cols `9..17`) and digits `1..9`; deduplicates by `cell * 10 + d`. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `LOCKED_PAIR` | 1000 | Medium | Intersections | `subsets.ts`: `iterNakedSubset(g, 2, true)` / `findNakedSubset` | Yes | `exhaustive` | Scans all 27 units for 2-cell subsets confined to a box+line intersection; deduplicated by sorted cell tuple + eliminations via `patternInstanceKey`. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `LOCKED_TRIPLE` | 1100 | Medium | Intersections | `subsets.ts`: `iterNakedSubset(g, 3, true)` / `findNakedSubset` | Yes | `exhaustive` | Scans all 27 units for irreducible 3-cell subsets (`isIrreducibleNakedSubset`) in a box+line intersection. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `LOCKED_CANDIDATES_1` | 1200 | Medium | Intersections | `intersections.ts`: `iterLockedCandidates1` / `findLockedCandidates1` | Yes | `exhaustive` | Pointing: scans all 9 boxes × 9 digits for box candidates confined to one row or column that eliminate outside the box. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `LOCKED_CANDIDATES_2` | 1210 | Medium | Intersections | `intersections.ts`: `iterLockedCandidates2` / `findLockedCandidates2` | Yes | `exhaustive` | Claiming: scans all 18 lines (`0..17`) × 9 digits for line candidates confined to one box that eliminate outside the line. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `NAKED_PAIR` | 1300 | Medium | Subsets | `subsets.ts`: `iterNakedSubset(g, 2, false)` / `findNakedSubset` | Yes | `exhaustive` | Scans all 27 units for non-locked 2-cell naked subsets; deduplicates across shared units if identical cell+elim set occurs. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `NAKED_TRIPLE` | 1400 | Medium | Subsets | `subsets.ts`: `iterNakedSubset(g, 3, false)` / `findNakedSubset` | Yes | `exhaustive` | Scans all 27 units for irreducible 3-cell naked subsets (`isIrreducibleNakedSubset`). | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `HIDDEN_PAIR` | 1500 | Medium | Subsets | `subsets.ts`: `iterHiddenSubset(g, 2)` / `findHiddenSubset` | Yes | `exhaustive` | Scans all 27 units for 2-digit hidden subsets. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `HIDDEN_TRIPLE` | 1600 | Medium | Subsets | `subsets.ts`: `iterHiddenSubset(g, 3)` / `findHiddenSubset` | Yes | `exhaustive` | Scans all 27 units for irreducible 3-digit hidden subsets (`isIrreducibleHiddenSubset`). | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `NAKED_QUADRUPLE` | 2000 | Hard | Subsets | `subsets.ts`: `iterNakedSubset(g, 4, false)` / `findNakedSubset` | Yes | `exhaustive` | Scans all 27 units for irreducible 4-cell naked subsets (`isIrreducibleNakedSubset`). | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `HIDDEN_QUADRUPLE` | 2100 | Hard | Subsets | `subsets.ts`: `iterHiddenSubset(g, 4)` / `findHiddenSubset` | Yes | `exhaustive` | Scans all 27 units for irreducible 4-digit hidden subsets (`isIrreducibleHiddenSubset`). | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |

---

### 3.2 Fish Patterns (Basic, Finned, Sashimi, Franken) — 14 Implemented (`exhaustive`)

| `Tech` ID | Index | Level | Category | Module & Generator / Finder | Enabled by Default | Coverage Mode | Enumeration & Deduplication Behaviour | Verification Tests |
| --- | ---: | --- | --- | --- | :---: | :---: | --- | --- |
| `X_WING` | 2200 | Hard | Basic Fish | `fish.ts`: `iterBasicFish(g, 2)` / `findBasicFish` | Yes | `exhaustive` | Both orientations (`rows = true, false`), all digits `1..9`, all `C(9, 2)` base combinations. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `SWORDFISH` | 2300 | Hard | Basic Fish | `fish.ts`: `iterBasicFish(g, 3)` / `findBasicFish` | Yes | `exhaustive` | Both orientations (`rows = true, false`), all digits `1..9`, irreducible (`isIrreducibleBasicFish` rejects embedded X-Wings). | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `JELLYFISH` | 2400 | Hard | Basic Fish | `fish.ts`: `iterBasicFish(g, 4)` / `findBasicFish` | Yes | `exhaustive` | Both orientations (`rows = true, false`), all digits `1..9`, irreducible (`isIrreducibleBasicFish`). | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `SQUIRMBAG` | 2500 | Unfair | Basic Fish | `fish.ts`: `iterBasicFish(g, 5)` / `findBasicFish` | **No** (`includeDisabled`) | `exhaustive` | Size-5 basic fish; both orientations, all digits `1..9`, irreducible (`isIrreducibleBasicFish`). | `tests/fish.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts` |
| `WHALE` | 2600 | Unfair | Basic Fish | `fish.ts`: `iterBasicFish(g, 6)` / `findBasicFish` | **No** (`includeDisabled`) | `exhaustive` | Size-6 basic fish; both orientations, all digits `1..9`, irreducible (`isIrreducibleBasicFish`). | `tests/fish.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts` |
| `LEVIATHAN` | 2700 | Unfair | Basic Fish | `fish.ts`: `iterBasicFish(g, 7)` / `findBasicFish` | **No** (`includeDisabled`) | `exhaustive` | Size-7 basic fish; both orientations, all digits `1..9`, irreducible (`isIrreducibleBasicFish`). | `tests/fish.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts` |
| `FINNED_X_WING` | 4100 | Hard | Finned Fish | `fish.ts`: `iterFinnedFish(g, 2, false)` / `findFinnedFish` | Yes | `exhaustive` | Both orientations (`rows = true, false`), all digits `1..9`, non-sashimi (`every base line has >= 2 cover-column cells`). | `tests/techniques.test.ts`, `tests/fish.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `SASHIMI_X_WING` | 4200 | Hard | Finned Fish | `fish.ts`: `iterFinnedFish(g, 2, true)` / `findFinnedFish` | Yes | `exhaustive` | Both orientations (`rows = true, false`), all digits `1..9`, sashimi (`at least one base line has only 1 cover-column cell`). | `tests/techniques.test.ts`, `tests/fish.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `FINNED_SWORDFISH` | 4300 | Unfair | Finned Fish | `fish.ts`: `iterFinnedFish(g, 3, false)` / `findFinnedFish` | Yes | `exhaustive` | Both orientations, all digits `1..9`, irreducible (`isIrreducibleFinnedFish`), non-sashimi. | `tests/techniques.test.ts`, `tests/fish.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `SASHIMI_SWORDFISH` | 4400 | Unfair | Finned Fish | `fish.ts`: `iterFinnedFish(g, 3, true)` / `findFinnedFish` | Yes | `exhaustive` | Both orientations, all digits `1..9`, irreducible (`isIrreducibleFinnedFish`), sashimi. | `tests/techniques.test.ts`, `tests/fish.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `FINNED_JELLYFISH` | 4500 | Unfair | Finned Fish | `fish.ts`: `iterFinnedFish(g, 4, false)` / `findFinnedFish` | Yes | `exhaustive` | Both orientations, all digits `1..9`, irreducible (`isIrreducibleFinnedFish`), non-sashimi. | `tests/techniques.test.ts`, `tests/fish.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `SASHIMI_JELLYFISH` | 4600 | Unfair | Finned Fish | `fish.ts`: `iterFinnedFish(g, 4, true)` / `findFinnedFish` | Yes | `exhaustive` | Both orientations, all digits `1..9`, irreducible (`isIrreducibleFinnedFish`), sashimi. | `tests/techniques.test.ts`, `tests/fish.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `FRANKEN_X_WING` | 6100 | Unfair | Complex Fish | `complexFish.ts`: `iterFrankenFish(g, 2)` / `findFrankenFish` | Yes | `exhaustive` | Digits `1..9`, both `rowsAsBase` orientations, 2-unit base/cover combinations where at least one unit is a box (`u >= 18`). | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `FRANKEN_SWORDFISH` | 6200 | Unfair | Complex Fish | `complexFish.ts`: `iterFrankenFish(g, 3)` / `findFrankenFish` | Yes | `exhaustive` | Digits `1..9`, both `rowsAsBase` orientations, irreducible 3-unit Franken combinations (`isIrreducibleFrankenFish`). | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |

---

### 3.3 Single-Digit Patterns — 4 Implemented (`exhaustive`)

| `Tech` ID | Index | Level | Category | Module & Generator / Finder | Enabled by Default | Coverage Mode | Enumeration & Deduplication Behaviour | Verification Tests |
| --- | ---: | --- | --- | --- | :---: | :---: | --- | --- |
| `SKYSCRAPER` | 3000 | Hard | Single Digit Patterns | `singleDigit.ts`: `iterTurbotFamily(g, 'SKYSCRAPER')` / `findTurbotFamily` | Yes | `exhaustive` | Scans digits `1..9` and all parallel line conjugate pairs (both rows and columns) connected by a weak link; canonicalized by unordered 4-cell set + eliminations. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `TWO_STRING_KITE` | 3100 | Hard | Single Digit Patterns | `singleDigit.ts`: `iterTurbotFamily(g, 'TWO_STRING_KITE')` / `findTurbotFamily` | Yes | `exhaustive` | Scans digits `1..9` and all row+column conjugate pairs whose inner ends share a box. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `TURBOT_FISH` | 3120 | Hard | Single Digit Patterns | `singleDigit.ts`: `iterTurbotFamily(g, 'TURBOT_FISH')` / `findTurbotFamily` | Yes | `exhaustive` | Scans digits `1..9` and all remaining two-strong-link pairs connected by a weak link (box+line or box+box). | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `EMPTY_RECTANGLE` | 3170 | Hard | Single Digit Patterns | `singleDigit.ts`: `iterEmptyRectangle` / `findEmptyRectangle` | Yes | `exhaustive` | Scans digits `1..9`, all 9 boxes, all valid ER cross intersections `(erRow, erCol)`, and all perpendicular conjugate pairs. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |

---

### 3.4 Wings — 4 Implemented (3 `exhaustive`, 1 `bounded`)

| `Tech` ID | Index | Level | Category | Module & Generator / Finder | Enabled by Default | Coverage Mode | Enumeration & Deduplication Behaviour | Verification Tests |
| --- | ---: | --- | --- | --- | :---: | :---: | --- | --- |
| `W_WING` | 3200 | Hard | Wings | `wings.ts`: `iterWWing` / `findWWing` | Yes | `exhaustive` | Scans all identical bivalue cell pairs `(c1 < c2)` and all strong links on either digit in all 27 units; preserves distinct strong-link bridges via `secondary` in `patternInstanceKey`. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `XY_WING` | 3300 | Hard | Wings | `wings.ts`: `iterXYWing` / `findXYWing` | Yes | `exhaustive` | Scans all bivalue pivots `p` and all valid pincer pairs `(w1, w2)` carrying `(x, z)` and `(y, z)`. Preserves distinct pivots/pincers even when they eliminate the same candidate. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `XYZ_WING` | 3400 | Hard | Wings | `wings.ts`: `iterXYZWing` / `findXYZWing` | Yes | `exhaustive` | Scans all trivalue pivots `p` and unordered bivalue pincer pairs `(w1 < w2)` subset of `cands[p]`. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `WXYZ_WING` | 3450 | Hard | Wings | `als.ts`: `iterWxyzWing` / `findWxyzWing` | Yes | `bounded` (`maxAls = 600`) | 4-cell/4-candidate ALS-XZ special case (1-cell bivalue + 3-cell ALS); deduplicates by 4-cell ALS union + conclusion. Reports `als-cap` if `collectAls` hits 600. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |

---

### 3.5 Uniqueness — 11 Implemented (`exhaustive`)

| `Tech` ID | Index | Level | Category | Module & Generator / Finder | Enabled by Default | Coverage Mode | Enumeration & Deduplication Behaviour | Verification Tests |
| --- | ---: | --- | --- | --- | :---: | :---: | --- | --- |
| `BUG_PLUS_1` | 2900 | Hard | Uniqueness | `uniqueness.ts`: `iterBugPlus1` / `findBugPlus1` | Yes | `exhaustive` | Checks if exactly one unsolved cell is trivalue and all others are bivalue; yields the candidate occurring 3 times in its row, col, and box. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `UNIQUENESS_1` | 3500 | Hard | Uniqueness | `uniqueness.ts`: `iterUniqueness(g, 1)` / `findUniqueness` | Yes | `exhaustive` | Enumerates all 2-box rectangles and digit pairs `{x, y}` where 3 corners are exact `{x, y}`. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `UNIQUENESS_2` | 3600 | Hard | Uniqueness | `uniqueness.ts`: `iterUniqueness(g, 2)` / `findUniqueness` | Yes | `exhaustive` | Enumerates all 2-box rectangles where 2 roof corners share a single extra candidate `z`. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `UNIQUENESS_3` | 3700 | Hard | Uniqueness | `uniqueness.ts`: `iterUniqueness(g, 3)` / `findUniqueness` | Yes | `exhaustive` | Enumerates all 2-box rectangles and irreducible helper subsets `S` (`k = 1, 2, 3`) in shared roof units. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `UNIQUENESS_4` | 3800 | Hard | Uniqueness | `uniqueness.ts`: `iterUniqueness(g, 4)` / `findUniqueness` | Yes | `exhaustive` | Enumerates all 2-box rectangles where one UR digit is confined to the two roof cells in a shared unit. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `UNIQUENESS_5` | 3900 | Hard | Uniqueness | `uniqueness.ts`: `iterUniqueness(g, 5)` / `findUniqueness` | Yes | `exhaustive` | Enumerates all 2-box rectangles where 3 corners carry the same single extra digit `z`. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `UNIQUENESS_6` | 4000 | Hard | Uniqueness | `uniqueness.ts`: `iterUniqueness(g, 6)` / `findUniqueness` | Yes | `exhaustive` | Enumerates all diagonal 2-box rectangles where one UR digit is confined to the rectangle in both rows or both columns. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `HIDDEN_RECTANGLE` | 4010 | Hard | Uniqueness | `uniqueness.ts`: `iterHiddenRectangle` / `findHiddenRectangle` | Yes | `exhaustive` | Enumerates all 2-box rectangles and diagonal corner pairs `(A, B)` where `A` is bivalue `{x, y}` and `strong` is confined in `B`'s row and col. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `AVOIDABLE_RECTANGLE_1` | 4020 | Hard | Uniqueness | `uniqueness.ts`: `iterAvoidableRectangle(g, 1)` / `findAvoidableRectangle` | Yes | `exhaustive` | Enumerates all 2-box rectangles with 3 solved non-given cells (`!g.given[c]`) and 1 unsolved corner. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `AVOIDABLE_RECTANGLE_2` | 4030 | Hard | Uniqueness | `uniqueness.ts`: `iterAvoidableRectangle(g, 2)` / `findAvoidableRectangle` | Yes | `exhaustive` | Enumerates all 2-box rectangles with 2 adjacent solved non-given cells and 2 unsolved roof corners sharing extra candidate `cDigit`. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `EXTENDED_RECTANGLE` | 4040 | Hard | Uniqueness | `extendedRectangle.ts`: `iterExtendedRectangle` / `findExtendedRectangle` | Yes | `exhaustive` | Enumerates all 6-cell 3-box chute formations in both orientations (`columns = true, false`) for Type 1 and Type 2 eliminations. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |

---

### 3.6 Coloring — 3 Implemented (`exhaustive`)

| `Tech` ID | Index | Level | Category | Module & Generator / Finder | Enabled by Default | Coverage Mode | Enumeration & Deduplication Behaviour | Verification Tests |
| --- | ---: | --- | --- | --- | :---: | :---: | --- | --- |
| `SIMPLE_COLORS` | 5330 | Hard | Coloring | `coloring.ts`: `iterSimpleColors` / `findSimpleColors` | Yes | `exhaustive` | Builds all conjugate-pair clusters (`size >= 3`) for digits `1..9`; yields both Color Wrap and Color Trap steps per cluster. | `tests/techniques.test.ts`, `tests/coloring.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `MULTI_COLORS` | 5360 | Hard | Coloring | `coloring.ts`: `iterMultiColors` / `findMultiColors` | Yes | `exhaustive` | Evaluates all cluster pairs `(c1, c2)` and colour parities `(colA, colB)` for Rule 1 and Rule 2; canonicalized across cluster order and colour parity swap. | `tests/techniques.test.ts`, `tests/coloring.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `MEDUSA_3D` | 5370 | Unfair | Coloring | `medusa.ts`: `iterMedusa3d` / `findMedusa3d` | Yes | `exhaustive` | Builds all 3D conjugate+bivalue clusters (`nodes >= 4`); evaluates all 6 Medusa rules (Rules 1, 2, 3, 4/5, 6) per cluster. | `tests/techniques.test.ts`, `tests/coloring.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |

---

### 3.7 Chains and Loops — 11 Implemented (2 `exhaustive`, 9 `bounded`) + 1 Unimplemented

| `Tech` ID | Index | Level | Category | Module & Generator / Finder | Enabled by Default | Coverage Mode | Bounds & Canonical Deduplication Behaviour | Verification Tests |
| --- | ---: | --- | --- | --- | :---: | :---: | --- | --- |
| `REMOTE_PAIR` | 2800 | Hard | Chains and Loops | `chains.ts`: `iterRemotePair` / `findRemotePair` | Yes | `exhaustive` | Partition identical bivalue cells into bipartite connected components (`size >= 4`); yields one step per component with eliminations. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `CHUTE_REMOTE_PAIR` | 2850 | Hard | Chains and Loops | `chuteRemotePair.ts`: `iterChuteRemotePair` / `findChuteRemotePair` | Yes | `exhaustive` | Evaluates all non-seeing identical bivalue pairs `(c1 < c2)` in the same band or stack (`horizontal = true, false`). | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `X_CHAIN` | 5400 | Unfair | Chains and Loops | `chains.ts`: `iterXChain` / `findXChain` | Yes | `bounded` (`maxLength = 9`) | BFS over `(cell, parity)` for digits `1..9`; deduplicated by `(digit, unordered endpoint pair, eliminations)`. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `X_CYCLES` | 5450 | Unfair | Chains and Loops | `xCycles.ts`: `iterXCycles` / `findXCycles` | Yes | `bounded` (`maxLength = 12`, `nodeBudget = 30000` / digit) | DFS per digit; Rule 1 continuous loops deduplicated by `(sorted loop cells, eliminations)`; Rule 2 discontinuous loops deduplicated by `(start cell, placement)`. Reports `search-budget` if budget hit. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `GROUPED_X_CYCLES` | 5460 | Unfair | Chains and Loops | `groupedXCycles.ts`: `iterGroupedXCycles(g, 10, true)` / `findGroupedXCycles` | Yes | `bounded` (`maxLength = 10`, `nodeBudget = 25000` / digit) | Scanner sets `requireGroup = true` so plain ungrouped X-Cycles are not duplicated; supports Rule 1, Rule 2, and Rule 3. Reports `search-budget` if budget hit. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `XY_CHAIN` | 5500 | Unfair | Chains and Loops | `chains.ts`: `iterXYChain` / `findXYChain` | Yes | `bounded` (`maxLength = 10`) | BFS over bivalue cells; deduplicated by `(target digit z, unordered endpoint pair, eliminations)`. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `TWINNED_XY_CHAIN` | 5550 | Unfair | Chains and Loops | *None* (`implemented: false`) | **No** | `unimplemented` | Catalogue-only placeholder from HoDoKu; returns 0 instances and is excluded from `getScannableTechniques()`. | `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts` |
| `NICE_LOOP` | 5600 | Unfair | Chains and Loops | `aic.ts`: `iterNiceLoop` / `findNiceLoop` | Yes | `bounded` (`maxLength = 12`, `nodeBudget = 60000`) | Multi-digit closed AIC loops; Rule 1 deduplicated by `(sorted candidate nodes, eliminations)`, Rule 2 by `(start node, placement)`. Reports `search-budget` if budget hit. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `GROUPED_NICE_LOOP` | 5650 | Unfair | Chains and Loops | `groupedAic.ts`: `iterGroupedNiceLoop` / `findGroupedNiceLoop` | Yes | `bounded` (`maxLength = 10`, `nodeBudget = 40000`) | Multi-digit closed loops requiring at least one group node; Rule 1 and Rule 2 supported. Reports `search-budget` if budget hit. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `AIC` | 5950 | Unfair | Chains and Loops | `aic.ts`: `iterAic` / `findAic` | Yes | `bounded` (`maxLength = 12`, `nodeBudget = 60000`) | Multi-digit alternating inference chains; deduplicated by `(unordered start/end candidate nodes, eliminations)`. Reports `search-budget` if budget hit. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `AIC_GROUPED` | 5960 | Unfair | Chains and Loops | `groupedAic.ts`: `iterGroupedAic(g, 10, 'grouped')` / `findGroupedAic` | Yes | `bounded` (`maxLength = 10`, `nodeBudget = 40000`) | Filtered to chains containing at least one group node and no ALS nodes (`filter = 'grouped'`); deduplicated by `(unordered endpoint nodes, eliminations)`. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `AIC_ALS` | 5970 | Unfair | Chains and Loops | `groupedAic.ts`: `iterGroupedAic(g, 10, 'als')` / `findGroupedAic` | Yes | `bounded` (`maxLength = 10`, `nodeBudget = 40000`, `maxAls = 90`) | Filtered to chains containing at least one ALS node (`filter = 'als'`), cleanly separated from `AIC_GROUPED`. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |

---

### 3.8 Almost Locked Sets (ALS) — 4 Implemented (`bounded`)

| `Tech` ID | Index | Level | Category | Module & Generator / Finder | Enabled by Default | Coverage Mode | Bounds & Canonical Deduplication Behaviour | Verification Tests |
| --- | ---: | --- | --- | --- | :---: | :---: | --- | --- |
| `ALS_XZ` | 5700 | Unfair | Almost Locked Sets | `als.ts`: `iterAlsXz` / `findAlsXz` | Yes | `bounded` (`maxAls = 600`) | Enumerates all disjoint ALS pairs `(i < j)` (`size 1..4`) with restricted common `x` and elimination digit `z`; deduplicated by `(ALS pair cells, z, eliminations)`. Reports `als-cap` if `collectAls` hits 600. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `ALS_XY_WING` | 5800 | Unfair | Almost Locked Sets | `als.ts`: `iterAlsXyWing` / `findAlsXyWing` | Yes | `bounded` (`maxAls = 400`) | Enumerates all hinge ALSs `C` and wing ALSs `(A, B)` linked by distinct restricted commons `x != y`; deduplicated by `(hinge, unordered wing pair, z, eliminations)`. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `ALS_XY_CHAIN` | 5900 | Unfair | Almost Locked Sets | `als.ts`: `iterAlsXyChain` / `findAlsXyChain` | Yes | `bounded` (`maxAls = 300`, `nodeBudget = 20000`) | Enumerates 4-ALS chains `A-B-C-D`; canonicalized under chain reversal (`A,B,C,D` vs `D,C,B,A`). Reports `als-cap` or `search-budget` if hit. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `DEATH_BLOSSOM` | 6000 | Unfair | Almost Locked Sets | `als.ts`: `iterDeathBlossom` / `findDeathBlossom` | Yes | `bounded` (`maxAls = 600`, `maxBranchSize = 16` petals/digit) | Enumerates 2–3 candidate stem cells and non-overlapping petal ALSs; deduplicated by `(stem, petals, z, eliminations)`. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |

---

### 3.9 Miscellaneous — 4 Implemented (2 `exhaustive`, 2 `bounded`) + 1 Unimplemented

| `Tech` ID | Index | Level | Category | Module & Generator / Finder | Enabled by Default | Coverage Mode | Bounds & Canonical Deduplication Behaviour | Verification Tests |
| --- | ---: | --- | --- | --- | :---: | :---: | --- | --- |
| `SUE_DE_COQ` | 5300 | Unfair | Miscellaneous | `sueDeCoq.ts`: `iterSueDeCoq` / `findSueDeCoq` | Yes | `exhaustive` | Scans all 18 lines × 3 boxes × 2–3 cell intersections `C` × line bivalue `D` × box bivalue `E`. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `FIREWORKS` | 6300 | Extreme | Miscellaneous | `fireworks.ts`: `iterFireworks` / `findFireworks` | Yes | `exhaustive` | Scans all 9 boxes, cross cells `A`, row wings `B`, and col wings `C` where 3 digits fire on `{A, B, C}`. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `TRIDAGON` | 6310 | Extreme | Miscellaneous | `tridagon.ts`: `iterTridagon` / `findTridagon` | Yes | `bounded` (`maxBranchSize = 12` triples/box, `nodeBudget = 300` / guardian) | Enumerates candidate trios `T`, 2×2 box rectangles, guardians, and 12-cell formations proven unsatisfiable by exhaustive local assignment (`!trioSatisfiable(cells)`). | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `SK_LOOP` | 6320 | Extreme | Miscellaneous | *None* (`implemented: false`) | **No** | `unimplemented` | Catalogue-only placeholder; returns 0 instances and is excluded from `getScannableTechniques()`. | `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts` |
| `ALIGNED_PAIR_EXCLUSION` | 6330 | Unfair | Miscellaneous | `ape.ts`: `iterAlignedPairExclusion` / `findAlignedPairExclusion` | Yes | `bounded` (`maxAls = 400`) | Scans all seeing cell pairs `(a < b)` and shared visible ALSs (`collectAls(g, 4, 400)`). Reports `als-cap` if ALS cap hit. | `tests/techniques.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |

---

### 3.10 Last Resort (Exocet, Templates, Forcing, Brute Force) — 8 Implemented (`bounded` / `exhaustive`) + 2 Non-Scanner Entries

| `Tech` ID | Index | Level | Category | Module & Generator / Finder | Enabled by Default | Coverage Mode | Bounds & Canonical Deduplication Behaviour | Verification Tests |
| --- | ---: | --- | --- | --- | :---: | :---: | --- | --- |
| `EXOCET` | 8300 | Extreme | Last Resort | `exocet.ts`: `iterExocet` / `findExocet` | Yes | `bounded` (`maxTemplates = 20000` / digit) | Enumerates both orientations (`rows = true, false`), bands, base pairs `(B1 < B2)`, and target pairs `(T1 < T2)` proven by complete digit template enumeration. Reports `template-overflow` if > 20,000 templates. | `tests/techniques.test.ts`, `tests/exocet.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `DOUBLE_EXOCET` | 8310 | Extreme | Last Resort | `exocet.ts`: `iterDoubleExocet` / `findDoubleExocet` | **No** (`includeDisabled`) | `bounded` (`maxTemplates = 20000` / digit) | Pairs two proven exocets on the same line sharing the same 4-digit base set `S`. Reports `template-overflow` if > 20,000 templates. | `tests/exocet.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts` |
| `PATTERN_OVERLAY` | 8320 | Extreme | Last Resort | `templates.ts`: `iterPatternOverlay` / `findPatternOverlay` | Yes | `bounded` (`maxTemplates = 20000` / digit) | Enumerates all valid 9-cell templates per digit `1..9`; yields one step per digit with cells present in all templates (placements) or no templates (eliminations). Reports `template-overflow` if > 20,000 templates. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `FORCING_CHAIN` | 8500 | Extreme | Last Resort | *None* (`implemented: false`) | **No** | `unimplemented` | Catalogue-only umbrella entry (specific forcing techniques are implemented separately as `DIGIT_FORCING_CHAIN`, `NISHIO_FORCING_CHAIN`, `CELL_FORCING_CHAIN`, `UNIT_FORCING_CHAIN`, `FORCING_NET`). | `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts` |
| `DIGIT_FORCING_CHAIN` | 8510 | Extreme | Last Resort | `forcing.ts`: `iterDigitForcing` / `findDigitForcing` | Yes | `exhaustive` | Tests both parities (`on` and `off`) via singles propagation for every candidate `(cell, d)`; yields one step per `(cell, d)` hypothesis that proves a placement or common conclusion. | `tests/techniques.test.ts`, `tests/forcingTrail.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `NISHIO_FORCING_CHAIN` | 8520 | Extreme | Last Resort | `forcing.ts`: `iterNishio` / `findNishio` | Yes | `exhaustive` | Tests `branch(g, cell, d)` via singles propagation for every candidate `(cell, d)` and constructs its contradiction trail (`contradictionStep`). | `tests/techniques.test.ts`, `tests/forcingTrail.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `CELL_FORCING_CHAIN` | 8530 | Extreme | Last Resort | `forcing.ts`: `iterCellForcing` / `findCellForcing` | Yes | `bounded` (`maxBranchSize = 4` cands/cell) | Tests all candidates of each cell (`2..4` candidates) via singles propagation and intersects all branches (`intersectBranches`). Preserves distinct origin cells (`primary`) even when two cells force the same conclusion. | `tests/techniques.test.ts`, `tests/forcingTrail.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `UNIT_FORCING_CHAIN` | 8540 | Extreme | Last Resort | `forcing.ts`: `iterUnitForcing` / `findUnitForcing` | Yes | `bounded` (`maxBranchSize = 4` spots/unit) | Tests all positions of digit `d` in each unit (`2..4` spots) via singles propagation and intersects all branches. Preserves distinct origin `(unit, digit)` sets even when two units force the same conclusion. | `tests/techniques.test.ts`, `tests/forcingTrail.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `FORCING_NET` | 8600 | Extreme | Last Resort | `forcing.ts`: `iterForcingNet(g, true)` / `findForcingNet` | Yes | `exhaustive` | Tests singles + box/line intersection propagation (`propagateNet`) for each candidate `(cell, d)`. Scanner sets `excludeNishio = true` so contradictions already proven by plain singles (`NISHIO_FORCING_CHAIN`) are not duplicated. | `tests/techniques.test.ts`, `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts`, `tests/soundness.test.ts` |
| `BRUTE_FORCE` | 8900 | Extreme | Last Resort | `humanSolver.ts` (inline fallback in `ratePuzzle`) | **No** (excluded from scanner) | `unimplemented` | Solver-only fallback; never returned by `findNextStep`, `findStep`, `findAllSteps`, or `findAllPatternInstances`. | `tests/scanner.test.ts`, `tests/scannerCoverage.test.ts` |
