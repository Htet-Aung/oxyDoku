import React, { useState, useMemo } from 'react';
import { useSettings } from '../state/settings';
import { useT, rich } from '../content/i18n';
import { Modal } from './Dialogs';
import { TECHS, Tech, Category } from '../engine/ratings';
import { IMPLEMENTED_TECHS, UNIMPLEMENTED_TECHS, TECH_SCANNER_META } from '../engine/scanner';
import {
  Familiarity,
  MASTERY_PRESETS,
  getFamiliarity,
  countMasteryStats
} from '../content/mastery';
import {
  REASONING_CONCEPTS,
  ReasoningConceptId,
  TECHNIQUE_TAXONOMY,
  getTechniqueConcept
} from '../content/concepts';
import { FAMILY_ORDER, categoryLabel, CATEGORY_NOTES } from '../content/categories';

interface MyTechniquesDialogProps {
  onClose: () => void;
  onLearn?: (tech: Tech) => void;
}

type GroupByView = 'category' | 'concept';

export function MyTechniquesDialog({ onClose, onLearn }: MyTechniquesDialogProps) {
  const t = useT();
  const mastery = useSettings((s) => s.mastery);
  const setTechniqueFamiliarity = useSettings((s) => s.setTechniqueFamiliarity);
  const setTechniqueFamiliarityBatch = useSettings((s) => s.setTechniqueFamiliarityBatch);
  const applyMasteryPreset = useSettings((s) => s.applyMasteryPreset);
  const setIncludeLearning = useSettings((s) => s.setIncludeLearning);

  const [view, setView] = useState<GroupByView>('concept');
  const [search, setSearch] = useState('');
  const [filterFam, setFilterFam] = useState<'all' | Familiarity>('all');
  const [presetNotice, setPresetNotice] = useState<string | null>(null);

  const stats = useMemo(() => countMasteryStats(mastery), [mastery]);

  const q = search.trim().toLowerCase();

  // Filter techniques by search query and familiarity filter
  const filterTech = (tech: Tech): boolean => {
    const fam = getFamiliarity(mastery, tech);
    if (filterFam !== 'all' && fam !== filterFam) return false;

    if (!q) return true;

    const tName = TECHS[tech].name.toLowerCase();
    const lName = t.tech(tech).toLowerCase();
    const taxonomy = TECHNIQUE_TAXONOMY[tech];
    const aliases = taxonomy?.aliases.join(' ').toLowerCase() ?? '';
    const concept = getTechniqueConcept(tech).name.toLowerCase();

    return tName.includes(q) || lName.includes(q) || aliases.includes(q) || concept.includes(q);
  };

  const handleApplyPreset = (presetId: string) => {
    applyMasteryPreset(presetId);
    const preset = MASTERY_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setPresetNotice(t('Applied preset: {name}', { name: preset.name }));
      setTimeout(() => setPresetNotice(null), 3500);
    }
  };

  return (
    <Modal title={t('My Techniques')} onClose={onClose}>
      <div className="mastery-dialog-content">
        <p className="dialog-note">
          {t(
            'Tell Pattern Lab which Sudoku techniques you already understand or are currently studying. The Pattern Scanner uses this to show the patterns you care about without overwhelming you with unfamiliar methods.'
          )}
        </p>

        {/* Stats Summary Bar */}
        <div className="mastery-stats-bar">
          <div className="mastery-stat known">
            <span className="mastery-stat-count">{stats.knownCount}</span>
            <span className="mastery-stat-label">{t('Known')}</span>
          </div>
          <div className="mastery-stat learning">
            <span className="mastery-stat-count">{stats.learningCount}</span>
            <span className="mastery-stat-label">{t('Learning')}</span>
          </div>
          <div className="mastery-stat unfamiliar">
            <span className="mastery-stat-count">{stats.unfamiliarCount}</span>
            <span className="mastery-stat-label">{t('Unfamiliar')}</span>
          </div>
          <div className="mastery-stat total">
            <span className="mastery-stat-count">{stats.totalImplemented}</span>
            <span className="mastery-stat-label">{t('Supported')}</span>
          </div>
        </div>

        {/* Preset Picker */}
        <div className="mastery-presets-section">
          <div className="mastery-presets-head">
            <strong>{t('Starter Presets')}</strong>
            <small>{t('Quickly populate your familiarity or start from scratch')}</small>
          </div>
          <div className="mastery-presets-buttons">
            {MASTERY_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className={`ghost preset-btn ${mastery?.activePreset === preset.id ? 'active' : ''}`}
                onClick={() => handleApplyPreset(preset.id)}
                title={preset.description}
              >
                {t(preset.name)}
              </button>
            ))}
          </div>
          {presetNotice && <p className="mastery-preset-alert">{presetNotice}</p>}
        </div>

        {/* Search, Grouping and Familiarity Filter Controls */}
        <div className="mastery-controls-bar">
          <input
            type="search"
            className="mastery-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Search techniques, aliases or concepts…')}
            aria-label={t('Search techniques, aliases or concepts')}
          />

          <div className="mastery-toggles-row">
            <div className="segmented mastery-view-segmented" role="group" aria-label={t('Group techniques by')}>
              <button
                className={view === 'concept' ? 'active' : ''}
                onClick={() => setView('concept')}
                title={t('Group by underlying reasoning mechanism (e.g. Fish logic, Wing logic, ALS)')}
              >
                {t('By Reasoning Concept')}
              </button>
              <button
                className={view === 'category' ? 'active' : ''}
                onClick={() => setView('category')}
                title={t('Group by catalogue family (Singles, Fish, Wings, Chains)')}
              >
                {t('By Category')}
              </button>
            </div>

            <div className="segmented mastery-fam-segmented" role="group" aria-label={t('Filter by familiarity')}>
              <button className={filterFam === 'all' ? 'active' : ''} onClick={() => setFilterFam('all')}>
                {t('All')}
              </button>
              <button className={filterFam === 'known' ? 'active' : ''} onClick={() => setFilterFam('known')}>
                {t('Known ({n})', { n: stats.knownCount })}
              </button>
              <button className={filterFam === 'learning' ? 'active' : ''} onClick={() => setFilterFam('learning')}>
                {t('Learning ({n})', { n: stats.learningCount })}
              </button>
              <button className={filterFam === 'unfamiliar' ? 'active' : ''} onClick={() => setFilterFam('unfamiliar')}>
                {t('Unfamiliar ({n})', { n: stats.unfamiliarCount })}
              </button>
            </div>
          </div>
        </div>

        {/* Options Row */}
        <div className="mastery-options-row">
          <label className="mastery-checkbox-label">
            <input
              type="checkbox"
              checked={mastery?.includeLearning !== false}
              onChange={(e) => setIncludeLearning(e.target.checked)}
            />
            <span>{t("Include techniques marked 'Learning' in normal pattern scans")}</span>
          </label>
        </div>

        {/* Technique List: Grouped by Concept or Category */}
        <div className="mastery-tech-list">
          {view === 'concept' ? (
            /* VIEW BY REASONING CONCEPT */
            (Object.keys(REASONING_CONCEPTS) as ReasoningConceptId[]).map((cId) => {
              const concept = REASONING_CONCEPTS[cId];
              const matchingTechs = concept.techniques.filter(filterTech);
              if (matchingTechs.length === 0) return null;

              return (
                <div key={cId} className="mastery-group-card">
                  <div className="mastery-group-head">
                    <div className="mastery-group-title">
                      <h3>{t(concept.name)}</h3>
                      <p className="mastery-group-desc">{t(concept.summary)}</p>
                    </div>
                    <div className="mastery-group-bulk-actions">
                      <button
                        className="ghost mini"
                        onClick={() => setTechniqueFamiliarityBatch(matchingTechs, 'known')}
                        title={t('Mark all matching techniques in this concept as Known')}
                      >
                        ✓ {t('All Known')}
                      </button>
                      <button
                        className="ghost mini"
                        onClick={() => setTechniqueFamiliarityBatch(matchingTechs, 'learning')}
                        title={t('Mark all matching techniques in this concept as Learning')}
                      >
                        🎓 {t('All Learning')}
                      </button>
                      <button
                        className="ghost mini"
                        onClick={() => setTechniqueFamiliarityBatch(matchingTechs, 'unfamiliar')}
                        title={t('Mark all matching techniques in this concept as Unfamiliar')}
                      >
                        ✕ {t('All Unfamiliar')}
                      </button>
                    </div>
                  </div>

                  <div className="mastery-tech-items">
                    {matchingTechs.map((tech) => (
                      <TechniqueRow
                        key={tech}
                        tech={tech}
                        familiarity={getFamiliarity(mastery, tech)}
                        onSetFamiliarity={(fam) => setTechniqueFamiliarity(tech, fam)}
                        onLearn={onLearn}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            /* VIEW BY CATEGORY */
            FAMILY_ORDER.map((cat) => {
              const catTechs = (Object.keys(TECHS) as Tech[])
                .filter((t) => TECHS[t].category === cat)
                .filter(filterTech);
              if (catTechs.length === 0) return null;

              return (
                <div key={cat} className="mastery-group-card">
                  <div className="mastery-group-head">
                    <div className="mastery-group-title">
                      <h3>{t(categoryLabel(cat))}</h3>
                      <p className="mastery-group-desc">{t(CATEGORY_NOTES[cat])}</p>
                    </div>
                    <div className="mastery-group-bulk-actions">
                      <button
                        className="ghost mini"
                        onClick={() => setTechniqueFamiliarityBatch(catTechs, 'known')}
                        title={t('Mark all matching techniques in this category as Known')}
                      >
                        ✓ {t('All Known')}
                      </button>
                      <button
                        className="ghost mini"
                        onClick={() => setTechniqueFamiliarityBatch(catTechs, 'learning')}
                        title={t('Mark all matching techniques in this category as Learning')}
                      >
                        🎓 {t('All Learning')}
                      </button>
                      <button
                        className="ghost mini"
                        onClick={() => setTechniqueFamiliarityBatch(catTechs, 'unfamiliar')}
                        title={t('Mark all matching techniques in this category as Unfamiliar')}
                      >
                        ✕ {t('All Unfamiliar')}
                      </button>
                    </div>
                  </div>

                  <div className="mastery-tech-items">
                    {catTechs.map((tech) => (
                      <TechniqueRow
                        key={tech}
                        tech={tech}
                        familiarity={getFamiliarity(mastery, tech)}
                        onSetFamiliarity={(fam) => setTechniqueFamiliarity(tech, fam)}
                        onLearn={onLearn}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="hint-actions mastery-footer-actions">
          <button onClick={onClose}>{t('Done')}</button>
        </div>
      </div>
    </Modal>
  );
}

/** Individual technique row with 3-way mastery toggle, meta badges, and relationships */
function TechniqueRow({
  tech,
  familiarity,
  onSetFamiliarity,
  onLearn
}: {
  tech: Tech;
  familiarity: Familiarity;
  onSetFamiliarity: (fam: Familiarity) => void;
  onLearn?: (tech: Tech) => void;
}) {
  const t = useT();
  const info = TECHS[tech];
  const meta = TECH_SCANNER_META[tech];
  const taxonomy = TECHNIQUE_TAXONOMY[tech];
  const isImplemented = meta?.implemented ?? false;

  return (
    <div className={`mastery-tech-row ${!isImplemented ? 'unimplemented' : ''}`}>
      <div className="mastery-tech-info">
        <div className="mastery-tech-title-line">
          <strong className="mastery-tech-name">{t.tech(tech)}</strong>
          {t.tech(tech) !== info.name && (
            <span className="mastery-tech-en">({info.name})</span>
          )}
          {isImplemented ? (
            <span className={`level-badge level-${info.level.toLowerCase()} mini-badge`}>
              {t.level(info.level)}
            </span>
          ) : (
            <span className="mastery-unimplemented-badge" title={t('Catalogue entry not implemented in sudokUI')}>
              {t('Not implemented in engine')}
            </span>
          )}
        </div>

        {taxonomy?.aliases && taxonomy.aliases.length > 0 && (
          <p className="mastery-tech-aliases">
            {t('Also called: {aliases}', { aliases: taxonomy.aliases.join(', ') })}
          </p>
        )}

        {taxonomy?.explanation && (
          <p className="mastery-tech-explanation">{t(taxonomy.explanation)}</p>
        )}
      </div>

      <div className="mastery-tech-actions">
        {isImplemented ? (
          <div className="segmented mastery-status-selector" role="radiogroup" aria-label={t('Familiarity for {tech}', { tech: t.tech(tech) })}>
            <button
              className={familiarity === 'known' ? 'active known' : ''}
              role="radio"
              aria-checked={familiarity === 'known'}
              onClick={() => onSetFamiliarity('known')}
              title={t('I know and want to practice this pattern')}
            >
              ✓ {t('Known')}
            </button>
            <button
              className={familiarity === 'learning' ? 'active learning' : ''}
              role="radio"
              aria-checked={familiarity === 'learning'}
              onClick={() => onSetFamiliarity('learning')}
              title={t('I am studying this pattern')}
            >
              🎓 {t('Learning')}
            </button>
            <button
              className={familiarity === 'unfamiliar' ? 'active unfamiliar' : ''}
              role="radio"
              aria-checked={familiarity === 'unfamiliar'}
              onClick={() => onSetFamiliarity('unfamiliar')}
              title={t('I do not want this in my normal scan')}
            >
              ✕ {t('Unfamiliar')}
            </button>
          </div>
        ) : (
          <span className="mastery-na-label">{t('Unavailable')}</span>
        )}

        {onLearn && isImplemented && (
          <button
            className="ghost icon-btn mini"
            onClick={() => onLearn(tech)}
            title={t('Learn about {name}', { name: t.tech(tech) })}
            aria-label={t('Learn about {name}', { name: t.tech(tech) })}
          >
            ⓘ
          </button>
        )}
      </div>
    </div>
  );
}
