/**
 * Progressive Hints Engine for Sudoku Pattern Learning.
 *
 * Implements 4-stage progressive disclosure for any Step without giving away
 * the solution prematurely:
 * - Level 1: Region & digit nudge (highlights relevant houses/units, hints at the digit).
 * - Level 2: Structural mechanism (describes the pattern formation to look for).
 * - Level 3: Participating cells & candidate links (highlights primary/secondary/fin cells).
 * - Level 4: Complete explanation & valid deduction (shows eliminations/placements and full walk).
 *
 * Pure TypeScript, zero React/DOM imports.
 */

import { cellName, cellNames } from './board';
import { CellDigit, ChainLink, Step, UnitBand } from './steps';
import { Tech, TECHS } from './ratings';
import { describe, conclusionText } from './hintFrames';
import { getTechniqueGuide } from '../content/techniqueGuides';
import { getTechniqueConcept } from '../content/concepts';
import { tr, unitName } from './text';

export type HintStageLevel = 1 | 2 | 3 | 4;

export interface ProgressiveHintStage {
  level: HintStageLevel;
  /** Short title of the stage (e.g., '1. Nudge', '2. Structure', '3. Cells', '4. Solution') */
  title: string;
  /** Actionable hint text for the learner */
  text: string;
  /** Units/houses to highlight on the board */
  highlightUnits?: UnitBand[];
  /** Cells to highlight as primary (blue) */
  primary?: CellDigit[];
  /** Supporting cells to highlight as secondary (gold/amber) */
  secondary?: CellDigit[];
  /** Fins to highlight (purple) */
  fins?: CellDigit[];
  /** Chain links to draw */
  links?: ChainLink[];
  /** Target eliminations to highlight (red) */
  eliminations?: CellDigit[];
  /** Target placements to highlight (green) */
  placements?: CellDigit[];
  /** Whether the full deduction is revealed */
  isFullReveal: boolean;
}

export interface ProgressiveHintSequence {
  tech: Tech;
  step: Step;
  stages: [
    ProgressiveHintStage,
    ProgressiveHintStage,
    ProgressiveHintStage,
    ProgressiveHintStage
  ];
}

const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];

/** Extract key digits involved in this deduction */
export function getStepDigits(step: Step): number[] {
  const digits = new Set<number>();
  for (const { digit } of step.eliminations) digits.add(digit);
  for (const { digit } of step.placements) digits.add(digit);
  if (step.primary) for (const { digit } of step.primary) digits.add(digit);
  if (step.secondary) for (const { digit } of step.secondary) digits.add(digit);
  if (step.fins) for (const { digit } of step.fins) digits.add(digit);
  if (step.links) {
    for (const link of step.links) {
      for (const cd of link.from) digits.add(cd.digit);
      for (const cd of link.to) digits.add(cd.digit);
    }
  }
  return [...digits].sort((a, b) => a - b);
}

/** Extract houses or units associated with the step */
export function getStepUnits(step: Step): UnitBand[] {
  if (step.units && step.units.length > 0) return step.units;

  // Infer units from participating cells
  const units: UnitBand[] = [];
  const cells = uniq([
    ...(step.primary ?? []).map((cd) => cd.cell),
    ...(step.secondary ?? []).map((cd) => cd.cell),
    ...(step.chainCells ?? [])
  ]);

  if (cells.length > 0) {
    // Check if cells share rows or cols
    const rows = uniq(cells.map((c) => Math.floor(c / 9)));
    const cols = uniq(cells.map((c) => c % 9));
    const boxes = uniq(cells.map((c) => Math.floor(Math.floor(c / 9) / 3) * 3 + Math.floor((c % 9) / 3)));

    if (rows.length <= 2 && rows.length > 0) {
      for (const r of rows) units.push({ unit: r, role: 'primary' });
    } else if (cols.length <= 2 && cols.length > 0) {
      for (const c of cols) units.push({ unit: 9 + c, role: 'primary' });
    } else if (boxes.length <= 2 && boxes.length > 0) {
      for (const b of boxes) units.push({ unit: 18 + b, role: 'primary' });
    }
  }

  return units;
}

/**
 * Generate the 4 progressive hint stages for any given Step.
 */
export function buildProgressiveHints(step: Step): ProgressiveHintSequence {
  const tech = step.tech;
  const guide = getTechniqueGuide(tech);
  const concept = getTechniqueConcept(tech);
  const digits = getStepDigits(step);
  const digitStr = digits.length === 1 ? `digit ${digits[0]}` : `digits ${digits.join(', ')}`;
  const units = getStepUnits(step);

  const unitNames = units.map((u) => unitName(u.unit));
  const stage1Text = unitNames.length > 0
    ? tr`Look closely at ${unitNames.join(' and ')} for ${digitStr}. Examine how candidates for that digit are restricted or distributed there.`
    : tr`Look for an interaction involving ${digitStr}. Examine how candidates for that digit are restricted or distributed there.`;

  // Stage 1: Nudge (Region + Digit)
  const stage1: ProgressiveHintStage = {
    level: 1,
    title: tr`Nudge`,
    text: stage1Text,
    highlightUnits: units,
    isFullReveal: false
  };

  // Stage 2: Structure hint (Pattern Mechanism)
  const stage2Text = tr`${TECHS[tech].name} (${concept.name}): Look for ${guide.structuralRoles.toLowerCase()}`;
  const stage2: ProgressiveHintStage = {
    level: 2,
    title: tr`Structure`,
    text: stage2Text,
    highlightUnits: units,
    isFullReveal: false
  };

  // Stage 3: Participating cells & candidate links
  const stage3: ProgressiveHintStage = {
    level: 3,
    title: tr`Pattern Cells`,
    text: tr`Notice the highlighted cells forming the pattern. What candidate eliminations or placements must this force?`,
    highlightUnits: units,
    primary: step.primary,
    secondary: step.secondary,
    fins: step.fins,
    links: step.links,
    isFullReveal: false
  };

  // Stage 4: Full revelation & deduction
  const fullDescription = describe(step);
  const stage4: ProgressiveHintStage = {
    level: 4,
    title: tr`Complete Solution`,
    text: fullDescription,
    highlightUnits: units,
    primary: step.primary,
    secondary: step.secondary,
    fins: step.fins,
    links: step.links,
    eliminations: step.eliminations,
    placements: step.placements,
    isFullReveal: true
  };

  return {
    tech,
    step,
    stages: [stage1, stage2, stage3, stage4]
  };
}
