import { describe, it, expect, beforeEach } from 'vitest';
import { emptyGrid, bit } from '../src/engine/board';
import { Step } from '../src/engine/steps';
import { TECHS, Tech } from '../src/engine/ratings';
import { buildProgressiveHints } from '../src/engine/progressiveHints';
import {
  verifyPracticeAnswer,
  UserPracticeAnswer,
  PracticeVerificationResult,
  extractBoardDeductions
} from '../src/engine/practiceVerifier';
import {
  getTechniqueGuide,
  TECHNIQUE_GUIDES
} from '../src/content/techniqueGuides';
import {
  usePractice,
  getStrugglingTechniques,
  getProficientTechniques
} from '../src/state/practiceStore';
import { findAllPatternInstances } from '../src/engine/humanSolver';
import { useSettings } from '../src/state/settings';
import { buildPresetStatus } from '../src/content/mastery';

describe('Phase 5 — Turn Pattern Lab into a Learning and Practice Tool (tests/practice.test.ts)', () => {
  beforeEach(() => {
    // Reset practice store
    usePractice.getState().exitPractice();
    usePractice.getState().clearProgress();
    usePractice.setState({ trackingEnabled: true });

    // Reset settings
    useSettings.setState({
      mastery: {
        status: buildPresetStatus('intermediate'),
        includeLearning: true,
        setupCompleted: true,
        activePreset: 'intermediate'
      }
    });
  });

  // Mock step for testing
  const mockXWingStep: Step = {
    tech: 'X_WING',
    primary: [
      { cell: 0, digit: 4 },
      { cell: 8, digit: 4 },
      { cell: 18, digit: 4 },
      { cell: 26, digit: 4 }
    ], // r1c1, r1c9, r3c1, r3c9
    secondary: [],
    fins: [],
    links: [],
    eliminations: [
      { cell: 9, digit: 4 },
      { cell: 27, digit: 4 }
    ],
    placements: [],
    units: [
      { unit: 0, role: 'primary' },
      { unit: 2, role: 'primary' }
    ],
    description: 'X-Wing on 4 in rows 1 and 3 removes 4 from r2c1 and r4c1.'
  };

  const mockXYWingStep: Step = {
    tech: 'XY_WING',
    primary: [{ cell: 10, digit: 3 }], // pivot r2c2
    secondary: [
      { cell: 11, digit: 3 },
      { cell: 19, digit: 5 }
    ], // pincers r2c3, r3c2
    fins: [],
    links: [],
    eliminations: [{ cell: 20, digit: 5 }],
    placements: [],
    units: [],
    description: 'XY-Wing with pivot r2c2 (35) and pincers r2c3 (37) and r3c2 (57) eliminates 5 from r3c3.'
  };

  describe('1. Progressive Hints Engine', () => {
    it('generates exactly 4 discrete progressive stages for a step', () => {
      const hints = buildProgressiveHints(mockXWingStep);
      expect(hints.tech).toBe('X_WING');
      expect(hints.stages.length).toBe(4);
      expect(hints.stages.map((s) => s.level)).toEqual([1, 2, 3, 4]);
    });

    it('Stage 1 (Nudge): gives digit and region context without revealing pattern cells or deductions', () => {
      const hints = buildProgressiveHints(mockXWingStep);
      const stage1 = hints.stages[0];

      expect(stage1.level).toBe(1);
      expect(stage1.isFullReveal).toBe(false);
      expect(stage1.highlightUnits?.length).toBeGreaterThan(0);
      expect(stage1.primary).toBeUndefined();
      expect(stage1.secondary).toBeUndefined();
      expect(stage1.eliminations).toBeUndefined();
      expect(stage1.placements).toBeUndefined();
      expect(stage1.text).toContain('digit 4');
    });

    it('Stage 2 (Structure): explains the pattern mechanism and structural roles', () => {
      const hints = buildProgressiveHints(mockXWingStep);
      const stage2 = hints.stages[1];

      expect(stage2.level).toBe(2);
      expect(stage2.isFullReveal).toBe(false);
      expect(stage2.text).toContain('X-Wing');
      expect(stage2.primary).toBeUndefined();
      expect(stage2.eliminations).toBeUndefined();
    });

    it('Stage 3 (Pattern Cells): highlights participating cells and links without giving away eliminations', () => {
      const hints = buildProgressiveHints(mockXWingStep);
      const stage3 = hints.stages[2];

      expect(stage3.level).toBe(3);
      expect(stage3.isFullReveal).toBe(false);
      expect(stage3.primary).toEqual(mockXWingStep.primary);
      expect(stage3.eliminations).toBeUndefined();
      expect(stage3.placements).toBeUndefined();
    });

    it('Stage 4 (Complete Solution): provides full revelation including eliminations and placements', () => {
      const hints = buildProgressiveHints(mockXWingStep);
      const stage4 = hints.stages[3];

      expect(stage4.level).toBe(4);
      expect(stage4.isFullReveal).toBe(true);
      expect(stage4.primary).toEqual(mockXWingStep.primary);
      expect(stage4.eliminations).toEqual(mockXWingStep.eliminations);
      expect(stage4.text).toBe(mockXWingStep.description);
    });

    it('is strictly non-mutating on the original step', () => {
      const originalDescription = mockXWingStep.description;
      const originalPrimary = [...(mockXWingStep.primary ?? [])];
      buildProgressiveHints(mockXWingStep);

      expect(mockXWingStep.description).toBe(originalDescription);
      expect(mockXWingStep.primary).toEqual(originalPrimary);
    });
  });

  describe('2. Practice Answer Verifier', () => {
    it('accepts exact target match with correct cells and digit', () => {
      const answer: UserPracticeAnswer = {
        tech: 'X_WING',
        digit: 4,
        digits: [4],
        cells: [0, 8, 18, 26],
        eliminations: [{ cell: 9, digit: 4 }]
      };

      const result = verifyPracticeAnswer(answer, mockXWingStep, [mockXWingStep]);
      expect(result.isCorrect).toBe(true);
      expect(result.status).toBe('exact');
      expect(result.matchedStep?.tech).toBe('X_WING');
      expect(result.suggestedAction).toBe('next');
    });

    it('accepts alternative valid pattern on the board in mixed mode', () => {
      // User is presented with a puzzle where mockXWingStep was the generator's initial target,
      // but user spotted mockXYWingStep which also exists on this board position
      const answer: UserPracticeAnswer = {
        tech: 'XY_WING',
        digit: 5,
        digits: [5],
        cells: [10, 11, 19],
        eliminations: [{ cell: 20, digit: 5 }]
      };

      const result = verifyPracticeAnswer(answer, mockXWingStep, [
        mockXWingStep,
        mockXYWingStep
      ]);

      expect(result.isCorrect).toBe(true);
      expect(result.status).toBe('alternative');
      expect(result.matchedStep?.tech).toBe('XY_WING');
      expect(result.title).toContain('Alternative Pattern Found');
    });

    it('detects partial match: correct cells and digit, but incorrect elimination', () => {
      const answer: UserPracticeAnswer = {
        tech: 'X_WING',
        digit: 4,
        cells: [0, 8, 18, 26],
        eliminations: [{ cell: 70, digit: 4 }] // wrong elimination cell
      };

      const result = verifyPracticeAnswer(answer, mockXWingStep, [mockXWingStep]);
      expect(result.isCorrect).toBe(false);
      expect(result.status).toBe('partial');
      expect(result.title).toContain('Right cells, check the deduction');
    });

    it('detects partial match: correct cells, wrong digit', () => {
      const answer: UserPracticeAnswer = {
        digit: 7, // wrong digit
        cells: [0, 8, 18, 26]
      };

      const result = verifyPracticeAnswer(answer, mockXWingStep, [mockXWingStep]);
      expect(result.isCorrect).toBe(false);
      expect(result.status).toBe('partial');
      expect(result.title).toContain('Pattern cells spotted');
    });

    it('detects partial match: correct digit, wrong cells', () => {
      const answer: UserPracticeAnswer = {
        digit: 4,
        cells: [1, 2, 3] // wrong cells
      };

      const result = verifyPracticeAnswer(answer, mockXWingStep, [mockXWingStep]);
      expect(result.isCorrect).toBe(false);
      expect(result.status).toBe('partial');
      expect(result.title).toContain('Correct digit, look for the structure');
    });

    it('returns incorrect status with helpful hint guidance for completely wrong answer', () => {
      const answer: UserPracticeAnswer = {
        digit: 9,
        cells: [40, 41]
      };

      const result = verifyPracticeAnswer(answer, mockXWingStep, [mockXWingStep]);
      expect(result.isCorrect).toBe(false);
      expect(result.status).toBe('incorrect');
      expect(result.suggestedAction).toBe('hint');
    });

    it('accepts exact match from candidate eliminations alone without requiring cell keying', () => {
      const answer: UserPracticeAnswer = {
        tech: 'X_WING',
        eliminations: [
          { cell: 9, digit: 4 },
          { cell: 27, digit: 4 }
        ]
      };

      const result = verifyPracticeAnswer(answer, mockXWingStep, [mockXWingStep]);
      expect(result.isCorrect).toBe(true);
      expect(result.status).toBe('exact');
      expect(result.title).toContain('Spot on! Valid X-Wing');
      expect(result.feedback).toContain('candidate 4 from r2c1, 4 from r4c1');
    });

    it('accepts exact match when user selects the deduction / elimination cells and digit', () => {
      const answer: UserPracticeAnswer = {
        tech: 'X_WING',
        digit: 4,
        cells: [9, 27] // The elimination cells (r2c1 and r4c1)
      };

      const result = verifyPracticeAnswer(answer, mockXWingStep, [mockXWingStep]);
      expect(result.isCorrect).toBe(true);
      expect(result.status).toBe('exact');
      expect(result.title).toContain('Spot on! Valid X-Wing');
    });

    it('provides clear feedback when an eliminated candidate note is not justified by the pattern', () => {
      const answer: UserPracticeAnswer = {
        tech: 'X_WING',
        eliminations: [{ cell: 50, digit: 4 }] // Cell 50 is not eliminated by X-Wing
      };

      const result = verifyPracticeAnswer(answer, mockXWingStep, [mockXWingStep]);
      expect(result.isCorrect).toBe(false);
      expect(result.status).toBe('incorrect');
      expect(result.title).toContain('Candidate not eliminated');
      expect(result.feedback).toContain('r6c6');
    });
  });

  describe('3. Technique Logic, Pitfalls & Kin Documentation', () => {
    it('provides comprehensive logic guides for all implemented patterns', () => {
      const testTechs: Tech[] = [
        'FULL_HOUSE',
        'NAKED_SINGLE',
        'HIDDEN_SINGLE',
        'LOCKED_CANDIDATES_1',
        'NAKED_PAIR',
        'HIDDEN_PAIR',
        'X_WING',
        'SWORDFISH',
        'XY_WING',
        'XYZ_WING',
        'W_WING',
        'SKYSCRAPER',
        'TWO_STRING_KITE',
        'TURBOT_FISH',
        'SIMPLE_COLORS',
        'REMOTE_PAIR',
        'UNIQUENESS_1',
        'AVOIDABLE_RECTANGLE_1',
        'BUG_PLUS_1',
        'ALS_XZ',
        'DEATH_BLOSSOM',
        'MEDUSA_3D'
      ];

      for (const tech of testTechs) {
        const guide = getTechniqueGuide(tech);
        expect(guide.tech).toBe(tech);
        expect(guide.structuralRoles.length).toBeGreaterThan(10);
        expect(guide.affectedCandidates.length).toBeGreaterThan(10);
        expect(guide.pitfalls.length).toBeGreaterThan(0);
        expect(guide.distinctions.length).toBeGreaterThan(10);
      }
    });

    it('distinguishes false friends and kin clearly', () => {
      const xwingGuide = getTechniqueGuide('X_WING');
      expect(xwingGuide.pitfalls.some((p) => p.includes('parallel'))).toBe(true);
      expect(xwingGuide.distinctions).toContain('Swordfish');

      const xyWingGuide = getTechniqueGuide('XY_WING');
      expect(xyWingGuide.pitfalls.some((p) => p.includes('pincer'))).toBe(true);
      expect(xyWingGuide.distinctions).toContain('XYZ-Wing');
    });
  });

  describe('4. Practice Store & Local Progress Tracking', () => {
    it('starts focused practice with expected target and answer resets', () => {
      const store = usePractice.getState();
      store.startFocusedPractice('X_WING', mockXWingStep);

      const state = usePractice.getState();
      expect(state.mode).toBe('focused');
      expect(state.targetTech).toBe('X_WING');
      expect(state.targetStep).toBe(mockXWingStep);
      expect(state.exerciseState).toBe('answering');
      expect(state.currentHintLevel).toBe(0);
      expect(state.userAnswer.tech).toBe('X_WING');
    });

    it('starts mixed practice without pre-selecting target technique', () => {
      const store = usePractice.getState();
      store.startMixedPractice(['X_WING', 'XY_WING'], mockXWingStep);

      const state = usePractice.getState();
      expect(state.mode).toBe('mixed');
      expect(state.targetTech).toBeNull();
      expect(state.mixedPool).toEqual(['X_WING', 'XY_WING']);
      expect(state.userAnswer.tech).toBeUndefined();
    });

    it('steps progressively through hints from 0 to 4', () => {
      const store = usePractice.getState();
      store.startFocusedPractice('X_WING', mockXWingStep);

      expect(usePractice.getState().currentHintLevel).toBe(0);

      const h1 = store.requestNextHint();
      expect(h1?.level).toBe(1);
      expect(usePractice.getState().currentHintLevel).toBe(1);

      const h2 = store.requestNextHint();
      expect(h2?.level).toBe(2);
      expect(usePractice.getState().currentHintLevel).toBe(2);

      const h3 = store.requestNextHint();
      expect(h3?.level).toBe(3);
      expect(usePractice.getState().currentHintLevel).toBe(3);

      const h4 = store.requestNextHint();
      expect(h4?.level).toBe(4);
      expect(usePractice.getState().currentHintLevel).toBe(4);
      expect(usePractice.getState().exerciseState).toBe('revealed');
    });

    it('submits answer, records local progress, and updates history', () => {
      const store = usePractice.getState();
      store.startFocusedPractice('X_WING', mockXWingStep);

      store.setUserDigit(4);
      store.setUserCells([0, 8, 18, 26]);
      store.setUserElimination({ cell: 9, digit: 4 });

      const result = store.submitAnswer();
      expect(result?.isCorrect).toBe(true);

      const state = usePractice.getState();
      expect(state.exerciseState).toBe('submitted');
      expect(state.progress.X_WING?.attempts).toBe(1);
      expect(state.progress.X_WING?.successes).toBe(1);
      expect(state.history.length).toBe(1);
      expect(state.history[0].tech).toBe('X_WING');
      expect(state.history[0].success).toBe(true);
    });

    it('identifies struggling techniques based on accuracy and hint usage', () => {
      const store = usePractice.getState();

      // Record several failed attempts or heavy hint usage on SKYSCRAPER
      usePractice.setState({
        progress: {
          SKYSCRAPER: {
            tech: 'SKYSCRAPER',
            attempts: 5,
            successes: 1, // 20% success rate
            hintsUsed: 8
          },
          X_WING: {
            tech: 'X_WING',
            attempts: 4,
            successes: 4, // 100% success rate
            hintsUsed: 0
          }
        }
      });

      const progress = usePractice.getState().progress;
      const struggling = getStrugglingTechniques(progress);
      expect(struggling.includes('SKYSCRAPER')).toBe(true);
      expect(struggling.includes('X_WING')).toBe(false);

      const proficient = getProficientTechniques(progress);
      expect(proficient.includes('X_WING')).toBe(true);
      expect(proficient.includes('SKYSCRAPER')).toBe(false);
    });

    it('clears practice history cleanly on user request', () => {
      const store = usePractice.getState();
      usePractice.setState({
        progress: {
          X_WING: { tech: 'X_WING', attempts: 5, successes: 4, hintsUsed: 2 }
        },
        history: [
          {
            id: 'p-1',
            timestamp: Date.now(),
            tech: 'X_WING',
            mode: 'focused',
            success: true,
            hintsUsed: 0
          }
        ]
      });

      expect(Object.keys(usePractice.getState().progress).length).toBe(1);
      expect(usePractice.getState().history.length).toBe(1);

      store.clearProgress();

      expect(Object.keys(usePractice.getState().progress).length).toBe(0);
      expect(usePractice.getState().history.length).toBe(0);
    });

    it('extracts candidate eliminations and digit placements from board cell diffs', () => {
      const initialCells = Array.from({ length: 81 }, () => ({
        value: 0,
        excluded: 0,
        corner: bit(1) | bit(4),
        center: 0
      }));

      const currentCells = Array.from({ length: 81 }, (_, i) => ({
        value: i === 10 ? 3 : 0,
        excluded: i === 9 ? bit(4) : 0,
        corner: i === 27 ? bit(1) : bit(1) | bit(4), // eliminated 4 from cell 27
        center: 0
      }));

      // auto-candidates mode diff
      const autoDeductions = extractBoardDeductions(initialCells, currentCells, true);
      expect(autoDeductions.eliminations).toEqual([{ cell: 9, digit: 4 }]);
      expect(autoDeductions.placements).toEqual([{ cell: 10, digit: 3 }]);

      // manual marks mode diff
      const manualDeductions = extractBoardDeductions(initialCells, currentCells, false);
      expect(manualDeductions.eliminations).toEqual([{ cell: 27, digit: 4 }]);
      expect(manualDeductions.placements).toEqual([{ cell: 10, digit: 3 }]);
    });

    it('synchronizes board note removals directly into practice verification without form submit', () => {
      const store = usePractice.getState();
      const initialCells = Array.from({ length: 81 }, () => ({
        value: 0,
        excluded: 0,
        corner: 0,
        center: 0
      }));

      store.startFocusedPractice('X_WING', mockXWingStep, [mockXWingStep], initialCells);

      // Player strikes out candidate 4 from cell 9 and cell 27 directly on the board
      const currentCells = Array.from({ length: 81 }, (_, i) => ({
        value: 0,
        excluded: (i === 9 || i === 27) ? bit(4) : 0,
        corner: 0,
        center: 0
      }));

      const result = store.syncBoardDeductions(currentCells, true);
      expect(result).not.toBeNull();
      expect(result?.isCorrect).toBe(true);
      expect(result?.status).toBe('exact');
      expect(result?.title).toContain('Spot on! Valid X-Wing');

      const state = usePractice.getState();
      expect(state.exerciseState).toBe('submitted');
      expect(state.lastResult?.isCorrect).toBe(true);
      expect(state.progress.X_WING?.successes).toBe(1);
    });
  });

  describe('5. Solving Engine Independence & Non-Mutation Invariant', () => {
    it('verifies that practice hints and verifier never mutate candidate state or board cells', () => {
      const g = emptyGrid();
      g.cands[0] = bit(1) | bit(4);
      g.cands[8] = bit(1) | bit(4);
      g.cands[18] = bit(4) | bit(7);
      g.cands[26] = bit(4) | bit(7);
      g.cands[9] = bit(4) | bit(9);

      const candsBefore = new Uint16Array(g.cands);
      const valuesBefore = new Uint8Array(g.values);

      // Build progressive hints
      buildProgressiveHints(mockXWingStep);

      // Verify answer
      verifyPracticeAnswer(
        { digit: 4, cells: [0, 8, 18, 26] },
        mockXWingStep,
        [mockXWingStep]
      );

      // Assert board arrays were not mutated in any way
      expect(g.cands).toEqual(candsBefore);
      expect(g.values).toEqual(valuesBefore);
    });
  });
});
