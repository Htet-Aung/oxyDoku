import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { useGame, engineGrid } from '../src/state/gameStore';
import { MobileFloatingPanel } from '../src/ui/mobile/MobileFloatingPanel';
import { HintPanel } from '../src/ui/HintPanel';
import { StepExplanationView } from '../src/ui/StepExplanationView';
import { findNextStep } from '../src/engine/humanSolver';

const HARD_PUZZLE =
  '...6..9.1..95....4....4985..241....5....3....9....546..7549....3....12..1.2..3...';

describe('Mobile hint crash and interaction test', () => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  };

  it('renders StepExplanationView, HintPanel and MobileFloatingPanel without crashing', () => {
    useGame.getState().startGame(HARD_PUZZLE, 1348, 'Hard');
    const step = findNextStep(engineGrid(useGame.getState().cells));
    expect(step).not.toBeNull();
    useGame.setState({ hint: step, hintStage: 'full' });

    // StepExplanationView
    expect(() => {
      renderToString(React.createElement(StepExplanationView, { step: step! }));
    }).not.toThrow();

    // HintPanel
    expect(() => {
      renderToString(React.createElement(HintPanel, { onLearn: () => {} }));
    }).not.toThrow();

    // MobileFloatingPanel in compact mode
    const compactHtml = renderToString(
      React.createElement(MobileFloatingPanel, {
        activeTab: 'hint',
        onClose: () => {},
        onOpenTab: () => {},
        onLearn: () => {},
        onOpenMastery: () => {},
      })
    );
    expect(compactHtml).toContain('mobile-floating-btn');
    expect(compactHtml).not.toContain('close-btn');

    // Dismiss hint while activeTab is hint
    useGame.getState().dismissHint();

    // Re-render MobileFloatingPanel when hint is null
    expect(() => {
      renderToString(
        React.createElement(MobileFloatingPanel, {
          activeTab: 'hint',
          onClose: () => {},
          onOpenTab: () => {},
          onLearn: () => {},
          onOpenMastery: () => {},
        })
      );
    }).not.toThrow();
  });
});
