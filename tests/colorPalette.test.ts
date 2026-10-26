import { describe, it, expect, beforeEach } from 'vitest';
import { useSettings, DEFAULT_PALETTE, PALETTE_PRESETS } from '../src/state/settings';
import { useGame } from '../src/state/gameStore';
import { getContrastTextColor } from '../src/ui/ColorPaletteBar';

describe('Color Palette & Coloring Workflow', () => {
  beforeEach(() => {
    useSettings.getState().resetPalette();
    useGame.getState().startGame('.'.repeat(81), 0, 'Easy');
    useGame.getState().select([0, 1], false);
  });

  describe('Palette Configuration & Customization', () => {
    it('has exactly 9 default colors matching digits 1 through 9', () => {
      expect(DEFAULT_PALETTE).toHaveLength(9);
      expect(DEFAULT_PALETTE[0]).toBe('#e05563'); // digit 1
      expect(DEFAULT_PALETTE[1]).toBe('#e8934a'); // digit 2
      expect(DEFAULT_PALETTE[2]).toBe('#e6c74c'); // digit 3
      expect(DEFAULT_PALETTE[3]).toBe('#67b96a'); // digit 4
      expect(DEFAULT_PALETTE[4]).toBe('#4fc1b0'); // digit 5
      expect(DEFAULT_PALETTE[5]).toBe('#5b8fe0'); // digit 6
      expect(DEFAULT_PALETTE[6]).toBe('#9b74d8'); // digit 7
      expect(DEFAULT_PALETTE[7]).toBe('#d873b8'); // digit 8
      expect(DEFAULT_PALETTE[8]).toBe('#9aa3b5'); // digit 9
    });

    it('allows customizing an individual palette color and persists it', () => {
      expect(useSettings.getState().customPalette[0]).toBe('#e05563');
      useSettings.getState().setPaletteColor(0, '#ff0000');
      expect(useSettings.getState().customPalette[0]).toBe('#ff0000');
      // Other colors stay intact
      expect(useSettings.getState().customPalette[1]).toBe('#e8934a');
    });

    it('allows applying preset palettes', () => {
      const vivid = PALETTE_PRESETS.find((p) => p.id === 'vivid')!;
      expect(vivid).toBeDefined();
      expect(vivid.colors).toHaveLength(9);

      useSettings.getState().setCustomPalette([...vivid.colors]);
      expect(useSettings.getState().customPalette).toEqual([...vivid.colors]);
    });

    it('resets to default palette on demand', () => {
      useSettings.getState().setPaletteColor(0, '#123456');
      expect(useSettings.getState().customPalette[0]).toBe('#123456');

      useSettings.getState().resetPalette();
      expect(useSettings.getState().customPalette).toEqual([...DEFAULT_PALETTE]);
    });

    it('calculates high-contrast text color for light and dark colors', () => {
      expect(getContrastTextColor('#ffffff')).toBe('#111827');
      expect(getContrastTextColor('#ffff00')).toBe('#111827');
      expect(getContrastTextColor('#000000')).toBe('#ffffff');
      expect(getContrastTextColor('#1e1b4b')).toBe('#ffffff');
    });
  });

  describe('Cell Coloring Interactions', () => {
    it('applies color index digit - 1 when input(digit, "color") is called (e.g. via Z + digit shortcut)', () => {
      const { input, select } = useGame.getState();
      select([10, 11], false);

      // Color with digit 1 (index 0)
      input(1, 'color');
      const cells = useGame.getState().cells;
      expect(cells[10].colors).toContain(0);
      expect(cells[11].colors).toContain(0);

      // Color with digit 5 (index 4)
      input(5, 'color');
      const cellsAfter = useGame.getState().cells;
      expect(cellsAfter[10].colors).toContain(0);
      expect(cellsAfter[10].colors).toContain(4);
      expect(cellsAfter[11].colors).toContain(0);
      expect(cellsAfter[11].colors).toContain(4);
    });

    it('toggles color off when applying an existing color to all selected cells', () => {
      const { input, select } = useGame.getState();
      select([10], false);

      input(2, 'color');
      expect(useGame.getState().cells[10].colors).toContain(1);

      // Calling again toggles it off
      input(2, 'color');
      expect(useGame.getState().cells[10].colors).not.toContain(1);
    });

    it('erases color when erase() is called in color mode', () => {
      const { input, select, setTempMode, erase } = useGame.getState();
      select([10], false);
      input(3, 'color');
      expect(useGame.getState().cells[10].colors).toContain(2);

      setTempMode('color');
      erase();
      setTempMode(null);
      expect(useGame.getState().cells[10].colors).toEqual([]);
    });

    it('temporary mode overrides base mode without permanently changing base mode', () => {
      const { setMode, setTempMode, input, select } = useGame.getState();
      setMode('digit');
      select([5], false);

      // Hold Z simulator: tempMode set to 'color'
      setTempMode('color');
      input(4); // should enter color 4, not digit 4
      expect(useGame.getState().cells[5].value).toBe(0);
      expect(useGame.getState().cells[5].colors).toContain(3);

      // Release Z simulator: tempMode cleared
      setTempMode(null);
      expect(useGame.getState().mode).toBe('digit');
      input(4); // should enter digit 4
      expect(useGame.getState().cells[5].value).toBe(4);
    });
  });

  describe('Multi-Number Highlighting & Digit Filter Workflow', () => {
    it('allows arming multiple digits for filtering without setting armedDigit or armedColor', () => {
      const { select, toggleArmedDigit } = useGame.getState();
      select([], false); // No cells selected

      // Click swatch 1 (digit 1)
      toggleArmedDigit(1, false);
      let state = useGame.getState();
      expect(state.armedDigits).toEqual([1]);
      expect(state.armedDigit).toBeNull();
      expect(state.armedColor).toBeNull();

      // Click swatch 8 (digit 8)
      toggleArmedDigit(8, false);
      state = useGame.getState();
      expect(state.armedDigits).toEqual([1, 8]);
      expect(state.armedDigit).toBeNull();
      expect(state.armedColor).toBeNull();

      // Click swatch 3 (digit 3)
      toggleArmedDigit(3, false);
      state = useGame.getState();
      expect(state.armedDigits).toEqual([1, 8, 3]);
      expect(state.armedDigit).toBeNull();
      expect(state.armedColor).toBeNull();

      // Clicking swatch 8 again toggles it off
      toggleArmedDigit(8, false);
      state = useGame.getState();
      expect(state.armedDigits).toEqual([1, 3]);
      expect(state.armedDigit).toBeNull();
      expect(state.armedColor).toBeNull();
    });

    it('clears all armed digits with clearArmedDigits()', () => {
      const { select, toggleArmedDigit, clearArmedDigits } = useGame.getState();
      select([], false);

      toggleArmedDigit(2, false);
      toggleArmedDigit(5, false);
      expect(useGame.getState().armedDigits).toEqual([2, 5]);

      clearArmedDigits();
      const state = useGame.getState();
      expect(state.armedDigits).toEqual([]);
      expect(state.armedDigit).toBeNull();
      expect(state.armedColor).toBeNull();
    });

    it('swatch toggling does not apply colors to selected cells', () => {
      const { select, toggleArmedDigit } = useGame.getState();
      select([10, 11], false);

      // Swatch click does toggleArmedDigit(digit, false)
      toggleArmedDigit(2, false);
      const cells = useGame.getState().cells;
      expect(cells[10].colors).toEqual([]);
      expect(cells[11].colors).toEqual([]);
      expect(useGame.getState().armedDigits).toEqual([2]);
    });

    it('paints cells when armedColor is armed via keyboard shortcut Z with no selection', () => {
      const { select, setTempMode, input } = useGame.getState();
      select([], false);

      // Arm color 8 via keyboard (hold Z and press 8 with no selection)
      setTempMode('color');
      input(8);
      setTempMode(null);

      const state = useGame.getState();
      expect(state.armedColor).toBe(7);
      expect(state.armedDigit).toBeNull();

      // Simulate clicking cell 15 on the grid while color 8 is armed
      select([15], false);
      input(state.armedColor! + 1, 'color');
      useGame.setState({ selection: [] });

      // Verify cell 15 is colored with color 7, and its value is NOT changed to 8
      const cell15 = useGame.getState().cells[15];
      expect(cell15.colors).toContain(7);
      expect(cell15.value).toBe(0);

      // Verify armedColor is still active to paint the next clicked cell
      expect(useGame.getState().armedColor).toBe(7);

      // Simulate clicking another cell (cell 16)
      select([16], false);
      input(useGame.getState().armedColor! + 1, 'color');
      useGame.setState({ selection: [] });

      const cell16 = useGame.getState().cells[16];
      expect(cell16.colors).toContain(7);
      expect(cell16.value).toBe(0);
    });

    it('arms color via keyboard when holding Z with no selection', () => {
      const { select, setTempMode, input } = useGame.getState();
      select([], false);

      setTempMode('color');
      input(6); // Pressing 6 while holding Z with no cells selected
      setTempMode(null);

      const state = useGame.getState();
      expect(state.armedDigits).toContain(6);
      expect(state.armedColor).toBe(5);
      expect(state.armedDigit).toBeNull();
    });
  });
});
