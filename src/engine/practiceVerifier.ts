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

export interface BoardCellLike {
  value: number;
  excluded: number;
  corner: number;
  center: number;
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
 * Extract candidate eliminations and digit placements made on the board
 * relative to the puzzle's starting state.
 */
export function extractBoardDeductions(
  initialCells: BoardCellLike[],
  currentCells: BoardCellLike[],
  autoCandidates: boolean
): { eliminations: CellDigit[]; placements: CellDigit[] } {
  const eliminations: CellDigit[] = [];
  const placements: CellDigit[] = [];

  const len = Math.min(initialCells.length, currentCells.length, 81);
  for (let i = 0; i < len; i++) {
    const init = initialCells[i];
    const curr = currentCells[i];

    if (!init.value && curr.value) {
      placements.push({ cell: i, digit: curr.value });
    }

    if (autoCandidates) {
      const addedExcluded = curr.excluded & ~init.excluded;
      for (let d = 1; d <= 9; d++) {
        if (addedExcluded & (1 << (d - 1))) {
          eliminations.push({ cell: i, digit: d });
        }
      }
    } else {
      const initMarks = init.corner | init.center;
      const currMarks = curr.corner | curr.center;
      const removedMarks = initMarks & ~currMarks;
      for (let d = 1; d <= 9; d++) {
        if (removedMarks & (1 << (d - 1))) {
          eliminations.push({ cell: i, digit: d });
        }
      }
    }
  }

  return { eliminations, placements };
}

export interface StepMatchDetails {
  isMatch: boolean;
  digitMatch: boolean;
  cellsMatch: boolean;
  structuralCellsMatch: boolean;
  deductionCellsMatch: boolean;
  elimMatch: boolean;
  techMatch: boolean;
  validActionCount: number;
  invalidActionCount: number;
  remainingActionCount: number;
  hasUserActions: boolean;
}

/**
 * Check whether a user answer matches a given Step.
 * Supports:
 * - Direct candidate eliminations / placements made on the board or in the answer
 * - Selection of structural pattern cells (corners, wings, base cells)
 * - Selection of deduction / elimination cells (target cells)
 * - Key digit selection
 */
export function matchesStep(ans: UserPracticeAnswer, step: Step): StepMatchDetails {
  const stepDigits = getStepDigits(step);
  const stepCells = extractParticipatingCells(step);
  const stepElimCells = step.eliminations.map((e) => e.cell);
  const stepPlaceCells = step.placements.map((p) => p.cell);
  const stepDeductionCells = [...new Set([...stepElimCells, ...stepPlaceCells])].sort((a, b) => a - b);

  // 1. Technique match
  const techMatch = !ans.tech || ans.tech === step.tech;

  // 2. Digit match: explicit digit(s) or inferred from user eliminations / placements
  const userElimDigits = (ans.eliminations ?? []).map((e) => e.digit);
  const userPlaceDigits = (ans.placements ?? []).map((p) => p.digit);
  const userDigits =
    ans.digits && ans.digits.length > 0
      ? ans.digits
      : ans.digit !== undefined
        ? [ans.digit]
        : [...new Set([...userElimDigits, ...userPlaceDigits])];

  const digitMatch =
    userDigits.length === 0 ||
    userDigits.some((d) => stepDigits.includes(d));

  // 3. Cells match: does user selection match pattern structure OR deduction cells?
  const userCells = ans.cells ?? [];
  const structuralCellsMatch =
    userCells.length > 0 &&
    (sameSet(userCells, stepCells) ||
      (stepCells.length > 0 && subsetOf(stepCells, userCells)) ||
      (userCells.length >= 2 && subsetOf(userCells, stepCells)));

  const deductionCellsMatch =
    userCells.length > 0 &&
    stepDeductionCells.length > 0 &&
    (sameSet(userCells, stepDeductionCells) ||
      (userCells.length >= 1 && subsetOf(userCells, stepDeductionCells)));

  const cellsMatch = structuralCellsMatch || deductionCellsMatch;

  // 4. Elimination/placement match
  const userElims = ans.eliminations ?? [];
  const userPlaces = ans.placements ?? [];
  const hasUserElims = userElims.length > 0;
  const hasUserPlaces = userPlaces.length > 0;
  const hasUserActions = hasUserElims || hasUserPlaces;

  let validActionCount = 0;
  let invalidActionCount = 0;
  let remainingActionCount = step.eliminations.length + step.placements.length;
  let elimMatch = false;

  if (hasUserActions) {
    const validElims = userElims.filter((ae) =>
      step.eliminations.some((se) => se.cell === ae.cell && se.digit === ae.digit)
    );
    const invalidElims = userElims.filter((ae) =>
      !step.eliminations.some((se) => se.cell === ae.cell && se.digit === ae.digit)
    );
    const validPlaces = userPlaces.filter((ap) =>
      step.placements.some((sp) => sp.cell === ap.cell && sp.digit === ap.digit)
    );
    const invalidPlaces = userPlaces.filter((ap) =>
      !step.placements.some((sp) => sp.cell === ap.cell && sp.digit === ap.digit)
    );

    validActionCount = validElims.length + validPlaces.length;
    invalidActionCount = invalidElims.length + invalidPlaces.length;
    remainingActionCount = (step.eliminations.length + step.placements.length) - validActionCount;

    // A valid elimination/placement move requires zero invalid moves and at least one valid deduction
    elimMatch = invalidActionCount === 0 && validActionCount > 0;
  } else {
    // If user didn't specify eliminations, match is determined by cells and digit
    elimMatch = true;
  }

  // An overall match occurs if:
  // (a) User executed valid deduction(s) on the board (even without highlighting cells), OR
  // (b) User highlighted the structural/deduction cells and selected the digit.
  const isMatch =
    techMatch &&
    digitMatch &&
    ((hasUserActions && elimMatch && (userCells.length === 0 || cellsMatch)) ||
      (!hasUserActions && cellsMatch && elimMatch));

  return {
    isMatch,
    digitMatch,
    cellsMatch,
    structuralCellsMatch,
    deductionCellsMatch,
    elimMatch,
    techMatch,
    validActionCount,
    invalidActionCount,
    remainingActionCount,
    hasUserActions
  };
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
    let feedback = tr`You correctly recognized the ${techName} on this board. ${describe(targetStep)}`;
    if (answer.eliminations && answer.eliminations.length > 0) {
      const elimStr = answer.eliminations.map((e) => `${e.digit} from ${cellName(e.cell)}`).join(', ');
      feedback = tr`You correctly eliminated candidate ${elimStr} via ${techName}! ${describe(targetStep)}`;
    } else if (answer.placements && answer.placements.length > 0) {
      const placeStr = answer.placements.map((p) => `${p.digit} into ${cellName(p.cell)}`).join(', ');
      feedback = tr`You correctly placed ${placeStr} via ${techName}! ${describe(targetStep)}`;
    } else if (targetCheck.deductionCellsMatch) {
      const cellStr = (answer.cells ?? []).map((c) => cellName(c)).join(', ');
      feedback = tr`You correctly identified the deduction in ${cellStr} via ${techName}! ${describe(targetStep)}`;
    }

    return {
      status: 'exact',
      isCorrect: true,
      matchedStep: targetStep,
      title: tr`Spot on! Valid ${techName}`,
      feedback,
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

  // 3. Partial match checks on target step (retaining exact test expectations)
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

  // 4. Deduction checks on target step when user made moves on the board
  if (targetCheck.hasUserActions && targetCheck.invalidActionCount > 0) {
    const wrongElim = (answer.eliminations ?? []).find(
      (ae) => !targetStep.eliminations.some((se) => se.cell === ae.cell && se.digit === ae.digit)
    );
    if (wrongElim) {
      return {
        status: 'incorrect',
        isCorrect: false,
        title: tr`Candidate not eliminated`,
        feedback: tr`Candidate ${wrongElim.digit} in ${cellName(wrongElim.cell)} is not eliminated by this pattern. Take another look at which cells see all base candidates.`,
        suggestedAction: 'hint'
      };
    }
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

  // 5. Incorrect
  return {
    status: 'incorrect',
    isCorrect: false,
    title: tr`Not quite the pattern`,
    feedback: tr`The selected cells and digit do not form a valid deduction in this position. Try using a progressive hint to narrow down the region.`,
    suggestedAction: 'hint'
  };
}
