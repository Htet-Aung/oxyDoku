import React, { useRef, useState } from 'react';
import { useGame, EntryMode } from '../../state/gameStore';
import { useSettings, DEFAULT_PALETTE } from '../../state/settings';
import { useT, msg } from '../../content/i18n';
import { PALETTE } from '../Grid';
import { EraserIcon, UndoIcon, RedoIcon, PencilIcon, ShiftIcon } from '../Icons';

const MODES: { id: EntryMode; label: string }[] = [
  { id: 'digit', label: msg('Digit') },
  { id: 'corner', label: msg('Corner') },
  { id: 'center', label: msg('Centre') },
  { id: 'color', label: msg('Colour') }
];

export function MobileNumpad() {
  const mode = useGame((s) => s.mode);
  const tempMode = useGame((s) => s.tempMode);
  const effectiveMode = tempMode ?? mode;
  const setMode = useGame((s) => s.setMode);
  const input = useGame((s) => s.input);
  const erase = useGame((s) => s.erase);
  const wipe = useGame((s) => s.wipe);
  const undo = useGame((s) => s.undo);
  const redo = useGame((s) => s.redo);
  const canUndo = useGame((s) => s.history.length > 0);
  const canRedo = useGame((s) => s.future.length > 0);
  const convertMarks = useGame((s) => s.convertMarks);
  const selection = useGame((s) => s.selection);
  const armedDigits = useGame((s) => s.armedDigits);
  const toggleArmedDigit = useGame((s) => s.toggleArmedDigit);
  const shiftActive = useGame((s) => s.shiftActive);
  const toggleShift = useGame((s) => s.toggleShift);

  const customPalette = useSettings((s) => s.customPalette);
  const palette = customPalette && customPalette.length === 9 ? customPalette : DEFAULT_PALETTE;
  const t = useT();

  // Long-press detection on number keys: holding enters a corner mark directly
  const keyHold = useRef<{ digit: number; timer: number; fired: boolean } | null>(null);
  const lastKeyPointer = useRef(0);
  const [heldKey, setHeldKey] = useState<number | null>(null);

  const pressKey = (d: number) => {
    lastKeyPointer.current = Date.now();
    if (keyHold.current) window.clearTimeout(keyHold.current.timer);
    const hold = { digit: d, timer: 0, fired: false };
    hold.timer = window.setTimeout(() => {
      hold.fired = true;
      setHeldKey(d);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(14);
      }
      input(d, 'corner');
    }, 320);
    keyHold.current = hold;
  };

  const releaseKey = (d: number | null) => {
    const hold = keyHold.current;
    if (!hold) return;
    keyHold.current = null;
    window.clearTimeout(hold.timer);
    setHeldKey(null);

    // If lifted before timer fired and still on the target key: standard tap
    if (!hold.fired && d === hold.digit) {
      if (selection.length === 0) {
        // With nothing selected, tap arms/highlights that digit
        toggleArmedDigit(d, false);
      } else {
        input(d);
      }
    }
  };

  const cancelKey = () => {
    if (keyHold.current) {
      window.clearTimeout(keyHold.current.timer);
      keyHold.current = null;
    }
    setHeldKey(null);
  };

  // Erase button: long press wipes everything in selected cells
  const eraseHold = useRef<number | null>(null);
  const onEraseDown = () => {
    eraseHold.current = window.setTimeout(() => {
      eraseHold.current = null;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(20);
      }
      wipe();
    }, 450);
  };
  const onEraseUp = () => {
    if (eraseHold.current !== null) {
      window.clearTimeout(eraseHold.current);
      eraseHold.current = null;
      erase();
    }
  };

  return (
    <div className="mobile-numpad-container" role="region" aria-label={t('Number Pad')}>
      {/* Mode switcher & Quick action bar */}
      <div className="mobile-mode-row">
        <div className="mobile-mode-pills" role="radiogroup" aria-label={t('Entry mode')}>
          {MODES.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={effectiveMode === m.id}
              className={`mobile-mode-pill ${effectiveMode === m.id ? 'active' : ''}`}
              onClick={() => setMode(m.id)}
            >
              {t(m.label)}
            </button>
          ))}
        </div>

        <div className="mobile-utility-actions">
          <button
            type="button"
            className="mobile-util-btn"
            onClick={undo}
            disabled={!canUndo}
            title={t('Undo')}
            aria-label={t('Undo')}
          >
            <UndoIcon size={18} />
          </button>
          <button
            type="button"
            className="mobile-util-btn"
            onClick={redo}
            disabled={!canRedo}
            title={t('Redo')}
            aria-label={t('Redo')}
          >
            <RedoIcon size={18} />
          </button>
          <button
            type="button"
            className="mobile-util-btn"
            onClick={convertMarks}
            title={t('Swap corner and centre marks')}
            aria-label={t('Swap corner and centre marks')}
          >
            <span className="swap-icon-text" aria-hidden="true">⇄</span>
          </button>
        </div>
      </div>

      {/* 3x3 Number Pad */}
      <div className="mobile-numpad-grid" role="group" aria-label={t('Numbers')}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
          const colorHex = palette[d - 1] ?? PALETTE[d - 1];
          const isArmed = armedDigits.includes(d);
          const isHeld = heldKey === d;
          const isColorMode = effectiveMode === 'color';

          return (
            <button
              key={d}
              type="button"
              className={`mobile-num-btn ${isArmed ? 'armed' : ''} ${isHeld ? 'held-corner' : ''} ${isColorMode ? 'color-mode-btn' : ''}`}
              style={{
                '--num-accent-color': colorHex
              } as React.CSSProperties}
              aria-pressed={isArmed}
              title={t('Number {d}', { d })}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                pressKey(d);
              }}
              onPointerUp={() => releaseKey(d)}
              onPointerLeave={cancelKey}
              onPointerCancel={cancelKey}
              onContextMenu={(e) => e.preventDefault()}
            >
              <span className="mobile-num-color-strip" style={{ backgroundColor: colorHex }} />
              <span className="mobile-num-digit">{d}</span>
              {isHeld && <span className="mobile-num-held-tag">{t('Corner')}</span>}
            </button>
          );
        })}
      </div>

      {/* Shift and Erase buttons */}
      <div className="mobile-numpad-bottom-row">
        <button
          type="button"
          className={`mobile-shift-btn ${shiftActive ? 'active' : ''}`}
          onClick={toggleShift}
          title={t('Shift (multi-select cells, corner marks in digit mode)')}
          aria-label={t('Shift')}
          aria-pressed={shiftActive}
        >
          <ShiftIcon size={18} />
          <span className="mobile-shift-label">{t('Shift')}</span>
        </button>

        <button
          type="button"
          className="mobile-erase-btn"
          onPointerDown={onEraseDown}
          onPointerUp={onEraseUp}
          onPointerLeave={() => {
            if (eraseHold.current !== null) {
              window.clearTimeout(eraseHold.current);
              eraseHold.current = null;
            }
          }}
          title={t('Erase (hold to wipe completely)')}
          aria-label={t('Erase')}
        >
          <EraserIcon size={18} />
          <span className="mobile-erase-label">{t('Erase')}</span>
        </button>
      </div>
    </div>
  );
}
