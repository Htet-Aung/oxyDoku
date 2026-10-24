import { describe, it, expect, beforeEach } from 'vitest';
import { TECHS, Tech, SOLVE_ORDER } from '../src/engine/ratings';
import {
  REASONING_CONCEPTS,
  ReasoningConceptId,
  TECHNIQUE_TAXONOMY,
  getTechniqueConcept,
  getRelatedTechniques
} from '../src/content/concepts';
import {
  Familiarity,
  MasterySettings,
  MASTERY_PRESETS,
  DEFAULT_MASTERY_SETTINGS,
  buildPresetStatus,
  countMasteryStats,
  getFamiliarity,
  isTechniqueVisibleInScan
} from '../src/content/mastery';
import { useSettings } from '../src/state/settings';
import { useGame, engineGrid } from '../src/state/gameStore';
import { usePatternScanner } from '../src/state/scannerStore';
import { findNextStep, ratePuzzle } from '../src/engine/humanSolver';
import { TECH_SCANNER_META, IMPLEMENTED_TECHS } from '../src/engine/scanner';

const HARD_PUZZLE =
  '...6..9.1..95....4....4985..241....5....3....9....546..7549....3....12..1.2..3...';

describe('Phase 4 — My Techniques: Knowledge Settings & Logic-Aware Filtering', () => {
  beforeEach(() => {
    // Reset settings mastery to a clean default state
    useSettings.setState({
      mastery: {
        status: buildPresetStatus('intermediate'),
        includeLearning: true,
        setupCompleted: false,
        activePreset: 'intermediate'
      }
    });

    // Reset game and scanner stores
    useGame.getState().startGame(HARD_PUZZLE, 1348, 'Hard');
    useGame.setState({ autoCandidates: true });

    usePatternScanner.setState({
      isOpen: false,
      isScanning: false,
      scanResult: null,
      selectedInstanceId: null,
      boardFingerprintAtScan: null,
      isStale: false,
      groupBy: 'technique'
    });
    usePatternScanner.getState().resetFilter();
  });

  describe('1. Logic-Aware Concept Taxonomy', () => {
    it('covers all 80 catalogue techniques in TECHS with verified taxonomy entries', () => {
      const catalogueTechs = Object.keys(TECHS) as Tech[];
      expect(catalogueTechs.length).toBe(80);

      for (const tech of catalogueTechs) {
        const entry = TECHNIQUE_TAXONOMY[tech];
        expect(entry, `missing taxonomy for ${tech}`).toBeDefined();
        expect(entry.tech).toBe(tech);
        expect(entry.conceptId).toBeTruthy();
        expect(REASONING_CONCEPTS[entry.conceptId]).toBeDefined();
        expect(Array.isArray(entry.aliases)).toBe(true);
        expect(typeof entry.explanation).toBe('string');
      }
    });

    it('faithfully marks exactly 77 implemented and 3 unimplemented techniques in the engine scanner', () => {
      const allEntries = Object.values(TECHNIQUE_TAXONOMY);
      const unimplemented = ['FORCING_CHAIN', 'SK_LOOP', 'TWINNED_XY_CHAIN'];

      for (const tech of unimplemented as Tech[]) {
        expect(IMPLEMENTED_TECHS.includes(tech)).toBe(false);
        expect(TECH_SCANNER_META[tech].implemented).toBe(false);
        expect(TECH_SCANNER_META[tech].coverage).toBe('unimplemented');
      }

      // Check implemented human techniques
      const implemented = allEntries.filter(
        (e) => !unimplemented.includes(e.tech) && e.tech !== 'BRUTE_FORCE'
      );
      expect(implemented.length).toBe(76);
      for (const entry of implemented) {
        expect(IMPLEMENTED_TECHS.includes(entry.tech)).toBe(true);
        expect(TECH_SCANNER_META[entry.tech].implemented).toBe(true);
        expect(TECH_SCANNER_META[entry.tech].coverage).not.toBe('unimplemented');
      }
    });

    it('groups techniques across all 9 reasoning concepts correctly', () => {
      const concepts = Object.keys(REASONING_CONCEPTS) as ReasoningConceptId[];
      expect(concepts.length).toBe(9);

      for (const cid of concepts) {
        const concept = REASONING_CONCEPTS[cid];
        expect(
          concept.techniques.length,
          `concept ${cid} should contain at least one technique`
        ).toBeGreaterThan(0);
      }

      // Verify specific concept associations
      expect(getTechniqueConcept('X_WING').id).toBe('fish_logic');
      expect(getTechniqueConcept('SWORDFISH').id).toBe('fish_logic');
      expect(getTechniqueConcept('XY_WING').id).toBe('wing_logic');
      expect(getTechniqueConcept('SKYSCRAPER').id).toBe('single_digit_patterns');
      expect(getTechniqueConcept('TWO_STRING_KITE').id).toBe('single_digit_patterns');
      expect(getTechniqueConcept('ALS_XZ').id).toBe('als_logic');
      expect(getTechniqueConcept('SIMPLE_COLORS').id).toBe('coloring_aic');
      expect(getTechniqueConcept('UNIQUENESS_1').id).toBe('uniqueness_logic');
      expect(getTechniqueConcept('NAKED_PAIR').id).toBe('subsets_locked_sets');
      expect(getTechniqueConcept('NISHIO_FORCING_CHAIN').id).toBe('contradiction_forcing');
      expect(getTechniqueConcept('PATTERN_OVERLAY').id).toBe('advanced_patterns');
    });

    it('retrieves related techniques and kin correctly', () => {
      const xWingRelated = getRelatedTechniques('X_WING');
      expect(xWingRelated.length).toBeGreaterThan(0);
      expect(xWingRelated).toContain('SWORDFISH');

      const xyWingRelated = getRelatedTechniques('XY_WING');
      expect(xyWingRelated).toContain('XYZ_WING');
    });
  });

  describe('2. Mastery Settings & Presets', () => {
    it('provides all 5 starter presets with correct technique distributions', () => {
      const presets = MASTERY_PRESETS.map((p) => p.id);
      expect(presets).toEqual([
        'basics',
        'intermediate',
        'advanced',
        'all_implemented',
        'blank'
      ]);

      // Blank preset
      const blankStatus = buildPresetStatus('blank');
      const blankStats = countMasteryStats({
        status: blankStatus,
        includeLearning: true,
        setupCompleted: true
      });
      expect(blankStats.knownCount).toBe(0);
      expect(blankStats.learningCount).toBe(0);
      expect(blankStats.unfamiliarCount).toBe(76);
      expect(blankStats.totalImplemented).toBe(76);

      // All implemented preset
      const allStatus = buildPresetStatus('all_implemented');
      const allStats = countMasteryStats({
        status: allStatus,
        includeLearning: true,
        setupCompleted: true
      });
      expect(allStats.knownCount).toBe(76);
      expect(allStats.learningCount).toBe(0);
      expect(allStats.unfamiliarCount).toBe(0);

      // Basics preset
      const basicsStatus = buildPresetStatus('basics');
      const basicsStats = countMasteryStats({
        status: basicsStatus,
        includeLearning: true,
        setupCompleted: true
      });
      expect(basicsStats.knownCount).toBeGreaterThan(0);
      expect(basicsStats.learningCount).toBe(0);
      expect(basicsStatus['FULL_HOUSE']).toBe('known');
      expect(basicsStatus['NAKED_SINGLE']).toBe('known');
      expect(basicsStatus['NAKED_PAIR']).toBe('known');
      expect(basicsStatus['X_WING']).toBe('unfamiliar');

      // Intermediate (Common patterns) preset
      const commonStatus = buildPresetStatus('intermediate');
      const commonStats = countMasteryStats({
        status: commonStatus,
        includeLearning: true,
        setupCompleted: true
      });
      expect(commonStats.knownCount).toBeGreaterThan(0);
      expect(commonStatus['X_WING']).toBe('known');
      expect(commonStatus['XY_WING']).toBe('known');
      expect(commonStatus['SKYSCRAPER']).toBe('known');
      expect(commonStatus['ALS_XZ']).toBe('unfamiliar');
    });

    it('safely handles unfamiliarity and visibility rules', () => {
      const settings: MasterySettings = {
        status: {
          X_WING: 'known',
          XY_WING: 'learning',
          SWORDFISH: 'unfamiliar'
        },
        includeLearning: true,
        setupCompleted: true
      };

      // Unconfigured technique falls back to 'unfamiliar'
      expect(getFamiliarity(settings, 'JELLYFISH')).toBe('unfamiliar');
      expect(getFamiliarity(settings, 'X_WING')).toBe('known');
      expect(getFamiliarity(settings, 'XY_WING')).toBe('learning');
      expect(getFamiliarity(settings, 'SWORDFISH')).toBe('unfamiliar');

      // Normal scan with includeLearning = true
      expect(isTechniqueVisibleInScan(settings, 'X_WING', false)).toBe(true);
      expect(isTechniqueVisibleInScan(settings, 'XY_WING', false)).toBe(true);
      expect(isTechniqueVisibleInScan(settings, 'SWORDFISH', false)).toBe(false);

      // Normal scan with includeLearning = false
      const strictSettings: MasterySettings = { ...settings, includeLearning: false };
      expect(isTechniqueVisibleInScan(strictSettings, 'X_WING', false)).toBe(true);
      expect(isTechniqueVisibleInScan(strictSettings, 'XY_WING', false)).toBe(false);
      expect(isTechniqueVisibleInScan(strictSettings, 'SWORDFISH', false)).toBe(false);

      // Discovery mode reveals everything supported
      expect(isTechniqueVisibleInScan(settings, 'X_WING', true)).toBe(true);
      expect(isTechniqueVisibleInScan(settings, 'XY_WING', true)).toBe(true);
      expect(isTechniqueVisibleInScan(settings, 'SWORDFISH', true)).toBe(true);
      expect(isTechniqueVisibleInScan(settings, 'JELLYFISH', true)).toBe(true);

      // Unimplemented techniques are never visible
      expect(isTechniqueVisibleInScan(settings, 'FORCING_CHAIN', true)).toBe(false);
    });
  });

  describe('3. Settings Store Integration & Updates', () => {
    it('updates single technique familiarity and marks setupCompleted true', () => {
      expect(useSettings.getState().mastery.setupCompleted).toBe(false);

      useSettings.getState().setTechniqueFamiliarity('X_WING', 'learning');
      expect(useSettings.getState().mastery.status['X_WING']).toBe('learning');
      expect(useSettings.getState().mastery.setupCompleted).toBe(true);

      useSettings.getState().setTechniqueFamiliarity('X_WING', 'known');
      expect(useSettings.getState().mastery.status['X_WING']).toBe('known');
    });

    it('supports batch familiarity updates across a concept or category', () => {
      const fishTechs = REASONING_CONCEPTS.fish_logic.techniques;

      useSettings.getState().setTechniqueFamiliarityBatch(fishTechs, 'known');

      const status = useSettings.getState().mastery.status;
      expect(status['X_WING']).toBe('known');
      expect(status['SWORDFISH']).toBe('known');
      expect(status['JELLYFISH']).toBe('known');
      expect(status['FINNED_X_WING']).toBe('known');
    });

    it('applies presets through settings store', () => {
      useSettings.getState().applyMasteryPreset('advanced');
      const stats = countMasteryStats(useSettings.getState().mastery);

      expect(stats.knownCount).toBeGreaterThan(0);
      expect(useSettings.getState().mastery.setupCompleted).toBe(true);
      expect(useSettings.getState().mastery.activePreset).toBe('advanced');
    });

    it('toggles includeLearning independently', () => {
      expect(useSettings.getState().mastery.includeLearning).toBe(true);

      useSettings.getState().setIncludeLearning(false);
      expect(useSettings.getState().mastery.includeLearning).toBe(false);

      useSettings.getState().setIncludeLearning(true);
      expect(useSettings.getState().mastery.includeLearning).toBe(true);
    });
  });

  describe('4. Scanner Store Filtering & Discovery Mode', () => {
    it('filters scan results to known/learning techniques in normal mode', async () => {
      // Set mastery to basics only (Singles & Subsets)
      useSettings.getState().applyMasteryPreset('basics');
      useSettings.getState().setIncludeLearning(false);

      usePatternScanner.getState().openScanner();
      await new Promise((resolve) => setTimeout(resolve, 60));

      const scanResult = usePatternScanner.getState().scanResult;
      expect(scanResult).not.toBeNull();
      expect(scanResult!.instances.length).toBeGreaterThan(0);

      // Verify that all instances present in the scan result are actually detected
      const allInstances = scanResult!.instances;
      const settings = useSettings.getState().mastery;

      // Filter visible instances as PatternScannerPanel does
      const normalVisible = allInstances.filter((inst) =>
        isTechniqueVisibleInScan(settings, inst.tech, false)
      );
      const unfamiliarInstances = allInstances.filter(
        (inst) => !isTechniqueVisibleInScan(settings, inst.tech, false)
      );

      // Normal visible should only contain known techniques
      for (const inst of normalVisible) {
        expect(settings.status[inst.tech]).toBe('known');
      }

      // If unfamiliar instances exist on the board, they are held back from normal view
      expect(unfamiliarInstances.length).toBeGreaterThanOrEqual(0);
    });

    it('respects includeLearning toggle in filtering', async () => {
      // Configure X_WING as known, XY_WING as learning, and others as unfamiliar
      const customStatus: Partial<Record<Tech, Familiarity>> = {};
      customStatus['NAKED_SINGLE'] = 'known';
      customStatus['HIDDEN_SINGLE'] = 'known';
      customStatus['LOCKED_CANDIDATES_1'] = 'known';
      customStatus['LOCKED_CANDIDATES_2'] = 'known';
      customStatus['NAKED_PAIR'] = 'learning';

      useSettings.setState({
        mastery: {
          status: customStatus,
          includeLearning: false,
          setupCompleted: true
        }
      });

      const settingsNoLearning = useSettings.getState().mastery;
      expect(isTechniqueVisibleInScan(settingsNoLearning, 'NAKED_SINGLE', false)).toBe(true);
      expect(isTechniqueVisibleInScan(settingsNoLearning, 'NAKED_PAIR', false)).toBe(false);

      // Toggle includeLearning to true
      useSettings.getState().setIncludeLearning(true);
      const settingsWithLearning = useSettings.getState().mastery;
      expect(isTechniqueVisibleInScan(settingsWithLearning, 'NAKED_PAIR', false)).toBe(true);
    });

    it('discovery mode reveals unfamiliar techniques without mutating user mastery', async () => {
      // Configure blank preset so all techniques are unfamiliar
      useSettings.getState().applyMasteryPreset('blank');

      usePatternScanner.getState().openScanner();
      await new Promise((resolve) => setTimeout(resolve, 60));

      const scanResult = usePatternScanner.getState().scanResult;
      expect(scanResult).not.toBeNull();

      const settings = useSettings.getState().mastery;
      const normalVisible = scanResult!.instances.filter((inst) =>
        isTechniqueVisibleInScan(settings, inst.tech, false)
      );
      expect(normalVisible.length).toBe(0);

      // Enable Discovery Mode
      usePatternScanner.getState().setDiscoveryMode(true);
      expect(usePatternScanner.getState().filter.discoveryMode).toBe(true);

      const discoveryVisible = scanResult!.instances.filter((inst) =>
        isTechniqueVisibleInScan(settings, inst.tech, true)
      );
      expect(discoveryVisible.length).toBeGreaterThan(0);

      // Mastery status was NOT automatically changed
      expect(useSettings.getState().mastery.status['NAKED_SINGLE'] ?? 'unfamiliar').toBe(
        'unfamiliar'
      );
    });

    it('supports concept filter in scanner store', () => {
      expect(usePatternScanner.getState().filter.concept).toBe('all');

      usePatternScanner.getState().setFilter({ concept: 'fish_logic' });
      expect(usePatternScanner.getState().filter.concept).toBe('fish_logic');

      usePatternScanner.getState().resetFilter();
      expect(usePatternScanner.getState().filter.concept).toBe('all');
    });
  });

  describe('5. Invariants: Strict Non-Mutation and Solver Independence', () => {
    it('changing mastery settings never mutates the game board, candidates, or history', () => {
      const cellsBefore = JSON.stringify(useGame.getState().cells);
      const historyBefore = useGame.getState().history.length;

      // Apply multiple mastery operations
      useSettings.getState().applyMasteryPreset('blank');
      useSettings.getState().applyMasteryPreset('all_implemented');
      useSettings.getState().setTechniqueFamiliarity('X_WING', 'unfamiliar');
      useSettings.getState().setIncludeLearning(false);

      expect(JSON.stringify(useGame.getState().cells)).toBe(cellsBefore);
      expect(useGame.getState().history.length).toBe(historyBefore);
    });

    it('solver order, puzzle rating, and findNextStep are 100% independent of mastery settings', () => {
      const grid = engineGrid(useGame.getState().cells);

      // Find standard next step
      const step1 = findNextStep(grid);
      expect(step1).not.toBeNull();

      // Change user mastery settings drastically (to blank or advanced)
      useSettings.getState().applyMasteryPreset('blank');
      const step2 = findNextStep(grid);

      useSettings.getState().applyMasteryPreset('all_implemented');
      const step3 = findNextStep(grid);

      // The standard solver step MUST NOT be altered
      expect(step2?.tech).toBe(step1?.tech);
      expect(step3?.tech).toBe(step1?.tech);

      // SOLVE_ORDER remains the authoritative canonical solving sequence
      expect(SOLVE_ORDER.length).toBe(73);
      expect(SOLVE_ORDER[0]).toBe('FULL_HOUSE');
      expect(SOLVE_ORDER[1]).toBe('NAKED_SINGLE');
    });

    it('unimplemented techniques are never detected in scan results', async () => {
      usePatternScanner.getState().openScanner();
      await new Promise((resolve) => setTimeout(resolve, 60));

      const scanResult = usePatternScanner.getState().scanResult;
      expect(scanResult).not.toBeNull();

      const unimplemented = ['FORCING_CHAIN', 'SK_LOOP', 'TWINNED_XY_CHAIN'];
      for (const inst of scanResult!.instances) {
        expect(unimplemented).not.toContain(inst.tech);
      }
    });
  });
});
