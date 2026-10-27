/**
 * Interactive Practice Panel for Pattern Lab.
 *
 * Provides the interactive exercise interface for both focused and mixed practice.
 * Features:
 * - Digit selector (1–9).
 * - Participating cells selector (synced with board selection).
 * - Technique picker (for mixed mode).
 * - Progressive hint disclosure (1: Nudge -> 2: Structure -> 3: Cells -> 4: Full reveal).
 * - Answer verification and feedback (exact match, alternative pattern match, partial match).
 * - Seamless transition to walk frames and full explanation.
 */

import React, { useEffect, useMemo } from 'react';
import { usePractice } from '../state/practiceStore';
import { useGame } from '../state/gameStore';
import { useSettings } from '../state/settings';
import { TECHS, Tech } from '../engine/ratings';
import { cellName } from '../engine/board';
import { Step, CellDigit } from '../engine/steps';
import { buildProgressiveHints } from '../engine/progressiveHints';
import { useT, rich } from '../content/i18n';
import { getTechniqueConcept } from '../content/concepts';
import { CloseIcon, LightbulbIcon, CheckIcon } from './Icons';

interface PracticePanelProps {
  onNextPuzzle: () => void;
  onOpenLearn: (tech: Tech) => void;
  onOpenMastery: () => void;
}

export function PracticePanel({
  onNextPuzzle,
  onOpenLearn,
  onOpenMastery
}: PracticePanelProps) {
  const t = useT();
  const mastery = useSettings((s) => s.mastery);

  const mode = usePractice((s) => s.mode);
  const targetTech = usePractice((s) => s.targetTech);
  const mixedPool = usePractice((s) => s.mixedPool);
  const exerciseState = usePractice((s) => s.exerciseState);
  const targetStep = usePractice((s) => s.targetStep);
  const allValidSteps = usePractice((s) => s.allValidSteps);
  const currentHintLevel = usePractice((s) => s.currentHintLevel);
  const userAnswer = usePractice((s) => s.userAnswer);
  const lastResult = usePractice((s) => s.lastResult);

  const toggleUserDigit = usePractice((s) => s.toggleUserDigit);
  const setUserCells = usePractice((s) => s.setUserCells);
  const toggleUserCell = usePractice((s) => s.toggleUserCell);
  const setUserTech = usePractice((s) => s.setUserTech);
  const clearUserAnswer = usePractice((s) => s.clearUserAnswer);
  const requestNextHint = usePractice((s) => s.requestNextHint);
  const submitAnswer = usePractice((s) => s.submitAnswer);
  const revealSolution = usePractice((s) => s.revealSolution);
  const exitPractice = usePractice((s) => s.exitPractice);
  const syncBoardDeductions = usePractice((s) => s.syncBoardDeductions);

  const boardSelection = useGame((s) => s.selection);
  const boardCells = useGame((s) => s.cells);
  const autoCandidates = useGame((s) => s.autoCandidates);
  const selectBoard = useGame((s) => s.select);
  const setHint = useGame((s) => s.showStep);
  const dismissHint = useGame((s) => s.dismissHint);
  const walkHint = useGame((s) => s.walkHint);

  // Synchronize board note eliminations and placements directly with the practice store
  useEffect(() => {
    if (mode !== 'inactive') {
      syncBoardDeductions(boardCells, autoCandidates);
    }
  }, [boardCells, autoCandidates, mode, syncBoardDeductions]);

  // Progressive hints generator
  const progressive = useMemo(() => {
    return targetStep ? buildProgressiveHints(targetStep) : null;
  }, [targetStep]);

  // Synchronize progressive hint highlights to the board
  useEffect(() => {
    if (!targetStep || currentHintLevel === 0) {
      return;
    }
    const hints = buildProgressiveHints(targetStep);
    const stage = hints.stages[currentHintLevel - 1];

    if (stage.level === 1 || stage.level === 2) {
      // Show units only
      useGame.setState({
        hint: {
          ...targetStep,
          primary: [],
          secondary: [],
          fins: [],
          links: [],
          eliminations: [],
          placements: [],
          units: stage.highlightUnits,
          description: stage.text
        },
        hintStage: 'full'
      });
    } else if (stage.level === 3) {
      // Show pattern cells and links without eliminations
      useGame.setState({
        hint: {
          ...targetStep,
          eliminations: [],
          placements: [],
          units: stage.highlightUnits,
          primary: stage.primary,
          secondary: stage.secondary,
          fins: stage.fins,
          links: stage.links,
          description: stage.text
        },
        hintStage: 'full'
      });
    } else if (stage.level === 4) {
      // Show full step with eliminations
      useGame.setState({
        hint: targetStep,
        hintStage: 'full'
      });
    }
  }, [targetStep, currentHintLevel]);

  if (mode === 'inactive' || !targetStep) {
    return null;
  }

  const selectedDigits = userAnswer.digits ?? [];
  const selectedCells = userAnswer.cells ?? [];
  const activeCells = selectedCells.length > 0 ? selectedCells : boardSelection;
  const eliminations = userAnswer.eliminations ?? [];
  const placements = userAnswer.placements ?? [];

  // Use current board selection as pattern cells
  const handleAdoptSelection = () => {
    if (boardSelection.length > 0) {
      setUserCells(boardSelection);
    }
  };

  const handleNextHint = () => {
    requestNextHint();
  };

  const handleSubmit = () => {
    submitAnswer(
      selectedCells.length > 0 ? selectedCells : boardSelection,
      boardCells,
      autoCandidates
    );
  };

  const handleReveal = () => {
    revealSolution();
  };

  const handleClear = () => {
    clearUserAnswer();
    if (boardSelection.length > 0) {
      selectBoard([], false);
    }
  };

  const canCheck =
    selectedDigits.length > 0 ||
    selectedCells.length > 0 ||
    boardSelection.length > 0 ||
    eliminations.length > 0 ||
    placements.length > 0;

  const currentHint = progressive && currentHintLevel > 0
    ? progressive.stages[currentHintLevel - 1]
    : null;

  return (
    <div className="practice-panel" role="region" aria-label={t('Pattern Practice')}>
      {/* Practice Header */}
      <div className="practice-panel-header">
        <div className="practice-panel-title">
          <span className="practice-badge">
            {mode === 'focused' ? t('Focused Practice') : t('Mixed Practice')}
          </span>
          <h3>
            {mode === 'focused' && targetTech ? (
              <>
                {t('Spot the {name}', { name: t.tech(targetTech) })}
                <button
                  className="ghost-learn-btn"
                  onClick={() => onOpenLearn(targetTech)}
                  title={t('Learn about {name}', { name: t.tech(targetTech) })}
                >
                  ⓘ
                </button>
              </>
            ) : (
              t('Identify the pattern in this position')
            )}
          </h3>
        </div>
        <button
          className="ghost practice-close-btn"
          onClick={exitPractice}
          title={t('Exit practice')}
        >
          <CloseIcon size={14} />
        </button>
      </div>

      {/* Progressive Hint Banner (if active) */}
      {currentHint && (
        <div className={`practice-hint-box level-${currentHint.level}`}>
          <div className="practice-hint-head">
            <span className="hint-stage-pill">{currentHint.title}</span>
            <span className="hint-level-count">
              {t('Hint {n} of 4', { n: currentHint.level })}
            </span>
          </div>
          <p className="practice-hint-text">{currentHint.text}</p>
        </div>
      )}

      {/* Answer Input Controls */}
      <div className="practice-answer-section">
        <p className="practice-tip">
          {t('Strike out eliminated notes directly on the board, or select the key digit and deduction/pattern cells below.')}
        </p>

        {/* Board Eliminations Detected */}
        {eliminations.length > 0 && (
          <div className="practice-input-group">
            <label className="practice-label">
              {t('Eliminated Notes ({n}):', { n: eliminations.length })}
            </label>
            <div className="practice-cell-tags">
              {eliminations.map((e) => (
                <span key={`${e.cell}-${e.digit}`} className="cell-tag elim-tag">
                  {cellName(e.cell)}: -{e.digit}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Board Placements Detected */}
        {placements.length > 0 && (
          <div className="practice-input-group">
            <label className="practice-label">
              {t('Placed Digits ({n}):', { n: placements.length })}
            </label>
            <div className="practice-cell-tags">
              {placements.map((p) => (
                <span key={`${p.cell}-${p.digit}`} className="cell-tag place-tag">
                  {cellName(p.cell)}: {p.digit}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* In Mixed Mode: Technique Selector */}
        {mode === 'mixed' && (
          <div className="practice-input-group">
            <label className="practice-label">{t('Which technique is it?')}</label>
            <select
              className="practice-tech-select"
              value={userAnswer.tech ?? ''}
              onChange={(e) => setUserTech(e.target.value as Tech)}
            >
              <option value="">{t('Choose technique…')}</option>
              {mixedPool.map((tech) => (
                <option key={tech} value={tech}>
                  {t.tech(tech)} ({TECHS[tech].category})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Digit Selector */}
        <div className="practice-input-group">
          <label className="practice-label">
            {t('Key Digit(s):')}
            {selectedDigits.length > 0 && (
              <span className="practice-selected-digits">
                {selectedDigits.join(', ')}
              </span>
            )}
          </label>
          <div className="practice-digit-row" role="group" aria-label={t('Select digits')}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
              <button
                key={d}
                type="button"
                className={`digit-pill ${selectedDigits.includes(d) ? 'selected' : ''}`}
                onClick={() => toggleUserDigit(d)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Participating / Elimination Cells Selection */}
        <div className="practice-input-group">
          <div className="practice-label-with-action">
            <label className="practice-label">
              {t('Selected Cells ({n}):', { n: activeCells.length })}
              {selectedCells.length === 0 && boardSelection.length > 0 && (
                <span className="practice-live-badge">{t('(from board)')}</span>
              )}
            </label>
            {boardSelection.length > 0 && selectedCells.length === 0 && (
              <button
                type="button"
                className="btn-text-action"
                onClick={handleAdoptSelection}
                title={t('Lock current board selection into answer')}
              >
                {t('Lock selection ({n})', { n: boardSelection.length })}
              </button>
            )}
          </div>
          <div className="practice-cells-display">
            {activeCells.length > 0 ? (
              <div className="practice-cell-tags">
                {activeCells.map((c) => (
                  <span
                    key={c}
                    className="cell-tag"
                    onClick={() => {
                      if (selectedCells.length > 0) toggleUserCell(c);
                      else selectBoard(boardSelection.filter((x) => x !== c), false);
                    }}
                    title={t('Click to remove cell')}
                  >
                    {cellName(c)} <CloseIcon size={11} />
                  </span>
                ))}
              </div>
            ) : (
              <span className="practice-empty-note">
                {t('Strike out notes on the board, or select cells and tap Check Answer')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Verification Feedback Banner */}
      {lastResult && (
        <div className={`practice-result-banner status-${lastResult.status}`}>
          <div className="result-header">
            <strong>{lastResult.title}</strong>
          </div>
          <p className="result-text">{lastResult.feedback}</p>
          {lastResult.isCorrect && (
            <div className="result-actions">
              <button
                className="btn-next-exercise"
                onClick={onNextPuzzle}
              >
                {t('Next Puzzle')} →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bottom Action Bar */}
      <div className="practice-action-bar">
        <div className="practice-left-actions">
          <button
            type="button"
            className="ghost"
            onClick={handleNextHint}
            disabled={currentHintLevel >= 4}
            title={t('Get a progressive hint without revealing the whole answer')}
          >
            <LightbulbIcon size={14} /> {t('Hint')} {currentHintLevel > 0 ? `(${currentHintLevel}/4)` : ''}
          </button>
          {currentHintLevel >= 3 && exerciseState !== 'revealed' && (
            <button
              type="button"
              className="ghost"
              onClick={handleReveal}
              title={t('Show the complete solution')}
            >
              {t('Reveal')}
            </button>
          )}
        </div>

        <div className="practice-right-actions">
          <button
            type="button"
            className="ghost"
            onClick={handleClear}
            disabled={selectedDigits.length === 0 && selectedCells.length === 0 && boardSelection.length === 0 && eliminations.length === 0}
          >
            {t('Clear')}
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleSubmit}
            disabled={!canCheck}
          >
            <CheckIcon size={14} /> {t('Check Answer')}
          </button>
        </div>
      </div>
    </div>
  );
}
