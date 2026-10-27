import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { useGame, engineGrid } from '../src/state/gameStore';
import { MobileFloatingPanel } from '../src/ui/mobile/MobileFloatingPanel';
import { findNextStep } from '../src/engine/humanSolver';

const HARD_PUZZLE =
  '...6..9.1..95....4....4985..241....5....3....9....546..7549....3....12..1.2..3...';

describe('Mobile Progressive Hint Flow', () => {
  it('preserves progressive hint disclosure in compact mode: hint -> show me -> answer -> walk stepper', () => {
    useGame.getState().startGame(HARD_PUZZLE, 1348, 'Hard');
    const step = findNextStep(engineGrid(useGame.getState().cells));
    expect(step).not.toBeNull();

    // 1. Initial hint request sets hintStage: 'tech'
    useGame.setState({ hint: step, hintStage: 'tech', walkIndex: 0 });

    const techHtml = renderToString(
      React.createElement(MobileFloatingPanel, {
        activeTab: 'hint',
        initialSize: 'compact',
        onClose: () => {},
        onOpenTab: () => {},
        onLearn: () => {},
        onOpenMastery: () => {},
      })
    );

    // In tech stage: must show "The next step uses" and "Show me" button
    expect(techHtml).toContain('The next step uses');
    expect(techHtml).toContain('Show me');
    // Must NOT spoil the move description or show Apply move
    expect(techHtml).not.toContain(step!.description);
    expect(techHtml).not.toContain('Apply move');

    // 2. Tapping "Show me" reveals the hint (hintStage: 'full')
    useGame.getState().revealHint();
    expect(useGame.getState().hintStage).toBe('full');

    const fullHtml = renderToString(
      React.createElement(MobileFloatingPanel, {
        activeTab: 'hint',
        initialSize: 'compact',
        onClose: () => {},
        onOpenTab: () => {},
        onLearn: () => {},
        onOpenMastery: () => {},
      })
    );

    // In full stage: shows step description and Apply move button
    expect(fullHtml).toContain('Hidden Single');
    expect(fullHtml).toContain('fits only in');
    expect(fullHtml).toContain('Apply move');
    expect(fullHtml).not.toContain('Show me');

    // 3. Tapping the arrow key starts walking (hintStage: 'walk')
    useGame.getState().walkHint(1);
    expect(useGame.getState().hintStage).toBe('walk');
    expect(useGame.getState().walkIndex).toBe(0);

    const walkHtml = renderToString(
      React.createElement(MobileFloatingPanel, {
        activeTab: 'hint',
        initialSize: 'compact',
        onClose: () => {},
        onOpenTab: () => {},
        onLearn: () => {},
        onOpenMastery: () => {},
      })
    );

    // Stepper shows "1 of"
    expect(walkHtml).toContain('1 of');
    expect(walkHtml).toContain('Apply move');
  });

  it('also displays hint stage in expanded mode', () => {
    useGame.getState().startGame(HARD_PUZZLE, 1348, 'Hard');
    const step = findNextStep(engineGrid(useGame.getState().cells));
    expect(step).not.toBeNull();

    useGame.setState({ hint: step, hintStage: 'tech', walkIndex: 0 });

    const expandedHtml = renderToString(
      React.createElement(MobileFloatingPanel, {
        activeTab: 'hint',
        initialSize: 'expanded',
        onClose: () => {},
        onOpenTab: () => {},
        onLearn: () => {},
        onOpenMastery: () => {},
      })
    );

    expect(expandedHtml).toContain('The next step uses');
    expect(expandedHtml).toContain('Show me');
  });
});
