import { describe, it, expect } from 'vitest';
import { parseGrid } from '../src/engine/board';
import { findNextStep, findAllSteps } from '../src/engine/humanSolver';
import { explainStep } from '../src/content/stepExplainer';
import { walkFrames } from '../src/engine/hintFrames';
import { Step } from '../src/engine/steps';

const EASY = '..3.2.6..9..3.5..1..18.64....81.29..7.......8..67.82....26.95..8..2.3..9..5.1.3..';

describe('Step Explainer Engine (src/engine/stepExplainer.ts)', () => {
  it('generates rich, deductive explanation for a synthetic XY-Wing step', () => {
    const xyWingStep: Step = {
      tech: 'XY_WING',
      placements: [],
      eliminations: [{ cell: 71, digit: 9 }], // r8c9
      primary: [
        { cell: 11, digit: 2 },
        { cell: 11, digit: 4 }
      ], // pivot r2c3 (24)
      secondary: [
        { cell: 16, digit: 9 }, // pincer 1 r2c8 (29)
        { cell: 65, digit: 9 }  // pincer 2 r8c3 (49)
      ],
      labels: { primary: 'pivot', secondary: 'pincers' },
      description: 'XY-Wing: pivot r2c3 (24) with pincers r2c8 (29) and r8c3 (49); one pincer must be 9, so 9 is removed from cells seeing both.'
    };

    const exp = explainStep(xyWingStep);
    expect(exp.tech).toBe('XY_WING');
    expect(exp.techName).toBe('XY-Wing');
    expect(exp.synopsis).toContain('XY-Wing: pivot r2c3');

    // Structure
    expect(exp.structure.components.length).toBeGreaterThanOrEqual(2);
    expect(exp.structure.components[0].role).toBe('primary');
    expect(exp.structure.components[0].cells).toEqual([11]);

    // Why it works (case analysis)
    expect(exp.whyItWorks.cases).toBeDefined();
    expect(exp.whyItWorks.cases!.length).toBe(2);
    expect(exp.whyItWorks.cases![0].title).toContain('Case 1');
    expect(exp.whyItWorks.cases![0].chain.length).toBeGreaterThan(0);
    expect(exp.whyItWorks.cases![1].title).toContain('Case 2');
    expect(exp.whyItWorks.deductionSteps.length).toBeGreaterThanOrEqual(3);

    // Why elimination
    expect(exp.whyElimination.details.length).toBe(1);
    expect(exp.whyElimination.details[0].cellStr).toBe('r8c9');
    expect(exp.whyElimination.details[0].reason).toContain('pincer');

    // Walk frames
    expect(exp.walkFrames.length).toBeGreaterThanOrEqual(4);
    const frames = exp.walkFrames;
    expect(frames.length).toBeGreaterThanOrEqual(4);
    expect(frames[0].text).toContain('pivot');
    expect(frames[frames.length - 1].text).toContain('Conclusion');
  });

  it('generates rich, deductive explanation for a synthetic X-Wing step', () => {
    const xWingStep: Step = {
      tech: 'X_WING',
      placements: [],
      eliminations: [
        { cell: 11, digit: 7 },
        { cell: 65, digit: 7 }
      ],
      primary: [
        { cell: 10, digit: 7 },
        { cell: 16, digit: 7 },
        { cell: 64, digit: 7 },
        { cell: 70, digit: 7 }
      ],
      units: [
        { unit: 1, role: 'primary' }, // row 2
        { unit: 7, role: 'primary' }, // row 8
        { unit: 10, role: 'secondary' }, // col 2
        { unit: 16, role: 'secondary' }  // col 8
      ],
      description: 'X-Wing on 7: in rows 2 and 8, 7 can only go in columns 2 and 8.'
    };

    const exp = explainStep(xWingStep);
    expect(exp.tech).toBe('X_WING');
    expect(exp.whyItWorks.deductionSteps.some((s) => s.includes('cover'))).toBe(true);
    expect(exp.walkFrames.length).toBeGreaterThanOrEqual(3);
  });

  it('generates rich explanation for real puzzle steps', () => {
    const g = parseGrid(EASY)!;
    const steps = findAllSteps(g);
    expect(steps.length).toBeGreaterThan(0);

    for (const step of steps) {
      const exp = explainStep(step);
      expect(exp.tech).toBe(step.tech);
      expect(exp.synopsis.length).toBeGreaterThan(0);
      expect(exp.whyItWorks.deductionSteps.length).toBeGreaterThan(0);
      expect(exp.walkFrames.length).toBeGreaterThan(0);
    }
  });

  it('generates clear Skyscraper explanation', () => {
    const skyscraperStep: Step = {
      tech: 'SKYSCRAPER',
      placements: [],
      eliminations: [{ cell: 30, digit: 5 }],
      primary: [
        { cell: 10, digit: 5 }, // base 1
        { cell: 19, digit: 5 }, // base 2 (sees base 1 in col 2)
        { cell: 16, digit: 5 }, // roof 1
        { cell: 25, digit: 5 }  // roof 2
      ],
      links: [
        { from: [{ cell: 10, digit: 5 }], to: [{ cell: 19, digit: 5 }], strong: false },
        { from: [{ cell: 10, digit: 5 }], to: [{ cell: 16, digit: 5 }], strong: true },
        { from: [{ cell: 19, digit: 5 }], to: [{ cell: 25, digit: 5 }], strong: true }
      ],
      description: 'Skyscraper on 5: r2c2 and r2c8 in row 2...'
    };

    const exp = explainStep(skyscraperStep);
    expect(exp.tech).toBe('SKYSCRAPER');
    expect(exp.whyItWorks.deductionSteps.some((s) => s.includes('base') || s.includes('outer'))).toBe(true);
    expect(exp.walkFrames.length).toBeGreaterThanOrEqual(3);
  });

  it('generates clear Locked Candidates explanation', () => {
    const pointingStep: Step = {
      tech: 'LOCKED_CANDIDATES_1',
      placements: [],
      eliminations: [{ cell: 5, digit: 4 }, { cell: 6, digit: 4 }],
      primary: [
        { cell: 1, digit: 4 },
        { cell: 2, digit: 4 }
      ],
      units: [
        { unit: 18, role: 'primary' }, // box 1
        { unit: 0, role: 'secondary' }  // row 1
      ],
      description: 'Locked Candidates (Pointing): in box 1, digit 4 is confined to r1c2, r1c3.'
    };

    const exp = explainStep(pointingStep);
    expect(exp.tech).toBe('LOCKED_CANDIDATES_1');
    expect(exp.whyItWorks.corePrinciple).toContain('claims');
    expect(exp.whyElimination.details.length).toBe(2);
  });
});
