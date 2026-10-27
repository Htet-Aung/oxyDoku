// The color palette toolbar: displays the 9 Sudoku colors numbered 1 to 9,
// lets players highlight/filter digits by clicking swatches, apply colors to selected cells with Z + 1-9,
// and supports full customization with persistence across sessions.
import React, { useState } from 'react';
import { useT } from '../content/i18n';
import { useGame } from '../state/gameStore';
import { useSettings, DEFAULT_PALETTE, PALETTE_PRESETS } from '../state/settings';
import { Modal } from './Dialogs';
import { PaletteIcon, CheckIcon } from './Icons';

export function getContrastTextColor(hex: string): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? '#111827' : '#ffffff';
}

export function ColorPaletteBar({ zHeld = false }: { zHeld?: boolean }) {
  const [customizing, setCustomizing] = useState(false);
  const selection = useGame((s) => s.selection);
  const cells = useGame((s) => s.cells);
  const mode = useGame((s) => s.mode);
  const tempMode = useGame((s) => s.tempMode);
  const armedDigits = useGame((s) => s.armedDigits);
  const armedDigit = useGame((s) => s.armedDigit);
  const armedColor = useGame((s) => s.armedColor);
  const toggleArmedDigit = useGame((s) => s.toggleArmedDigit);
  const armDigit = useGame((s) => s.armDigit);
  const clearArmedDigits = useGame((s) => s.clearArmedDigits);

  const customPalette = useSettings((s) => s.customPalette);
  const numpadInputMode = useSettings((s) => s.numpadInputMode);
  const setPaletteColor = useSettings((s) => s.setPaletteColor);
  const setCustomPalette = useSettings((s) => s.setCustomPalette);
  const resetPalette = useSettings((s) => s.resetPalette);

  const palette = customPalette && customPalette.length === 9 ? customPalette : DEFAULT_PALETTE;
  const t = useT();

  const isColorActive = zHeld || tempMode === 'color' || mode === 'color';

  const selectedHasColor = (k: number) => {
    if (!selection.length) return false;
    return selection.every((i) => cells[i].colors.includes(k));
  };

  const selectedHasAnyColor = selection.some((i) => cells[i].colors.length > 0);

  const onSwatchClick = (digit: number) => {
    if (numpadInputMode === 'digitFirst') {
      if (isColorActive) {
        useGame.setState({
          armedColor: armedColor === digit - 1 ? null : digit - 1,
          armedDigit: null,
          armedDigits: armedColor === digit - 1 ? [] : [digit]
        });
      } else {
        armDigit(armedDigit === digit ? null : digit);
      }
    } else {
      toggleArmedDigit(digit, isColorActive);
    }
  };

  const onClearColors = () => {
    if (selection.length > 0 && selectedHasAnyColor) {
      useGame.getState().setTempMode('color');
      useGame.getState().erase();
      useGame.getState().setTempMode(null);
    } else {
      clearArmedDigits();
    }
  };

  const canClear =
    selectedHasAnyColor || armedDigits.length > 0 || armedColor !== null;

  return (
    <div
      className={`color-palette-bar ${isColorActive ? 'color-palette-active' : ''}`}
      role="toolbar"
      aria-label={t('Colour palette')}
    >
      <div className="color-swatches-container">
        {palette.map((colorHex, k) => {
          const digit = k + 1;
          const contrast = getContrastTextColor(colorHex);
          const isFiltered =
            numpadInputMode === 'digitFirst'
              ? isColorActive
                ? armedColor === digit - 1
                : armedDigit === digit
              : armedDigits.includes(digit);
          const hasColor = selectedHasColor(k);
          const isArmedPaint = selection.length === 0 && armedColor === k;

          return (
            <button
              key={digit}
              type="button"
              className={`color-swatch-btn ${isFiltered ? 'swatch-selected' : ''} ${isArmedPaint ? 'swatch-armed-paint' : ''}`}
              style={{
                backgroundColor: colorHex,
                borderColor: isFiltered || hasColor ? contrast : 'rgba(0, 0, 0, 0.2)'
              }}
              data-digit={digit}
              onClick={() => onSwatchClick(digit)}
              title={t('Colour {n}: hold Z + {n} · Click to highlight', { n: digit })}
              aria-label={t('Colour {n}', { n: digit })}
              aria-pressed={isFiltered}
            >
              <span className="swatch-number" style={{ color: contrast }}>
                {digit}
              </span>
              {hasColor && (
                <span className="swatch-check-badge" style={{ color: contrast }}>
                  <CheckIcon size={12} />
                </span>
              )}
            </button>
          );
        })}

        <button
          type="button"
          className="color-bar-btn color-erase-btn"
          onClick={onClearColors}
          disabled={!canClear}
          title={
            selection.length > 0 && selectedHasAnyColor
              ? t('Clear colours in selected cells (or hold Z + Backspace)')
              : t('Clear marked numbers')
          }
          aria-label={selection.length > 0 && selectedHasAnyColor ? t('Clear colours') : t('Clear marked numbers')}
        >
          <span aria-hidden="true">⌫</span>
        </button>

        <button
          type="button"
          className="color-bar-btn color-customize-btn"
          onClick={() => setCustomizing(true)}
          title={t('Customize colours')}
          aria-label={t('Customize colours')}
        >
          <span aria-hidden="true"><PaletteIcon size={16} /></span>
        </button>
      </div>

      {(isColorActive || armedDigits.length > 0) && (
        <div className="color-bar-hint">
          {selection.length === 0 && armedDigits.length > 0 ? (
            <span>
              {armedColor !== null
                ? t('Marked: {digits} · Tap cell to paint colour {color} · Esc clears', {
                    digits: armedDigits.slice().sort((a, b) => a - b).join(', '),
                    color: armedColor + 1
                  })
                : t('Marked: {digits} · Esc clears', {
                    digits: armedDigits.slice().sort((a, b) => a - b).join(', ')
                  })}
            </span>
          ) : (
            <span>{t('Colour mode (hold Z + 1–9 to colour)')}</span>
          )}
        </div>
      )}

      {customizing && (
        <Modal title={t('Customize colours')} onClose={() => setCustomizing(false)}>
          <p className="dialog-note">
            {t(
              'Sudoku colouring uses 9 colours (digits 1 to 9). You can customize any individual colour or pick a preset palette. Preferences are saved automatically for future sessions.'
            )}
          </p>

          <div className="palette-customizer-grid">
            {palette.map((colorHex, k) => {
              const digit = k + 1;
              return (
                <div key={digit} className="palette-color-row">
                  <span className="palette-row-label">
                    <strong>{t('Colour {n}', { n: digit })}</strong>
                    <small>({digit})</small>
                  </span>
                  <div className="palette-row-inputs">
                    <input
                      type="color"
                      className="palette-color-picker"
                      value={colorHex}
                      onChange={(e) => setPaletteColor(k, e.target.value)}
                      aria-label={t('Colour {n} picker', { n: digit })}
                    />
                    <input
                      type="text"
                      className="palette-color-hex"
                      value={colorHex}
                      size={7}
                      maxLength={7}
                      spellCheck={false}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                          setPaletteColor(k, val);
                        }
                      }}
                      aria-label={t('Colour {n} hex code', { n: digit })}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="palette-presets-section">
            <span className="tools-section-title">{t('Presets')}</span>
            <div className="palette-presets-row">
              {PALETTE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="preset-btn"
                  onClick={() => setCustomPalette([...preset.colors])}
                >
                  <span className="preset-name">{t(preset.name)}</span>
                  <span className="preset-preview">
                    {preset.colors.map((c, i) => (
                      <span key={i} className="preset-dot" style={{ backgroundColor: c }} />
                    ))}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="hint-actions palette-actions">
            <button type="button" className="ghost" onClick={resetPalette}>
              {t('Reset to default colours')}
            </button>
            <button type="button" onClick={() => setCustomizing(false)}>
              {t('Done')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
