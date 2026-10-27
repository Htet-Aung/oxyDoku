import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { hasBoardProgress, useGame } from '../src/state/gameStore';
import { usePractice } from '../src/state/practiceStore';
import { useSettings } from '../src/state/settings';
import { Modal } from '../src/ui/Dialogs';

const EASY = '..3.2.6..9..3.5..1..18.64....81.29..7.......8..67.82....26.95..8..2.3..9..5.1.3..';

describe('hasBoardProgress logic', () => {
  beforeEach(() => {
    useSettings.setState({ practiceFastForward: true });
    useGame.setState({
      info: null,
      custom: false,
      won: false,
      solved: false,
      history: [],
      cells: Array.from({ length: 81 }, () => ({
        given: false,
        value: 0,
        corner: 0,
        center: 0,
        excluded: 0,
        colors: []
      })),
      autoCandidates: false,
      practiceFound: false
    });
    usePractice.setState({
      mode: 'inactive',
      targetTech: null,
      exerciseState: 'idle',
      currentHintLevel: 0,
      userAnswer: { digits: [], cells: [] },
      lastResult: null
    });
  });

  it('returns false when no game is active', () => {
    const game = useGame.getState();
    const practice = usePractice.getState();
    expect(hasBoardProgress(game, practice)).toBe(false);
  });

  it('returns false on a pristine, untouched puzzle', () => {
    useGame.getState().startGame(EASY, 100, 'Easy');
    const game = useGame.getState();
    const practice = usePractice.getState();
    expect(hasBoardProgress(game, practice)).toBe(false);
  });

  it('returns true when a player enters a digit on the board', () => {
    useGame.getState().startGame(EASY, 100, 'Easy');
    // Find an empty cell
    const emptyIdx = useGame.getState().cells.findIndex((c) => !c.given);
    useGame.getState().select([emptyIdx], false);
    useGame.getState().input(4);

    const game = useGame.getState();
    expect(hasBoardProgress(game, usePractice.getState())).toBe(true);
  });

  it('returns true when a player adds pencil marks', () => {
    useGame.getState().startGame(EASY, 100, 'Easy');
    const emptyIdx = useGame.getState().cells.findIndex((c) => !c.given);
    useGame.getState().select([emptyIdx], false);
    useGame.getState().setMode('corner');
    useGame.getState().input(5);

    const game = useGame.getState();
    expect(hasBoardProgress(game, usePractice.getState())).toBe(true);
  });

  it('returns true when a player switches auto candidates on', () => {
    useGame.getState().startGame(EASY, 100, 'Easy');
    useGame.getState().toggleAutoCandidates();

    const game = useGame.getState();
    expect(hasBoardProgress(game, usePractice.getState())).toBe(true);
  });

  it('returns false once the puzzle is won or solved', () => {
    useGame.getState().startGame(EASY, 100, 'Easy');
    const emptyIdx = useGame.getState().cells.findIndex((c) => !c.given);
    useGame.getState().select([emptyIdx], false);
    useGame.getState().input(4);

    useGame.setState({ won: true });
    expect(hasBoardProgress(useGame.getState(), usePractice.getState())).toBe(false);

    useGame.setState({ won: false, solved: true });
    expect(hasBoardProgress(useGame.getState(), usePractice.getState())).toBe(false);
  });

  it('handles custom entry mode correctly', () => {
    useGame.getState().startCustomEntry();
    expect(hasBoardProgress(useGame.getState(), usePractice.getState())).toBe(false);

    // Enter a given digit
    useGame.getState().select([0], false);
    useGame.getState().input(7);
    expect(hasBoardProgress(useGame.getState(), usePractice.getState())).toBe(true);
  });

  it('handles practice mode correctly', () => {
    // Start practice puzzle
    useGame.getState().startGame(EASY, 200, 'Medium', 'NAKED_SINGLE');
    const game = useGame.getState();
    const practice = usePractice.getState();

    // Pristine practice position (fast-forwarded by default)
    expect(hasBoardProgress(game, practice)).toBe(false);

    // Player selects a candidate digit in practice
    usePractice.setState({ userAnswer: { digits: [3], cells: [] } });
    expect(hasBoardProgress(useGame.getState(), usePractice.getState())).toBe(true);

    // Player clears answer but requested a progressive hint
    usePractice.setState({ userAnswer: { digits: [], cells: [] }, currentHintLevel: 1 });
    expect(hasBoardProgress(useGame.getState(), usePractice.getState())).toBe(true);

    // Player made moves on the board
    usePractice.setState({ currentHintLevel: 0 });
    const emptyIdx = useGame.getState().cells.findIndex((c) => !c.given && !c.value);
    useGame.getState().select([emptyIdx], false);
    useGame.getState().input(9);
    expect(hasBoardProgress(useGame.getState(), usePractice.getState())).toBe(true);

    // Player successfully found the pattern
    useGame.setState({ practiceFound: true });
    expect(hasBoardProgress(useGame.getState(), usePractice.getState())).toBe(false);

    // Or practice lastResult is correct
    useGame.setState({ practiceFound: false });
    usePractice.setState({ lastResult: { title: 'Correct', feedback: 'Great job!', isCorrect: true, status: 'exact' } });
    expect(hasBoardProgress(useGame.getState(), usePractice.getState())).toBe(false);
  });

  it('renders confirmation modal with warning and actions without emojis', () => {
    const html = renderToString(
      React.createElement(
        Modal,
        {
          title: 'Change board?',
          onClose: () => {},
          children: [
            React.createElement('p', { key: 'note', className: 'dialog-note' }, 'Your progress on this current board will be lost.'),
            React.createElement(
              'div',
              { key: 'actions', className: 'hint-actions' },
              React.createElement('button', { key: 'change' }, 'Change board'),
              React.createElement('button', { key: 'keep', className: 'ghost' }, 'Keep playing')
            )
          ]
        }
      )
    );
    expect(html).toContain('Change board?');
    expect(html).toContain('Your progress on this current board will be lost.');
    expect(html).toContain('Change board');
    expect(html).toContain('Keep playing');
    // Ensure no raw emojis
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
