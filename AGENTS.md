# Agent Instructions — Pattern Lab (`sudokUI`)

Before making any code, state, or UI changes in this repository, **you must read**:

1. [`docs/pattern-lab-project-brief.md`](docs/pattern-lab-project-brief.md) — Durable product goals, user preferences, solving philosophy, pattern coverage rules, personal mastery settings ("My Techniques"), local-first privacy constraints, and verified baseline facts.
2. [`docs/pattern-lab-roadmap.md`](docs/pattern-lab-roadmap.md) — Architecture audit, per-technique coverage & deduplication plan for all 77 implemented techniques, API design, UI integration plan, and phased roadmap.

## Key Invariants

- **Reuse, do not rewrite:** Preserve the existing `sudokUI` board representation (`src/engine/board.ts`), step structure (`src/engine/steps.ts`), solver behaviour (`findNextStep`, `ratePuzzle` in `src/engine/humanSolver.ts`), candidate contract (`engineGrid`, `contractGrid` in `src/state/gameStore.ts`), SVG board/arrow renderer (`src/ui/Grid.tsx`), and existing tests.
- **Strictly non-mutating scanning:** Scanning a position must analyse the current board as it stands without applying moves, mutating candidates, or advancing the puzzle.
- **All-instance coverage & honest bounds:** Report every distinct instance of applicable techniques on the current board (with canonical deduplication for symmetric chains/loops/subsets), preserve overlapping techniques that explain the same elimination, and explicitly flag any search-budget or instance-cap truncation.
- **Explicit personal mastery:** Never assume the user knows a technique just because they viewed, asked about, or played a move justified by it. Only explicit user choices update "My Techniques".
- **Strictly no emojis:** Never use raw emoji characters anywhere in the UI (buttons, headings, dialogs, badges, toasts, tabs, notifications, etc.). Always use clean, accessible inline SVG icons from `src/ui/Icons.tsx` or clean typography. Do not introduce emojis in any future UI or content updates.
- **100% local & non-competitive:** Keep all features offline-capable and stored locally (`localStorage`). Do not add remote APIs, external AI calls, leaderboards, or timed recognition pressure.
- **Layering:** Enforce `src/ui/ -> src/state/ -> src/engine/` (with static/i18n content in `src/content/`). `src/engine/` must remain pure TypeScript with zero React or DOM imports.

## Commands (Windows / PowerShell)

Use `npm.cmd` (or `npx.cmd`) if PowerShell script execution policy blocks `npm.ps1`:

- **Run unit & soundness tests:** `npm.cmd test` (`vitest run`)
- **Run a single test file:** ` npx.cmd vitest run tests/<file>.test.ts`
- **Production build & static learn generation:** `npm.cmd run build` (`tsc -b && vite build && vite-node scripts/build-learn.ts`)
- **Local dev server:** `npm.cmd run dev`
