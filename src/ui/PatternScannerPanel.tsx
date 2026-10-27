import React, { useState, useMemo, useEffect } from 'react';
import { usePatternScanner, ScanGrouping } from '../state/scannerStore';
import { useGame } from '../state/gameStore';
import { useSettings } from '../state/settings';
import { useT, Translator, rich } from '../content/i18n';
import { TECHS, Tech, Category } from '../engine/ratings';
import { cellName } from '../engine/board';
import { PatternInstance, TechScanSummary } from '../engine/scanner';
import {
  getFamiliarity,
  isTechniqueVisibleInScan,
  countMasteryStats
} from '../content/mastery';
import {
  getTechniqueConcept,
  REASONING_CONCEPTS,
  ReasoningConceptId,
  TECHNIQUE_TAXONOMY
} from '../content/concepts';
import { walkFrames } from '../engine/hintFrames';
import { stepText } from '../content/eureka';
import { copyText } from './send';
import { MicroscopeIcon, GearIcon, SearchIcon, GraduationCapIcon, CheckIcon, LightbulbIcon } from './Icons';
import { StepExplanationView } from './StepExplanationView';
import { FormattedExplanation } from './FormattedExplanation';
import { explainStep } from '../content/stepExplainer';

const ALL_CATEGORIES: Category[] = [
  'Singles',
  'Intersections',
  'Subsets',
  'Basic Fish',
  'Finned Fish',
  'Complex Fish',
  'Single Digit Patterns',
  'Wings',
  'Uniqueness',
  'Chains and Loops',
  'Coloring',
  'Almost Locked Sets',
  'Miscellaneous',
  'Last Resort'
];

interface PatternScannerPanelProps {
  onClose: () => void;
  onLearn?: (tech: Tech) => void;
  onOpenMastery?: () => void;
}

/** Render a short readable label for a conclusion key (e.g. 'E:12:3' -> 'Eliminate 3 from r2c4') */
function formatConclusionLabel(key: string, t: Translator): string {
  const parts = key.split(':');
  if (parts.length < 3) return key;
  const isElim = parts[0] === 'E';
  const cell = Number(parts[1]);
  const digit = Number(parts[2]);
  const cName = cellName(cell);
  return isElim
    ? t('Eliminate {digit} from {cell}', { digit, cell: cName })
    : t('Place {digit} in {cell}', { digit, cell: cName });
}

export function PatternScannerPanel({ onClose, onLearn, onOpenMastery }: PatternScannerPanelProps) {
  const t = useT();
  const isScanning = usePatternScanner((s) => s.isScanning);
  const scanResult = usePatternScanner((s) => s.scanResult);
  const selectedInstanceId = usePatternScanner((s) => s.selectedInstanceId);
  const isStale = usePatternScanner((s) => s.isStale);
  const groupBy = usePatternScanner((s) => s.groupBy);
  const expandedTechs = usePatternScanner((s) => s.expandedTechs);
  const expandedOutcomes = usePatternScanner((s) => s.expandedOutcomes);
  const filter = usePatternScanner((s) => s.filter);

  const runScan = usePatternScanner((s) => s.runScan);
  const selectInstance = usePatternScanner((s) => s.selectInstance);
  const setGroupBy = usePatternScanner((s) => s.setGroupBy);
  const toggleTechExpanded = usePatternScanner((s) => s.toggleTechExpanded);
  const toggleOutcomeExpanded = usePatternScanner((s) => s.toggleOutcomeExpanded);
  const setFilter = usePatternScanner((s) => s.setFilter);
  const resetFilter = usePatternScanner((s) => s.resetFilter);
  const applySelectedDeduction = usePatternScanner((s) => s.applySelectedDeduction);
  const checkStaleness = usePatternScanner((s) => s.checkStaleness);
  const toggleDiscoveryMode = usePatternScanner((s) => s.toggleDiscoveryMode);

  const mastery = useSettings((s) => s.mastery);
  const setTechniqueFamiliarity = useSettings((s) => s.setTechniqueFamiliarity);
  const applyMasteryPreset = useSettings((s) => s.applyMasteryPreset);
  const masteryStats = useMemo(() => countMasteryStats(mastery), [mastery]);

  const cells = useGame((s) => s.cells);
  const autoCandidates = useGame((s) => s.autoCandidates);
  const markContract = useGame((s) => s.markContract);

  useEffect(() => {
    checkStaleness();
  }, [cells, autoCandidates, markContract, checkStaleness]);

  const stage = useGame((s) => s.hintStage);
  const walkIndex = useGame((s) => s.walkIndex);
  const walkHint = useGame((s) => s.walkHint);
  const revealHint = useGame((s) => s.revealHint);

  const [showFilters, setShowFilters] = useState(false);
  const [detailInstanceId, setDetailInstanceId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Count of detected instances that are unfamiliar to the user
  const unfamiliarCount = useMemo(() => {
    if (!scanResult) return 0;
    return scanResult.instances.filter((inst) => getFamiliarity(mastery, inst.tech) === 'unfamiliar').length;
  }, [scanResult, mastery]);

  // Filter instances by query, category, concept, and mastery familiarity
  const filteredInstances = useMemo(() => {
    if (!scanResult) return [];
    let list = scanResult.instances;

    // Normal mode vs Discovery mode filtering:
    // In normal mode, only show techniques that the user has marked as known (or learning, if configured)
    if (!filter.discoveryMode) {
      list = list.filter((inst) => isTechniqueVisibleInScan(mastery, inst.tech, false));
    }

    // Search query
    const q = filter.query.trim().toLowerCase();
    if (q) {
      list = list.filter((inst) => {
        const tName = TECHS[inst.tech].name.toLowerCase();
        const lName = t.tech(inst.tech).toLowerCase();
        const digitsStr = inst.digits.join(' ');
        const cellStrs = inst.patternCells.map(cellName).join(' ').toLowerCase();
        const concStrs = inst.conclusionCells.map(cellName).join(' ').toLowerCase();
        const concept = getTechniqueConcept(inst.tech).name.toLowerCase();
        return (
          tName.includes(q) ||
          lName.includes(q) ||
          digitsStr.includes(q) ||
          cellStrs.includes(q) ||
          concStrs.includes(q) ||
          concept.includes(q)
        );
      });
    }

    // Category filter
    if (filter.category !== 'all') {
      list = list.filter((inst) => TECHS[inst.tech].category === filter.category);
    }

    // Reasoning Concept filter
    if (filter.concept !== 'all') {
      list = list.filter((inst) => TECHNIQUE_TAXONOMY[inst.tech]?.conceptId === filter.concept);
    }

    // Single target technique filter
    if (filter.lookForTech) {
      list = list.filter((inst) => inst.tech === filter.lookForTech);
    }

    return list;
  }, [scanResult, filter, mastery, t]);

  // Group instances by technique
  const instancesByTech = useMemo(() => {
    const map = new Map<Tech, PatternInstance[]>();
    for (const inst of filteredInstances) {
      const existing = map.get(inst.tech) ?? [];
      existing.push(inst);
      map.set(inst.tech, existing);
    }
    return map;
  }, [filteredInstances]);

  // Group instances by conclusion (outcome)
  const instancesByOutcome = useMemo(() => {
    const map = new Map<string, PatternInstance[]>();
    for (const inst of filteredInstances) {
      const existing = map.get(inst.conclusionKey) ?? [];
      existing.push(inst);
      map.set(inst.conclusionKey, existing);
    }
    return map;
  }, [filteredInstances]);

  const totalInstances = scanResult?.instances.length ?? 0;
  const filteredCount = filteredInstances.length;
  const hasActiveFilter =
    filter.query !== '' ||
    filter.category !== 'all' ||
    filter.concept !== 'all' ||
    filter.discoveryMode ||
    filter.lookForTech !== null ||
    !filter.useUniqueness ||
    filter.includeDisabled;

  return (
    <div
      className="hint-panel pattern-scanner-panel"
      role="region"
      aria-label={t('Pattern Scanner')}
    >
      <div className="hint-head pattern-scanner-head">
        <div className="scanner-title-wrap">
          <span className="scanner-badge-icon" aria-hidden="true">
            <MicroscopeIcon size={16} />
          </span>
          <strong>{t('Pattern Scanner')}</strong>
          {totalInstances > 0 && (
            <span className="scanner-total-pill">
              {t(totalInstances === 1 ? '{n} pattern' : '{n} patterns', { n: totalInstances })}
            </span>
          )}
        </div>
        <div className="scanner-head-actions">
          <button
            className="ghost scanner-action-btn"
            onClick={() => runScan()}
            disabled={isScanning}
            title={t('Rescan current board position')}
          >
            {isScanning ? t('Scanning…') : t('Rescan')}
          </button>
          <button
            className="ghost scanner-action-btn"
            onClick={onClose}
            title={t('Close Pattern Scanner')}
          >
            {t('Done')}
          </button>
        </div>
      </div>

      <div className="hint-body pattern-scanner-body">
        {/* First-time knowledge setup banner */}
        {!mastery?.setupCompleted && (
          <div className="scanner-setup-banner">
            <div className="scanner-setup-text">
              <strong>{t('Welcome to Pattern Scanner!')}</strong>
              <p>{t('Choose a starting preset to focus your practice, or customize your knowledge:')}</p>
            </div>
            <div className="scanner-setup-presets">
              <button className="ghost mini" onClick={() => applyMasteryPreset('basics')}>
                {t('Basics Only')}
              </button>
              <button className="ghost mini" onClick={() => applyMasteryPreset('intermediate')}>
                {t('Common Patterns')}
              </button>
              <button className="ghost mini" onClick={() => applyMasteryPreset('advanced')}>
                {t('Advanced')}
              </button>
              <button className="ghost mini" onClick={() => applyMasteryPreset('all_implemented')}>
                {t('All Implemented')}
              </button>
              {onOpenMastery && (
                <button className="ghost mini accent" onClick={onOpenMastery}>
                  <GearIcon size={13} /> {t('My Techniques')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Position changed warning banner */}
        {isStale && (
          <div className="scanner-stale-banner" role="status">
            <span>{t('Board position changed since this scan.')}</span>
            <button className="scanner-rescan-inline-btn" onClick={() => runScan()}>
              {t('Scan current position')}
            </button>
          </div>
        )}

        {/* Truncation warning if search bounds hit */}
        {scanResult?.truncated && (
          <div className="scanner-truncation-banner" role="status">
            <span>
              {t('Search budget reached for {techs} — some deeper patterns may not be shown.', {
                techs: Object.values(scanResult.byTech)
                  .filter((s): s is TechScanSummary => !!s?.truncated)
                  .map((s) => t.tech(s.tech))
                  .join(', ')
              })}
            </span>
          </div>
        )}

        {/* Discovery prompt banner when unfamiliar patterns exist but Discovery Mode is OFF */}
        {!filter.discoveryMode && unfamiliarCount > 0 && (
          <div className="scanner-discovery-prompt">
            <span>
              {t(
                unfamiliarCount === 1
                  ? '1 unfamiliar pattern also exists in this position.'
                  : '{n} unfamiliar patterns also exist in this position.',
                { n: unfamiliarCount }
              )}
            </span>
            <button className="ghost mini scanner-discovery-pill-btn" onClick={toggleDiscoveryMode}>
              <SearchIcon size={12} /> {t('Explore in Discovery Mode')}
            </button>
          </div>
        )}

        {/* Search & View Controls Bar */}
        <div className="scanner-toolbar">
          <div className="scanner-search-wrap">
            <input
              type="search"
              className="scanner-search-input"
              value={filter.query}
              onChange={(e) => setFilter({ query: e.target.value })}
              placeholder={t('Filter patterns…')}
              aria-label={t('Filter patterns')}
            />
          </div>
          <div className="scanner-group-toggle" role="group" aria-label={t('Group patterns by')}>
            <button
              className={`scanner-tab-btn ${groupBy === 'technique' ? 'active' : ''}`}
              onClick={() => setGroupBy('technique')}
              title={t('Group patterns by technique')}
            >
              {t('By Technique')}
            </button>
            <button
              className={`scanner-tab-btn ${groupBy === 'outcome' ? 'active' : ''}`}
              onClick={() => setGroupBy('outcome')}
              title={t('Group patterns by outcome')}
            >
              {t('By Outcome')}
            </button>
          </div>

          {/* Discovery Mode Toggle */}
          <button
            className={`ghost scanner-discovery-btn ${filter.discoveryMode ? 'active' : ''}`}
            onClick={toggleDiscoveryMode}
            title={t('Discovery Mode: show unfamiliar techniques with explanations')}
          >
            <SearchIcon size={13} /> {t('Discovery')}
          </button>

          {/* Options & My Techniques button */}
          <button
            className={`ghost scanner-filter-toggle-btn ${hasActiveFilter ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
            title={t('Scan filters and options')}
          >
            <GearIcon size={13} /> {t('Options')}
          </button>

          {onOpenMastery && (
            <button
              className="ghost scanner-mastery-btn"
              onClick={onOpenMastery}
              title={t('Configure My Techniques')}
            >
              <GraduationCapIcon size={13} /> {t('My Techniques ({n})', { n: masteryStats.knownCount })}
            </button>
          )}
        </div>

        {/* Expandable Filter / Options Drawer */}
        {showFilters && (
          <div className="scanner-filter-drawer">
            <div className="scanner-filter-row">
              <label>
                <strong>{t('Category:')}</strong>
              </label>
              <select
                className="scanner-category-select"
                value={filter.category}
                onChange={(e) => setFilter({ category: e.target.value as Category | 'all' })}
              >
                <option value="all">{t('All categories')}</option>
                {ALL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="scanner-filter-row">
              <label>
                <strong>{t('Reasoning Concept:')}</strong>
              </label>
              <select
                className="scanner-category-select"
                value={filter.concept}
                onChange={(e) => setFilter({ concept: e.target.value as ReasoningConceptId | 'all' })}
              >
                <option value="all">{t('All concepts')}</option>
                {(Object.keys(REASONING_CONCEPTS) as ReasoningConceptId[]).map((cId) => (
                  <option key={cId} value={cId}>
                    {t(REASONING_CONCEPTS[cId].name)}
                  </option>
                ))}
              </select>
            </div>

            <div className="scanner-filter-checkboxes">
              <label className="scanner-checkbox-label">
                <input
                  type="checkbox"
                  checked={filter.useUniqueness}
                  onChange={(e) => {
                    const useUniq = e.target.checked;
                    setFilter({ useUniqueness: useUniq });
                    runScan({ useUniqueness: useUniq });
                  }}
                />
                <span>{t('Include uniqueness techniques')}</span>
              </label>
              <label className="scanner-checkbox-label">
                <input
                  type="checkbox"
                  checked={filter.includeDisabled}
                  onChange={(e) => {
                    const incDisabled = e.target.checked;
                    setFilter({ includeDisabled: incDisabled });
                    runScan({ includeDisabled: incDisabled });
                  }}
                />
                <span>{t('Include disabled fish (Squirmbag, Whale, Leviathan)')}</span>
              </label>
            </div>
            {hasActiveFilter && (
              <div className="scanner-filter-reset">
                <button
                  className="ghost scanner-link-btn"
                  onClick={() => {
                    resetFilter();
                    runScan({ useUniqueness: true, includeDisabled: false });
                  }}
                >
                  {t('Reset all filters')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Selected Pattern Quick Action Bar */}
        {selectedInstanceId && (
          <div className="scanner-selection-bar">
            <span className="scanner-selection-note">
              {t('Pattern highlighted on board')}
            </span>
            <div className="scanner-selection-actions">
              <button
                className="ghost scanner-link-btn"
                onClick={() => selectInstance(null)}
                title={t('Clear board highlight')}
              >
                {t('Clear highlight')}
              </button>
              <button
                className="scanner-apply-btn"
                onClick={() => applySelectedDeduction()}
                title={t('Apply this deduction to the board')}
              >
                <CheckIcon size={13} /> {t('Apply deduction')}
              </button>
            </div>
          </div>
        )}

        {/* Results Container */}
        {isScanning ? (
          <div className="scanner-loading-state">
            <div className="spinner" />
            <p>{t('Scanning current position for patterns…')}</p>
          </div>
        ) : !scanResult ? (
          <div className="scanner-empty-state">
            <p>{t('Click Scan to analyze the current position.')}</p>
          </div>
        ) : filteredCount === 0 ? (
          <div className="scanner-empty-state">
            {hasActiveFilter ? (
              <>
                <p>{t('No patterns match your search filter.')}</p>
                {unfamiliarCount > 0 && !filter.discoveryMode && (
                  <button className="ghost scanner-discovery-pill-btn" onClick={toggleDiscoveryMode}>
                    <SearchIcon size={12} /> {t('Try Discovery Mode ({n} unfamiliar patterns)', { n: unfamiliarCount })}
                  </button>
                )}
                <button className="ghost scanner-link-btn" onClick={resetFilter}>
                  {t('Reset filter')}
                </button>
              </>
            ) : (
              <>
                <p>{t('No patterns found in this position with current techniques.')}</p>
                {unfamiliarCount > 0 && !filter.discoveryMode && (
                  <button className="ghost scanner-discovery-pill-btn" onClick={toggleDiscoveryMode}>
                    <SearchIcon size={12} /> {t('Try Discovery Mode ({n} unfamiliar patterns)', { n: unfamiliarCount })}
                  </button>
                )}
                <button className="ghost scanner-link-btn" onClick={() => runScan()}>
                  {t('Scan again')}
                </button>
              </>
            )}
          </div>
        ) : groupBy === 'technique' ? (
          /* View By Technique */
          <div className="scanner-list">
            {[...instancesByTech.entries()].map(([tech, instances]) => {
              const isExpanded = expandedTechs[tech] !== false;
              const info = TECHS[tech];
              const fam = getFamiliarity(mastery, tech);
              const isUnfamiliar = fam === 'unfamiliar';

              return (
                <div key={tech} className={`scanner-group-card ${isUnfamiliar ? 'unfamiliar-group' : ''}`}>
                  <div
                    className="scanner-group-header"
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleTechExpanded(tech)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleTechExpanded(tech);
                      }
                    }}
                  >
                    <div className="scanner-group-title">
                      <span className="scanner-chevron">{isExpanded ? '▼' : '▶'}</span>
                      <strong>{t.tech(tech)}</strong>
                      <span className="scanner-count-pill">{instances.length}</span>
                      {isUnfamiliar && (
                        <span className="scanner-discovery-badge-tag" title={t('Discovered outside your known techniques')}>
                          <SearchIcon size={12} /> {t('Discovery')}
                        </span>
                      )}
                    </div>
                    <span className="scanner-category-tag">{info.category}</span>
                  </div>

                  {isExpanded && (
                    <div className="scanner-instances-list">
                      {instances.map((inst) => {
                        const isSelected = selectedInstanceId === inst.id;
                        const isDetailOpen = detailInstanceId === inst.id;
                        const exp = explainStep(inst.step);
                        const frames = isSelected ? (exp.walkFrames.length > 1 ? exp.walkFrames : walkFrames(inst.step)) : [];
                        const walking = isSelected && stage === 'walk' && frames.length > 0;
                        const otherExplanationsCount =
                          (scanResult?.byConclusion[inst.conclusionKey]?.length ?? 1) - 1;
                        const concept = getTechniqueConcept(inst.tech);

                        return (
                          <div
                            key={inst.id}
                            className={`scanner-instance-card ${isSelected ? 'selected' : ''} ${isUnfamiliar ? 'unfamiliar-card' : ''}`}
                            onClick={() => selectInstance(inst.id)}
                          >
                            {/* Discovery badge banner on unfamiliar instance */}
                            {isUnfamiliar && (
                              <div className="scanner-instance-discovery-banner">
                                <div className="discovery-banner-head">
                                  <span><LightbulbIcon size={13} /> {t('Discovery Pattern')}</span>
                                  <span className="discovery-concept-tag">{t(concept.name)}</span>
                                </div>
                                <div className="discovery-quick-actions">
                                  <button
                                    className="ghost mini"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setTechniqueFamiliarity(inst.tech, 'learning');
                                    }}
                                  >
                                    <GraduationCapIcon size={12} /> {t('Mark as Learning')}
                                  </button>
                                  <button
                                    className="ghost mini"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setTechniqueFamiliarity(inst.tech, 'known');
                                    }}
                                  >
                                    <CheckIcon size={12} /> {t('Mark as Known')}
                                  </button>
                                </div>
                              </div>
                            )}

                            <div className="scanner-instance-row">
                              <div className="scanner-instance-meta">
                                <span className="scanner-digit-badge">
                                  {t(inst.digits.length === 1 ? 'Digit {d}' : 'Digits {d}', {
                                    d: inst.digits.join(', ')
                                  })}
                                </span>
                                <span className="scanner-conclusion-text">
                                  {formatConclusionLabel(inst.conclusionKey, t)}
                                </span>
                              </div>
                              <div className="scanner-instance-tags">
                                {fam === 'learning' && (
                                  <span className="scanner-fam-pill learning" title={t('Technique you are learning')}>
                                    <GraduationCapIcon size={12} /> {t('Learning')}
                                  </span>
                                )}
                                {fam === 'known' && (
                                  <span className="scanner-fam-pill known" title={t('Technique you know')}>
                                    <CheckIcon size={12} /> {t('Known')}
                                  </span>
                                )}
                                {otherExplanationsCount > 0 && (
                                  <span
                                    className="scanner-multi-tag"
                                    title={t(
                                      otherExplanationsCount === 1
                                        ? 'Also proven by {n} other pattern instance'
                                        : 'Also proven by {n} other pattern instances',
                                      { n: otherExplanationsCount }
                                    )}
                                  >
                                    {t('+{n} other', { n: otherExplanationsCount })}
                                  </span>
                                )}
                              </div>
                            </div>

                            <p className="scanner-instance-cells">
                              {t('Cells: {cells}', {
                                cells: inst.patternCells.map(cellName).join(', ')
                              })}
                            </p>

                            <div className="scanner-instance-actions">
                              <button
                                className="ghost scanner-link-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDetailInstanceId(isDetailOpen ? null : inst.id);
                                }}
                              >
                                {isDetailOpen ? t('Hide explanation') : t('Explain pattern')}
                              </button>
                              {isSelected && frames.length > 1 && !walking && (
                                <button
                                  className="ghost scanner-link-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    walkHint();
                                  }}
                                  title={t('Walk through it')}
                                >
                                  {t('Walk through it')}
                                </button>
                              )}
                              {isSelected && walking && (
                                <button
                                  className="ghost scanner-link-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    revealHint();
                                  }}
                                  title={t('Reveal')}
                                >
                                  {t('Show all')}
                                </button>
                              )}
                              <button
                                className="ghost scanner-link-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void copyText(stepText(inst.step)).then((outcome) => {
                                    if (outcome === 'copied') {
                                      setCopiedId(inst.id);
                                      setTimeout(() => setCopiedId(null), 2000);
                                    }
                                  });
                                }}
                                title={t('Copy this step as one line of notation (Eureka for a chain), the way the forums write it')}
                              >
                                {copiedId === inst.id ? <><CheckIcon size={14} /> {t('Copied')}</> : t('Copy step')}
                              </button>
                              {onLearn && (
                                <button
                                  className="ghost scanner-link-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onLearn(inst.tech);
                                  }}
                                  title={t('Learn about {name}', { name: t.tech(inst.tech) })}
                                >
                                  {t('Learn')} ⓘ
                                </button>
                              )}
                            </div>

                            {(isDetailOpen || walking) && (
                              <div className="scanner-instance-detail">
                                {walking && frames.length > 0 ? (
                                  <div className="hint-walk scanner-walk-box" aria-live="polite">
                                    <p className="hint-walk-text">
                                      <FormattedExplanation
                                        text={frames[Math.min(walkIndex, frames.length - 1)]?.text ?? ''}
                                        step={inst.step}
                                      />
                                    </p>
                                    <div className="hint-walk-nav">
                                      <button
                                        className="ghost"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          walkHint(-1);
                                        }}
                                        disabled={walkIndex === 0}
                                        aria-label={t('Previous')}
                                      >
                                        ◀
                                      </button>
                                      <span className="hint-walk-count">
                                        {t('{i} of {n}', {
                                          i: Math.min(walkIndex, frames.length - 1) + 1,
                                          n: frames.length
                                        })}
                                      </span>
                                      <button
                                        className="ghost"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          walkHint(1);
                                        }}
                                        disabled={walkIndex >= frames.length - 1}
                                        aria-label={t('Next')}
                                      >
                                        ▶
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <StepExplanationView step={inst.step} compact={true} defaultExpanded={true} />
                                )}
                                <p className="scanner-concept-note">
                                  <strong>{t('Reasoning Concept:')}</strong> {t(concept.name)} — {t(concept.summary)}
                                </p>
                                {inst.step.labels && (
                                  <ul className="scanner-labels-list">
                                    {inst.step.labels.primary && (
                                      <li>
                                        <i
                                          className="legend-dot"
                                          style={{ background: 'var(--hint-primary)' }}
                                        />
                                        <span>{inst.step.labels.primary}</span>
                                      </li>
                                    )}
                                    {inst.step.labels.secondary && (
                                      <li>
                                        <i
                                          className="legend-dot"
                                          style={{ background: 'var(--hint-secondary)' }}
                                        />
                                        <span>{inst.step.labels.secondary}</span>
                                      </li>
                                    )}
                                    {inst.step.labels.fins && (
                                      <li>
                                        <i
                                          className="legend-dot"
                                          style={{ background: 'var(--hint-fin)' }}
                                        />
                                        <span>{inst.step.labels.fins}</span>
                                      </li>
                                    )}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* View By Outcome */
          <div className="scanner-list">
            {[...instancesByOutcome.entries()].map(([outcomeKey, instances]) => {
              const isExpanded = expandedOutcomes[outcomeKey] !== false;
              const outcomeLabel = formatConclusionLabel(outcomeKey, t);

              return (
                <div key={outcomeKey} className="scanner-group-card">
                  <div
                    className="scanner-group-header"
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleOutcomeExpanded(outcomeKey)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleOutcomeExpanded(outcomeKey);
                      }
                    }}
                  >
                    <div className="scanner-group-title">
                      <span className="scanner-chevron">{isExpanded ? '▼' : '▶'}</span>
                      <strong>{outcomeLabel}</strong>
                      <span className="scanner-count-pill">{instances.length}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="scanner-instances-list">
                      {instances.map((inst) => {
                        const isSelected = selectedInstanceId === inst.id;
                        const isDetailOpen = detailInstanceId === inst.id;
                        const fam = getFamiliarity(mastery, inst.tech);
                        const isUnfamiliar = fam === 'unfamiliar';
                        const concept = getTechniqueConcept(inst.tech);
                        const exp = explainStep(inst.step);
                        const frames = isSelected ? (exp.walkFrames.length > 1 ? exp.walkFrames : walkFrames(inst.step)) : [];
                        const walking = isSelected && stage === 'walk' && frames.length > 0;

                        return (
                          <div
                            key={inst.id}
                            className={`scanner-instance-card ${isSelected ? 'selected' : ''} ${isUnfamiliar ? 'unfamiliar-card' : ''}`}
                            onClick={() => selectInstance(inst.id)}
                          >
                            <div className="scanner-instance-row">
                              <span className="scanner-tech-badge">
                                <strong>{t.tech(inst.tech)}</strong>
                                {isUnfamiliar && (
                                  <span className="scanner-discovery-badge-tag"><SearchIcon size={12} /> {t('Discovery')}</span>
                                )}
                              </span>
                              <div className="scanner-instance-tags">
                                <span className="scanner-digit-badge">
                                  {t(inst.digits.length === 1 ? 'Digit {d}' : 'Digits {d}', {
                                    d: inst.digits.join(', ')
                                  })}
                                </span>
                                {fam === 'learning' && (
                                  <span className="scanner-fam-pill learning"><GraduationCapIcon size={12} /> {t('Learning')}</span>
                                )}
                                {fam === 'known' && (
                                  <span className="scanner-fam-pill known"><CheckIcon size={12} /> {t('Known')}</span>
                                )}
                              </div>
                            </div>

                            <p className="scanner-instance-cells">
                              {t('Pattern cells: {cells}', {
                                cells: inst.patternCells.map(cellName).join(', ')
                              })}
                            </p>

                            <div className="scanner-instance-actions">
                              <button
                                className="ghost scanner-link-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDetailInstanceId(isDetailOpen ? null : inst.id);
                                }}
                              >
                                {isDetailOpen ? t('Hide explanation') : t('Explain pattern')}
                              </button>
                              {isSelected && frames.length > 1 && !walking && (
                                <button
                                  className="ghost scanner-link-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    walkHint();
                                  }}
                                  title={t('Walk through it')}
                                >
                                  {t('Walk through it')}
                                </button>
                              )}
                              {isSelected && walking && (
                                <button
                                  className="ghost scanner-link-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    revealHint();
                                  }}
                                  title={t('Reveal')}
                                >
                                  {t('Show all')}
                                </button>
                              )}
                              <button
                                className="ghost scanner-link-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void copyText(stepText(inst.step)).then((outcome) => {
                                    if (outcome === 'copied') {
                                      setCopiedId(inst.id);
                                      setTimeout(() => setCopiedId(null), 2000);
                                    }
                                  });
                                }}
                                title={t('Copy this step as one line of notation (Eureka for a chain), the way the forums write it')}
                              >
                                {copiedId === inst.id ? <><CheckIcon size={14} /> {t('Copied')}</> : t('Copy step')}
                              </button>
                              {onLearn && (
                                <button
                                  className="ghost scanner-link-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onLearn(inst.tech);
                                  }}
                                  title={t('Learn about {name}', { name: t.tech(inst.tech) })}
                                >
                                  {t('Learn')} ⓘ
                                </button>
                              )}
                            </div>

                            {(isDetailOpen || walking) && (
                              <div className="scanner-instance-detail">
                                {walking && frames.length > 0 ? (
                                  <div className="hint-walk scanner-walk-box" aria-live="polite">
                                    <p className="hint-walk-text">
                                      <FormattedExplanation
                                        text={frames[Math.min(walkIndex, frames.length - 1)]?.text ?? ''}
                                        step={inst.step}
                                      />
                                    </p>
                                    <div className="hint-walk-nav">
                                      <button
                                        className="ghost"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          walkHint(-1);
                                        }}
                                        disabled={walkIndex === 0}
                                        aria-label={t('Previous')}
                                      >
                                        ◀
                                      </button>
                                      <span className="hint-walk-count">
                                        {t('{i} of {n}', {
                                          i: Math.min(walkIndex, frames.length - 1) + 1,
                                          n: frames.length
                                        })}
                                      </span>
                                      <button
                                        className="ghost"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          walkHint(1);
                                        }}
                                        disabled={walkIndex >= frames.length - 1}
                                        aria-label={t('Next')}
                                      >
                                        ▶
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <StepExplanationView step={inst.step} compact={true} defaultExpanded={true} />
                                )}
                                <p className="scanner-concept-note">
                                  <strong>{t('Reasoning Concept:')}</strong> {t(concept.name)} — {t(concept.summary)}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
