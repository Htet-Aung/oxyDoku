import { describe, it, expect } from 'vitest';
import { useGame } from '../src/state/gameStore';

const PUZZLE = '..3.2.6..9..3.5..1..18.64....81.29..7.......8..67.82....26.95..8..2.3..9..5.1.3..';
const EMPTY = [...PUZZLE].map((ch, i) => (ch === '.' ? i : -1)).filter((i) => i >= 0);

describe('fillCandidates', () => {
  it('defaults to corner marks when in digit mode', () => {
    useGame.getState().startGame(PUZZLE, 196, 'Easy');
    useGame.setState({ mode: 'digit', selection: [] });
    useGame.getState().fillCandidates();
    const cells = useGame.getState().cells;
    expect(cells[EMPTY[0]].corner).toBeGreaterThan(0);
    expect(cells[EMPTY[0]].center).toBe(0);
  });

  it('fills corner marks when in corner mode', () => {
    useGame.getState().startGame(PUZZLE, 196, 'Easy');
    useGame.setState({ mode: 'corner', selection: [] });
    useGame.getState().fillCandidates();
    const cells = useGame.getState().cells;
    expect(cells[EMPTY[0]].corner).toBeGreaterThan(0);
    expect(cells[EMPTY[0]].center).toBe(0);
  });

  it('fills centre marks when in center mode', () => {
    useGame.getState().startGame(PUZZLE, 196, 'Easy');
    useGame.setState({ mode: 'center', selection: [] });
    useGame.getState().fillCandidates();
    const cells = useGame.getState().cells;
    expect(cells[EMPTY[0]].center).toBeGreaterThan(0);
    expect(cells[EMPTY[0]].corner).toBe(0);
  });
});
