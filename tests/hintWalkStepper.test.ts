import { describe, it, expect, beforeEach } from 'vitest';
import { useGame } from '../src/state/gameStore';
import { walkFrames } from '../src/engine/hintFrames';
import type { Step } from '../src/engine/steps';

// Mock a multi-frame step (Finned X-Wing with 4 walk frames)
const mockFinnedXWingStep: Step = {
  tech: 'FINNED_X_WING',
  description:
    'Finned X-Wing on 2: in rows 4, 7, 2 sits in columns 4, 7 (r4c4, r4c7, r7c4, r7c7) except for the fin r7c6.',
  units: [
    { unit: 12, role: 'primary' },
    { unit: 15, role: 'primary' },
    { unit: 21, role: 'secondary' },
    { unit: 24, role: 'secondary' }
  ],
  primary: [
    { cell: 30, digit: 2 },
    { cell: 33, digit: 2 },
    { cell: 57, digit: 2 },
    { cell: 60, digit: 2 }
  ],
  fins: [{ cell: 59, digit: 2 }],
  labels: {
    primary: 'base rows: the 2s of the fish',
    secondary: "cover columns: where the base's 2s must land",
    fins: 'fin: 2s outside the fish, in one box; a removal must see every fin'
  },
  eliminations: [{ cell: 32, digit: 2 }],
  placements: []
};

describe('Hint Walk Stepper (0 of N overview -> 1 of N -> ...)', () => {
  beforeEach(() => {
    useGame.setState({
      hint: mockFinnedXWingStep,
      hintStage: 'full',
      walkIndex: 0
    });
  });

  it('verifies that overview state starts at 0 of 4 with back disabled', () => {
    const s = useGame.getState();
    const frames = walkFrames(s.hint!);
    expect(frames.length).toBe(4);

    const walking = s.hintStage === 'walk';
    expect(walking).toBe(false);

    // Stepper index: 0 when !walking, otherwise walkIndex + 1
    const stepperIndex = walking ? Math.min(s.walkIndex, frames.length - 1) + 1 : 0;
    expect(stepperIndex).toBe(0);

    // Previous disabled when !walking
    const prevDisabled = !walking;
    expect(prevDisabled).toBe(true);

    // Next enabled
    const nextDisabled = walking && s.walkIndex >= frames.length - 1;
    expect(nextDisabled).toBe(false);
  });

  it('steps to 1 of 4 when walkHint(1) is called, and back to 0 of 4 when walkHint(-1) is called', () => {
    // Click Next (▶)
    useGame.getState().walkHint(1);
    let s = useGame.getState();
    let frames = walkFrames(s.hint!);

    let walking = s.hintStage === 'walk';
    expect(walking).toBe(true);
    expect(s.walkIndex).toBe(0);

    let stepperIndex = walking ? Math.min(s.walkIndex, frames.length - 1) + 1 : 0;
    expect(stepperIndex).toBe(1);

    // Previous is now ENABLED at 1 of 4
    let prevDisabled = !walking;
    expect(prevDisabled).toBe(false);

    // Click Previous (◀) from 1 of 4
    useGame.getState().walkHint(-1);
    s = useGame.getState();

    // hintStage returns to 'full' (overview)
    expect(s.hintStage).toBe('full');
    walking = s.hintStage === 'walk';
    expect(walking).toBe(false);

    stepperIndex = walking ? Math.min(s.walkIndex, frames.length - 1) + 1 : 0;
    expect(stepperIndex).toBe(0);
    expect(!walking).toBe(true);
  });

  it('advances through 1, 2, 3, 4 of 4 and disables Next at 4 of 4', () => {
    useGame.getState().walkHint(1); // 1 of 4
    expect(useGame.getState().walkIndex).toBe(0);

    useGame.getState().walkHint(1); // 2 of 4
    expect(useGame.getState().walkIndex).toBe(1);

    useGame.getState().walkHint(1); // 3 of 4
    expect(useGame.getState().walkIndex).toBe(2);

    useGame.getState().walkHint(1); // 4 of 4
    expect(useGame.getState().walkIndex).toBe(3);

    const s = useGame.getState();
    const walking = s.hintStage === 'walk';
    const nextDisabled = walking && s.walkIndex >= 3;
    expect(nextDisabled).toBe(true);
  });
});
