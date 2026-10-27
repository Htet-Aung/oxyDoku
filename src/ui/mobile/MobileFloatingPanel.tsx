import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { usePatternScanner } from '../../state/scannerStore';
import { useGame } from '../../state/gameStore';
import { useSettings } from '../../state/settings';
import { usePractice } from '../../state/practiceStore';
import { useT, rich } from '../../content/i18n';
import { TECHS, Tech, pickOf } from '../../engine/ratings';
import { TECH_DOCS } from '../../content/techniqueDocs';
import { walkFrames } from '../../engine/hintFrames';
import { FormattedExplanation } from '../FormattedExplanation';
import { PatternScannerPanel } from '../PatternScannerPanel';
import { HintPanel, ChainPanel } from '../HintPanel';
import { PracticePanel } from '../PracticePanel';
import { useLearnLocale } from '../useLearnLocale';
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

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface PanelBounds {
  panelRect: { top: number; bottom: number; left: number; right: number; width: number; height: number };
  containerRect: { top: number; bottom: number; left: number; right: number; width: number; height: number };
  currentOffset: { x: number; y: number };
  targetOffset: { x: number; y: number };
  safeMargin?: number;
}

/**
 * Computes safe clamped translation offsets for the floating window within its container.
 * Guaranteed to keep the top bar (drag handle & buttons) and screen edges inside visible bounds,
 * both during active dragging and when expanding from a small window parked near a corner.
 */
export function computeClampedOffset({
  panelRect,
  containerRect,
  currentOffset,
  targetOffset,
  safeMargin = 8
}: PanelBounds): { x: number; y: number } {
  if (panelRect.width <= 0 || panelRect.height <= 0 || containerRect.width <= 0 || containerRect.height <= 0) {
    return targetOffset;
  }

  // Base (untransformed) position in screen coordinates
  const baseTop = panelRect.top - currentOffset.y;
  const baseBottom = panelRect.bottom - currentOffset.y;
  const baseLeft = panelRect.left - currentOffset.x;
  const baseRight = panelRect.right - currentOffset.x;

  const safeTop = containerRect.top + safeMargin;
  const safeBottom = containerRect.bottom - safeMargin;
  const safeLeft = containerRect.left + safeMargin;
  const safeRight = containerRect.right - safeMargin;

  // Vertical limits:
  // untransformedTop + y >= safeTop   => y >= safeTop - baseTop (minY, furthest up)
  // untransformedBottom + y <= safeBottom => y <= safeBottom - baseBottom (maxY, furthest down)
  const minY = safeTop - baseTop;
  const maxY = safeBottom - baseBottom;

  let clampedY: number;
  if (minY > maxY) {
    // Panel is taller than the available safe height:
    // ALWAYS pin the top so the drag handle, title, and reshape/close buttons remain visible and clickable!
    clampedY = minY;
  } else {
    clampedY = Math.max(minY, Math.min(maxY, targetOffset.y));
  }

  // Horizontal limits:
  // untransformedLeft + x >= safeLeft   => x >= safeLeft - baseLeft (minX, furthest left)
  // untransformedRight + x <= safeRight => x <= safeRight - baseRight (maxX, furthest right)
  const minX = safeLeft - baseLeft;
  const maxX = safeRight - baseRight;

  let clampedX: number;
  if (minX > maxX) {
    clampedX = minX;
  } else {
    clampedX = Math.max(minX, Math.min(maxX, targetOffset.x));
  }

  return {
    x: Number.isFinite(clampedX) ? clampedX : 0,
    y: Number.isFinite(clampedY) ? clampedY : 0
  };
}

function useTechWhat(): (tech: Tech) => string {
  const loc = useLearnLocale();
  return (tech) => loc?.techDocs[tech]?.what ?? TECH_DOCS[tech].what;
}

interface MobileFloatingPanelProps {
  activeTab: FloatingPanelTab | null;
  onClose: () => void;
  onOpenTab: (tab: FloatingPanelTab) => void;
  onLearn: (tech: Tech) => void;
  onOpenMastery: () => void;
  onShowSteps?: () => void;
  onStartPractice?: (tech: Tech | 'mixed') => void;
  onReportHint?: (hint: any) => void;
  initialSize?: FloatingPanelSize;
}

export function MobileFloatingPanel({
  activeTab,
  onClose,
  onOpenTab,
  onLearn,
  onOpenMastery,
  onShowSteps,
  onStartPractice,
  onReportHint,
  initialSize
}: MobileFloatingPanelProps) {
  const t = useT();
  const techWhat = useTechWhat();

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
  const [panelSize, setPanelSize] = useState<FloatingPanelSize>(initialSize ?? 'expanded');
  const [isPeeking, setIsPeeking] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // 2D Drag position offset (in pixels from default bottom docked position)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragOffsetRef = useRef(dragOffset);
  dragOffsetRef.current = dragOffset;

  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    pointerId: number;
    hasMoved: boolean;
  } | null>(null);
  const lastDragTimeRef = useRef<number>(0);

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

  // Reset offset when opening a new tab
  const prevTabRef = useRef<FloatingPanelTab | null>(activeTab);
  useEffect(() => {
    if (!prevTabRef.current && activeTab) {
      setDragOffset({ x: 0, y: 0 });
    }
    prevTabRef.current = activeTab;
  }, [activeTab]);

  // Boundary checker & auto-centering function
  const recheckBounds = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const container = panel.parentElement;
    const containerRect = container
      ? container.getBoundingClientRect()
      : {
          top: 0,
          left: 0,
          right: window.innerWidth,
          bottom: window.innerHeight,
          width: window.innerWidth,
          height: window.innerHeight
        };

    const panelRect = panel.getBoundingClientRect();
    if (panelRect.width <= 0 || panelRect.height <= 0) return;

    const current = dragOffsetRef.current;
    const clamped = computeClampedOffset({
      panelRect,
      containerRect,
      currentOffset: current,
      targetOffset: current,
      safeMargin: 8
    });

    if (clamped.x !== current.x || clamped.y !== current.y) {
      setDragOffset(clamped);
    }
  }, []);

  // Re-clamp position whenever panel size, active tab, or selected instance changes
  useIsomorphicLayoutEffect(() => {
    recheckBounds();
  }, [panelSize, activeTab, selectedInstanceId, hintStage, recheckBounds]);

  // Observe element resizing and window resizing to keep window inside screen bounds
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver(() => {
      if (!dragStartRef.current) {
        recheckBounds();
      }
    });

    ro.observe(panel);
    if (panel.parentElement) {
      ro.observe(panel.parentElement);
    }

    const onWinResize = () => {
      if (!dragStartRef.current) {
        recheckBounds();
      }
    };
    window.addEventListener('resize', onWinResize);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onWinResize);
    };
  }, [recheckBounds]);

  // Drag handlers
  const onPointerDownDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return;

    const panel = panelRef.current;
    if (!panel) return;

    const container = panel.parentElement;
    const containerRect = container
      ? container.getBoundingClientRect()
      : {
          top: 0,
          left: 0,
          right: window.innerWidth,
          bottom: window.innerHeight,
          width: window.innerWidth,
          height: window.innerHeight
        };

    const panelRect = panel.getBoundingClientRect();
    const current = dragOffsetRef.current;

    const baseTop = panelRect.top - current.y;
    const baseBottom = panelRect.bottom - current.y;
    const baseLeft = panelRect.left - current.x;
    const baseRight = panelRect.right - current.x;

    const safeMargin = 8;
    const safeTop = containerRect.top + safeMargin;
    const safeBottom = containerRect.bottom - safeMargin;
    const safeLeft = containerRect.left + safeMargin;
    const safeRight = containerRect.right - safeMargin;

    const minY = safeTop - baseTop;
    const maxY = safeBottom - baseBottom;
    const minX = safeLeft - baseLeft;
    const maxX = safeRight - baseRight;

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: current.x,
      initialY: current.y,
      minX,
      maxX,
      minY,
      maxY,
      pointerId: e.pointerId,
      hasMoved: false
    };

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const onPointerMoveDrag = (e: React.PointerEvent) => {
    const d = dragStartRef.current;
    if (!d || d.pointerId !== e.pointerId) return;

    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    if (!d.hasMoved && Math.hypot(dx, dy) > 4) {
      d.hasMoved = true;
      setIsDragging(true);
      setIsPeeking(true);
    }

    if (!d.hasMoved) return;

    const targetX = d.initialX + dx;
    const targetY = d.initialY + dy;

    const clampedX = d.minX > d.maxX ? d.minX : Math.max(d.minX, Math.min(d.maxX, targetX));
    const clampedY = d.minY > d.maxY ? d.minY : Math.max(d.minY, Math.min(d.maxY, targetY));

    setDragOffset({ x: clampedX, y: clampedY });
  };

  const onPointerUpDrag = (e: React.PointerEvent) => {
    const d = dragStartRef.current;
    if (d && d.pointerId === e.pointerId) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      if (d.hasMoved) {
        lastDragTimeRef.current = Date.now();
      }
      dragStartRef.current = null;
      setIsDragging(false);
      setIsPeeking(false);
    }
  };

  const handlePillClick = () => {
    if (Date.now() - lastDragTimeRef.current < 250) return;
    setPanelSize(selectedInstance || hint ? 'compact' : 'expanded');
  };

  // If no active tab or activeTab is hint but hint is hidden/dismissed, don't render
  if (!activeTab) return null;

  // Walk frames for stepper in compact mode
  const currentStep = selectedInstance?.step ?? (hintStage !== 'hidden' ? hint : null);
  const frames = currentStep ? walkFrames(currentStep) : [];
  const walking = hintStage === 'walk' && frames.length > 0;
  const currentFrame = frames[Math.min(walkIndex, frames.length - 1)];

  return (
    <div
      ref={panelRef}
      className={`mobile-floating-panel ${panelSize} ${isDragging ? 'dragging' : ''} ${isPeeking ? 'peeking' : ''}`}
      style={{
        transform:
          dragOffset.x !== 0 || dragOffset.y !== 0
            ? `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`
            : undefined
      }}
      role="region"
      aria-label={t('Mobile floating assist panel')}
    >
      {panelSize === 'pill' ? (
        /* PILL MODE: Super compact 1-line interactive widget with grip and quick controls */
        <div
          className="mobile-floating-pill-row"
          onPointerDown={onPointerDownDrag}
          onPointerMove={onPointerMoveDrag}
          onPointerUp={onPointerUpDrag}
          onPointerCancel={onPointerUpDrag}
        >
          <span className="mobile-floating-pill-grip" aria-hidden="true">
            <GripIcon size={14} />
          </span>
          <div
            className="mobile-floating-pill-text"
            onClick={handlePillClick}
            role="button"
            tabIndex={0}
            title={t('Expand panel')}
            aria-label={t('Expand panel')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handlePillClick();
              }
            }}
          >
            {selectedInstance
              ? `${t.tech(selectedInstance.tech)} — ${selectedInstance.step.description}`
              : hint
                ? `${t.tech(hint.tech)}`
                : t('Tap to expand')}
          </div>
          <div className="mobile-floating-header-controls">
            <button
              type="button"
              className="mobile-floating-btn"
              onClick={(e) => {
                e.stopPropagation();
                setPanelSize(selectedInstance || hint ? 'compact' : 'expanded');
              }}
              title={t('Expand panel')}
              aria-label={t('Expand panel')}
            >
              <MaximizeIcon size={14} />
            </button>
            <button
              type="button"
              className="mobile-floating-btn"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              title={t('Close')}
              aria-label={t('Close')}
            >
              <CloseIcon size={14} />
            </button>
          </div>
        </div>
      ) : (
        <>
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

          <header
            className="mobile-floating-header"
            onPointerDown={onPointerDownDrag}
            onPointerMove={onPointerMoveDrag}
            onPointerUp={onPointerUpDrag}
            onPointerCancel={onPointerUpDrag}
          >
            <div className="mobile-floating-title-group">
              {activeTab === 'patterns' && (
                <>
                  <span className="mobile-floating-tab-icon" aria-hidden="true"><MicroscopeIcon size={16} /></span>
                  <span className="mobile-floating-tab-title">
                    {selectedInstance
                      ? t.tech(selectedInstance.tech)
                      : t('Patterns ({n})', { n: scanResult?.instances.length ?? 0 })}
                  </span>
                  {info && !selectedInstance && (
                    <span className="mobile-floating-rating-pill">
                      {t.level(pickOf(info.level, info.score))} · {info.score}
                    </span>
                  )}
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
                    {practiceMode === 'mixed'
                      ? t('Mixed Practice')
                      : info?.practiceTech
                        ? t('Practice: {tech}', { tech: t.tech(info.practiceTech) })
                        : t('Practice')}
                  </span>
                </>
              )}
            </div>

            <div className="mobile-floating-header-controls">
              {/* If compact, button to expand */}
              {panelSize === 'compact' && (
                <button
                  type="button"
                  className="mobile-floating-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPanelSize('expanded');
                  }}
                  title={t('Expand panel')}
                  aria-label={t('Expand panel')}
                >
                  <MaximizeIcon size={16} />
                </button>
              )}

              {/* If expanded or compact, button to collapse */}
              <button
                type="button"
                className="mobile-floating-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setPanelSize(panelSize === 'expanded' ? 'compact' : 'pill');
                }}
                title={t('Collapse panel')}
                aria-label={t('Collapse panel')}
              >
                <MinimizeIcon size={16} />
              </button>

              {/* Close button */}
              <button
                type="button"
                className="mobile-floating-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                title={t('Close')}
                aria-label={t('Close')}
              >
                <CloseIcon size={16} />
              </button>
            </div>
          </header>

          {panelSize === 'compact' && (selectedInstance || hint) ? (
        /* COMPACT MODE: Streamlined explanation card with stepper, Apply, and Learn */
        activeTab === 'hint' && hintStage === 'tech' && hint ? (
          <div className="mobile-compact-explanation-card mobile-compact-hint-tech">
            <div className="mobile-compact-body">
              <p className="mobile-compact-description">
                <strong>{rich(t('The next step uses {name}.'), { name: <span>{t.tech(hint.tech)}</span> })}</strong>
              </p>
              <p className="mobile-compact-what">
                {techWhat(hint.tech)}
              </p>
            </div>

            <div className="mobile-compact-actions">
              <div className="mobile-compact-actions-secondary">
                {onLearn && (
                  <button
                    type="button"
                    className="mobile-compact-action-btn ghost"
                    onClick={() => onLearn(hint.tech)}
                  >
                    {t('Learn')}
                  </button>
                )}
                <button
                  type="button"
                  className="mobile-compact-action-btn ghost"
                  onClick={onClose}
                >
                  {t('Close')}
                </button>
              </div>

              <button
                type="button"
                className="mobile-compact-action-btn primary"
                onClick={revealHint}
              >
                {t('Show me')}
              </button>
            </div>
          </div>
        ) : (
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
                  step={currentStep}
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
                    title={t('Previous frame')}
                  >
                    ◀
                  </button>
                  <span
                    className="mobile-stepper-count"
                    onClick={!walking ? () => walkHint(1) : undefined}
                    style={{ cursor: !walking ? 'pointer' : 'default' }}
                    title={!walking ? t('Walk through it') : undefined}
                  >
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
                    aria-label={walking ? t('Next frame') : t('Walk through it')}
                    title={walking ? t('Next frame') : t('Walk through it')}
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
        )
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
              onClose={onClose}
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
        </>
      )}
    </div>
  );
}
