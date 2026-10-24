/**
 * Practice Answer Verifier for Pattern Lab.
 *
 * Checks user-submitted answers in both focused and mixed practice modes.
 * Fulfills Section 3, 5, and 7:
 * - Checks whether the answer matches the expected target step.
 * - Checks whether the answer matches any valid alternative pattern present on the board.
 * - Evaluates partial correctness (digit match, cell match, elimination match).
 * - Provides constructive, supportive feedback.
 *
 * Pure TypeScript, zero React/DOM imports.
 */

import { CellDigit, Step } from './steps';
import { Tech, TECHS } from './ratings';
import { cellName, cellNames } from './board';
import { describe } from './hintFrames';
import { getStepDigits } from './progressiveHints';
import { tr } from './text';

export interface UserPracticeAnswer {
  tech?: Tech;
  digit?: number;
  digits?: number[];
  cells?: number[];
  eliminations?: CellDigit[];
  placements?: CellDigit[];
}

export type PracticeVerificationStatus =
  | 'exact'
  | 'alternative'
  | 'partial'
  | 'incorrect';

export interface PracticeVerificationResult {
  status: PracticeVerificationStatus;
  isCorrect: boolean;
  matchedStep?: Step;
  title: string;
  feedback: string;
  suggestedAction?: 'next' | 'retry' | 'hint';
}

const sameSet = <T>(a: T[], b: T[]): boolean => {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
};

const subsetOf = <T>(sub: T[], superSet: T[]): boolean => {
  const s = new Set(superSet);
  return sub.every((x) => s.has(x));
};

const extractParticipatingCells = (step: Step): number[] => {
  const cells = new Set<number>();
  if (step.primary) for (const cd of step.primary) cells.add(cd.cell);
  if (step.secondary) for (const cd of step.secondary) cells.add(cd.cell);
  if (step.fins) for (const cd of step.fins) cells.add(cd.cell);
  if (step.chainCells) for (const c of step.chainCells) cells.add(c);
  if (step.links) {
    for (const l of step.links) {
      for (const cd of l.from) cells.add(cd.cell);
      for (const cd of l.to) cells.add(cd.cell);
    }
  }
  return [...cells].sort((a, b) => a - b);
};

/**
 * Check whether a user answer matches a given Step.
 */
export function matchesStep(ans: UserPracticeAnswer, step: Step): {
  isMatch: boolean;
  digitMatch: boolean;
  cellsMatch: boolean;
  elimMatch: boolean;
  techMatch: boolean;
} {
  const stepDigits = getStepDigits(step);
  const stepCells = extractParticipatingCells(step);

  // 1. Technique match
  const techMatch = !ans.tech || ans.tech === step.tech;

  // 2. Digit match
  const userDigits = ans.digits && ans.digits.length > 0
    ? ans.digits
    : ans.digit !== undefined
      ? [ans.digit]
      : [];
  const digitMatch =
    userDigits.length === 0 ||
    userDigits.some((d) => stepDigits.includes(d));

  // 3. Cells match: does user selection match or cover the pattern's essential cells?
  const userCells = ans.cells ?? [];
  const cellsMatch =
    userCells.length > 0 &&
    (sameSet(userCells, stepCells) ||
      (stepCells.length > 0 && subsetOf(stepCells, userCells)) ||
      (userCells.length >= 2 && subsetOf(userCells, stepCells)));

  // 4. Elimination/placement match
  let elimMatch = false;
  if ((ans.eliminations && ans.eliminations.length > 0) || (ans.placements && ans.placements.length > 0)) {
    const elimOk =
      ans.eliminations && ans.eliminations.length > 0
        ? ans.eliminations.some((ae) =>
            step.eliminations.some((se) => se.cell === ae.cell && se.digit === ae.digit)
          )
        : true;
    const placeOk =
      ans.placements && ans.placements.length > 0
        ? ans.placements.some((ap) =>
            step.placements.some((sp) => sp.cell === ap.cell && sp.digit === ap.digit)
          )
        : true;
    elimMatch = elimOk && placeOk;
  } else {
    // If user didn't specify eliminations, match is determined by cells and digit
    elimMatch = true;
  }

  const isMatch = techMatch && digitMatch && cellsMatch && elimMatch;
  return { isMatch, digitMatch, cellsMatch, elimMatch, techMatch };
}

/**
 * Verify user answer against the target step and all other valid steps in the position.
 */
export function verifyPracticeAnswer(
  answer: UserPracticeAnswer,
  targetStep: Step,
  allValidSteps: Step[] = []
): PracticeVerificationResult {
  // 1. Check target step match
  const targetCheck = matchesStep(answer, targetStep);
  if (targetCheck.isMatch) {
    const techName = TECHS[targetStep.tech].name;
    return {
      status: 'exact',
      isCorrect: true,
      matchedStep: targetStep,
      title: tr`Spot on! Valid ${techName}`,
      feedback: tr`You correctly recognized the ${techName} on this board. ${describe(targetStep)}`,
      suggestedAction: 'next'
    };
  }

  // 2. Check alternative valid patterns on the board
  for (const altStep of allValidSteps) {
    if (altStep.tech === targetStep.tech) continue;
    const altCheck = matchesStep(answer, altStep);
    if (altCheck.isMatch) {
      const altName = TECHS[altStep.tech].name;
      return {
        status: 'alternative',
        isCorrect: true,
        matchedStep: altStep,
        title: tr`Alternative Pattern Found: ${altName}`,
        feedback: tr`Excellent observation! You spotted a logically valid ${altName} on this position rather than the generator's initial target. Both are completely sound! ${describe(altStep)}`,
        suggestedAction: 'next'
      };
    }
  }

  // 3. Partial match checks on target step
  if (targetCheck.cellsMatch && targetCheck.digitMatch) {
    return {
      status: 'partial',
      isCorrect: false,
      title: tr`Right cells, check the deduction`,
      feedback: tr`You have identified the correct pattern cells and digit! Now check which candidate digit gets placed or eliminated as a consequence.`,
      suggestedAction: 'retry'
    };
  }

  if (targetCheck.cellsMatch && !targetCheck.digitMatch) {
    return {
      status: 'partial',
      isCorrect: false,
      title: tr`Pattern cells spotted`,
      feedback: tr`You found the key cells forming the structure, but verify which digit or conjugate link is driving the elimination.`,
      suggestedAction: 'retry'
    };
  }

  if (targetCheck.digitMatch && !targetCheck.cellsMatch) {
    return {
      status: 'partial',
      isCorrect: false,
      title: tr`Correct digit, look for the structure`,
      feedback: tr`You are looking at the right digit! But look for the specific parallel lines or intersecting wing cells that lock the candidate.`,
      suggestedAction: 'hint'
    };
  }

  // 4. Incorrect
  return {
    status: 'incorrect',
    isCorrect: false,
    title: tr`Not quite the pattern`,
    feedback: tr`The selected cells and digit do not form a valid deduction in this position. Try using a progressive hint to narrow down the region.`,
    suggestedAction: 'hint'
  };
}
