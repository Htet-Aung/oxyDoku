/**
 * Step Explainer Engine for Pattern Lab (`src/content/stepExplainer.ts`).
 *
 * Provides comprehensive, educational, deductive explanations for every Sudoku
 * technique step. Explains:
 * 1. What the pattern is and where it is located (cells, houses, candidate notes).
 * 2. WHY the deduction works (step-by-step causal logic, branch/case analysis).
 * 3. WHY specific candidate notes can be eliminated or placed.
 * 4. Pedagogical visual walk frames for step-by-step board progression.
 *
 * Strictly pure TypeScript, zero React or DOM imports.
 */

import {
  cellName,
  cellNames,
  rowOf,
  colOf,
  boxOf,
  UNITS,
  sees,
  digitsOf,
  bit
} from '../engine/board';
import { Step, CellDigit, ChainLink } from '../engine/steps';
import { Tech, TECHS } from '../engine/ratings';
import { unitName, joinAnd } from '../engine/text';
import { linkText, conclusionText, Part, Frame } from '../engine/hintFrames';

export interface ExplanationCase {
  title: string;
  premise: string;
  chain: string[];
  conclusion: string;
}

export interface ExplanationComponent {
  role: 'primary' | 'secondary' | 'fin' | 'unit';
  label: string;
  cells: number[];
  digits?: number[];
  text: string;
}

export interface ExplanationEliminationDetail {
  cell: number;
  cellStr: string;
  digit: number;
  action: 'remove' | 'place';
  reason: string;
}

export interface StepExplanation {
  tech: Tech;
  techName: string;
  synopsis: string;
  structure: {
    title: string;
    description: string;
    components: ExplanationComponent[];
  };
  whyItWorks: {
    corePrinciple: string;
    cases?: ExplanationCase[];
    deductionSteps: string[];
  };
  whyElimination: {
    summary: string;
    details: ExplanationEliminationDetail[];
  };
  walkFrames: Frame[];
}

const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];

const fmt = (strings: TemplateStringsArray, ...values: unknown[]): string => {
  let s = strings[0];
  for (let i = 1; i <= values.length; i++) {
    s += String(values[i - 1]) + strings[i];
  }
  return s;
};

function getStepDigits(step: Step): number[] {
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

// ---------------------------------------------------------------------------
// Specialized Explanation Builders by Technique Logic
// ---------------------------------------------------------------------------

function explainXYWing(step: Step): StepExplanation {
  const techName = TECHS[step.tech].name;
  const pivotCell = step.primary?.[0]?.cell ?? 0;
  const pivotDigits = uniq((step.primary ?? []).map((cd) => cd.digit)).sort((a, b) => a - b);
  const [x, y] = pivotDigits.length >= 2 ? pivotDigits : [pivotDigits[0] ?? 1, 2];

  const pincerCells = uniq((step.secondary ?? []).map((cd) => cd.cell));
  const w1 = pincerCells[0] ?? 0;
  const w2 = pincerCells[1] ?? (pincerCells[0] ?? 0);
  const z = step.eliminations[0]?.digit ?? (step.secondary?.[0]?.digit ?? 9);

  const elimCells = step.eliminations.map((e) => e.cell);
  const elimNames = cellNames(elimCells);

  const synopsis = fmt`XY-Wing: pivot ${cellName(pivotCell)} forces one of pincers ${cellName(w1)} or ${cellName(w2)} to be ${z}, removing ${z} from cells seeing both.`;

  const cases: ExplanationCase[] = [
    {
      title: fmt`Case 1: If pivot ${cellName(pivotCell)} is ${x}`,
      premise: fmt`Assume ${cellName(pivotCell)} takes value ${x}.`,
      chain: [
        fmt`Pincer ${cellName(w1)} shares a house with ${cellName(pivotCell)}, so it cannot be ${x}.`,
        fmt`Since ${cellName(w1)} only has candidates {${x}, ${z}}, it is forced to be ${z}.`
      ],
      conclusion: fmt`Result: ${cellName(w1)} must be ${z}.`
    },
    {
      title: fmt`Case 2: If pivot ${cellName(pivotCell)} is ${y}`,
      premise: fmt`Assume ${cellName(pivotCell)} takes value ${y}.`,
      chain: [
        fmt`Pincer ${cellName(w2)} shares a house with ${cellName(pivotCell)}, so it cannot be ${y}.`,
        fmt`Since ${cellName(w2)} only has candidates {${y}, ${z}}, it is forced to be ${z}.`
      ],
      conclusion: fmt`Result: ${cellName(w2)} must be ${z}.`
    }
  ];

  const deductionSteps = [
    fmt`The pivot cell ${cellName(pivotCell)} has only two remaining candidates: {${x}, ${y}}.`,
    fmt`If ${cellName(pivotCell)} is ${x}, pincer ${cellName(w1)} is forced to be ${z}.`,
    fmt`If ${cellName(pivotCell)} is ${y}, pincer ${cellName(w2)} is forced to be ${z}.`,
    fmt`Because ${cellName(pivotCell)} must be either ${x} or ${y}, at least one of the two pincers (${cellName(w1)} or ${cellName(w2)}) MUST be ${z} in the final solution.`
  ];

  const elimDetails: ExplanationEliminationDetail[] = step.eliminations.map((e) => ({
    cell: e.cell,
    cellStr: cellName(e.cell),
    digit: e.digit,
    action: 'remove',
    reason: fmt`Sees both pincers ${cellName(w1)} and ${cellName(w2)}. Because one of those two pincers is guaranteed to be ${z}, placing ${z} here would cause an immediate conflict either way.`
  }));

  const walkFrames: Frame[] = [
    {
      text: fmt`Identify the pivot: Cell ${cellName(pivotCell)} contains candidates {${x}, ${y}}.`,
      links: 0,
      show: new Set<Part>(['units', 'primary'])
    },
    {
      text: fmt`Identify the pincers: Cells ${cellName(w1)} ({${x}, ${z}}) and ${cellName(w2)} ({${y}, ${z}}) both see the pivot and share target candidate ${z}.`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'secondary'])
    },
    {
      text: fmt`Case 1: If pivot ${cellName(pivotCell)} is ${x}, then pincer ${cellName(w1)} cannot be ${x}, which forces ${cellName(w1)} to be ${z}.`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'secondary'])
    },
    {
      text: fmt`Case 2: If pivot ${cellName(pivotCell)} is ${y}, then pincer ${cellName(w2)} cannot be ${y}, which forces ${cellName(w2)} to be ${z}.`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'secondary'])
    },
    {
      text: fmt`Conclusion: One pincer must be ${z}! Any cell seeing both pincers (${elimNames}) can never be ${z}, removing ${z} from them.`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'secondary', 'conclusion'])
    }
  ];

  return {
    tech: step.tech,
    techName,
    synopsis,
    structure: {
      title: fmt`Pattern Structure`,
      description: fmt`A bivalue pivot cell and two bivalue pincer cells.`,
      components: [
        {
          role: 'primary',
          label: fmt`Pivot`,
          cells: [pivotCell],
          digits: pivotDigits,
          text: fmt`${cellName(pivotCell)} holds {${x}, ${y}}`
        },
        {
          role: 'secondary',
          label: fmt`Pincers`,
          cells: pincerCells,
          digits: [z],
          text: fmt`${cellName(w1)} and ${cellName(w2)} both contain candidate ${z}`
        }
      ]
    },
    whyItWorks: {
      corePrinciple: fmt`Because the pivot has only two possible values, one of the two pincers must contain the target digit ${z}.`,
      cases,
      deductionSteps
    },
    whyElimination: {
      summary: fmt`Candidate ${z} cannot appear in any cell that sees both pincers.`,
      details: elimDetails
    },
    walkFrames
  };
}

function explainXYZWing(step: Step): StepExplanation {
  const techName = TECHS[step.tech].name;
  const pivotCell = step.primary?.[0]?.cell ?? 0;
  const pivotDigits = uniq((step.primary ?? []).map((cd) => cd.digit)).sort((a, b) => a - b);
  const [x, y, z] = pivotDigits.length >= 3 ? pivotDigits : [pivotDigits[0] ?? 1, pivotDigits[1] ?? 2, 3];

  const pincerCells = uniq((step.secondary ?? []).map((cd) => cd.cell));
  const w1 = pincerCells[0] ?? 0;
  const w2 = pincerCells[1] ?? (pincerCells[0] ?? 0);
  const targetDigit = step.eliminations[0]?.digit ?? z;

  const elimCells = step.eliminations.map((e) => e.cell);
  const elimNames = cellNames(elimCells);

  const synopsis = fmt`XYZ-Wing: pivot ${cellName(pivotCell)} ({${x}, ${y}, ${targetDigit}}) and pincers ${cellName(w1)}, ${cellName(w2)} guarantee that one of the three cells must be ${targetDigit}.`;

  const cases: ExplanationCase[] = [
    {
      title: fmt`Case 1: If pivot ${cellName(pivotCell)} is ${x}`,
      premise: fmt`Assume ${cellName(pivotCell)} takes value ${x}.`,
      chain: [fmt`Pincer ${cellName(w1)} cannot be ${x}, forcing it to be ${targetDigit}.`],
      conclusion: fmt`Result: ${cellName(w1)} is ${targetDigit}.`
    },
    {
      title: fmt`Case 2: If pivot ${cellName(pivotCell)} is ${y}`,
      premise: fmt`Assume ${cellName(pivotCell)} takes value ${y}.`,
      chain: [fmt`Pincer ${cellName(w2)} cannot be ${y}, forcing it to be ${targetDigit}.`],
      conclusion: fmt`Result: ${cellName(w2)} is ${targetDigit}.`
    },
    {
      title: fmt`Case 3: If pivot ${cellName(pivotCell)} is ${targetDigit}`,
      premise: fmt`Assume ${cellName(pivotCell)} takes value ${targetDigit}.`,
      chain: [fmt`The pivot cell ${cellName(pivotCell)} itself holds ${targetDigit}.`],
      conclusion: fmt`Result: ${cellName(pivotCell)} is ${targetDigit}.`
    }
  ];

  const deductionSteps = [
    fmt`The pivot ${cellName(pivotCell)} contains three candidates: {${x}, ${y}, ${targetDigit}}.`,
    fmt`If the pivot is ${x}, pincer ${cellName(w1)} must be ${targetDigit}.`,
    fmt`If the pivot is ${y}, pincer ${cellName(w2)} must be ${targetDigit}.`,
    fmt`If the pivot is ${targetDigit}, the pivot itself is ${targetDigit}.`,
    fmt`In all three possible outcomes, at least one of these three cells is guaranteed to be ${targetDigit}.`
  ];

  const elimDetails: ExplanationEliminationDetail[] = step.eliminations.map((e) => ({
    cell: e.cell,
    cellStr: cellName(e.cell),
    digit: e.digit,
    action: 'remove',
    reason: fmt`Sees all three cells (${cellName(pivotCell)}, ${cellName(w1)}, and ${cellName(w2)}). Because at least one of those three must be ${targetDigit}, placing ${targetDigit} here is impossible.`
  }));

  const walkFrames: Frame[] = [
    {
      text: fmt`Identify the pivot: Cell ${cellName(pivotCell)} has three candidates: {${x}, ${y}, ${targetDigit}}.`,
      links: 0,
      show: new Set<Part>(['units', 'primary'])
    },
    {
      text: fmt`Identify the pincers: Cells ${cellName(w1)} and ${cellName(w2)} both see the pivot and share digit ${targetDigit}.`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'secondary'])
    },
    {
      text: fmt`Case 1: If pivot is ${x}, pincer ${cellName(w1)} must be ${targetDigit}. Case 2: If pivot is ${y}, pincer ${cellName(w2)} must be ${targetDigit}.`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'secondary'])
    },
    {
      text: fmt`Case 3: If pivot is ${targetDigit}, the pivot itself is ${targetDigit}. In all cases, one of the three cells is ${targetDigit}!`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'secondary'])
    },
    {
      text: fmt`Conclusion: Any cell that sees all three cells (${elimNames}) cannot be ${targetDigit}, removing it.`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'secondary', 'conclusion'])
    }
  ];

  return {
    tech: step.tech,
    techName,
    synopsis,
    structure: {
      title: fmt`Pattern Structure`,
      description: fmt`A tri-value pivot cell and two bivalue pincer cells.`,
      components: [
        {
          role: 'primary',
          label: fmt`Pivot`,
          cells: [pivotCell],
          digits: pivotDigits,
          text: fmt`${cellName(pivotCell)} holds {${pivotDigits.join(', ')}}`
        },
        {
          role: 'secondary',
          label: fmt`Pincers`,
          cells: pincerCells,
          digits: [targetDigit],
          text: fmt`${cellName(w1)} and ${cellName(w2)} both contain ${targetDigit}`
        }
      ]
    },
    whyItWorks: {
      corePrinciple: fmt`Whichever of its three digits the pivot takes, one of the three cells must be ${targetDigit}.`,
      cases,
      deductionSteps
    },
    whyElimination: {
      summary: fmt`Cells seeing the pivot and both pincers cannot contain ${targetDigit}.`,
      details: elimDetails
    },
    walkFrames
  };
}

function explainWWing(step: Step): StepExplanation {
  const techName = TECHS[step.tech].name;
  const endpointCells = uniq((step.primary ?? []).map((cd) => cd.cell));
  const a = endpointCells[0] ?? 0;
  const b = endpointCells[1] ?? (endpointCells[0] ?? 0);
  const digits = uniq((step.primary ?? []).map((cd) => cd.digit)).sort((a, b) => a - b);
  const elimDigit = step.eliminations[0]?.digit ?? digits[1] ?? 9;
  const linkDigit = digits.find((d) => d !== elimDigit) ?? digits[0] ?? 1;

  const link = step.links?.[0];
  const l1 = link ? cellName(link.from[0]?.cell ?? 0) : 'a';
  const l2 = link ? cellName(link.to[0]?.cell ?? 0) : 'b';

  const elimNames = cellNames(step.eliminations.map((e) => e.cell));

  const synopsis = fmt`W-Wing: endpoints ${cellName(a)} and ${cellName(b)} ({${linkDigit}, ${elimDigit}}) connected by a strong link on ${linkDigit} force one endpoint to be ${elimDigit}.`;

  const deductionSteps = [
    fmt`Both endpoint cells ${cellName(a)} and ${cellName(b)} contain only candidates {${linkDigit}, ${elimDigit}}.`,
    fmt`If neither cell contained ${elimDigit}, BOTH cells would have to be ${linkDigit}.`,
    fmt`However, digit ${linkDigit} has a strong link (conjugate pair) between ${l1} and ${l2}: one of those two cells must be ${linkDigit}.`,
    fmt`Placing ${linkDigit} in ${cellName(a)} would kill ${linkDigit} in ${l1}, which forces ${l2} to be ${linkDigit}, making ${linkDigit} impossible in ${cellName(b)}.`,
    fmt`Therefore, both endpoints cannot be ${linkDigit} at the same time. At least one endpoint MUST be ${elimDigit}!`
  ];

  const elimDetails: ExplanationEliminationDetail[] = step.eliminations.map((e) => ({
    cell: e.cell,
    cellStr: cellName(e.cell),
    digit: e.digit,
    action: 'remove',
    reason: fmt`Sees both endpoints ${cellName(a)} and ${cellName(b)}. Because at least one endpoint must be ${elimDigit}, this cell sees ${elimDigit} in either case.`
  }));

  const walkFrames: Frame[] = [
    {
      text: fmt`Identify the two endpoints: Cells ${cellName(a)} and ${cellName(b)} both hold candidates {${linkDigit}, ${elimDigit}}.`,
      links: 0,
      show: new Set<Part>(['units', 'primary'])
    },
    {
      text: fmt`Identify the strong link: Digit ${linkDigit} has a conjugate pair between ${l1} and ${l2}.`,
      links: step.links?.length ?? 1,
      show: new Set<Part>(['units', 'primary'])
    },
    {
      text: fmt`Logical deduction: Both endpoints cannot be ${linkDigit} at once without violating the strong link. At least one endpoint must be ${elimDigit}!`,
      links: step.links?.length ?? 1,
      show: new Set<Part>(['units', 'primary'])
    },
    {
      text: fmt`Conclusion: Any cell seeing both endpoints (${elimNames}) cannot be ${elimDigit}, removing it.`,
      links: step.links?.length ?? 1,
      show: new Set<Part>(['units', 'primary', 'conclusion'])
    }
  ];

  return {
    tech: step.tech,
    techName,
    synopsis,
    structure: {
      title: fmt`Pattern Structure`,
      description: fmt`Two identical bivalue cells linked by an outside conjugate pair.`,
      components: [
        {
          role: 'primary',
          label: fmt`Endpoints`,
          cells: [a, b],
          digits,
          text: fmt`${cellName(a)} and ${cellName(b)} hold {${linkDigit}, ${elimDigit}}`
        }
      ]
    },
    whyItWorks: {
      corePrinciple: fmt`Because digit ${linkDigit} has only two places in its line, both endpoints cannot take ${linkDigit} simultaneously.`,
      deductionSteps
    },
    whyElimination: {
      summary: fmt`Cells seeing both endpoints cannot be ${elimDigit}.`,
      details: elimDetails
    },
    walkFrames
  };
}

function explainBasicFish(step: Step): StepExplanation {
  const techName = TECHS[step.tech].name;
  const d = step.eliminations[0]?.digit ?? (step.primary?.[0]?.digit ?? 1);
  const baseUnits = (step.units ?? []).filter((u) => u.role === 'primary').map((u) => u.unit);
  const coverUnits = (step.units ?? []).filter((u) => u.role === 'secondary').map((u) => u.unit);
  const isRowBase = baseUnits.length > 0 && baseUnits[0] < 9;
  const baseType = isRowBase ? fmt`rows` : fmt`columns`;
  const coverType = isRowBase ? fmt`columns` : fmt`rows`;

  const baseNames = baseUnits.map(unitName).join(', ');
  const coverNames = coverUnits.map(unitName).join(', ');
  const size = Math.max(baseUnits.length, coverUnits.length, 2);
  const elimNames = cellNames(step.eliminations.map((e) => e.cell));

  const synopsis = fmt`${techName} on ${d}: in ${baseNames}, ${d} can only appear within ${coverNames}. Those ${size} base houses use up ${d} in the ${size} cover houses.`;

  const deductionSteps = [
    fmt`Every Sudoku house must contain digit ${d} exactly once. Therefore, the ${size} base ${baseType} require exactly ${size} placements of ${d}.`,
    fmt`Looking across those ${size} base ${baseType}, candidate ${d} is confined exclusively to the ${size} cover ${coverType}.`,
    fmt`Because ${size} digits must fit into ${size} cover ${coverType}, each cover house receives exactly one ${d} from the base lines.`,
    fmt`This completely satisfies digit ${d} for all ${size} cover ${coverType}. No other cell in those cover houses can contain ${d}!`
  ];

  const elimDetails: ExplanationEliminationDetail[] = step.eliminations.map((e) => ({
    cell: e.cell,
    cellStr: cellName(e.cell),
    digit: e.digit,
    action: 'remove',
    reason: fmt`Lies in a cover line (${unitName(isRowBase ? 9 + colOf(e.cell) : rowOf(e.cell))}) outside the base pattern. That cover line is already guaranteed to receive its ${d} from the base cells.`
  }));

  const walkFrames: Frame[] = [
    {
      text: fmt`Base ${baseType}: In ${baseNames}, digit ${d} is restricted to only ${size} ${coverType}.`,
      links: 0,
      show: new Set<Part>(['units', 'primary'])
    },
    {
      text: fmt`Cover ${coverType}: The ${size} copies of ${d} in the base ${baseType} must land in ${coverNames}.`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'secondary'])
    },
    {
      text: fmt`Deduction: These ${size} placements will completely use up digit ${d} in ${coverNames}.`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'secondary'])
    },
    {
      text: fmt`Conclusion: Digit ${d} is eliminated from all other cells in ${coverNames} (${elimNames}).`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'secondary', 'conclusion'])
    }
  ];

  return {
    tech: step.tech,
    techName,
    synopsis,
    structure: {
      title: fmt`Pattern Structure`,
      description: fmt`${size} base houses confined to ${size} cover houses.`,
      components: [
        {
          role: 'primary',
          label: fmt`Base ${baseType}`,
          cells: (step.primary ?? []).map((cd) => cd.cell),
          digits: [d],
          text: fmt`${baseNames} hold ${d} only in the cover lines`
        },
        {
          role: 'secondary',
          label: fmt`Cover ${coverType}`,
          cells: [],
          digits: [d],
          text: fmt`${coverNames} take the base's ${d}s`
        }
      ]
    },
    whyItWorks: {
      corePrinciple: fmt`When N lines only place a digit in N perpendicular lines, those perpendicular lines are completely filled for that digit.`,
      deductionSteps
    },
    whyElimination: {
      summary: fmt`All other cells in the cover lines lose candidate ${d}.`,
      details: elimDetails
    },
    walkFrames
  };
}

function explainFinnedFish(step: Step): StepExplanation {
  const techName = TECHS[step.tech].name;
  const d = step.eliminations[0]?.digit ?? (step.primary?.[0]?.digit ?? 1);
  const finCells = uniq((step.fins ?? []).map((cd) => cd.cell));
  const finNames = cellNames(finCells);
  const finBox = finCells.length > 0 ? unitName(18 + boxOf(finCells[0])) : fmt`the fin box`;
  const elimNames = cellNames(step.eliminations.map((e) => e.cell));

  const synopsis = fmt`${techName} on ${d}: fish pattern with fin in ${finNames}. Eliminations occur where the pure fish and the fin both eliminate ${d}.`;

  const cases: ExplanationCase[] = [
    {
      title: fmt`Case 1: If the fin ${finNames} is FALSE`,
      premise: fmt`Assume the fin candidate is not ${d}.`,
      chain: [
        fmt`The pattern becomes a pure, unfinned fish.`,
        fmt`The pure fish eliminates ${d} along the cover lines.`
      ],
      conclusion: fmt`Result: Candidate ${d} is removed from the cover lines.`
    },
    {
      title: fmt`Case 2: If the fin ${finNames} is TRUE`,
      premise: fmt`Assume the fin candidate IS ${d}.`,
      chain: [
        fmt`A true digit in ${finNames} eliminates ${d} from every other cell in ${finBox}.`
      ],
      conclusion: fmt`Result: Candidate ${d} is removed from ${finBox}.`
    }
  ];

  const deductionSteps = [
    fmt`A finned fish is a regular fish with extra candidate(s) called the "fin" in ${finNames}.`,
    fmt`If the fin is FALSE (not ${d}), the regular fish is completed and eliminates ${d} from the cover lines.`,
    fmt`If the fin is TRUE (is ${d}), the fin itself eliminates ${d} from all cells in ${finBox}.`,
    fmt`Conclusion: Any cell that lies in the cover line AND shares ${finBox} with the fin sees ${d} removed in BOTH outcomes!`
  ];

  const elimDetails: ExplanationEliminationDetail[] = step.eliminations.map((e) => ({
    cell: e.cell,
    cellStr: cellName(e.cell),
    digit: e.digit,
    action: 'remove',
    reason: fmt`Lies in the cover line (eliminated if fin is false) and in ${finBox} (eliminated if fin is true). Both possibilities eliminate ${d} from this cell.`
  }));

  const walkFrames: Frame[] = [
    {
      text: fmt`Base fish structure: Digit ${d} forms a fish pattern across base and cover houses.`,
      links: 0,
      show: new Set<Part>(['units', 'primary'])
    },
    {
      text: fmt`The fin: Cell(s) ${finNames} in ${finBox} are extra candidates preventing a pure fish.`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'fins'])
    },
    {
      text: fmt`Two-case deduction: If the fin is false, the pure fish eliminates ${d}. If the fin is true, the fin eliminates ${d} from ${finBox}.`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'fins'])
    },
    {
      text: fmt`Conclusion: Cells in the cover line within ${finBox} (${elimNames}) lose ${d} either way.`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'fins', 'conclusion'])
    }
  ];

  return {
    tech: step.tech,
    techName,
    synopsis,
    structure: {
      title: fmt`Pattern Structure`,
      description: fmt`A fish pattern with one or more extra fin candidates in a single box.`,
      components: [
        {
          role: 'primary',
          label: fmt`Base fish`,
          cells: (step.primary ?? []).map((cd) => cd.cell),
          digits: [d],
          text: fmt`The main fish candidates on ${d}`
        },
        {
          role: 'fin',
          label: fmt`Fin`,
          cells: finCells,
          digits: [d],
          text: fmt`${finNames} in ${finBox}`
        }
      ]
    },
    whyItWorks: {
      corePrinciple: fmt`Whether the fin is true or false, candidates that intersect both the cover line and the fin box are eliminated.`,
      cases,
      deductionSteps
    },
    whyElimination: {
      summary: fmt`Cells seeing the cover line and the fin box lose candidate ${d}.`,
      details: elimDetails
    },
    walkFrames
  };
}

function explainTurbotFamily(step: Step): StepExplanation {
  const techName = TECHS[step.tech].name;
  const d = step.eliminations[0]?.digit ?? (step.primary?.[0]?.digit ?? 1);
  const primaryCells = uniq((step.primary ?? []).map((cd) => cd.cell));

  // Determine base ends (that see each other) and roof/outer ends (that do not)
  let base1 = -1;
  let base2 = -1;
  let roof1 = -1;
  let roof2 = -1;

  for (let i = 0; i < primaryCells.length; i++) {
    for (let j = i + 1; j < primaryCells.length; j++) {
      if (sees(primaryCells[i], primaryCells[j])) {
        base1 = primaryCells[i];
        base2 = primaryCells[j];
        const others = primaryCells.filter((c) => c !== base1 && c !== base2);
        if (others.length === 2 && !sees(others[0], others[1])) {
          roof1 = others[0];
          roof2 = others[1];
          break;
        }
      }
    }
    if (roof1 >= 0) break;
  }

  if (roof1 < 0 && primaryCells.length >= 4) {
    base1 = primaryCells[1];
    base2 = primaryCells[2];
    roof1 = primaryCells[0];
    roof2 = primaryCells[3];
  }

  const elimNames = cellNames(step.eliminations.map((e) => e.cell));

  const synopsis = fmt`${techName} on ${d}: two conjugate pairs linked at base ${cellName(base1)} and ${cellName(base2)} prove that at least one outer end (${cellName(roof1)} or ${cellName(roof2)}) must be ${d}.`;

  const deductionSteps = [
    fmt`The two base cells ${cellName(base1)} and ${cellName(base2)} see each other, so at most one of them can be ${d}.`,
    fmt`In the first line, if base ${cellName(base1)} is not ${d}, outer cell ${cellName(roof1)} MUST be ${d} (nowhere else in that line).`,
    fmt`In the second line, if base ${cellName(base2)} is not ${d}, outer cell ${cellName(roof2)} MUST be ${d} (nowhere else in that line).`,
    fmt`Because at least one base cell is NOT ${d}, at least one of the two outer cells (${cellName(roof1)} or ${cellName(roof2)}) MUST be ${d}!`
  ];

  const elimDetails: ExplanationEliminationDetail[] = step.eliminations.map((e) => ({
    cell: e.cell,
    cellStr: cellName(e.cell),
    digit: e.digit,
    action: 'remove',
    reason: fmt`Sees both outer cells ${cellName(roof1)} and ${cellName(roof2)}. Because at least one of those two cells must be ${d}, placing ${d} here is impossible.`
  }));

  const walkFrames: Frame[] = [
    {
      text: fmt`Identify the two conjugate pairs: Digit ${d} has only two places in each of two lines.`,
      links: 0,
      show: new Set<Part>(['units', 'primary'])
    },
    {
      text: fmt`Base connection: Base cells ${cellName(base1)} and ${cellName(base2)} see each other, so at most one can be ${d}.`,
      links: 1,
      show: new Set<Part>(['units', 'primary'])
    },
    {
      text: fmt`Roof deduction: Since at least one base is not ${d}, at least one of the outer ends (${cellName(roof1)} or ${cellName(roof2)}) MUST be ${d}!`,
      links: step.links?.length ?? 2,
      show: new Set<Part>(['units', 'primary'])
    },
    {
      text: fmt`Conclusion: Any cell that sees both outer ends (${elimNames}) can never be ${d}, removing ${d} from them.`,
      links: step.links?.length ?? 2,
      show: new Set<Part>(['units', 'primary', 'conclusion'])
    }
  ];

  return {
    tech: step.tech,
    techName,
    synopsis,
    structure: {
      title: fmt`Pattern Structure`,
      description: fmt`Two strong links connected by a weak link between their base cells.`,
      components: [
        {
          role: 'primary',
          label: fmt`Conjugate pairs`,
          cells: primaryCells,
          digits: [d],
          text: fmt`Cells ${cellNames(primaryCells)} forming the strong links on ${d}`
        }
      ]
    },
    whyItWorks: {
      corePrinciple: fmt`Because the two base cells cannot both be ${d}, at least one of the outer roof cells must be ${d}.`,
      deductionSteps
    },
    whyElimination: {
      summary: fmt`Cells seeing both outer ends have candidate ${d} removed.`,
      details: elimDetails
    },
    walkFrames
  };
}

function explainEmptyRectangle(step: Step): StepExplanation {
  const techName = TECHS[step.tech].name;
  const d = step.eliminations[0]?.digit ?? 1;
  const target = step.eliminations[0]?.cell ?? 0;
  const boxUnit = step.units?.find((u) => u.unit >= 18)?.unit ?? 18;
  const boxCells = uniq((step.primary ?? []).map((cd) => cd.cell));
  const pairCells = uniq((step.secondary ?? []).map((cd) => cd.cell));

  const synopsis = fmt`Empty Rectangle on ${d}: in ${unitName(boxUnit)}, all candidates for ${d} lie on a cross; combined with the conjugate pair in ${cellNames(pairCells)}, ${d} is eliminated from ${cellName(target)}.`;

  const deductionSteps = [
    fmt`In ${unitName(boxUnit)}, all candidates for ${d} are confined to one row and one column (forming an L-shape or cross).`,
    fmt`Outside the box, cells ${cellNames(pairCells)} form a conjugate pair: exactly one of them must be ${d}.`,
    fmt`• Case 1: If the conjugate cell aligned with ${cellName(target)} is ${d}, it directly sees and eliminates ${d} from ${cellName(target)}.`,
    fmt`• Case 2: If the other conjugate cell is ${d}, it eliminates ${d} from its arm of ${unitName(boxUnit)}. That forces ${d} in ${unitName(boxUnit)} into the orthogonal arm, which points directly at ${cellName(target)}!`,
    fmt`Conclusion: In both outcomes, digit ${d} appears in a cell that sees ${cellName(target)}. Therefore, ${d} can never go in ${cellName(target)}.`
  ];

  const elimDetails: ExplanationEliminationDetail[] = [
    {
      cell: target,
      cellStr: cellName(target),
      digit: d,
      action: 'remove',
      reason: fmt`Whether the conjugate pair resolves one way or the other, digit ${d} is forced into a cell that sees ${cellName(target)}.`
    }
  ];

  const walkFrames: Frame[] = [
    {
      text: fmt`In ${unitName(boxUnit)}, every candidate for ${d} lies on one row and one column.`,
      links: 0,
      show: new Set<Part>(['units', 'primary'])
    },
    {
      text: fmt`Outside conjugate pair: Cells ${cellNames(pairCells)} are the only places for ${d} in their line.`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'secondary'])
    },
    {
      text: fmt`Deduction: If conjugate cell 1 is ${d}, target sees it. If conjugate cell 2 is ${d}, the box's ${d} is pushed into the line seeing target!`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'secondary'])
    },
    {
      text: fmt`Conclusion: Either way, digit ${d} sees ${cellName(target)}, so ${d} is eliminated from ${cellName(target)}.`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'secondary', 'conclusion'])
    }
  ];

  return {
    tech: step.tech,
    techName,
    synopsis,
    structure: {
      title: fmt`Pattern Structure`,
      description: fmt`An L-shaped cluster in a box coupled with an external conjugate pair.`,
      components: [
        {
          role: 'primary',
          label: fmt`Box cross`,
          cells: boxCells,
          digits: [d],
          text: fmt`Candidates for ${d} in ${unitName(boxUnit)}`
        },
        {
          role: 'secondary',
          label: fmt`Conjugate pair`,
          cells: pairCells,
          digits: [d],
          text: fmt`External strong link on ${d}`
        }
      ]
    },
    whyItWorks: {
      corePrinciple: fmt`Pushing the external conjugate pair pushes the box's digit into the perpendicular line, covering the target cell in both cases.`,
      deductionSteps
    },
    whyElimination: {
      summary: fmt`Candidate ${d} is eliminated from ${cellName(target)}.`,
      details: elimDetails
    },
    walkFrames
  };
}

function explainLockedCandidates(step: Step): StepExplanation {
  const isPointing = step.tech === 'LOCKED_CANDIDATES_1';
  const techName = TECHS[step.tech].name;
  const d = step.eliminations[0]?.digit ?? 1;
  const primaryCells = uniq((step.primary ?? []).map((cd) => cd.cell));
  const boxUnit = (step.units ?? []).find((u) => u.unit >= 18)?.unit ?? (18 + boxOf(primaryCells[0] ?? 0));
  const lineUnit = (step.units ?? []).find((u) => u.unit < 18)?.unit ?? (rowOf(primaryCells[0] ?? 0));
  const elimNames = cellNames(step.eliminations.map((e) => e.cell));

  if (isPointing) {
    const synopsis = fmt`Locked Candidates (Pointing): in ${unitName(boxUnit)}, all candidates for ${d} lie on ${unitName(lineUnit)}, so ${d} is removed from the rest of ${unitName(lineUnit)}.`;

    const deductionSteps = [
      fmt`${unitName(boxUnit)} must contain digit ${d} somewhere.`,
      fmt`Within ${unitName(boxUnit)}, candidate ${d} is confined entirely to ${cellNames(primaryCells)}, which all lie along ${unitName(lineUnit)}.`,
      fmt`Therefore, the ${d} for ${unitName(boxUnit)} is guaranteed to be placed on ${unitName(lineUnit)} inside this box.`,
      fmt`Since ${unitName(lineUnit)} gets its ${d} from inside ${unitName(boxUnit)}, no other cell on ${unitName(lineUnit)} outside the box can be ${d}!`
    ];

    const elimDetails: ExplanationEliminationDetail[] = step.eliminations.map((e) => ({
      cell: e.cell,
      cellStr: cellName(e.cell),
      digit: e.digit,
      action: 'remove',
      reason: fmt`Lies on ${unitName(lineUnit)} outside ${unitName(boxUnit)}. Since ${unitName(boxUnit)} must place its ${d} on this line, no cell outside the box can contain ${d}.`
    }));

    const walkFrames: Frame[] = [
      {
        text: fmt`In ${unitName(boxUnit)}, all remaining candidates for ${d} sit on ${unitName(lineUnit)}.`,
        links: 0,
        show: new Set<Part>(['units', 'primary'])
      },
      {
        text: fmt`Because ${unitName(boxUnit)} must contain ${d}, digit ${d} is guaranteed to land in this line segment.`,
        links: 0,
        show: new Set<Part>(['units', 'primary', 'secondary'])
      },
      {
        text: fmt`Conclusion: Digit ${d} is eliminated from the rest of ${unitName(lineUnit)} (${elimNames}).`,
        links: 0,
        show: new Set<Part>(['units', 'primary', 'secondary', 'conclusion'])
      }
    ];

    return {
      tech: step.tech,
      techName,
      synopsis,
      structure: {
        title: fmt`Pattern Structure`,
        description: fmt`Box candidates confined to a single row or column.`,
        components: [
          {
            role: 'primary',
            label: fmt`Pointing cells`,
            cells: primaryCells,
            digits: [d],
            text: fmt`${cellNames(primaryCells)} in ${unitName(boxUnit)}`
          }
        ]
      },
      whyItWorks: {
        corePrinciple: fmt`Because the box must contain digit ${d}, it claims ${d} on that line, clearing it elsewhere along the line.`,
        deductionSteps
      },
      whyElimination: {
        summary: fmt`Candidate ${d} is removed from the rest of ${unitName(lineUnit)}.`,
        details: elimDetails
      },
      walkFrames
    };
  } else {
    const synopsis = fmt`Locked Candidates (Claiming): in ${unitName(lineUnit)}, all candidates for ${d} lie in ${unitName(boxUnit)}, so ${d} is removed from the rest of ${unitName(boxUnit)}.`;

    const deductionSteps = [
      fmt`${unitName(lineUnit)} must contain digit ${d} somewhere.`,
      fmt`Within ${unitName(lineUnit)}, candidate ${d} is confined entirely to ${cellNames(primaryCells)}, which all sit inside ${unitName(boxUnit)}.`,
      fmt`Therefore, the ${d} for ${unitName(lineUnit)} is guaranteed to be placed inside ${unitName(boxUnit)}.`,
      fmt`Since ${unitName(boxUnit)} gets its ${d} from ${unitName(lineUnit)}, no other cell in ${unitName(boxUnit)} outside that line can be ${d}!`
    ];

    const elimDetails: ExplanationEliminationDetail[] = step.eliminations.map((e) => ({
      cell: e.cell,
      cellStr: cellName(e.cell),
      digit: e.digit,
      action: 'remove',
      reason: fmt`Lies in ${unitName(boxUnit)} outside ${unitName(lineUnit)}. Since ${unitName(lineUnit)} must place its ${d} in this box, no cell in the box outside the line can contain ${d}.`
    }));

    const walkFrames: Frame[] = [
      {
        text: fmt`In ${unitName(lineUnit)}, all remaining candidates for ${d} sit inside ${unitName(boxUnit)}.`,
        links: 0,
        show: new Set<Part>(['units', 'primary'])
      },
      {
        text: fmt`Because ${unitName(lineUnit)} must contain ${d}, digit ${d} is guaranteed to land inside ${unitName(boxUnit)}.`,
        links: 0,
        show: new Set<Part>(['units', 'primary', 'secondary'])
      },
      {
        text: fmt`Conclusion: Digit ${d} is eliminated from the rest of ${unitName(boxUnit)} (${elimNames}).`,
        links: 0,
        show: new Set<Part>(['units', 'primary', 'secondary', 'conclusion'])
      }
    ];

    return {
      tech: step.tech,
      techName,
      synopsis,
      structure: {
        title: fmt`Pattern Structure`,
        description: fmt`Line candidates confined to a single 3×3 box.`,
        components: [
          {
            role: 'primary',
            label: fmt`Claiming cells`,
            cells: primaryCells,
            digits: [d],
            text: fmt`${cellNames(primaryCells)} in ${unitName(lineUnit)}`
          }
        ]
      },
      whyItWorks: {
        corePrinciple: fmt`Because the line must contain digit ${d}, it claims ${d} in that box, clearing it elsewhere in the box.`,
        deductionSteps
      },
      whyElimination: {
        summary: fmt`Candidate ${d} is removed from the rest of ${unitName(boxUnit)}.`,
        details: elimDetails
      },
      walkFrames
    };
  }
}

function explainSubsets(step: Step): StepExplanation {
  const tech = step.tech;
  const techName = TECHS[tech].name;
  const isHidden = tech.startsWith('HIDDEN_');
  const cells = uniq((step.primary ?? []).map((cd) => cd.cell));
  const digits = uniq((step.primary ?? []).map((cd) => cd.digit)).sort((a, b) => a - b);
  const size = cells.length;
  const unit = step.units?.[0]?.unit ?? rowOf(cells[0] ?? 0);
  const house = unitName(unit);
  const elimNames = cellNames(step.eliminations.map((e) => e.cell));

  if (!isHidden) {
    const synopsis = fmt`${techName}: cells ${cellNames(cells)} hold only candidates ${digits.join('/')}, locking those digits and removing them from other cells in ${house}.`;

    const deductionSteps = [
      fmt`${size} cells in ${house} (${cellNames(cells)}) contain only candidates from the set {${digits.join(', ')}}.`,
      fmt`Because ${size} cells must each contain one of those ${size} digits, all ${size} digits are completely claimed and locked into these cells.`,
      fmt`No matter which digit goes where among them, none of those digits can appear anywhere else in ${house}.`
    ];

    const elimDetails: ExplanationEliminationDetail[] = step.eliminations.map((e) => ({
      cell: e.cell,
      cellStr: cellName(e.cell),
      digit: e.digit,
      action: 'remove',
      reason: fmt`Shares ${house} with the locked set ${cellNames(cells)}. Digit ${e.digit} is completely used up by the locked cells.`
    }));

    const walkFrames: Frame[] = [
      {
        text: fmt`${size} cells (${cellNames(cells)}) in ${house} contain only candidates {${digits.join(', ')}}.`,
        links: 0,
        show: new Set<Part>(['units', 'primary'])
      },
      {
        text: fmt`Because ${size} cells must take these ${size} digits, they are completely locked in these cells.`,
        links: 0,
        show: new Set<Part>(['units', 'primary'])
      },
      {
        text: fmt`Conclusion: Digits {${digits.join(', ')}} are eliminated from all other cells in ${house} (${elimNames}).`,
        links: 0,
        show: new Set<Part>(['units', 'primary', 'conclusion'])
      }
    ];

    return {
      tech,
      techName,
      synopsis,
      structure: {
        title: fmt`Pattern Structure`,
        description: fmt`${size} cells holding only ${size} candidates.`,
        components: [
          {
            role: 'primary',
            label: fmt`Locked subset`,
            cells,
            digits,
            text: fmt`${cellNames(cells)} hold {${digits.join(', ')}}`
          }
        ]
      },
      whyItWorks: {
        corePrinciple: fmt`N cells with N candidates completely consume those digits within the house.`,
        deductionSteps
      },
      whyElimination: {
        summary: fmt`Candidates {${digits.join(', ')}} are removed from the rest of ${house}.`,
        details: elimDetails
      },
      walkFrames
    };
  } else {
    const synopsis = fmt`${techName}: in ${house}, digits ${digits.join('/')} fit only in ${cellNames(cells)}, so all other candidates in those cells are eliminated.`;

    const deductionSteps = [
      fmt`${house} must contain digits {${digits.join(', ')}} somewhere.`,
      fmt`Across the entire house, these ${size} digits fit ONLY inside cells ${cellNames(cells)}.`,
      fmt`Because each cell can hold only one number, these ${size} cells must be reserved exclusively for digits {${digits.join(', ')}}.`,
      fmt`Therefore, no other candidate numbers can legally exist in these cells, and all other pencil marks are removed.`
    ];

    const elimDetails: ExplanationEliminationDetail[] = step.eliminations.map((e) => ({
      cell: e.cell,
      cellStr: cellName(e.cell),
      digit: e.digit,
      action: 'remove',
      reason: fmt`This cell must be reserved exclusively for one of {${digits.join(', ')}}. Other candidates cannot fit.`
    }));

    const walkFrames: Frame[] = [
      {
        text: fmt`In ${house}, digits {${digits.join(', ')}} can only fit inside cells ${cellNames(cells)}.`,
        links: 0,
        show: new Set<Part>(['units', 'primary'])
      },
      {
        text: fmt`Since ${house} must contain all ${size} digits, these cells are reserved exclusively for them.`,
        links: 0,
        show: new Set<Part>(['units', 'primary'])
      },
      {
        text: fmt`Conclusion: All other candidates in ${cellNames(cells)} are eliminated, leaving only {${digits.join(', ')}}.`,
        links: 0,
        show: new Set<Part>(['units', 'primary', 'conclusion'])
      }
    ];

    return {
      tech,
      techName,
      synopsis,
      structure: {
        title: fmt`Pattern Structure`,
        description: fmt`${size} digits restricted to only ${size} cells in a house.`,
        components: [
          {
            role: 'primary',
            label: fmt`Hidden subset cells`,
            cells,
            digits,
            text: fmt`${cellNames(cells)} are the only places for {${digits.join(', ')}} in ${house}`
          }
        ]
      },
      whyItWorks: {
        corePrinciple: fmt`Because the house requires all N digits and only N cells can take them, those cells can contain nothing else.`,
        deductionSteps
      },
      whyElimination: {
        summary: fmt`Other candidates are removed from ${cellNames(cells)}.`,
        details: elimDetails
      },
      walkFrames
    };
  }
}

function explainSingles(step: Step): StepExplanation {
  const tech = step.tech;
  const techName = TECHS[tech].name;
  const place = step.placements[0] ?? { cell: 0, digit: 1 };
  const cName = cellName(place.cell);
  const d = place.digit;

  if (tech === 'FULL_HOUSE') {
    const unit = step.units?.[0]?.unit ?? rowOf(place.cell);
    const house = unitName(unit);
    const synopsis = fmt`Full House: ${cName} is the last empty cell in ${house}, so it must be ${d}.`;
    const deductionSteps = [
      fmt`${house} has 8 of its 9 numbers already placed.`,
      fmt`Every Sudoku house must contain numbers 1 through 9 with no duplicates.`,
      fmt`Digit ${d} is the only remaining number needed to complete ${house}, so it must be placed in ${cName}.`
    ];
    return {
      tech,
      techName,
      synopsis,
      structure: {
        title: fmt`Pattern Structure`,
        description: fmt`A house with 8 filled cells and 1 empty cell.`,
        components: [
          {
            role: 'primary',
            label: fmt`Last cell`,
            cells: [place.cell],
            digits: [d],
            text: fmt`${cName} in ${house}`
          }
        ]
      },
      whyItWorks: {
        corePrinciple: fmt`The single empty cell in an almost-completed house must take the missing digit.`,
        deductionSteps
      },
      whyElimination: {
        summary: fmt`${cName} is placed as ${d}.`,
        details: [{ cell: place.cell, cellStr: cName, digit: d, action: 'place', reason: fmt`Last empty cell in ${house}.` }]
      },
      walkFrames: [
        {
          text: fmt`${house} has 8 numbers placed, leaving only ${cName} empty.`,
          links: 0,
          show: new Set<Part>(['units', 'primary'])
        },
        {
          text: fmt`Conclusion: Digit ${d} is the only number missing, so ${cName} must be ${d}.`,
          links: 0,
          show: new Set<Part>(['units', 'primary', 'conclusion'])
        }
      ]
    };
  } else if (tech === 'NAKED_SINGLE') {
    const synopsis = fmt`Naked Single: all other digits 1–9 already appear in ${cName}'s row, column, or box, leaving only ${d}.`;
    const deductionSteps = [
      fmt`Examine all 20 peer cells sharing a row, column, or box with ${cName}.`,
      fmt`Every digit from 1 to 9 (except ${d}) is already placed in one of those peer cells.`,
      fmt`Because no duplicate digits are allowed in any house, cell ${cName} has only one legal choice left: ${d}.`
    ];
    return {
      tech,
      techName,
      synopsis,
      structure: {
        title: fmt`Pattern Structure`,
        description: fmt`A cell with exactly one legal candidate remaining.`,
        components: [
          {
            role: 'primary',
            label: fmt`Single candidate`,
            cells: [place.cell],
            digits: [d],
            text: fmt`${cName} has only ${d} left`
          }
        ]
      },
      whyItWorks: {
        corePrinciple: fmt`When 8 digits are ruled out by peer cells, the 9th digit is forced.`,
        deductionSteps
      },
      whyElimination: {
        summary: fmt`${cName} is placed as ${d}.`,
        details: [{ cell: place.cell, cellStr: cName, digit: d, action: 'place', reason: fmt`All other digits 1–9 are ruled out by peers.` }]
      },
      walkFrames: [
        {
          text: fmt`Examining peers: Every other digit is already placed in ${cName}'s row, column, or box.`,
          links: 0,
          show: new Set<Part>(['units', 'primary'])
        },
        {
          text: fmt`Conclusion: ${cName} has only one candidate left, so it must be ${d}.`,
          links: 0,
          show: new Set<Part>(['units', 'primary', 'conclusion'])
        }
      ]
    };
  } else {
    // Hidden Single
    const unit = step.units?.[0]?.unit ?? rowOf(place.cell);
    const house = unitName(unit);
    const synopsis = fmt`Hidden Single: in ${house}, digit ${d} can only fit in ${cName}.`;
    const deductionSteps = [
      fmt`${house} must contain digit ${d} somewhere.`,
      fmt`Checking all other empty cells in ${house}, every other cell is blocked from holding ${d} by peer placements.`,
      fmt`Even if cell ${cName} has other pencil marks, it is the ONLY place in ${house} where ${d} can legally go.`,
      fmt`Therefore, ${cName} must be ${d}, and any other pencil marks in it are cleared.`
    ];
    return {
      tech,
      techName,
      synopsis,
      structure: {
        title: fmt`Pattern Structure`,
        description: fmt`A digit that fits in only one cell of a house.`,
        components: [
          {
            role: 'primary',
            label: fmt`Unique cell`,
            cells: [place.cell],
            digits: [d],
            text: fmt`${cName} in ${house}`
          }
        ]
      },
      whyItWorks: {
        corePrinciple: fmt`Because the house must contain the digit and only one cell can hold it, that cell is forced.`,
        deductionSteps
      },
      whyElimination: {
        summary: fmt`${cName} is placed as ${d}.`,
        details: [{ cell: place.cell, cellStr: cName, digit: d, action: 'place', reason: fmt`Only cell in ${house} that can hold ${d}.` }]
      },
      walkFrames: [
        {
          text: fmt`In ${house}, digit ${d} fits in only one cell (${cName}).`,
          links: 0,
          show: new Set<Part>(['units', 'primary'])
        },
        {
          text: fmt`Conclusion: ${house} must have a ${d}, so ${cName} must be ${d}.`,
          links: 0,
          show: new Set<Part>(['units', 'primary', 'conclusion'])
        }
      ]
    };
  }
}

function explainChainsAndLoops(step: Step): StepExplanation {
  const tech = step.tech;
  const techName = TECHS[tech].name;
  const links = step.links ?? [];
  const start = links[0]?.from[0] ?? { cell: 0, digit: 1 };
  const end = links[links.length - 1]?.to[0] ?? { cell: 0, digit: 1 };
  const startName = `${start.digit}@${cellName(start.cell)}`;
  const endName = `${end.digit}@${cellName(end.cell)}`;
  const elimNames = cellNames(step.eliminations.map((e) => e.cell));

  if (tech === 'REMOTE_PAIR') {
    const cells = uniq((step.primary ?? []).map((cd) => cd.cell));
    const digits = uniq((step.primary ?? []).map((cd) => cd.digit)).sort((a, b) => a - b);
    const [x, y] = digits.length >= 2 ? digits : [digits[0] ?? 1, 2];

    const synopsis = fmt`Remote Pair: cells ${cellNames(cells)} form an alternating chain of ${x}/${y} pairs; cells seeing both ends lose both ${x} and ${y}.`;

    const deductionSteps = [
      fmt`Every cell in the chain contains only the exact same pair of candidates: {${x}, ${y}}.`,
      fmt`The cells alternate like a 2-colored checkerboard: if one is ${x}, its neighbor must be ${y}, the next is ${x}, and so on.`,
      fmt`In any valid solution, cells at opposite parity ends of the chain will hold OPPOSITE digits—one will be ${x} and the other will be ${y}.`,
      fmt`Any cell that sees both opposite ends sees an ${x} at one end and a ${y} at the other. Therefore, it can be neither ${x} nor ${y}!`
    ];

    const elimDetails: ExplanationEliminationDetail[] = step.eliminations.map((e) => ({
      cell: e.cell,
      cellStr: cellName(e.cell),
      digit: e.digit,
      action: 'remove',
      reason: fmt`Sees opposite ends of the pair chain. Since one end is ${x} and the other is ${y}, candidate ${e.digit} is impossible here.`
    }));

    const walkFrames: Frame[] = [
      {
        text: fmt`Cells ${cellNames(cells)} form a chain where every cell has candidates {${x}, ${y}}.`,
        links: 0,
        show: new Set<Part>(['units', 'primary'])
      },
      {
        text: fmt`Parity alternation: Neighboring cells take opposite digits. One end must be ${x} and the other must be ${y}.`,
        links: links.length,
        show: new Set<Part>(['units', 'primary'])
      },
      {
        text: fmt`Conclusion: Any cell seeing both ends (${elimNames}) sees both ${x} and ${y}, eliminating both numbers.`,
        links: links.length,
        show: new Set<Part>(['units', 'primary', 'conclusion'])
      }
    ];

    return {
      tech,
      techName,
      synopsis,
      structure: {
        title: fmt`Pattern Structure`,
        description: fmt`An alternating chain of identical bivalue cells.`,
        components: [
          {
            role: 'primary',
            label: fmt`Pair chain`,
            cells,
            digits,
            text: fmt`${cellNames(cells)} hold {${x}, ${y}}`
          }
        ]
      },
      whyItWorks: {
        corePrinciple: fmt`Opposite parity cells in a bivalue chain always take opposite digits, eliminating both digits from common peers.`,
        deductionSteps
      },
      whyElimination: {
        summary: fmt`Digits ${x} and ${y} are removed from cells seeing both ends.`,
        details: elimDetails
      },
      walkFrames
    };
  }

  // General AIC / Nice Loop
  const synopsis = fmt`${techName}: alternating inference chain from ${startName} to ${endName} proves at least one endpoint must be true.`;

  const deductionSteps = [
    fmt`Follow the alternating strong and weak inferences starting with candidate ${startName}:`,
    fmt`• Case 1: If ${startName} is TRUE, then any cell seeing it cannot hold that candidate.`,
    fmt`• Case 2: If ${startName} is FALSE, each strong link forces the next candidate to be true, propagating link-by-link through the chain until ${endName} is forced to be TRUE!`,
    fmt`• Conclusion: At least one of ${startName} or ${endName} MUST be true in the solved puzzle.`,
    fmt`Therefore, any candidate conflicting with both endpoints is safely eliminated.`
  ];

  const elimDetails: ExplanationEliminationDetail[] = step.eliminations.map((e) => ({
    cell: e.cell,
    cellStr: cellName(e.cell),
    digit: e.digit,
    action: 'remove',
    reason: fmt`Conflicts with both chain endpoints (${startName} and ${endName}). Because at least one endpoint is guaranteed to be true, this candidate cannot exist.`
  }));

  const walkFrames: Frame[] = [];
  walkFrames.push({
    text: fmt`Chain start: Consider candidate ${startName}. If it is false, we trace the forced implications.`,
    links: 1,
    show: new Set<Part>(['units', 'primary'])
  });

  for (let i = 1; i < links.length; i++) {
    walkFrames.push({
      text: linkText(links[i]),
      links: i + 1,
      show: new Set<Part>(['units', 'primary'])
    });
  }

  walkFrames.push({
    text: fmt`Conclusion: Either ${startName} is true, or the chain forces ${endName} to be true. Candidates conflicting with both (${elimNames}) are eliminated.`,
    links: links.length,
    show: new Set<Part>(['units', 'primary', 'conclusion'])
  });

  return {
    tech,
    techName,
    synopsis,
    structure: {
      title: fmt`Chain Inferences`,
      description: fmt`An alternating chain of strong and weak candidate links.`,
      components: [
        {
          role: 'primary',
          label: fmt`Chain`,
          cells: (step.chainCells ?? (step.primary ?? []).map((cd) => cd.cell)),
          digits: getStepDigits(step),
          text: fmt`Chain from ${startName} to ${endName}`
        }
      ]
    },
    whyItWorks: {
      corePrinciple: fmt`Denying the starting candidate forces the chain to propagate and prove the ending candidate true.`,
      deductionSteps
    },
    whyElimination: {
      summary: fmt`Candidates conflicting with both chain endpoints are eliminated.`,
      details: elimDetails
    },
    walkFrames
  };
}

function explainUniqueness(step: Step): StepExplanation {
  const tech = step.tech;
  const techName = TECHS[tech].name;
  const primaryCells = uniq((step.primary ?? []).map((cd) => cd.cell));
  const digits = uniq((step.primary ?? []).map((cd) => cd.digit)).sort((a, b) => a - b);
  const elimNames = cellNames(step.eliminations.map((e) => e.cell));

  if (tech === 'BUG_PLUS_1') {
    const triCell = primaryCells[0] ?? 0;
    const place = step.placements[0] ?? { cell: triCell, digit: digits[0] ?? 1 };
    const synopsis = fmt`BUG+1: every unsolved cell has 2 candidates except ${cellName(triCell)}; setting it to ${place.digit} prevents a multi-solution grid.`;
    const deductionSteps = [
      fmt`Every unsolved cell on the board currently has exactly two candidates, except for cell ${cellName(triCell)} which has three.`,
      fmt`A Sudoku position where every cell has 2 candidates and every digit appears twice per house has either 0 or 2 solutions (a deadly pattern).`,
      fmt`Because proper Sudoku puzzles must have a unique solution, the deadly pattern must be avoided.`,
      fmt`Candidate ${place.digit} appears 3 times in its houses (odd parity), so cell ${cellName(triCell)} must be placed as ${place.digit} to guarantee uniqueness.`
    ];
    return {
      tech,
      techName,
      synopsis,
      structure: {
        title: fmt`Pattern Structure`,
        description: fmt`A bivalue universal grave with a single tri-value cell.`,
        components: [
          {
            role: 'primary',
            label: fmt`Tri-value cell`,
            cells: [triCell],
            digits: [place.digit],
            text: fmt`${cellName(triCell)} holds three candidates`
          }
        ]
      },
      whyItWorks: {
        corePrinciple: fmt`To prevent a 2-solution deadly pattern across the entire board, the tri-value cell must take its odd-parity candidate.`,
        deductionSteps
      },
      whyElimination: {
        summary: fmt`${cellName(triCell)} is placed as ${place.digit}.`,
        details: [{ cell: place.cell, cellStr: cellName(place.cell), digit: place.digit, action: 'place', reason: fmt`Resolves the Bivalue Universal Grave uniquely.` }]
      },
      walkFrames: [
        {
          text: fmt`Almost every unsolved cell is bivalue: only ${cellName(triCell)} has 3 candidates.`,
          links: 0,
          show: new Set<Part>(['units', 'primary'])
        },
        {
          text: fmt`Conclusion: To avoid the deadly 2-solution pattern, ${cellName(triCell)} must be ${place.digit}.`,
          links: 0,
          show: new Set<Part>(['units', 'primary', 'conclusion'])
        }
      ]
    };
  }

  // Unique Rectangle Types
  const [x, y] = digits.length >= 2 ? digits : [digits[0] ?? 1, 2];
  const synopsis = fmt`${techName}: cells ${cellNames(primaryCells)} on ${x}/${y} would form a deadly 2-solution rectangle; avoiding the deadly pattern forces the deduction.`;

  const deductionSteps = [
    fmt`The four cells ${cellNames(primaryCells)} form a rectangle spanning exactly 2 rows, 2 columns, and 2 boxes.`,
    fmt`If these four cells were restricted to only candidates {${x}, ${y}}, they would form an interchangeable loop with two valid completions ($${x}-${y}-${x}-${y}$ and $${y}-${x}-${y}-${x}$).`,
    fmt`That would mean the entire Sudoku puzzle has multiple valid solutions—violating the rule that proper puzzles have a unique solution.`,
    fmt`Therefore, the deadly pattern must be avoided, forcing the elimination or placement.`
  ];

  const elimDetails: ExplanationEliminationDetail[] = step.eliminations.map((e) => ({
    cell: e.cell,
    cellStr: cellName(e.cell),
    digit: e.digit,
    action: 'remove',
    reason: fmt`Keeping this candidate would allow the deadly ${x}/${y} rectangle to form, destroying uniqueness.`
  }));

  const walkFrames: Frame[] = [
    {
      text: fmt`Deadly rectangle: Cells ${cellNames(primaryCells)} span 2 rows, 2 columns, and 2 boxes with candidates {${x}, ${y}}.`,
      links: 0,
      show: new Set<Part>(['units', 'primary'])
    },
    {
      text: fmt`Uniqueness rule: If all four cells held only {${x}, ${y}}, the puzzle would have multiple solutions.`,
      links: 0,
      show: new Set<Part>(['units', 'primary'])
    },
    {
      text: fmt`Conclusion: The deadly pattern must be broken (${elimNames} lose candidates).`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'conclusion'])
    }
  ];

  return {
    tech,
    techName,
    synopsis,
    structure: {
      title: fmt`Pattern Structure`,
      description: fmt`A 4-cell rectangle spanning 2 rows, 2 columns, and 2 boxes.`,
      components: [
        {
          role: 'primary',
          label: fmt`Rectangle corners`,
          cells: primaryCells,
          digits,
          text: fmt`${cellNames(primaryCells)} share candidates {${x}, ${y}}`
        }
      ]
    },
    whyItWorks: {
      corePrinciple: fmt`A proper Sudoku puzzle has exactly one solution; patterns that would yield two interchangeable solutions must be avoided.`,
      deductionSteps
    },
    whyElimination: {
      summary: fmt`Candidates that would complete the deadly pattern are eliminated.`,
      details: elimDetails
    },
    walkFrames
  };
}

function explainALS(step: Step): StepExplanation {
  const tech = step.tech;
  const techName = TECHS[tech].name;
  const cells = uniq((step.primary ?? []).map((cd) => cd.cell));
  const digits = getStepDigits(step);
  const targetDigit = step.eliminations[0]?.digit ?? digits[0] ?? 1;
  const elimNames = cellNames(step.eliminations.map((e) => e.cell));

  const synopsis = fmt`${techName}: Almost Locked Sets sharing restricted common candidates guarantee that target digit ${targetDigit} must lock in one of the sets.`;

  const deductionSteps = [
    fmt`An Almost Locked Set (ALS) has N cells and N+1 candidates. If it loses any one candidate, its remaining candidates become completely locked in its cells.`,
    fmt`The Almost Locked Sets involved in this pattern share restricted common candidate(s) that see each other.`,
    fmt`Because the sets see each other on the restricted common digit, both sets cannot take that digit simultaneously.`,
    fmt`Whichever set loses the shared candidate is reduced to a locked set, which forces digit ${targetDigit} into that set!`,
    fmt`Conclusion: At least one of the sets MUST place digit ${targetDigit}. Any outside cell seeing all instances of ${targetDigit} in both sets has ${targetDigit} eliminated.`
  ];

  const elimDetails: ExplanationEliminationDetail[] = step.eliminations.map((e) => ({
    cell: e.cell,
    cellStr: cellName(e.cell),
    digit: e.digit,
    action: 'remove',
    reason: fmt`Sees all candidates for ${targetDigit} across the Almost Locked Sets. Because one set is guaranteed to lock and place ${targetDigit}, this cell can never be ${targetDigit}.`
  }));

  const walkFrames: Frame[] = [
    {
      text: fmt`Identify the Almost Locked Sets: Sets of N cells with N+1 candidates.`,
      links: 0,
      show: new Set<Part>(['units', 'primary'])
    },
    {
      text: fmt`Restricted common: The sets share a common candidate that sees each other, so both sets cannot take it.`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'secondary'])
    },
    {
      text: fmt`Deduction: Whichever set loses the common candidate locks target digit ${targetDigit}!`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'secondary'])
    },
    {
      text: fmt`Conclusion: Cells seeing all ${targetDigit}s in both sets (${elimNames}) have ${targetDigit} eliminated.`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'secondary', 'conclusion'])
    }
  ];

  return {
    tech,
    techName,
    synopsis,
    structure: {
      title: fmt`Pattern Structure`,
      description: fmt`Almost Locked Sets connected by restricted common candidate links.`,
      components: [
        {
          role: 'primary',
          label: fmt`ALS cells`,
          cells,
          digits,
          text: fmt`${cellNames(cells)} forming the sets`
        }
      ]
    },
    whyItWorks: {
      corePrinciple: fmt`Restricted common digits ensure that at least one ALS is reduced to a locked set that places the target digit.`,
      deductionSteps
    },
    whyElimination: {
      summary: fmt`Cells seeing all occurrences of ${targetDigit} in the sets lose ${targetDigit}.`,
      details: elimDetails
    },
    walkFrames
  };
}

// ---------------------------------------------------------------------------
// Fallback / Generic Explanation Builder
// ---------------------------------------------------------------------------

function explainGenericStep(step: Step): StepExplanation {
  const tech = step.tech;
  const techName = TECHS[tech]?.name ?? tech;
  const primaryCells = uniq((step.primary ?? []).map((cd) => cd.cell));
  const digits = getStepDigits(step);
  const elimNames = cellNames(step.eliminations.map((e) => e.cell));

  const synopsis = step.description;

  const deductionSteps: string[] = [
    step.description
  ];

  const elimDetails: ExplanationEliminationDetail[] = [
    ...step.eliminations.map((e) => ({
      cell: e.cell,
      cellStr: cellName(e.cell),
      digit: e.digit,
      action: 'remove' as const,
      reason: fmt`Eliminated by the logic of ${techName}.`
    })),
    ...step.placements.map((p) => ({
      cell: p.cell,
      cellStr: cellName(p.cell),
      digit: p.digit,
      action: 'place' as const,
      reason: fmt`Placed by the logic of ${techName}.`
    }))
  ];

  const walkFrames: Frame[] = [];
  walkFrames.push({
    text: fmt`Identify the pattern: ${techName} on cells ${cellNames(primaryCells)}.`,
    links: 0,
    show: new Set<Part>(['units', 'primary'])
  });

  if (step.secondary?.length) {
    walkFrames.push({
      text: fmt`Supporting structure: ${step.labels?.secondary ?? 'supporting cells'}.`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'secondary'])
    });
  }

  if (step.fins?.length) {
    walkFrames.push({
      text: fmt`Fin cells: ${step.labels?.fins ?? 'fin'}.`,
      links: 0,
      show: new Set<Part>(['units', 'primary', 'secondary', 'fins'])
    });
  }

  walkFrames.push({
    text: conclusionText(step) || step.description,
    links: step.links?.length ?? 0,
    show: new Set<Part>(['units', 'primary', 'secondary', 'fins', 'conclusion'])
  });

  return {
    tech,
    techName,
    synopsis,
    structure: {
      title: fmt`Pattern Structure`,
      description: fmt`${techName} pattern formation.`,
      components: [
        {
          role: 'primary',
          label: fmt`Pattern cells`,
          cells: primaryCells,
          digits,
          text: fmt`${cellNames(primaryCells)}`
        }
      ]
    },
    whyItWorks: {
      corePrinciple: fmt`The logical constraints of ${techName} force the conclusion.`,
      deductionSteps
    },
    whyElimination: {
      summary: conclusionText(step),
      details: elimDetails
    },
    walkFrames
  };
}

// ---------------------------------------------------------------------------
// Main Public Dispatcher
// ---------------------------------------------------------------------------

/**
 * Returns a comprehensive, pedagogical explanation for any `Step`.
 * Explains what the pattern is, WHY it works causally (with case analysis),
 * WHY the target notes are removed or placed, and generates rich walk frames.
 */
export function explainStep(step: Step): StepExplanation {
  const tech = step.tech;

  // Wings
  if (tech === 'XY_WING') return explainXYWing(step);
  if (tech === 'XYZ_WING') return explainXYZWing(step);
  if (tech === 'W_WING') return explainWWing(step);

  // Fish
  if (
    tech === 'X_WING' ||
    tech === 'SWORDFISH' ||
    tech === 'JELLYFISH' ||
    tech === 'SQUIRMBAG' ||
    tech === 'WHALE' ||
    tech === 'LEVIATHAN'
  ) {
    return explainBasicFish(step);
  }

  if (
    tech === 'FINNED_X_WING' ||
    tech === 'FINNED_SWORDFISH' ||
    tech === 'FINNED_JELLYFISH' ||
    tech === 'SASHIMI_X_WING' ||
    tech === 'SASHIMI_SWORDFISH' ||
    tech === 'SASHIMI_JELLYFISH' ||
    tech === 'FRANKEN_X_WING' ||
    tech === 'FRANKEN_SWORDFISH'
  ) {
    return explainFinnedFish(step);
  }

  // Turbot family
  if (
    tech === 'SKYSCRAPER' ||
    tech === 'TWO_STRING_KITE' ||
    tech === 'TURBOT_FISH'
  ) {
    return explainTurbotFamily(step);
  }

  if (tech === 'EMPTY_RECTANGLE') {
    return explainEmptyRectangle(step);
  }

  // Locked candidates
  if (tech === 'LOCKED_CANDIDATES_1' || tech === 'LOCKED_CANDIDATES_2') {
    return explainLockedCandidates(step);
  }

  // Subsets
  if (
    tech === 'NAKED_PAIR' ||
    tech === 'NAKED_TRIPLE' ||
    tech === 'NAKED_QUADRUPLE' ||
    tech === 'HIDDEN_PAIR' ||
    tech === 'HIDDEN_TRIPLE' ||
    tech === 'HIDDEN_QUADRUPLE' ||
    tech === 'LOCKED_PAIR' ||
    tech === 'LOCKED_TRIPLE'
  ) {
    return explainSubsets(step);
  }

  // Singles
  if (tech === 'FULL_HOUSE' || tech === 'NAKED_SINGLE' || tech === 'HIDDEN_SINGLE') {
    return explainSingles(step);
  }

  // Chains & Nice Loops
  if (
    tech === 'REMOTE_PAIR' ||
    tech === 'AIC' ||
    tech === 'X_CHAIN' ||
    tech === 'XY_CHAIN' ||
    tech === 'NICE_LOOP' ||
    tech === 'AIC_GROUPED' ||
    tech === 'AIC_ALS' ||
    tech === 'GROUPED_X_CYCLES' ||
    tech === 'GROUPED_NICE_LOOP'
  ) {
    return explainChainsAndLoops(step);
  }

  // Uniqueness
  if (
    tech.startsWith('UNIQUENESS_') ||
    tech === 'BUG_PLUS_1' ||
    tech === 'HIDDEN_RECTANGLE' ||
    tech === 'AVOIDABLE_RECTANGLE_1' ||
    tech === 'AVOIDABLE_RECTANGLE_2' ||
    tech === 'EXTENDED_RECTANGLE'
  ) {
    return explainUniqueness(step);
  }

  // Almost Locked Sets
  if (
    tech === 'ALS_XZ' ||
    tech === 'ALS_XY_WING' ||
    tech === 'ALS_XY_CHAIN' ||
    tech === 'DEATH_BLOSSOM'
  ) {
    return explainALS(step);
  }

  // Generic fallback
  return explainGenericStep(step);
}
