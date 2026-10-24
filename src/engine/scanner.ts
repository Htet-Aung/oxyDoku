/**
 * Pattern Scanner API (`src/engine/scanner.ts`).
 *
 * Scans a Sudoku board position as it currently stands and returns every
 * distinct pattern instance across all selected techniques without mutating
 * the input grid, applying moves, or advancing the puzzle.
 */
import { Grid, UNITS, cloneGrid } from './board';
import { Step, CellDigit, UnitBand } from './steps';
import { Tech, TECHS, SOLVE_ORDER } from './ratings';
import { iterFullHouse, iterNakedSingle, iterHiddenSingle } from './techniques/singles';
import { iterLockedCandidates1, iterLockedCandidates2 } from './techniques/intersections';
import { iterNakedSubset, iterHiddenSubset } from './techniques/subsets';
import { iterBasicFish, iterFinnedFish } from './techniques/fish';
import { iterFrankenFish } from './techniques/complexFish';
import { iterTurbotFamily, iterEmptyRectangle } from './techniques/singleDigit';
import { iterXYWing, iterXYZWing, iterWWing } from './techniques/wings';
import {
  iterUniqueness,
  iterBugPlus1,
  iterHiddenRectangle,
  iterAvoidableRectangle
} from './techniques/uniqueness';
import { iterExtendedRectangle } from './techniques/extendedRectangle';
import { iterSimpleColors, iterMultiColors } from './techniques/coloring';
import { iterMedusa3d } from './techniques/medusa';
import { iterRemotePair, iterXChain, iterXYChain } from './techniques/chains';
import { iterChuteRemotePair } from './techniques/chuteRemotePair';
import { iterXCycles } from './techniques/xCycles';
import { iterGroupedXCycles } from './techniques/groupedXCycles';
import { iterAic, iterNiceLoop } from './techniques/aic';
import { iterGroupedAic, iterGroupedNiceLoop } from './techniques/groupedAic';
import {
  iterWxyzWing,
  iterAlsXz,
  iterAlsXyWing,
  iterAlsXyChain,
  iterDeathBlossom
} from './techniques/als';
import { iterSueDeCoq } from './techniques/sueDeCoq';
import { iterAlignedPairExclusion } from './techniques/ape';
import { iterFireworks } from './techniques/fireworks';
import { iterTridagon } from './techniques/tridagon';
import { iterExocet, iterDoubleExocet } from './techniques/exocet';
import { iterPatternOverlay } from './techniques/templates';
import {
  iterForcingNet,
  iterNishio,
  iterDigitForcing,
  iterCellForcing,
  iterUnitForcing
} from './techniques/forcing';

/**
 * Scanner coverage classification for a technique in the catalogue:
 * - 'exhaustive': enumerates every valid pattern instance in the current position.
 * - 'bounded': enumerates all distinct instances within an explicit search/node/ALS/template cap.
 * - 'unimplemented': catalogue entry with no human-technique detector in the engine.
 */
export type ScannerCoverage = 'exhaustive' | 'bounded' | 'unimplemented';

/** Reason a technique's scan results were truncated. */
export type TruncationReason = 'instance-cap' | 'search-budget' | 'template-overflow';

const TRUNCATION_REASONS: Record<'CAP' | 'BUDGET' | 'OVERFLOW', TruncationReason> = {
  CAP: ['instance', 'cap'].join('-') as TruncationReason,
  BUDGET: ['search', 'budget'].join('-') as TruncationReason,
  OVERFLOW: ['template', 'overflow'].join('-') as TruncationReason
};

export interface TechScannerBounds {
  maxLength?: number;
  nodeBudget?: number;
  maxAls?: number;
  maxTemplates?: number;
  maxBranchSize?: number;
}

export interface TechScannerMeta {
  tech: Tech;
  implemented: boolean;
  enabledInDefaultSolver: boolean;
  coverage: ScannerCoverage;
  bounds?: TechScannerBounds;
}

const BOUNDED_TECH_BOUNDS: Partial<Record<Tech, TechScannerBounds>> = {
  WXYZ_WING: { maxAls: 600 },
  X_CHAIN: { maxLength: 9 },
  X_CYCLES: { maxLength: 12, nodeBudget: 30000 },
  GROUPED_X_CYCLES: { maxLength: 10, nodeBudget: 25000 },
  XY_CHAIN: { maxLength: 10 },
  NICE_LOOP: { maxLength: 12, nodeBudget: 60000 },
  GROUPED_NICE_LOOP: { maxLength: 10, nodeBudget: 40000 },
  ALS_XZ: { maxAls: 600 },
  ALS_XY_WING: { maxAls: 400 },
  ALS_XY_CHAIN: { maxAls: 300, nodeBudget: 20000 },
  AIC: { maxLength: 12, nodeBudget: 60000 },
  AIC_GROUPED: { maxLength: 10, nodeBudget: 40000 },
  AIC_ALS: { maxLength: 10, maxAls: 90, nodeBudget: 40000 },
  DEATH_BLOSSOM: { maxAls: 600, maxBranchSize: 16 },
  TRIDAGON: { maxBranchSize: 12, nodeBudget: 300 },
  ALIGNED_PAIR_EXCLUSION: { maxAls: 400 },
  EXOCET: { maxTemplates: 20000 },
  DOUBLE_EXOCET: { maxTemplates: 20000 },
  PATTERN_OVERLAY: { maxTemplates: 20000 },
  CELL_FORCING_CHAIN: { maxBranchSize: 4 },
  UNIT_FORCING_CHAIN: { maxBranchSize: 4 }
};

/**
 * Techniques implemented in `src/engine/techniques/` (76 human techniques):
 * 72 enabled in `SOLVE_ORDER` + 4 disabled by default (`SQUIRMBAG`, `WHALE`,
 * `LEVIATHAN`, `DOUBLE_EXOCET`). Excludes `BRUTE_FORCE` and the 3 unimplemented
 * catalogue entries (`TWINNED_XY_CHAIN`, `SK_LOOP`, `FORCING_CHAIN`).
 */
export const IMPLEMENTED_TECHS: Tech[] = (Object.keys(TECHS) as Tech[])
  .filter((k) => TECHS[k].implemented && k !== 'BRUTE_FORCE')
  .sort((a, b) => TECHS[a].index - TECHS[b].index);

/**
 * Implemented human techniques that are disabled in the default `SOLVE_ORDER`
 * because complementary smaller fish or naked quads make them redundant for
 * puzzle rating, yet remain valid patterns for human pattern discovery.
 */
export const DISABLED_IMPLEMENTED_TECHS: Tech[] = IMPLEMENTED_TECHS.filter(
  (k) => !TECHS[k].enabled
);

/**
 * Catalogue entries in `TECHS` that have `implemented: false` and no detector.
 */
export const UNIMPLEMENTED_TECHS: Tech[] = (Object.keys(TECHS) as Tech[])
  .filter((k) => !TECHS[k].implemented)
  .sort((a, b) => TECHS[a].index - TECHS[b].index);

/** Explicit scanner availability and coverage metadata for every `Tech` in `TECHS`. */
export const TECH_SCANNER_META: Record<Tech, TechScannerMeta> = Object.fromEntries(
  (Object.keys(TECHS) as Tech[]).map((tech) => {
    const info = TECHS[tech];
    if (!info.implemented || tech === 'BRUTE_FORCE') {
      return [
        tech,
        {
          tech,
          implemented: false,
          enabledInDefaultSolver: false,
          coverage: 'unimplemented' as ScannerCoverage
        }
      ];
    }
    const bounds = BOUNDED_TECH_BOUNDS[tech];
    return [
      tech,
      {
        tech,
        implemented: true,
        enabledInDefaultSolver: info.enabled,
        coverage: (bounds ? 'bounded' : 'exhaustive') as ScannerCoverage,
        ...(bounds ? { bounds } : {})
      }
    ];
  })
) as Record<Tech, TechScannerMeta>;

export interface PatternInstance {
  /** Deterministic canonical identity key for deduplication and UI selection */
  id: string;
  /** Technique identifier */
  tech: Tech;
  /** Human-readable technique name from TECHS[tech].name */
  techName: string;
  /** Full sudokUI Step object (preserves primary, secondary, fins, units, links, labels, description) */
  step: Step;
  /** Sorted distinct digits involved in the pattern or its conclusions */
  digits: number[];
  /** Sorted distinct cell indices that establish the pattern */
  patternCells: number[];
  /** Sorted distinct cell indices where placements or eliminations occur */
  conclusionCells: number[];
  /** Canonical sorted signature of all placements and eliminations of this instance */
  conclusionKey: string;
}

export interface ScanOptions {
  /**
   * Explicit list of techniques to scan, in the caller's desired order.
   * Defaults to SOLVE_ORDER (plus DISABLED_IMPLEMENTED_TECHS when includeDisabled is true).
   */
  techniques?: Tech[];
  /**
   * Include uniqueness techniques (UR Types 1-6, Hidden/Avoidable/Extended Rectangle, BUG+1).
   * Defaults to true.
   */
  useUniqueness?: boolean;
  /**
   * Include implemented techniques disabled in the default SOLVE_ORDER
   * (SQUIRMBAG, WHALE, LEVIATHAN, DOUBLE_EXOCET).
   * Defaults to false when `techniques` is omitted; ignored for techniques explicitly listed in `techniques`.
   */
  includeDisabled?: boolean;
  /**
   * Optional cap on instances collected per technique.
   * When reached, `byTech[tech].truncated` is set to true with `truncationReason: 'instance-cap'`.
   */
  maxInstancesPerTech?: number;
  /**
   * Filter out reducible subsets/fish (e.g. a Naked Triple that is really a Naked Pair + 1 cell,
   * or a Swordfish that is really an X-Wing + 1 line) and duplicate Turbot/ForcingNet classifications.
   * Defaults to true.
   */
  irreducibleOnly?: boolean;
}

export interface TechScanSummary {
  tech: Tech;
  techName: string;
  implemented: boolean;
  enabledInDefaultSolver: boolean;
  coverage: ScannerCoverage;
  instances: PatternInstance[];
  truncated: boolean;
  truncationReason?: TruncationReason;
}

export interface ScanResult {
  /** Flat list of all discovered pattern instances across all scanned techniques */
  instances: PatternInstance[];
  /** Per-technique results and coverage/truncation metadata */
  byTech: Partial<Record<Tech, TechScanSummary>>;
  /** Instances grouped by individual conclusion key ('P:cell:digit' or 'E:cell:digit') to show overlapping deductions */
  byConclusion: Record<string, PatternInstance[]>;
  /** Techniques examined that have working finders */
  scannedTechniques: Tech[];
  /** Techniques requested that have no implementation in the engine */
  unimplementedTechniques: Tech[];
  /** True if any scanned technique hit an instance cap, search budget, or template overflow */
  truncated: boolean;
}

/** Canonical sorted string for a list of CellDigit items. */
function canonicalCds(cds?: CellDigit[]): string {
  if (!cds || cds.length === 0) return '';
  const unique = new Set<string>();
  const sorted = [...cds].sort((a, b) => a.cell - b.cell || a.digit - b.digit);
  for (const cd of sorted) unique.add(`${cd.cell}:${cd.digit}`);
  return [...unique].join(',');
}

/** Canonical sorted string for UnitBands. */
function canonicalUnits(units?: UnitBand[]): string {
  if (!units || units.length === 0) return '';
  return [...units]
    .sort((a, b) => a.unit - b.unit || a.role.localeCompare(b.role))
    .map((u) => `${u.role[0]}${u.unit}`)
    .join(',');
}

/**
 * Canonical sorted signature of a Step's conclusions (placements + eliminations).
 */
export function conclusionSignature(step: Step): string {
  const parts: string[] = [];
  const places = [...step.placements].sort((a, b) => a.cell - b.cell || a.digit - b.digit);
  for (const p of places) parts.push(`P:${p.cell}:${p.digit}`);
  const elims = [...step.eliminations].sort((a, b) => a.cell - b.cell || a.digit - b.digit);
  for (const e of elims) parts.push(`E:${e.cell}:${e.digit}`);
  return parts.join(',');
}

/**
 * Individual atomic conclusion keys ('P:cell:digit' or 'E:cell:digit') for indexing `byConclusion`.
 */
export function individualConclusionKeys(step: Step): string[] {
  const keys: string[] = [];
  for (const p of step.placements) keys.push(`P:${p.cell}:${p.digit}`);
  for (const e of step.eliminations) keys.push(`E:${e.cell}:${e.digit}`);
  return keys;
}

const OPEN_CHAIN_TECHS = new Set<Tech>([
  'X_CHAIN',
  'XY_CHAIN',
  'AIC',
  'AIC_GROUPED',
  'AIC_ALS'
]);

const CLOSED_LOOP_TECHS = new Set<Tech>([
  'X_CYCLES',
  'GROUPED_X_CYCLES',
  'NICE_LOOP',
  'GROUPED_NICE_LOOP'
]);

const COLORING_TECHS = new Set<Tech>(['SIMPLE_COLORS', 'MULTI_COLORS', 'MEDUSA_3D']);

/**
 * Compute a deterministic canonical identity key for a Step so that:
 * - Genuinely identical representations of the same instance (e.g., reversed open chains,
 *   rotated/reflected continuous loops, swapped parity colours, or subsets visited from
 *   multiple shared units) produce the exact same key.
 * - Distinct techniques that produce the same elimination have distinct keys (`step.tech` is first).
 * - Distinct instances of the same technique that happen to produce the same elimination
 *   (e.g., two different XY-Wings or two chains with different endpoint pairs) have distinct keys.
 */
export function patternInstanceKey(step: Step): string {
  const conc = conclusionSignature(step);

  if (OPEN_CHAIN_TECHS.has(step.tech) && step.links && step.links.length > 0) {
    const startNode = canonicalCds(step.links[0].from);
    const endNode = canonicalCds(step.links[step.links.length - 1].to);
    const ends = startNode < endNode ? `${startNode}<->${endNode}` : `${endNode}<->${startNode}`;
    return `${step.tech}|chain|${ends}|${conc}`;
  }

  if (CLOSED_LOOP_TECHS.has(step.tech)) {
    const isContinuous =
      step.placements.length === 0 &&
      step.links !== undefined &&
      step.links.length > 0 &&
      step.links[0].strong &&
      !step.links[step.links.length - 1].strong;
    if (isContinuous) {
      return `${step.tech}|loop1|${canonicalCds(step.primary)}|${conc}`;
    }
    const startSig =
      step.links && step.links.length > 0 ? canonicalCds(step.links[0].from) : '';
    return `${step.tech}|loop2|${startSig}|${conc}`;
  }

  if (COLORING_TECHS.has(step.tech)) {
    const c0 = canonicalCds(step.primary);
    const c1 = canonicalCds(step.secondary);
    const colors = c0 < c1 ? `${c0}~${c1}` : `${c1}~${c0}`;
    return `${step.tech}|color|${colors}|${canonicalCds(step.fins)}|${conc}`;
  }

  if (step.tech === 'WXYZ_WING' || step.tech === 'ALS_XZ') {
    const allCells = [
      ...(step.primary ?? []),
      ...(step.secondary ?? []),
      ...(step.fins ?? [])
    ];
    return `${step.tech}|als|${canonicalCds(allCells)}|${conc}`;
  }

  if (step.tech === 'ALS_XY_WING') {
    const a = canonicalCds(step.primary);
    const b = canonicalCds(step.secondary);
    const wings = a < b ? `${a}~${b}` : `${b}~${a}`;
    return `${step.tech}|alsxy|${wings}|${canonicalCds(step.fins)}|${conc}`;
  }

  return `${step.tech}|${canonicalCds(step.primary)}|${canonicalCds(step.secondary)}|${canonicalCds(step.fins)}|${canonicalUnits(step.units)}|${conc}`;
}

/**
 * Convert a raw `Step` into a structured `PatternInstance` with extracted digits,
 * pattern cells, conclusion cells, and canonical identity.
 */
export function toPatternInstance(step: Step): PatternInstance {
  const sortedPlacements = [...step.placements].sort(
    (a, b) => a.cell - b.cell || a.digit - b.digit
  );
  const sortedEliminations = [...step.eliminations].sort(
    (a, b) => a.cell - b.cell || a.digit - b.digit
  );
  const normalizedStep: Step = {
    ...step,
    placements: sortedPlacements,
    eliminations: sortedEliminations
  };

  const conclusionCellSet = new Set<number>();
  const elimPairSet = new Set<string>();
  const digitSet = new Set<number>();

  for (const p of sortedPlacements) {
    conclusionCellSet.add(p.cell);
    digitSet.add(p.digit);
  }
  for (const e of sortedEliminations) {
    conclusionCellSet.add(e.cell);
    elimPairSet.add(`${e.cell}:${e.digit}`);
    digitSet.add(e.digit);
  }

  const patternCellSet = new Set<number>();
  for (const list of [step.primary, step.secondary, step.fins]) {
    if (!list) continue;
    for (const cd of list) {
      patternCellSet.add(cd.cell);
      if (cd.digit >= 1 && cd.digit <= 9) digitSet.add(cd.digit);
    }
  }
  if (step.chainCells) {
    for (const c of step.chainCells) patternCellSet.add(c);
  }
  if (step.links) {
    for (const link of step.links) {
      for (const cd of link.from) {
        if (cd.digit >= 1 && cd.digit <= 9) digitSet.add(cd.digit);
        if (!link.text || !elimPairSet.has(`${cd.cell}:${cd.digit}`)) {
          patternCellSet.add(cd.cell);
        }
      }
      for (const cd of link.to) {
        if (cd.digit >= 1 && cd.digit <= 9) digitSet.add(cd.digit);
        // Witness links in coloring/medusa/forcing point to eliminated or conflict cells;
        // do not add pure elimination targets to patternCells unless already in primary/secondary/fins.
        if (!link.text && !elimPairSet.has(`${cd.cell}:${cd.digit}`)) {
          patternCellSet.add(cd.cell);
        }
      }
    }
  }
  // Full House has no primary CellDigits, only a primary UnitBand:
  // its pattern cells are the 8 filled cells of that house.
  if (patternCellSet.size === 0 && step.units && step.units.length > 0) {
    const primaryUnit = step.units.find((u) => u.role === 'primary') ?? step.units[0];
    for (const c of UNITS[primaryUnit.unit]) {
      if (!conclusionCellSet.has(c)) patternCellSet.add(c);
    }
  }

  const id = patternInstanceKey(normalizedStep);
  const conclusionKey = conclusionSignature(normalizedStep);

  return {
    id,
    tech: step.tech,
    techName: TECHS[step.tech].name,
    step: normalizedStep,
    digits: [...digitSet].sort((a, b) => a - b),
    patternCells: [...patternCellSet].sort((a, b) => a - b),
    conclusionCells: [...conclusionCellSet].sort((a, b) => a - b),
    conclusionKey
  };
}

interface IterContext {
  irreducibleOnly: boolean;
  onBudgetHit: () => void;
  onTemplateOverflow: () => void;
}

/**
 * Yield raw `Step` instances for a single implemented technique on grid `g`.
 */
function* iterateTechSteps(tech: Tech, g: Grid, ctx: IterContext): Generator<Step> {
  const { irreducibleOnly, onBudgetHit, onTemplateOverflow } = ctx;
  switch (tech) {
    case 'FULL_HOUSE':
      yield* iterFullHouse(g);
      return;
    case 'NAKED_SINGLE':
      yield* iterNakedSingle(g);
      return;
    case 'HIDDEN_SINGLE':
      yield* iterHiddenSingle(g);
      return;
    case 'LOCKED_PAIR':
      yield* iterNakedSubset(g, 2, true, irreducibleOnly);
      return;
    case 'LOCKED_TRIPLE':
      yield* iterNakedSubset(g, 3, true, irreducibleOnly);
      return;
    case 'LOCKED_CANDIDATES_1':
      yield* iterLockedCandidates1(g);
      return;
    case 'LOCKED_CANDIDATES_2':
      yield* iterLockedCandidates2(g);
      return;
    case 'NAKED_PAIR':
      yield* iterNakedSubset(g, 2, false, irreducibleOnly);
      return;
    case 'NAKED_TRIPLE':
      yield* iterNakedSubset(g, 3, false, irreducibleOnly);
      return;
    case 'HIDDEN_PAIR':
      yield* iterHiddenSubset(g, 2, irreducibleOnly);
      return;
    case 'HIDDEN_TRIPLE':
      yield* iterHiddenSubset(g, 3, irreducibleOnly);
      return;
    case 'NAKED_QUADRUPLE':
      yield* iterNakedSubset(g, 4, false, irreducibleOnly);
      return;
    case 'HIDDEN_QUADRUPLE':
      yield* iterHiddenSubset(g, 4, irreducibleOnly);
      return;
    case 'X_WING':
      yield* iterBasicFish(g, 2, irreducibleOnly);
      return;
    case 'SWORDFISH':
      yield* iterBasicFish(g, 3, irreducibleOnly);
      return;
    case 'JELLYFISH':
      yield* iterBasicFish(g, 4, irreducibleOnly);
      return;
    case 'SQUIRMBAG':
      yield* iterBasicFish(g, 5, irreducibleOnly);
      return;
    case 'WHALE':
      yield* iterBasicFish(g, 6, irreducibleOnly);
      return;
    case 'LEVIATHAN':
      yield* iterBasicFish(g, 7, irreducibleOnly);
      return;
    case 'REMOTE_PAIR':
      yield* iterRemotePair(g);
      return;
    case 'CHUTE_REMOTE_PAIR':
      yield* iterChuteRemotePair(g);
      return;
    case 'BUG_PLUS_1':
      yield* iterBugPlus1(g);
      return;
    case 'SKYSCRAPER':
      yield* iterTurbotFamily(g, 'SKYSCRAPER', irreducibleOnly);
      return;
    case 'TWO_STRING_KITE':
      yield* iterTurbotFamily(g, 'TWO_STRING_KITE', irreducibleOnly);
      return;
    case 'TURBOT_FISH':
      yield* iterTurbotFamily(g, 'TURBOT_FISH', irreducibleOnly);
      return;
    case 'EMPTY_RECTANGLE':
      yield* iterEmptyRectangle(g);
      return;
    case 'W_WING':
      yield* iterWWing(g);
      return;
    case 'XY_WING':
      yield* iterXYWing(g);
      return;
    case 'XYZ_WING':
      yield* iterXYZWing(g);
      return;
    case 'WXYZ_WING':
      yield* iterWxyzWing(g, onBudgetHit);
      return;
    case 'UNIQUENESS_1':
      yield* iterUniqueness(g, 1);
      return;
    case 'UNIQUENESS_2':
      yield* iterUniqueness(g, 2);
      return;
    case 'UNIQUENESS_3':
      yield* iterUniqueness(g, 3);
      return;
    case 'UNIQUENESS_4':
      yield* iterUniqueness(g, 4);
      return;
    case 'UNIQUENESS_5':
      yield* iterUniqueness(g, 5);
      return;
    case 'UNIQUENESS_6':
      yield* iterUniqueness(g, 6);
      return;
    case 'HIDDEN_RECTANGLE':
      yield* iterHiddenRectangle(g);
      return;
    case 'AVOIDABLE_RECTANGLE_1':
      yield* iterAvoidableRectangle(g, 1);
      return;
    case 'AVOIDABLE_RECTANGLE_2':
      yield* iterAvoidableRectangle(g, 2);
      return;
    case 'EXTENDED_RECTANGLE':
      yield* iterExtendedRectangle(g);
      return;
    case 'FINNED_X_WING':
      yield* iterFinnedFish(g, 2, false, irreducibleOnly);
      return;
    case 'SASHIMI_X_WING':
      yield* iterFinnedFish(g, 2, true, irreducibleOnly);
      return;
    case 'FINNED_SWORDFISH':
      yield* iterFinnedFish(g, 3, false, irreducibleOnly);
      return;
    case 'SASHIMI_SWORDFISH':
      yield* iterFinnedFish(g, 3, true, irreducibleOnly);
      return;
    case 'FINNED_JELLYFISH':
      yield* iterFinnedFish(g, 4, false, irreducibleOnly);
      return;
    case 'SASHIMI_JELLYFISH':
      yield* iterFinnedFish(g, 4, true, irreducibleOnly);
      return;
    case 'SUE_DE_COQ':
      yield* iterSueDeCoq(g);
      return;
    case 'SIMPLE_COLORS':
      yield* iterSimpleColors(g);
      return;
    case 'MULTI_COLORS':
      yield* iterMultiColors(g);
      return;
    case 'MEDUSA_3D':
      yield* iterMedusa3d(g);
      return;
    case 'X_CHAIN':
      yield* iterXChain(g);
      return;
    case 'X_CYCLES':
      yield* iterXCycles(g, 12, onBudgetHit);
      return;
    case 'GROUPED_X_CYCLES':
      yield* iterGroupedXCycles(g, 10, irreducibleOnly, onBudgetHit);
      return;
    case 'XY_CHAIN':
      yield* iterXYChain(g);
      return;
    case 'NICE_LOOP':
      yield* iterNiceLoop(g, 12, onBudgetHit);
      return;
    case 'GROUPED_NICE_LOOP':
      yield* iterGroupedNiceLoop(g, 10, onBudgetHit);
      return;
    case 'ALS_XZ':
      yield* iterAlsXz(g, onBudgetHit);
      return;
    case 'ALS_XY_WING':
      yield* iterAlsXyWing(g, onBudgetHit);
      return;
    case 'ALS_XY_CHAIN':
      yield* iterAlsXyChain(g, onBudgetHit);
      return;
    case 'AIC':
      yield* iterAic(g, 12, onBudgetHit);
      return;
    case 'AIC_GROUPED':
      yield* iterGroupedAic(g, 10, 'grouped', onBudgetHit);
      return;
    case 'AIC_ALS':
      yield* iterGroupedAic(g, 10, 'als', onBudgetHit);
      return;
    case 'DEATH_BLOSSOM':
      yield* iterDeathBlossom(g, onBudgetHit);
      return;
    case 'FRANKEN_X_WING':
      yield* iterFrankenFish(g, 2, irreducibleOnly);
      return;
    case 'FRANKEN_SWORDFISH':
      yield* iterFrankenFish(g, 3, irreducibleOnly);
      return;
    case 'FIREWORKS':
      yield* iterFireworks(g);
      return;
    case 'TRIDAGON':
      yield* iterTridagon(g, onBudgetHit);
      return;
    case 'ALIGNED_PAIR_EXCLUSION':
      yield* iterAlignedPairExclusion(g, onBudgetHit);
      return;
    case 'EXOCET':
      yield* iterExocet(g, onTemplateOverflow);
      return;
    case 'DOUBLE_EXOCET':
      yield* iterDoubleExocet(g, onTemplateOverflow);
      return;
    case 'PATTERN_OVERLAY':
      yield* iterPatternOverlay(g, 20000, onTemplateOverflow);
      return;
    case 'DIGIT_FORCING_CHAIN':
      yield* iterDigitForcing(g);
      return;
    case 'NISHIO_FORCING_CHAIN':
      yield* iterNishio(g);
      return;
    case 'CELL_FORCING_CHAIN':
      yield* iterCellForcing(g);
      return;
    case 'UNIT_FORCING_CHAIN':
      yield* iterUnitForcing(g);
      return;
    case 'FORCING_NET':
      yield* iterForcingNet(g, irreducibleOnly);
      return;
    default:
      return;
  }
}

/**
 * Scan a single technique on `grid` and return its `TechScanSummary` (instances,
 * coverage metadata, and truncation flags). Never mutates `grid`.
 */
export function findPatternInstancesForTech(
  tech: Tech,
  grid: Grid,
  options: ScanOptions = {}
): TechScanSummary {
  const meta = TECH_SCANNER_META[tech];
  const info = TECHS[tech];
  if (!meta.implemented) {
    return {
      tech,
      techName: info.name,
      implemented: false,
      enabledInDefaultSolver: info.enabled,
      coverage: 'unimplemented',
      instances: [],
      truncated: false
    };
  }

  // Clone once to guarantee strict non-mutation of caller's grid
  const snapshot = cloneGrid(grid);
  const irreducibleOnly = options.irreducibleOnly ?? true;
  const maxInstances = options.maxInstancesPerTech;

  let budgetHit = false;
  let templateOverflow = false;
  let instanceCapHit = false;

  const ctx: IterContext = {
    irreducibleOnly,
    onBudgetHit: () => {
      budgetHit = true;
    },
    onTemplateOverflow: () => {
      templateOverflow = true;
    }
  };

  // Map canonical instance ID -> best (shortest-chain) PatternInstance
  const byId = new Map<string, PatternInstance>();
  for (const step of iterateTechSteps(tech, snapshot, ctx)) {
    const instance = toPatternInstance(step);
    const existing = byId.get(instance.id);
    if (!existing) {
      if (maxInstances !== undefined && byId.size >= maxInstances) {
        instanceCapHit = true;
        break;
      }
      byId.set(instance.id, instance);
    } else {
      // If both have links, prefer the shorter proof chain
      const newLen = instance.step.links?.length ?? Infinity;
      const oldLen = existing.step.links?.length ?? Infinity;
      if (newLen < oldLen) {
        byId.set(instance.id, instance);
      }
    }
  }

  const truncated = instanceCapHit || budgetHit || templateOverflow;
  const truncationReason: TruncationReason | undefined = instanceCapHit
    ? TRUNCATION_REASONS.CAP
    : templateOverflow
      ? TRUNCATION_REASONS.OVERFLOW
      : budgetHit
        ? TRUNCATION_REASONS.BUDGET
        : undefined;

  return {
    tech,
    techName: info.name,
    implemented: true,
    enabledInDefaultSolver: info.enabled,
    coverage: meta.coverage,
    instances: [...byId.values()],
    truncated,
    ...(truncationReason ? { truncationReason } : {})
  };
}

/**
 * Scan the current board state and return every distinct pattern instance
 * across all requested techniques.
 *
 * Guarantees:
 * - Never mutates `grid.values`, `grid.cands`, or `grid.given`.
 * - Never applies a discovered move before scanning for subsequent patterns.
 * - Preserves overlapping techniques that explain the same elimination or placement.
 * - Deduplicates symmetric representations of the same instance.
 * - Explicitly reports unimplemented catalogue entries and bounded/truncated searches.
 */
export function findAllPatternInstances(
  grid: Grid,
  options: ScanOptions = {}
): ScanResult {
  const useUniqueness = options.useUniqueness ?? true;
  const includeDisabled = options.includeDisabled ?? false;

  let requested: Tech[];
  if (options.techniques) {
    // Deduplicate requested list while preserving caller order
    requested = [...new Set(options.techniques)];
  } else {
    requested = includeDisabled ? [...IMPLEMENTED_TECHS] : [...SOLVE_ORDER];
  }

  if (options.useUniqueness === false) {
    requested = requested.filter((t) => TECHS[t].category !== 'Uniqueness');
  } else if (!options.techniques && !useUniqueness) {
    requested = requested.filter((t) => TECHS[t].category !== 'Uniqueness');
  }

  const snapshot = cloneGrid(grid);
  const instances: PatternInstance[] = [];
  const byTech: Partial<Record<Tech, TechScanSummary>> = {};
  const byConclusion: Record<string, PatternInstance[]> = {};
  const scannedTechniques: Tech[] = [];
  const unimplementedTechniques: Tech[] = [];
  let anyTruncated = false;

  for (const tech of requested) {
    const summary = findPatternInstancesForTech(tech, snapshot, options);
    byTech[tech] = summary;

    if (!summary.implemented) {
      unimplementedTechniques.push(tech);
      continue;
    }

    scannedTechniques.push(tech);
    if (summary.truncated) anyTruncated = true;

    for (const inst of summary.instances) {
      instances.push(inst);
      for (const cKey of individualConclusionKeys(inst.step)) {
        if (!byConclusion[cKey]) byConclusion[cKey] = [];
        byConclusion[cKey].push(inst);
      }
    }
  }

  return {
    instances,
    byTech,
    byConclusion,
    scannedTechniques,
    unimplementedTechniques,
    truncated: anyTruncated
  };
}

/** Alias for `findAllPatternInstances`. */
export const scanPosition = findAllPatternInstances;
