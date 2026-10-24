import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  emptyGrid,
  cloneGrid,
  bit,
  parseGrid
} from '../src/engine/board';
import { solve, countSolutions } from '../src/engine/bruteForce';
import {
  findNextStep,
  findAllSteps,
  ratePuzzle,
  findAllPatternInstances,
  findPatternInstancesForTech,
  IMPLEMENTED_TECHS,
  UNIMPLEMENTED_TECHS,
  DISABLED_IMPLEMENTED_TECHS,
  TECH_SCANNER_META
} from '../src/engine/humanSolver';
import { TECHS, Tech, SOLVE_ORDER, PRACTICE_TECHS } from '../src/engine/ratings';
import { walkFrames, describe as describeStep } from '../src/engine/hintFrames';
import { buildProgressiveHints } from '../src/engine/progressiveHints';
import { verifyPracticeAnswer } from '../src/engine/practiceVerifier';
import {
  REASONING_CONCEPTS,
  TECHNIQUE_TAXONOMY,
  getTechniqueConcept,
  getRelatedTechniques
} from '../src/content/concepts';
import {
  Familiarity,
  BASICS_TECHS,
  INTERMEDIATE_TECHS,
  ADVANCED_TECHS,
  buildPresetStatus,
  getFamiliarity,
  isTechniqueVisibleInScan,
  countMasteryStats,
  sanitizeMasterySettings
} from '../src/content/mastery';
import { TECH_DOCS } from '../src/content/techniqueDocs';
import { getTechniqueGuide } from '../src/content/techniqueGuides';
import {
  buildPositionImportUrl,
  decodePositionPayload,
  validatePositionPayload,
  type PositionImportPayload
} from '../src/content/sudokuExchangeImport';
import { puzzleFromLink } from '../src/content/importLinks';
import { useSettings } from '../src/state/settings';
import {
  useGame,
  engineGrid,
  contractGrid,
  markSlip,
  stepMatchesSolution
} from '../src/state/gameStore';
import { usePatternScanner } from '../src/state/scannerStore';
import {
  usePractice,
  sanitizePracticePersistedState
} from '../src/state/practiceStore';
import { allSolutions, truthOf } from './solutionOracle';

const SAMPLE_PUZZLE =
  '...6..9.1..95....4....4985..241....5....3....9....546..7549....3....12..1.2..3...';

describe('Phase 6 — Final Validation, Offline Behaviour, Privacy & Project Polish', () => {
  beforeEach(() => {
    useSettings.setState({
      mastery: {
        status: buildPresetStatus('intermediate'),
        includeLearning: true,
        setupCompleted: true,
        activePreset: 'intermediate'
      }
    });
    useGame.getState().startGame(SAMPLE_PUZZLE, 1348, 'Hard');
    useGame.setState({ autoCandidates: true });
    usePatternScanner.getState().closeScanner();
    usePatternScanner.getState().resetFilter();
    usePractice.getState().exitPractice();
    usePractice.getState().clearProgress();
  });

  describe('1. Scanner Correctness & Soundness Invariants', () => {
    it('analyses current candidate state, never mutates input grid, and never auto-applies moves', () => {
      const g = parseGrid(SAMPLE_PUZZLE)!;
      const snapshotValues = new Uint8Array(g.values);
      const snapshotCands = new Uint16Array(g.cands);
      const snapshotGiven = new Uint8Array(g.given);

      const scan = findAllPatternInstances(g, { includeDisabled: true });

      expect(scan.instances.length).toBeGreaterThan(0);
      expect(g.values).toEqual(snapshotValues);
      expect(g.cands).toEqual(snapshotCands);
      expect(g.given).toEqual(snapshotGiven);

      // Verify candidate exclusions in current state directly affect scanning
      const firstElim = scan.instances.find((i) => i.step.eliminations.length > 0)?.step.eliminations[0];
      if (firstElim) {
        const gModified = cloneGrid(g);
        gModified.cands[firstElim.cell] &= ~bit(firstElim.digit);
        const scanModified = findAllPatternInstances(gModified);
        const stillEliminatesRemovedCand = scanModified.instances.some((inst) =>
          inst.step.eliminations.some(
            (e) => e.cell === firstElim.cell && e.digit === firstElim.digit
          )
        );
        expect(stillEliminatesRemovedCand).toBe(false);
      }
    });

    it('reports multiple instances of the same technique in both row and column orientations', () => {
      const g = emptyGrid();
      for (let i = 0; i < 81; i++) g.cands[i] = bit(1) | bit(2);

      // Row-based X-Wing on digit 3 in rows 0 and 4 (cols 1 and 6), with extra 3s in cols 1 and 6
      g.cands[0 * 9 + 1] |= bit(3);
      g.cands[0 * 9 + 6] |= bit(3);
      g.cands[4 * 9 + 1] |= bit(3);
      g.cands[4 * 9 + 6] |= bit(3);
      g.cands[2 * 9 + 1] |= bit(3); // elimination target in col 1
      g.cands[7 * 9 + 6] |= bit(3); // elimination target in col 6

      // Column-based X-Wing on digit 5 in cols 2 and 7 (rows 1 and 5), with extra 5s in rows 1 and 5
      g.cands[1 * 9 + 2] |= bit(5);
      g.cands[5 * 9 + 2] |= bit(5);
      g.cands[1 * 9 + 7] |= bit(5);
      g.cands[5 * 9 + 7] |= bit(5);
      g.cands[1 * 9 + 4] |= bit(5); // elimination target in row 1
      g.cands[5 * 9 + 8] |= bit(5); // elimination target in row 5

      const xwings = findPatternInstancesForTech('X_WING', g);
      expect(xwings.instances.length).toBe(2);
      const digitsFound = xwings.instances.map((i) => i.digits[0]).sort();
      expect(digitsFound).toEqual([3, 5]);
    });

    it('retains overlapping explanations for the same elimination while deduplicating symmetric traversals', () => {
      const g = emptyGrid();
      for (let i = 0; i < 81; i++) g.cands[i] = bit(8) | bit(9);

      // Create two distinct XY-Wings that both eliminate digit 5 from r2c3 (cell 11):
      // XY-Wing 1: Pivot r1c1 (0) {1,2}, Pincer 1 r1c3 (2) {1,5}, Pincer 2 r2c1 (9) {2,5} -> eliminates 5 from r2c3 (11)
      g.cands[0] = bit(1) | bit(2);
      g.cands[2] = bit(1) | bit(5);
      g.cands[9] = bit(2) | bit(5);

      // XY-Wing 2: Pivot r5c3 (38) {3,4}, Pincer 1 r2c2 (10) {3,5} (wait: r5c3 sees r5c2(37) and r2c3(11)):
      // Let's place Pivot 2 at r3c3 (20) {3,4}, Pincer A at r3c2 (19) {3,5}, Pincer B at r1c3 (already used) -> use r6c3 (47) {4,5}
      // Cell 11 (r2c3) sees r3c2 (19, same box 0) and r6c3 (47, same col 2)!
      // And Pivot r6c2 (46) {3,4} sees r3c2 (19, col 1) and r6c3 (47, row 5)!
      g.cands[46] = bit(3) | bit(4);
      g.cands[19] = bit(3) | bit(5);
      g.cands[47] = bit(4) | bit(5);

      // Target cell r2c3 (11) has candidate 5
      g.cands[11] |= bit(5);

      const scan = findAllPatternInstances(g, { techniques: ['XY_WING'] });
      const xyWings = scan.byTech.XY_WING?.instances ?? [];
      expect(xyWings.length).toBe(2);

      // Both eliminate 5 from cell 11 (E:11:5)
      const overlapping = scan.byConclusion['E:11:5'] ?? [];
      expect(overlapping.length).toBe(2);
    });

    it('clearly reports search truncation and unimplemented catalogue status honestly', () => {
      const g = parseGrid(SAMPLE_PUZZLE)!;

      // Force instance cap truncation with maxInstancesPerTech = 1
      const cappedScan = findAllPatternInstances(g, {
        techniques: ['HIDDEN_SINGLE', 'LOCKED_CANDIDATES_1', 'LOCKED_CANDIDATES_2'],
        maxInstancesPerTech: 1
      });
      expect(cappedScan.truncated).toBe(true);
      const truncatedSummaries = Object.values(cappedScan.byTech).filter((s) => s?.truncated);
      expect(truncatedSummaries.length).toBeGreaterThan(0);
      for (const summary of truncatedSummaries) {
        expect(summary?.truncated).toBe(true);
        expect(summary?.truncationReason).toBe('instance-cap');
      }

      // Unimplemented techniques are honestly flagged
      for (const unimp of UNIMPLEMENTED_TECHS) {
        const res = findPatternInstancesForTech(unimp, g);
        expect(res.implemented).toBe(false);
        expect(res.coverage).toBe('unimplemented');
        expect(res.instances).toEqual([]);
      }
    });

    it('verifies every discovered pattern instance on a real puzzle is 100% sound against solutionOracle', () => {
      const g = parseGrid(SAMPLE_PUZZLE)!;
      const solutions = allSolutions(g.values, g.cands, 2);
      expect(solutions).not.toBeNull();
      expect(solutions!.length).toBe(1);
      const truth = truthOf(solutions!);

      const scan = findAllPatternInstances(g, { includeDisabled: true });
      expect(scan.instances.length).toBeGreaterThan(0);
      for (const inst of scan.instances) {
        for (const p of inst.step.placements) {
          expect(
            truth.forced[p.cell],
            `${inst.tech} placed ${p.digit} at cell ${p.cell} where solution has ${truth.forced[p.cell]}`
          ).toBe(p.digit);
        }
        for (const e of inst.step.eliminations) {
          expect(
            truth.seen[e.cell] & (1 << (e.digit - 1)),
            `${inst.tech} eliminated solution digit ${e.digit} at cell ${e.cell}`
          ).toBe(0);
        }
      }
    });
  });

  describe('2. Mastery Filtering & Cross-Surface Metadata Consistency', () => {
    it('supports all required mastery profiles and Discovery mode without altering engine logic', () => {
      const g = parseGrid(SAMPLE_PUZZLE)!;
      const nextStepBefore = findNextStep(g);
      const ratingBefore = ratePuzzle(parseGrid(SAMPLE_PUZZLE)!);

      // 1. Only basic techniques marked Known
      const basicsMastery = {
        status: buildPresetStatus('basics'),
        includeLearning: false,
        setupCompleted: true,
        activePreset: 'basics' as const
      };
      expect(isTechniqueVisibleInScan(basicsMastery, 'NAKED_SINGLE', false)).toBe(true);
      expect(isTechniqueVisibleInScan(basicsMastery, 'NAKED_PAIR', false)).toBe(true);
      expect(isTechniqueVisibleInScan(basicsMastery, 'X_WING', false)).toBe(false);
      expect(isTechniqueVisibleInScan(basicsMastery, 'XY_WING', false)).toBe(false);

      // 2. Profile with fish patterns marked Known
      const fishMastery = {
        status: {
          ...buildPresetStatus('basics'),
          X_WING: 'known' as Familiarity,
          SWORDFISH: 'known' as Familiarity,
          JELLYFISH: 'known' as Familiarity,
          FINNED_X_WING: 'known' as Familiarity
        },
        includeLearning: false,
        setupCompleted: true,
        activePreset: 'custom' as const
      };
      expect(isTechniqueVisibleInScan(fishMastery, 'X_WING', false)).toBe(true);
      expect(isTechniqueVisibleInScan(fishMastery, 'SWORDFISH', false)).toBe(true);
      expect(isTechniqueVisibleInScan(fishMastery, 'FINNED_X_WING', false)).toBe(true);
      expect(isTechniqueVisibleInScan(fishMastery, 'XY_WING', false)).toBe(false);

      // 3. Profile that includes some Learning techniques
      const learningMastery = {
        status: {
          ...buildPresetStatus('basics'),
          XY_WING: 'learning' as Familiarity,
          SKYSCRAPER: 'learning' as Familiarity
        },
        includeLearning: true,
        setupCompleted: true,
        activePreset: 'custom' as const
      };
      expect(isTechniqueVisibleInScan(learningMastery, 'XY_WING', false)).toBe(true);
      expect(isTechniqueVisibleInScan({ ...learningMastery, includeLearning: false }, 'XY_WING', false)).toBe(false);

      // 4. Unfamiliar techniques excluded in normal mode, revealed in Discovery mode
      expect(isTechniqueVisibleInScan(learningMastery, 'ALS_XZ', false)).toBe(false);
      expect(isTechniqueVisibleInScan(learningMastery, 'ALS_XZ', true)).toBe(true);

      // Unimplemented techniques never appear even in Discovery mode
      expect(isTechniqueVisibleInScan(learningMastery, 'SK_LOOP', true)).toBe(false);

      // Underlying solver and rating are 100% unchanged by any mastery profile changes
      useSettings.setState({ mastery: basicsMastery });
      expect(findNextStep(g)).toEqual(nextStepBefore);
      expect(ratePuzzle(parseGrid(SAMPLE_PUZZLE)!)).toEqual(ratingBefore);
    });

    it('keeps technique names, categories, concepts, docs, and guides consistent across all 80 catalogue entries', () => {
      const allTechs = Object.keys(TECHS) as Tech[];
      expect(allTechs.length).toBe(80);
      expect(IMPLEMENTED_TECHS.length).toBe(76);
      expect(UNIMPLEMENTED_TECHS.length).toBe(3);
      expect(DISABLED_IMPLEMENTED_TECHS.length).toBe(4);

      for (const tech of allTechs) {
        const info = TECHS[tech];
        expect(info.name.length).toBeGreaterThan(0);
        expect(info.category.length).toBeGreaterThan(0);

        // Taxonomy & Concept
        const tax = TECHNIQUE_TAXONOMY[tech];
        expect(tax, `Missing taxonomy for ${tech}`).toBeDefined();
        expect(REASONING_CONCEPTS[tax.conceptId]).toBeDefined();
        const concept = getTechniqueConcept(tech);
        if (IMPLEMENTED_TECHS.includes(tech)) {
          expect(concept.techniques).toContain(tech);
        }

        // Related techniques are all valid Tech keys
        for (const rel of getRelatedTechniques(tech)) {
          expect(TECHS[rel]).toBeDefined();
        }

        // Docs & Learning Guide
        expect(TECH_DOCS[tech], `Missing TECH_DOCS for ${tech}`).toBeDefined();
        const guide = getTechniqueGuide(tech);
        expect(guide.tech).toBe(tech);
        expect(guide.structuralRoles.length).toBeGreaterThan(0);
        expect(guide.affectedCandidates.length).toBeGreaterThan(0);
        expect(guide.pitfalls.length).toBeGreaterThan(0);
        expect(guide.distinctions.length).toBeGreaterThan(0);

        // Scanner metadata
        expect(TECH_SCANNER_META[tech], `Missing TECH_SCANNER_META for ${tech}`).toBeDefined();
      }
    });
  });

  describe('3. Offline, Local-First & Corrupted Storage Resilience', () => {
    it('gracefully sanitizes corrupted or outdated mastery and practice storage payloads', () => {
      // Null / primitive / array payloads fall back cleanly
      expect(sanitizeMasterySettings(null)).toEqual({
        status: {},
        includeLearning: true,
        setupCompleted: false,
        activePreset: 'intermediate'
      });
      expect(sanitizeMasterySettings('corrupted-string')).toEqual({
        status: {},
        includeLearning: true,
        setupCompleted: false,
        activePreset: 'intermediate'
      });
      expect(sanitizeMasterySettings([1, 2, 3])).toEqual({
        status: {},
        includeLearning: true,
        setupCompleted: false,
        activePreset: 'intermediate'
      });

      // Partially corrupted status map keeps valid entries and drops invalid keys/values
      const dirtyMastery = sanitizeMasterySettings({
        status: {
          X_WING: 'known',
          XY_WING: 'learning',
          SWORDFISH: 'invalid_familiarity',
          NOT_A_TECHNIQUE: 'known'
        },
        includeLearning: 'not-a-boolean',
        setupCompleted: true,
        activePreset: 42
      });
      expect(dirtyMastery.status).toEqual({
        X_WING: 'known',
        XY_WING: 'learning'
      });
      expect(dirtyMastery.includeLearning).toBe(true);
      expect(dirtyMastery.setupCompleted).toBe(true);
      expect(dirtyMastery.activePreset).toBe('intermediate');

      // Practice store sanitizer handles corrupted progress and history gracefully
      expect(sanitizePracticePersistedState(null)).toEqual({
        trackingEnabled: true,
        progress: {},
        history: []
      });
      const dirtyPractice = sanitizePracticePersistedState({
        trackingEnabled: 'yes',
        progress: {
          X_WING: { attempts: 5, successes: 10, hintsUsed: -3 }, // successes > attempts & negative hints
          BOGUS_TECH: { attempts: 2, successes: 1, hintsUsed: 0 },
          XY_WING: 'not-an-object'
        },
        history: [
          { id: 'h1', tech: 'X_WING', timestamp: 1000, mode: 'mixed', success: 1, hintsUsed: 2 },
          { id: 'h2', tech: 'BOGUS_TECH', timestamp: 1000 },
          null,
          'corrupt-entry'
        ]
      });
      expect(dirtyPractice.trackingEnabled).toBe(true);
      expect(dirtyPractice.progress.X_WING).toEqual({
        tech: 'X_WING',
        attempts: 5,
        successes: 5, // clamped to attempts
        hintsUsed: 0 // clamped to >= 0
      });
      expect((dirtyPractice.progress as Record<string, unknown>).BOGUS_TECH).toBeUndefined();
      expect(dirtyPractice.history.length).toBe(1);
      expect(dirtyPractice.history[0].tech).toBe('X_WING');
      expect(dirtyPractice.history[0].mode).toBe('mixed');
    });

    it('persists mastery profiles across reloads and recovers cleanly from corrupted storage rehydration', async () => {
      const store = new Map<string, string>();
      const mockStorage: Storage = {
        get length() {
          return store.size;
        },
        clear: () => store.clear(),
        getItem: (k: string) => store.get(k) ?? null,
        key: (i: number) => [...store.keys()][i] ?? null,
        removeItem: (k: string) => {
          store.delete(k);
        },
        setItem: (k: string, v: string) => {
          store.set(k, v);
        }
      };

      vi.stubGlobal('localStorage', mockStorage);
      try {
        // 1. Save a customized profile and verify it persists in localStorage
        useSettings.getState().applyMasteryPreset('basics');
        useSettings.getState().setTechniqueFamiliarity('SKYSCRAPER', 'learning');
        const savedSnapshot = store.get('sudokui-settings-v1');
        expect(savedSnapshot).toBeDefined();

        // Reset in-memory state, restore saved snapshot in storage, and rehydrate (simulating browser reload)
        useSettings.setState({
          mastery: {
            status: {},
            includeLearning: false,
            setupCompleted: false,
            activePreset: 'intermediate'
          }
        });
        store.set('sudokui-settings-v1', savedSnapshot!);
        await useSettings.persist.rehydrate();
        expect(getFamiliarity(useSettings.getState().mastery, 'SKYSCRAPER')).toBe('learning');
        expect(getFamiliarity(useSettings.getState().mastery, 'NAKED_SINGLE')).toBe('known');
        expect(getFamiliarity(useSettings.getState().mastery, 'ALS_XZ')).toBe('unfamiliar');

        // 2. Write corrupted mastery payload to storage and rehydrate without crashing
        store.set(
          'sudokui-settings-v1',
          JSON.stringify({
            state: {
              mastery: {
                status: { X_WING: 'known', INVALID_TECH: 'known', XY_WING: 999 },
                includeLearning: 'corrupted',
                setupCompleted: true,
                activePreset: 12345
              }
            },
            version: 0
          })
        );
        await useSettings.persist.rehydrate();
        expect(getFamiliarity(useSettings.getState().mastery, 'X_WING')).toBe('known');
        expect(getFamiliarity(useSettings.getState().mastery, 'XY_WING')).toBe('unfamiliar');
        expect(useSettings.getState().mastery.includeLearning).toBe(true);
        expect(useSettings.getState().mastery.activePreset).toBe('intermediate');

        // 3. Write malformed raw JSON string to storage and verify rehydration does not throw
        store.set('sudokui-settings-v1', '{{{malformed-json');
        await expect(useSettings.persist.rehydrate()).resolves.not.toThrow();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('makes zero network requests across scanning, mastery, practice, and Sudoku Exchange import', () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      try {
        // 1. Scan position
        const g = parseGrid(SAMPLE_PUZZLE)!;
        const scan = findAllPatternInstances(g);
        expect(scan.instances.length).toBeGreaterThan(0);

        // 2. Update mastery settings
        useSettings.getState().setTechniqueFamiliarity('X_WING', 'learning');
        useSettings.getState().applyMasteryPreset('advanced');

        // 3. Build progressive hints & verify practice answer
        const step = scan.instances[0].step;
        const hints = buildProgressiveHints(step);
        expect(hints.stages.length).toBe(4);

        usePractice.getState().startFocusedPractice(step.tech, step, [step]);
        usePractice.getState().requestNextHint();
        usePractice.getState().submitAnswer();

        // 4. Import Sudoku Exchange position
        const payload: PositionImportPayload = {
          v: 1,
          source: 'sudokuexchange',
          fidelity: 'full',
          givens: SAMPLE_PUZZLE,
          values: SAMPLE_PUZZLE
        };
        const url = buildPositionImportUrl(payload);
        const decoded = decodePositionPayload(url);
        expect(decoded.ok).toBe(true);
        if (decoded.ok) {
          const validated = validatePositionPayload(decoded.payload);
          expect(validated.ok).toBe(true);
        }

        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe('4. Preservation of Existing sudokUI Functionality', () => {
    it('preserves findNextStep, findAllSteps, ratePuzzle, walkFrames, undo/redo, and import', () => {
      const g = parseGrid(SAMPLE_PUZZLE)!;

      // 1. Single-step solver and all-steps (at most 1 per tech)
      const nextStep = findNextStep(g);
      expect(nextStep).not.toBeNull();
      const allSteps = findAllSteps(g);
      expect(allSteps.length).toBeGreaterThan(0);
      const uniqueTechsInAllSteps = new Set(allSteps.map((s) => s.tech));
      expect(uniqueTechsInAllSteps.size).toBe(allSteps.length);

      // 2. Walk frames and step description
      const frames = walkFrames(nextStep!);
      expect(frames.length).toBeGreaterThan(0);
      expect(describeStep(nextStep!).length).toBeGreaterThan(0);

      // 3. Solution count and puzzle rating
      expect(countSolutions(g, 2)).toBe(1);
      const rating = ratePuzzle(parseGrid(SAMPLE_PUZZLE)!);
      expect(rating).not.toBeNull();
      expect(rating!.solvable).toBe(true);
      expect(rating!.score).toBeGreaterThan(0);

      // 4. Undo / Redo and candidate contract in gameStore
      useGame.getState().startGame(SAMPLE_PUZZLE, rating!.score, rating!.level);
      const emptyCell = useGame.getState().cells.findIndex((c) => c.value === 0);
      expect(emptyCell).toBeGreaterThanOrEqual(0);

      useGame.getState().select([emptyCell], false);
      useGame.getState().setMode('corner');
      useGame.getState().input(5);
      expect(useGame.getState().cells[emptyCell].corner & bit(5)).toBeTruthy();

      useGame.getState().undo();
      expect(useGame.getState().cells[emptyCell].corner & bit(5)).toBe(0);

      useGame.getState().redo();
      expect(useGame.getState().cells[emptyCell].corner & bit(5)).toBeTruthy();

      // 5. Standard import pipeline
      const parsed = puzzleFromLink(SAMPLE_PUZZLE);
      expect(parsed).toEqual({ ok: true, puzzle: SAMPLE_PUZZLE, source: null });
    });
  });
});
