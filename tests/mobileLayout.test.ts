import { describe, it, expect, beforeEach } from 'vitest';
import { useSettings, DEFAULT_PALETTE, PALETTE_PRESETS } from '../src/state/settings';

describe('oxyDoku Mobile Layout & Palette Customization', () => {
  beforeEach(() => {
    useSettings.getState().resetPalette();
    useSettings.getState().set({ layoutMode: 'auto' });
  });

  it('defaults to auto layoutMode', () => {
    expect(useSettings.getState().layoutMode).toBe('auto');
  });

  it('updates and persists layoutMode changes', () => {
    useSettings.getState().set({ layoutMode: 'mobile' });
    expect(useSettings.getState().layoutMode).toBe('mobile');

    useSettings.getState().set({ layoutMode: 'desktop' });
    expect(useSettings.getState().layoutMode).toBe('desktop');
  });

  it('provides default 9-color palette for all digits 1 to 9', () => {
    const palette = useSettings.getState().customPalette;
    expect(palette).toHaveLength(9);
    expect(palette[0]).toBe(DEFAULT_PALETTE[0]);
    expect(palette[8]).toBe(DEFAULT_PALETTE[8]);
  });

  it('allows customizing individual digit colors in Settings', () => {
    useSettings.getState().setPaletteColor(0, '#ff0000'); // digit 1
    useSettings.getState().setPaletteColor(4, '#00ff00'); // digit 5

    const palette = useSettings.getState().customPalette;
    expect(palette[0]).toBe('#ff0000');
    expect(palette[4]).toBe('#00ff00');
    expect(palette[1]).toBe(DEFAULT_PALETTE[1]);
  });

  it('applies color presets and resets cleanly', () => {
    const vivid = PALETTE_PRESETS.find((p) => p.id === 'vivid');
    expect(vivid).toBeDefined();

    useSettings.getState().setCustomPalette([...vivid!.colors]);
    expect(useSettings.getState().customPalette[0]).toBe(vivid!.colors[0]);

    useSettings.getState().resetPalette();
    expect(useSettings.getState().customPalette).toEqual([...DEFAULT_PALETTE]);
  });
});
