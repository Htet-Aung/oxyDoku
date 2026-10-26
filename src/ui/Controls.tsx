// The control panel: analysis-first controls providing primary pattern scanning,
// next-step hint trigger, and secondary candidate/verification tools.
// Keyboard interactions handle digit/mark input without an on-screen numpad.
import React, { useState } from 'react';
import { useT, msg, Translator } from '../content/i18n';
import { useGame, EntryMode } from '../state/gameStore';
import { useSettings, MarkLayer } from '../state/settings';
import { Modal } from './Dialogs';
import { MicroscopeIcon, LightbulbIcon, ToolsIcon, CheckIcon, ChainIcon, PencilIcon } from './Icons';

function eraseTitle(t: Translator, mode: EntryMode, auto: boolean): string {
  if (mode === 'color') return t('Erase colours in selected cells (Backspace) · W wipes everything');
  if (mode === 'corner' || mode === 'center') {
    if (auto) return t('Restore struck candidates in selected cells (Backspace) · W wipes everything');
    return mode === 'corner'
      ? t('Erase corner marks in selected cells (Backspace) · W wipes everything')
      : t('Erase centre marks in selected cells (Backspace) · W wipes everything');
  }
  return t('Erase value, then marks, then colours (Backspace) · W wipes everything');
}

/**
 * What every button does, in one line each. Shown by the "?" in the assist
 * box and, for the assists, in the question asked before the first one.
 */
const BUTTONS: { name: string; icon: React.ReactNode; text: string; assist?: true }[] = [
  { name: msg('Undo'), icon: '↩', text: msg('Takes back your last action.') },
  { name: msg('Redo'), icon: '↪', text: msg('Brings back what Undo took away.') },
  { name: msg('Erase'), icon: '⌫', text: msg('Clears the selected cells: the digit first, then pencil marks, then colours.') },
  { name: msg('Swap'), icon: '⇄', text: msg('Moves corner marks to the centre and centre marks to the corner. Notation only.') },
  { name: msg('Hint'), icon: <LightbulbIcon size={16} />, text: msg('Names the technique for the next step. It shows the step itself only if you ask.'), assist: true },
  { name: msg('Check'), icon: <CheckIcon size={16} />, text: msg('Marks wrong digits, and pencil marks that have lost the true digit.'), assist: true },
  { name: msg('Steps'), icon: '≡', text: msg('Lists every step of one complete solution. You can jump to any of them.'), assist: true },
  { name: msg('Scan'), icon: <MicroscopeIcon size={16} />, text: msg('Lists every technique that works in this exact position, not only the easiest.'), assist: true },
  { name: msg('Chain'), icon: <ChainIcon size={16} />, text: msg('You build a chain on the board, candidate by candidate; the engine checks each link and says what the chain proves.'), assist: true },
  { name: msg('Auto candidates'), icon: '⌗', text: msg('Works out the candidates of every cell and keeps them up to date as you play.'), assist: true },
  { name: msg('Fill candidates'), icon: <PencilIcon size={16} />, text: msg('Writes every candidate into the empty cells as pencil marks, once.'), assist: true }
];

const textOf = (name: string) => BUTTONS.find((b) => b.name === name)!.text;

const MODES: { id: EntryMode; label: string; keyHint?: string }[] = [
  { id: 'digit', label: msg('Digit') },
  { id: 'corner', label: msg('Corner'), keyHint: 'Shift' },
  { id: 'center', label: msg('Centre'), keyHint: 'Ctrl' },
  { id: 'color', label: msg('Colour'), keyHint: 'Z' }
];

export function Controls({
  onShowSteps,
  onScan,
  onHint,
  scannerOpen = false,
  hintActive = false
}: {
  onShowSteps?: () => void;
  onScan?: () => void;
  onHint?: () => void;
  scannerOpen?: boolean;
  hintActive?: boolean;
}) {
  const mode = useGame((s) => s.mode);
  const tempMode = useGame((s) => s.tempMode);
  const effectiveMode = tempMode ?? mode;

  const setMode = useGame((s) => s.setMode);
  const erase = useGame((s) => s.erase);
  const autoCandidates = useGame((s) => s.autoCandidates);
  const toggleAutoCandidates = useGame((s) => s.toggleAutoCandidates);
  const fillCandidates = useGame((s) => s.fillCandidates);
  const convertMarks = useGame((s) => s.convertMarks);
  const requestHint = useGame((s) => s.requestHint);
  const check = useGame((s) => s.check);
  const [autoOffPrompt, setAutoOffPrompt] = useState(false);
  const assisted = useGame((s) => s.assisted);
  const pending = useGame((s) => s.pendingAssist);
  const askAssist = useGame((s) => s.askAssist);
  const multiSelect = useGame((s) => s.multiSelect);
  const setMultiSelect = useGame((s) => s.setMultiSelect);
  const [help, setHelp] = useState(false);
  const [showTools, setShowTools] = useState(false);

  const onAutoToggle = () => {
    if (autoCandidates && !useSettings.getState().autoOffPromptDone) {
      setAutoOffPrompt(true);
      return;
    }
    toggleAutoCandidates();
  };

  const chooseAutoOff = (layer: MarkLayer | 'none') => {
    useSettings.getState().set(
      layer === 'none'
        ? { autoOffMaterialize: false, autoOffPromptDone: true }
        : { autoOffMaterialize: true, materializeLayer: layer, autoOffPromptDone: true }
    );
    setAutoOffPrompt(false);
    toggleAutoCandidates();
  };

  const startChain = useGame((s) => s.startChain);
  const guarded = (name: string, run: () => void) => () => {
    if (assisted || !useSettings.getState().confirmAssist) return run();
    askAssist(name);
  };

  const onHintAction = onHint ?? requestHint;

  const actions: Record<string, (() => void) | undefined> = {
    Hint: onHintAction,
    Check: check,
    Steps: onShowSteps,
    Scan: onScan,
    Chain: startChain,
    'Auto candidates': onAutoToggle,
    'Fill candidates': fillCandidates
  };

  const use = (stopAsking: boolean) => {
    if (stopAsking) useSettings.getState().set({ confirmAssist: false });
    if (pending) actions[pending]?.();
    askAssist(null);
  };

  const t = useT();

  return (
    <div className="controls analysis-controls">
      {/* Primary Action Bar */}
      <div className="analysis-action-bar">
        {onScan && (
          <button
            className={`primary-scan-btn ${scannerOpen ? 'active' : ''}`}
            onClick={onScan}
            title={t('Pattern Scanner: scan the current position for all available patterns')}
          >
            <span className="btn-icon" aria-hidden="true"><MicroscopeIcon size={16} /></span>
            <span className="btn-label">{scannerOpen ? t('Rescan') : t('Patterns')}</span>
          </button>
        )}
        <button
          className={`secondary-hint-btn ${hintActive && !scannerOpen ? 'active' : ''}`}
          onClick={guarded('Hint', onHintAction)}
          title={t('Hint (H): names the technique first, reveals it only if you ask')}
        >
          <span className="btn-icon" aria-hidden="true"><LightbulbIcon size={16} /></span>
          <span className="btn-label">{t('Hint')}</span>
        </button>
        <button
          className={`tools-toggle-btn ${showTools ? 'active' : ''}`}
          onClick={() => setShowTools(!showTools)}
          title={t('Assist')}
          aria-expanded={showTools}
        >
          <span className="btn-icon" aria-hidden="true"><ToolsIcon size={16} /></span>
          <span className="btn-label">{t('Assist')}</span>
          <span className="btn-chevron" aria-hidden="true">{showTools ? '▲' : '▼'}</span>
        </button>
      </div>

      {/* Expandable Secondary Utilities */}
      {showTools && (
        <div className="secondary-tools-drawer">
          <div className="tools-section">
            <span className="tools-section-title">{t('Reveals logic')}</span>
            <div className="tools-actions-row">
              <button
                className="tool-btn"
                onClick={guarded('Check', check)}
                title={t('Check values and candidate lists against the solution')}
              >
                <span className="btn-icon" aria-hidden="true"><CheckIcon size={16} /></span>
                <span>{t('Check')}</span>
              </button>
              {onShowSteps && (
                <button
                  className="tool-btn"
                  onClick={guarded('Steps', onShowSteps)}
                  title={t('Show every step of one complete solution and jump to any point. Counts as assistance')}
                >
                  <span className="btn-icon" aria-hidden="true">≡</span>
                  <span>{t('Steps')}</span>
                </button>
              )}
              <button
                className="tool-btn"
                onClick={guarded('Chain', startChain)}
                title={t('Build a chain yourself, candidate by candidate; the engine checks each link and says what it proves. Counts as assistance')}
              >
                <span className="btn-icon" aria-hidden="true"><ChainIcon size={16} /></span>
                <span>{t('Chain')}</span>
              </button>
            </div>
          </div>

          <div className="tools-section">
            <span className="tools-section-title">{t('Writes marks for you')}</span>
            <div className="tools-actions-row">
              <button
                className={`tool-btn ${autoCandidates ? 'toggled' : ''}`}
                onClick={autoCandidates ? onAutoToggle : guarded('Auto candidates', onAutoToggle)}
                title={t(
                  autoCandidates
                    ? 'Turn off. Where the candidates go is configurable in Settings, and Ctrl+Z reverts'
                    : 'Maintain candidates automatically (keeps your centre-mark eliminations); strike digits with pencil input'
                )}
              >
                <span className="btn-icon" aria-hidden="true">⌗</span>
                <span>{t('Auto candidates')}</span>
              </button>
              <button
                className="tool-btn"
                onClick={guarded('Fill candidates', fillCandidates)}
                title={t(
                  effectiveMode === 'corner'
                    ? 'Fill corner marks with all candidates. With empty cells selected, only those are filled'
                    : 'Fill centre marks with all candidates. With empty cells selected, only those are filled'
                )}
              >
                <span className="btn-icon" aria-hidden="true"><PencilIcon size={16} /></span>
                <span>{t('Fill candidates')}</span>
              </button>
              <button
                className="tool-btn"
                onClick={convertMarks}
                title={t('Swap corner and centre marks (S). Pure notation, never counts as help')}
              >
                <span className="btn-icon" aria-hidden="true">⇄</span>
                <span>{t('Swap')}</span>
              </button>
              <button
                className="tool-btn"
                onClick={erase}
                title={eraseTitle(t, effectiveMode, autoCandidates)}
              >
                <span className="btn-icon" aria-hidden="true">⌫</span>
                <span>{t('Erase')}</span>
              </button>
            </div>
          </div>

          <div className="tools-section">
            <div className="tools-mode-header">
              <span className="tools-section-title">{t('Digit')} · {t('Corner')} · {t('Centre')}</span>
              <button
                className="zone-help"
                onClick={() => setHelp(true)}
                aria-label={t('What the buttons do')}
                title={t('What the buttons do')}
              >
                ?
              </button>
            </div>
            <div className="tools-mode-pills">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  className={`mode-pill ${effectiveMode === m.id ? 'active' : ''}`}
                  onClick={() => setMode(m.id)}
                  title={m.keyHint ? `${t(m.label)} (${m.keyHint})` : t(m.label)}
                >
                  {t(m.label)} {m.keyHint && <span className="key-hint">({m.keyHint})</span>}
                </button>
              ))}
              <button
                className={`mode-pill multi${multiSelect ? ' active' : ''}`}
                onClick={() => setMultiSelect(!multiSelect)}
                title={t('Multi-select: tap cells to add or remove them, drag to paint them in or out; the page scrolls from beside the board')}
              >
                {t('Multi')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assist Confirmation Modal */}
      {pending && (
        <Modal title={t('Use {name}?', { name: t(pending) })} onClose={() => askAssist(null)}>
          <p className="dialog-note">{t(textOf(pending))}</p>
          <p className="dialog-note">
            {t('Using it counts as help, so this solve will no longer be unassisted. Everything else stays as it is.')}
          </p>
          <div className="hint-actions">
            <button onClick={() => use(false)}>{t('Use {name}', { name: t(pending) })}</button>
            <button className="ghost" onClick={() => askAssist(null)}>
              {t('Cancel')}
            </button>
            <button className="ghost" onClick={() => use(true)}>
              {t('Use, and stop asking')}
            </button>
          </div>
        </Modal>
      )}

      {/* Help Modal */}
      {help && (
        <Modal title={t('What the buttons do')} onClose={() => setHelp(false)}>
          <dl className="learn-points button-help">
            {BUTTONS.map((b) => (
              <React.Fragment key={b.name}>
                <dt>
                  <span className="button-help-icon" aria-hidden="true">
                    {b.icon}
                  </span>
                  {t(b.name)}
                  {b.assist && <span className="zone-note">{t('counts as help')}</span>}
                </dt>
                <dd>{t(b.text)}</dd>
              </React.Fragment>
            ))}
          </dl>
        </Modal>
      )}

      {/* Auto-off Prompt Modal */}
      {autoOffPrompt && (
        <Modal title={t('Keep your candidates?')} onClose={() => setAutoOffPrompt(false)}>
          <p className="dialog-note">
            {t(
              'When Auto is switched off, the candidates it was showing can stay on the board as your own pencil marks, so you continue exactly where Auto left off. Your choice becomes the default. Change it anytime in Settings.'
            )}
          </p>
          <div className="level-list">
            <button className="level-btn" onClick={() => chooseAutoOff('center')}>
              <strong>{t('Centre marks')}</strong>
              <span>{t('A compact list in the middle of the cell (recommended)')}</span>
            </button>
            <button className="level-btn" onClick={() => chooseAutoOff('corner')}>
              <strong>{t('Corner marks')}</strong>
              <span>{t('Each digit in its own fixed spot, where hints highlight it')}</span>
            </button>
            <button className="level-btn" onClick={() => chooseAutoOff('none')}>
              <strong>{t("Don't fill anything")}</strong>
              <span>{t('Just switch off. Your own marks stay as they were')}</span>
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
