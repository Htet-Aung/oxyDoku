import React, { useState } from 'react';
import type { Step } from '../engine/steps';
import { explainStep, StepExplanation } from '../content/stepExplainer';
import { useT } from '../content/i18n';
import {
  LightbulbIcon,
  InfoIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckIcon
} from './Icons';

interface StepExplanationViewProps {
  step: Step;
  /** Whether to show a toggle to collapse the full deductive proof */
  collapsible?: boolean;
  /** Initial expansion state if collapsible */
  defaultExpanded?: boolean;
  /** Compact style for tighter spaces like scanner card details */
  compact?: boolean;
}

export function StepExplanationView({
  step,
  collapsible = true,
  defaultExpanded = true,
  compact = false
}: StepExplanationViewProps) {
  const t = useT();
  const [expanded, setExpanded] = useState(defaultExpanded);

  const exp: StepExplanation = React.useMemo(() => explainStep(step), [step]);

  return (
    <div className={`step-explanation-container${compact ? ' compact' : ''}`}>
      {/* 1. Synopsis Overview */}
      <div className="explanation-synopsis-box">
        <div className="synopsis-header">
          <span className="synopsis-icon" aria-hidden="true">
            <LightbulbIcon size={16} />
          </span>
          <strong className="synopsis-title">{exp.techName}</strong>
        </div>
        <p className="synopsis-text">{exp.synopsis}</p>
      </div>

      {/* Toggle button if collapsible */}
      {collapsible && (
        <div className="explanation-toggle-bar">
          <button
            type="button"
            className="ghost explanation-toggle-btn"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            <span>{expanded ? t('Hide logical deduction') : t('Why does this work? (Step-by-step logic)')}</span>
            {expanded ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
          </button>
        </div>
      )}

      {/* Expanded Logic Details */}
      {(!collapsible || expanded) && (
        <div className="explanation-details-body">
          {/* 2. Core Principle Callout */}
          <div className="explanation-principle-card">
            <div className="principle-head">
              <InfoIcon size={14} />
              <strong>{t('Core Principle')}</strong>
            </div>
            <p className="principle-text">{exp.whyItWorks.corePrinciple}</p>
          </div>

          {/* 3. Case Analysis (when available, e.g. Wings, Turbots) */}
          {exp.whyItWorks.cases && exp.whyItWorks.cases.length > 0 && (
            <div className="explanation-section cases-section">
              <h4 className="explanation-section-title">{t('Case-by-Case Proof')}</h4>
              <div className="cases-grid">
                {exp.whyItWorks.cases.map((c, i) => (
                  <div key={i} className="case-card">
                    <div className="case-header">
                      <span className="case-badge">{t('Branch {n}', { n: i + 1 })}</span>
                      <strong className="case-title">{c.title}</strong>
                    </div>
                    <p className="case-premise">{c.premise}</p>
                    <ul className="case-chain">
                      {c.chain.map((link, j) => (
                        <li key={j}>{link}</li>
                      ))}
                    </ul>
                    <div className="case-conclusion">
                      <CheckIcon size={12} />
                      <span>{c.conclusion}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Deduction Steps */}
          {exp.whyItWorks.deductionSteps && exp.whyItWorks.deductionSteps.length > 0 && (
            <div className="explanation-section deductions-section">
              <h4 className="explanation-section-title">{t('How the Logic Works')}</h4>
              <ul className="deduction-steps-list">
                {exp.whyItWorks.deductionSteps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 5. Why Notes Are Eliminated / Placed */}
          {exp.whyElimination.details && exp.whyElimination.details.length > 0 && (
            <div className="explanation-section eliminations-section">
              <h4 className="explanation-section-title">
                {step.eliminations.length > 0
                  ? t('Why These Notes Can Be Eliminated')
                  : t('Why This Digit Is Placed')}
              </h4>
              <div className="elimination-reasons-list">
                {exp.whyElimination.details.map((d, i) => (
                  <div key={i} className={`elim-detail-row ${d.action}`}>
                    <span className={`elim-digit-pill ${d.action}`}>
                      {d.action === 'remove' ? `−${d.digit}` : `+${d.digit}`}
                    </span>
                    <strong className="elim-cell-name">{d.cellStr}:</strong>
                    <span className="elim-reason-text">{d.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 6. Pattern Components / Structure */}
          {exp.structure.components && exp.structure.components.length > 0 && (
            <div className="explanation-section structure-section">
              <h4 className="explanation-section-title">{t('Pattern Cells & Houses')}</h4>
              <div className="components-tags">
                {exp.structure.components.map((comp, i) => (
                  <div key={i} className={`component-tag role-${comp.role}`}>
                    <span className="comp-label">{comp.label}:</span>
                    <span className="comp-text">{comp.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
