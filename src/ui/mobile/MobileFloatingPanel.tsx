import React, { useState, useRef, useEffect } from 'react';
import { usePatternScanner } from '../../state/scannerStore';
import { useGame } from '../../state/gameStore';
import { useSettings } from '../../state/settings';
import { usePractice } from '../../state/practiceStore';
import { useT } from '../../content/i18n';
import { TECHS, Tech } from '../../engine/ratings';
import { walkFrames } from '../../engine/hintFrames';
import { FormattedExplanation } from '../FormattedExplanation';
import { PatternScannerPanel } from '../PatternScannerPanel';
import { HintPanel, ChainPanel } from '../HintPanel';
import { PracticePanel } from '../PracticePanel';
import {
  GripIcon,
  CloseIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  MaximizeIcon,
  MinimizeIcon,
  MicroscopeIcon,
  LightbulbIcon,
  ToolsIcon,
  CheckIcon,
  ChainIcon,
  PencilIcon,
  GraduationCapIcon
} from '../Icons';

export type FloatingPanelTab = 'patterns' | 'hint' | 'tools' | 'practice' | 'chain';
export type FloatingPanelSize = 'expanded' | 'compact' | 'pill';

interface MobileFloatingPanelProps {
  activeTab: FloatingPanelTab | null;
  onClose: () => void;
  onOpenTab: (tab: FloatingPanelTab) => void;
  onLearn: (tech: Tech) => void;
  onOpenMastery: () => void;
  onShowSteps?: () => void;
  onStartPractice?: (tech: Tech | 'mixed') => void;
  onReportHint?: (hint: any) => void;
}

export function MobileFloatingPanel({
  activeTab,
  onClose,
  onOpenTab,
  onLearn,
  onOpenMastery,
  onShowSteps,
  onStartPractice,
  onReportHint
}: MobileFloatingPanelProps) {
  const t = useT();

  // Scanner store state
  const scanResult = usePatternScanner((s) => s.scanResult);
  const selectedInstanceId = usePatternScanner((s) => s.selectedInstanceId);
  const selectInstance = usePatternScanner((s) => s.selectInstance);
  const applySelectedDeduction = usePatternScanner((s) => s.applySelectedDeduction);

  // Game store state
  const hint = useGame((s) => s.hint);
  const hintStage = useGame((s) => s.hintStage);
  const walkIndex = useGame((s) => s.walkIndex);
  const walkHint = useGame((s) => s.walkHint);
  const revealHint = useGame((s) => s.revealHint);
  const applyHint = useGame((s) => s.applyHint);
  const check = useGame((s) => s.check);
  const startChain = useGame((s) => s.startChain);
  const autoCandidates = useGame((s) => s.autoCandidates);
  const toggleAutoCandidates = useGame((s) => s.toggleAutoCandidates);
  const fillCandidates = useGame((s) => s.fillCandidates);
  const convertMarks = useGame((s) => s.convertMarks);
  const info = useGame((s) => s.info);
  const custom = useGame((s) => s.custom);

  // Practice state
  const practiceMode = usePractice((s) => s.mode);

  // Panel size state: 'expanded' (full list), 'compact' (explanation card), 'pill' (one-line mini)
  const [panelSize, setPanelSize] = useState<FloatingPanelSize>('expanded');
  const [isPeeking, setIsPeeking] = useState(false);

  // Drag position offset (in pixels from default bottom position)
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const dragStartRef = useRef<{ startY: number; initialOffset: number } | null>(null);

  // Selected pattern instance (if any)
  const selectedInstance = scanResult?.instances.find((i) => i.id === selectedInstanceId) ?? null;

  // Whenever a pattern is newly selected from the scanner, auto-collapse to 'compact'
  // so the player can see the highlighted board clearly!
  useEffect(() => {
    if (selectedInstanceId && panelSize === 'expanded') {
      setPanelSize('compact');
    }
  }, [selectedInstanceId]);

  // When hint is revealed in 'full' or 'walk' stage, prefer compact view
  useEffect(() => {
    if (activeTab === 'hint' && (hintStage === 'full' || hintStage === 'walk') && panelSize === 'expanded') {
      setPanelSize('compact');
    }
  }, [activeTab, hintStage]);

  // If no active tab, don't render
  if (!activeTab) return null;

  // Walk frames for stepper in compact mode
  const currentStep = selectedInstance?.step ?? (hintStage !== 'hidden' ? hint : null);
  const frames = currentStep ? walkFrames(currentStep) : [];
  const walking = hintStage === 'walk' && frames.length > 0;
  const currentFrame = frames[Math.min(walkIndex, frames.length - 1)];

  // Drag handlers
  const onPointerDownDrag = (e: React.PointerEvent) => {
    dragStartRef.current = { startY: e.clientY, initialOffset: dragOffsetY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsPeeking(true);
  };

  const onPointerMoveDrag = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const deltaY = e.clientY - dragStartRef.current.startY;
    // Limit upward drag to -300px and downward to 0px
    const newOffset = Math.max(-360, Math.min(60, dragStartRef.current.initialOffset + deltaY));
    setDragOffsetY(newOffset);
  };

  const onPointerUpDrag = (e: React.PointerEvent) => {
    dragStartRef.current = null;
    setIsPeeking(false);
  };

  return (
    <div
      className={`mobile-floating-panel ${panelSize} ${isPeeking ? 'peeking' : ''}`}
      style={{
        transform: dragOffsetY !== 0 ? `translate3d(0, ${dragOffsetY}px, 0)` : undefined
      }}
      role="region"
      aria-label={t('Mobile floating assist panel')}
    >
      {/* Drag & Header Bar */}
      <div
        className="mobile-floating-grip-bar"
        onPointerDown={onPointerDownDrag}
        onPointerMove={onPointerMoveDrag}
        onPointerUp={onPointerUpDrag}
        onPointerCancel={onPointerUpDrag}
      >
        <span className="mobile-floating-grip-handle" aria-hidden="true" />
      </div>

      <header className="mobile-floating-header">
        <div className="mobile-floating-title-group">
          {activeTab === 'patterns' && (
            <>
              <span className="mobile-floating-tab-icon" aria-hidden="true"><MicroscopeIcon size={16} /></span>
              <span className="mobile-floating-tab-title">
                {selectedInstance
                  ? t.tech(selectedInstance.tech)
                  : t('Patterns ({n})', { n: scanResult?.instances.length ?? 0 })}
              </span>
            </>
          )}
          {activeTab === 'hint' && (
            <>
              <span className="mobile-floating-tab-icon" aria-hidden="true"><LightbulbIcon size={16} /></span>
              <span className="mobile-floating-tab-title">
                {hint ? t.tech(hint.tech) : t('Hint')}
              </span>
            </>
          )}
          {activeTab === 'tools' && (
            <>
              <span className="mobile-floating-tab-icon" aria-hidden="true"><ToolsIcon size={16} /></span>
              <span className="mobile-floating-tab-title">{t('Assist & Tools')}</span>
            </>
          )}
          {activeTab === 'practice' && (
            <>
              <span className="mobile-floating-tab-icon" aria-hidden="true"><GraduationCapIcon size={16} /></span>
              <span className="mobile-floating-tab-title">
                {info?.practiceTech ? t('Practice: {tech}', { tech: t.tech(info.practiceTech) }) : t('Practice')}
              </span>
            </>
          )}
        </div>

        <div className="mobile-floating-header-controls">
          {/* If compact or pill, button to expand */}
          {panelSize !== 'expanded' && (
            <button
              type="button"
              className="mobile-floating-btn"
              onClick={() => setPanelSize('expanded')}
              title={t('Expand panel')}
              aria-label={t('Expand panel')}
            >
              <MaximizeIcon size={16} />
            </button>
          )}

          {/* If expanded or compact, button to minimize to pill */}
          {panelSize !== 'pill' && (
            <button
              type="button"
              className="mobile-floating-btn"
              onClick={() => setPanelSize(panelSize === 'expanded' ? 'compact' : 'pill')}
              title={t('Collapse panel')}
              aria-label={t('Collapse panel')}
            >
              <MinimizeIcon size={16} />
            </button>
          )}

          {/* Close button */}
          <button
            type="button"
            className="mobile-floating-btn close-btn"
            onClick={onClose}
            title={t('Close')}
            aria-label={t('Close')}
          >
            <CloseIcon size={16} />
          </button>
        </div>
      </header>

      {/* PILL MODE: Super compact 1-line view */}
      {panelSize === 'pill' ? (
        <div
          className="mobile-floating-pill-content"
          onClick={() => setPanelSize(selectedInstance || hint ? 'compact' : 'expanded')}
        >
          <span className="mobile-floating-pill-text">
            {selectedInstance
              ? `${t.tech(selectedInstance.tech)} — ${selectedInstance.step.description}`
              : hint
                ? `${t.tech(hint.tech)}`
                : t('Tap to expand')}
          </span>
          <span className="mobile-floating-pill-expand-icon">
            <ChevronUpIcon size={16} />
          </span>
        </div>
      ) : panelSize === 'compact' && (selectedInstance || hint) ? (
        /* COMPACT MODE: Streamlined explanation card with stepper, Apply, and Learn */
        <div className="mobile-compact-explanation-card">
          <div className="mobile-compact-body">
            {/* Step or walk narration */}
            <p className="mobile-compact-description">
              <FormattedExplanation
                text={
                  walking && currentFrame
                    ? currentFrame.text
                    : selectedInstance
                      ? selectedInstance.step.description
                      : hint?.description ?? ''
                }
              />
            </p>
          </div>

          <div className="mobile-compact-actions">
            {/* Walk stepper controls if step has multiple frames */}
            {frames.length > 1 && (
              <div className="mobile-compact-stepper">
                <button
                  type="button"
                  className="mobile-stepper-btn"
                  onClick={() => walkHint(-1)}
                  disabled={!walking}
                  aria-label={t('Previous frame')}
                >
                  ◀
                </button>
                <span className="mobile-stepper-count">
                  {t('{i} of {n}', {
                    i: walking ? Math.min(walkIndex, frames.length - 1) + 1 : 0,
                    n: frames.length
                  })}
                </span>
                <button
                  type="button"
                  className="mobile-stepper-btn"
                  onClick={() => walkHint(1)}
                  disabled={walking && walkIndex >= frames.length - 1}
                  aria-label={t('Next frame')}
                >
                  ▶
                </button>
              </div>
            )}

            {/* Back to list button */}
            {activeTab === 'patterns' && (
              <button
                type="button"
                className="mobile-compact-action-btn ghost"
                onClick={() => {
                  selectInstance(null);
                  setPanelSize('expanded');
                }}
              >
                {t('All patterns')}
              </button>
            )}

            {/* Learn button */}
            {currentStep && onLearn && (
              <button
                type="button"
                className="mobile-compact-action-btn ghost"
                onClick={() => onLearn(currentStep.tech)}
              >
                {t('Learn')}
              </button>
            )}

            {/* Apply deduction button */}
            <button
              type="button"
              className="mobile-compact-action-btn primary"
              onClick={() => {
                if (activeTab === 'patterns') {
                  applySelectedDeduction();
                } else if (activeTab === 'hint') {
                  applyHint();
                }
                onClose();
              }}
            >
              <CheckIcon size={14} /> {t('Apply move')}
            </button>
          </div>
        </div>
      ) : (
        /* EXPANDED MODE: Full scrollable panel content */
        <div className={`mobile-floating-body ${activeTab === 'patterns' ? 'scanner-tab-body' : ''}`}>
          {activeTab === 'patterns' && (
            <PatternScannerPanel
              onClose={onClose}
              onLearn={onLearn}
              onOpenMastery={onOpenMastery}
            />
          )}

          {activeTab === 'hint' && (
            <HintPanel
              onLearn={onLearn}
              onReport={(hint) => onReportHint?.(hint)}
            />
          )}

          {activeTab === 'practice' && (
            <PracticePanel
              onNextPuzzle={() => {
                if (onStartPractice && info?.practiceTech) {
                  onStartPractice(practiceMode === 'mixed' ? 'mixed' : info.practiceTech);
                }
              }}
              onOpenLearn={onLearn}
              onOpenMastery={onOpenMastery}
            />
          )}

          {activeTab === 'tools' && (
            <div className="mobile-tools-content">
              <div className="mobile-tools-section">
                <h4 className="mobile-tools-section-title">{t('Reveals logic')}</h4>
                <div className="mobile-tools-grid">
                  <button
                    type="button"
                    className="mobile-tool-card"
                    onClick={() => {
                      check();
                      onClose();
                    }}
                  >
                    <span className="mobile-tool-card-icon"><CheckIcon size={20} /></span>
                    <span className="mobile-tool-card-title">{t('Check')}</span>
                    <small>{t('Mark wrong digits and lost candidates')}</small>
                  </button>

                  {onShowSteps && (
                    <button
                      type="button"
                      className="mobile-tool-card"
                      onClick={() => {
                        onShowSteps();
                        onClose();
                      }}
                    >
                      <span className="mobile-tool-card-icon">≡</span>
                      <span className="mobile-tool-card-title">{t('Steps')}</span>
                      <small>{t('Full solution path')}</small>
                    </button>
                  )}

                  <button
                    type="button"
                    className="mobile-tool-card"
                    onClick={() => {
                      startChain();
                      onClose();
                    }}
                  >
                    <span className="mobile-tool-card-icon"><ChainIcon size={20} /></span>
                    <span className="mobile-tool-card-title">{t('Chain')}</span>
                    <small>{t('Build a chain candidate by candidate')}</small>
                  </button>
                </div>
              </div>

              <div className="mobile-tools-section">
                <h4 className="mobile-tools-section-title">{t('Writes marks for you')}</h4>
                <div className="mobile-tools-grid">
                  <button
                    type="button"
                    className={`mobile-tool-card ${autoCandidates ? 'active' : ''}`}
                    onClick={toggleAutoCandidates}
                  >
                    <span className="mobile-tool-card-icon">⌗</span>
                    <span className="mobile-tool-card-title">{t('Auto candidates')}</span>
                    <small>{autoCandidates ? t('Turn off') : t('Keep up to date')}</small>
                  </button>

                  <button
                    type="button"
                    className="mobile-tool-card"
                    onClick={() => {
                      fillCandidates();
                      onClose();
                    }}
                  >
                    <span className="mobile-tool-card-icon"><PencilIcon size={20} /></span>
                    <span className="mobile-tool-card-title">{t('Fill candidates')}</span>
                    <small>{t('Fill all empty cells once')}</small>
                  </button>

                  <button
                    type="button"
                    className="mobile-tool-card"
                    onClick={() => {
                      convertMarks();
                      onClose();
                    }}
                  >
                    <span className="mobile-tool-card-icon">⇄</span>
                    <span className="mobile-tool-card-title">{t('Swap marks')}</span>
                    <small>{t('Swap corner and centre marks')}</small>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
