/**
 * Personal technique mastery settings, presets, and logic-aware visibility filters.
 *
 * Grounded in:
 * - docs/pattern-lab-project-brief.md (Section 2, Pillar 2: "My Techniques")
 * - docs/pattern-lab-roadmap.md (Phase 4: Personal Mastery & Knowledge Settings)
 */

import { Tech, TECHS } from '../engine/ratings';
import { IMPLEMENTED_TECHS, UNIMPLEMENTED_TECHS } from '../engine/scanner';
import { REASONING_CONCEPTS, ReasoningConceptId } from './concepts';

export type Familiarity = 'known' | 'learning' | 'unfamiliar';

export interface MasterySettings {
  /** Map of Tech to its familiarity status. */
  status: Partial<Record<Tech, Familiarity>>;
  /** Whether normal pattern scanning includes techniques marked as 'learning' (default: true). */
  includeLearning: boolean;
  /** Whether the user has chosen their starting preset or completed initial setup. */
  setupCompleted: boolean;
  /** Active preset ID if applied ('basics', 'intermediate', 'advanced', 'all_implemented', 'custom'). */
  activePreset?: string;
}

export interface MasteryPreset {
  id: string;
  name: string;
  description: string;
  techniques: Tech[];
}

export const BASICS_TECHS: Tech[] = [
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
  'HIDDEN_TRIPLE'
];

export const INTERMEDIATE_TECHS: Tech[] = [
  ...BASICS_TECHS,
  'NAKED_QUADRUPLE',
  'HIDDEN_QUADRUPLE',
  'X_WING',
  'SWORDFISH',
  'SKYSCRAPER',
  'TWO_STRING_KITE',
  'XY_WING',
  'SIMPLE_COLORS',
  'UNIQUENESS_1'
];

export const ADVANCED_TECHS: Tech[] = [
  ...INTERMEDIATE_TECHS,
  'JELLYFISH',
  'FINNED_X_WING',
  'SASHIMI_X_WING',
  'FINNED_SWORDFISH',
  'SASHIMI_SWORDFISH',
  'TURBOT_FISH',
  'EMPTY_RECTANGLE',
  'XYZ_WING',
  'W_WING',
  'WXYZ_WING',
  'MULTI_COLORS',
  'REMOTE_PAIR',
  'CHUTE_REMOTE_PAIR',
  'X_CHAIN',
  'XY_CHAIN',
  'ALS_XZ',
  'UNIQUENESS_2',
  'UNIQUENESS_3',
  'UNIQUENESS_4',
  'UNIQUENESS_5',
  'UNIQUENESS_6',
  'BUG_PLUS_1',
  'AVOIDABLE_RECTANGLE_1',
  'AVOIDABLE_RECTANGLE_2',
  'EXTENDED_RECTANGLE',
  'SUE_DE_COQ'
];

export const MASTERY_PRESETS: MasteryPreset[] = [
  {
    id: 'basics',
    name: 'Basics Only',
    description: 'Singles, line/box intersections, and naked/hidden pairs and triples.',
    techniques: BASICS_TECHS
  },
  {
    id: 'intermediate',
    name: 'Common Patterns (Recommended)',
    description: 'Basics plus classic X-Wing, Swordfish, Skyscrapers, 2-String Kites, XY-Wings, and Simple Colors.',
    techniques: INTERMEDIATE_TECHS
  },
  {
    id: 'advanced',
    name: 'Advanced & Chains',
    description: 'Common patterns plus Jellyfish, finned fish, XYZ/W-Wings, X/XY-Chains, and Uniqueness Rectangles.',
    techniques: ADVANCED_TECHS
  },
  {
    id: 'all_implemented',
    name: 'All Implemented',
    description: 'Every human technique currently implemented by the Pattern Lab engine (76 techniques).',
    techniques: IMPLEMENTED_TECHS
  },
  {
    id: 'blank',
    name: 'Custom (Start from Scratch)',
    description: 'Start with all techniques marked unfamiliar so you can hand-pick only what you know.',
    techniques: []
  }
];

export const DEFAULT_MASTERY_SETTINGS: MasterySettings = {
  status: {},
  includeLearning: true,
  setupCompleted: false,
  activePreset: 'intermediate'
};

const VALID_FAMILIARITIES = new Set<Familiarity>(['known', 'learning', 'unfamiliar']);

/** Sanitize and normalize potentially corrupted or outdated MasterySettings from localStorage */
export function sanitizeMasterySettings(raw: unknown): MasterySettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_MASTERY_SETTINGS, status: {} };
  }
  const obj = raw as Record<string, unknown>;
  const cleanStatus: Partial<Record<Tech, Familiarity>> = {};
  if (obj.status && typeof obj.status === 'object' && !Array.isArray(obj.status)) {
    for (const [k, v] of Object.entries(obj.status as Record<string, unknown>)) {
      if (
        Object.prototype.hasOwnProperty.call(TECHS, k) &&
        typeof v === 'string' &&
        VALID_FAMILIARITIES.has(v as Familiarity)
      ) {
        cleanStatus[k as Tech] = v as Familiarity;
      }
    }
  }
  return {
    status: cleanStatus,
    includeLearning: typeof obj.includeLearning === 'boolean' ? obj.includeLearning : true,
    setupCompleted: typeof obj.setupCompleted === 'boolean' ? obj.setupCompleted : false,
    activePreset: typeof obj.activePreset === 'string' ? obj.activePreset : 'intermediate'
  };
}

/** Get the effective familiarity of a technique. If unconfigured and setup not complete, defaults to preset. */
export function getFamiliarity(
  mastery: MasterySettings | undefined,
  tech: Tech
): Familiarity {
  if (!mastery || typeof mastery !== 'object') return 'unfamiliar';

  // Explicit status set by user
  if (mastery.status && typeof mastery.status === 'object') {
    const val = mastery.status[tech];
    if (val === 'known' || val === 'learning' || val === 'unfamiliar') {
      return val;
    }
  }

  // If user has not completed setup yet, use intermediate preset as initial baseline
  if (!mastery.setupCompleted) {
    return INTERMEDIATE_TECHS.includes(tech) ? 'known' : 'unfamiliar';
  }

  // Default for unset techniques
  return 'unfamiliar';
}

/**
 * Determine whether a technique should be visible in pattern scan results:
 * - In Discovery Mode: ALL detected implemented techniques are visible (unfamiliar marked with badges).
 * - In Normal Mode:
 *     - 'known' techniques are always visible.
 *     - 'learning' techniques are visible if includeLearning is true.
 *     - 'unfamiliar' techniques are hidden from normal view.
 */
export function isTechniqueVisibleInScan(
  mastery: MasterySettings | undefined,
  tech: Tech,
  discoveryMode: boolean
): boolean {
  if (!IMPLEMENTED_TECHS.includes(tech)) return false;
  if (discoveryMode) return true;
  const fam = getFamiliarity(mastery, tech);
  if (fam === 'known') return true;
  if (fam === 'learning') return mastery?.includeLearning !== false;
  return false;
}

/** Build status map for a given preset ID */
export function buildPresetStatus(presetId: string): Partial<Record<Tech, Familiarity>> {
  const preset = MASTERY_PRESETS.find((p) => p.id === presetId);
  const status: Partial<Record<Tech, Familiarity>> = {};

  if (!preset) return status;

  const knownSet = new Set(preset.techniques);
  for (const tech of IMPLEMENTED_TECHS) {
    status[tech] = knownSet.has(tech) ? 'known' : 'unfamiliar';
  }

  // Catalogue-only unimplemented techniques are always marked unfamiliar
  for (const tech of UNIMPLEMENTED_TECHS) {
    status[tech] = 'unfamiliar';
  }

  return status;
}

/** Compute mastery counts across implemented techniques */
export function countMasteryStats(mastery: MasterySettings | undefined): {
  knownCount: number;
  learningCount: number;
  unfamiliarCount: number;
  totalImplemented: number;
} {
  let knownCount = 0;
  let learningCount = 0;
  let unfamiliarCount = 0;

  for (const tech of IMPLEMENTED_TECHS) {
    const fam = getFamiliarity(mastery, tech);
    if (fam === 'known') knownCount++;
    else if (fam === 'learning') learningCount++;
    else unfamiliarCount++;
  }

  return {
    knownCount,
    learningCount,
    unfamiliarCount,
    totalImplemented: IMPLEMENTED_TECHS.length
  };
}
