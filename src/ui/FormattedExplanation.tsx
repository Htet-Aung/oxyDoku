import React from 'react';
import type { Step } from '../engine/steps';

export interface FormattedExplanationProps {
  text: string;
  step?: Step | null;
  className?: string;
}

/**
 * Extracts all unique digits involved in a Step (placements, eliminations,
 * primary/secondary/fin candidate marks, chain links).
 */
export function getStepDigits(step?: Step | null): Set<number> {
  const set = new Set<number>();
  if (!step) return set;
  for (const p of step.placements || []) set.add(p.digit);
  for (const e of step.eliminations || []) set.add(e.digit);
  for (const p of step.primary || []) set.add(p.digit);
  for (const s of step.secondary || []) set.add(s.digit);
  for (const f of step.fins || []) set.add(f.digit);
  if (step.links) {
    for (const l of step.links) {
      for (const cd of l.from || []) set.add(cd.digit);
      for (const cd of l.to || []) set.add(cd.digit);
    }
  }
  return set;
}

/**
 * Splits a list of numbers like "4, 7" or "1, 4, 7 and 8" into styled number spans
 * preserving separators as plain text.
 */
function renderNumberList(
  numListStr: string,
  type: 'row' | 'col' | 'box' | 'digit',
  keyPrefix: string
): React.ReactNode[] {
  const parts = numListStr.split(/([1-9])/);
  return parts.map((part, idx) => {
    if (/^[1-9]$/.test(part)) {
      return (
        <span key={`${keyPrefix}-num-${idx}`} className={`hl-num hl-${type}`}>
          {part}
        </span>
      );
    }
    return <React.Fragment key={`${keyPrefix}-sep-${idx}`}>{part}</React.Fragment>;
  });
}

interface TokenPattern {
  name:
    | 'coord'
    | 'cand_cluster'
    | 'chain_link'
    | 'row_phrase'
    | 'col_phrase'
    | 'box_phrase'
    | 'neutral'
    | 'coord_part'
    | 'digit';
  regex: RegExp;
}

const TOKEN_PATTERNS: TokenPattern[] = [
  // 1. Cell coordinates: r4c7, r6c2, r7c6
  { name: 'coord', regex: /\br([1-9])c([1-9])\b/i },

  // 2. Candidate clusters inside parentheses: (12345), (79)
  { name: 'cand_cluster', regex: /\(([1-9]{2,9})\)/ },

  // 3. Chain link notations: –2– or -2-
  { name: 'chain_link', regex: /[–-]([1-9])[–-]/ },

  // 4. Row phrases: "in rows 4, 7", "rows 4, 7", "filas 4, 7", "radene 4, 7"
  // Negative lookahead prevents eating the following candidate digit when phrased "in rows 4, 7, 2 sits in..."
  {
    name: 'row_phrase',
    regex:
      /\b(?:in\s+|en\s+las?\s+|i\s+)?(?:rows?|filas?|rad(?:ene)?)\s+[1-9](?:(?:\s*,\s*|\s+(?:and|y|og|or|o|eller|\/)\s*)[1-9](?!\s+(?:sits|stands|is|can|must|falls|leaves|eliminates|está|står)\b))*/i
  },

  // 5. Column phrases: "in columns 4, 7", "column 4", "columnas 4, 7", "kolonnene 4, 7"
  {
    name: 'col_phrase',
    regex:
      /\b(?:in\s+|en\s+las?\s+|i\s+)?(?:columns?|columnas?|kolonne(?:ne)?)\s+[1-9](?:(?:\s*,\s*|\s+(?:and|y|og|or|o|eller|\/)\s*)[1-9])*/i
  },

  // 6. Box phrases: "in boxes 1, 2", "box 3", "cajas 1, 2", "boks 3"
  {
    name: 'box_phrase',
    regex:
      /\b(?:in\s+|en\s+las?\s+|i\s+)?(?:boxes|box|cajas?|boks(?:ene)?)\s+[1-9](?:(?:\s*,\s*|\s+(?:and|y|og|or|o|eller|\/)\s*)[1-9])*/i
  },

  // 7. Neutral non-digit numbers: "Type 2", "Branch 1", "2 cells", "1 of 4", "2-String"
  {
    name: 'neutral',
    regex:
      /\b(?:type|tipo|branch|rama|gren)\s+[1-9](?![0-9:])|\b[1-9]\s+(?:cells?|celdas?|ruter?)\b|\b\d+\s+of\s+\d+\b|\b\d+-(?:string|level|step|way|link)\b/i
  },

  // 8. Standalone coordinate components: r4, c7, b3
  { name: 'coord_part', regex: /\b([rcb])([1-9])(?![0-9:|A-Za-z])/i },

  // 9. Sudoku candidate / digit numbers: e.g. "on 2:", "2 sits in", "So 2 is removed", "the 2s of"
  // Negative lookahead (?![0-9]|:[0-9]) avoids times like 2:29 and large numbers like 2302
  { name: 'digit', regex: /\b([1-9])(s?)(?![0-9]|:[0-9])\b/i }
];

/**
 * Parses sudoku explanation text and returns React nodes where:
 * - Cell coordinates (r4c7) have row digit styled with --hl-coord-r and col digit with --hl-coord-c.
 * - Row numbers ("in rows 4, 7", "row 4") are styled with --hl-coord-r.
 * - Column numbers ("in columns 4, 7", "column 4") are styled with --hl-coord-c.
 * - Box numbers ("in boxes 1, 2", "box 3") are styled with --hl-coord-b.
 * - Sudoku digits / candidates ("on 2:", "2 sits in", "candidate 2", "the 2s of", "is 2") are styled with --hl-digit.
 *
 * All styles use CSS variables mapped per active theme (Dark, Light, Rose, Forest, Cyberpunk,
 * Chess, Aquarium, Midnight, Terminal).
 */
export function formatExplanationText(text: string, _step?: Step | null): React.ReactNode[] {
  if (!text) return [];

  const nodes: React.ReactNode[] = [];
  let pos = 0;

  while (pos < text.length) {
    let earliestMatch: RegExpExecArray | null = null;
    let earliestPattern: TokenPattern | null = null;

    for (const pat of TOKEN_PATTERNS) {
      pat.regex.lastIndex = 0;
      const m = pat.regex.exec(text.slice(pos));
      if (m) {
        const matchStart = pos + m.index;
        if (!earliestMatch || matchStart < (earliestMatch as any).index) {
          earliestMatch = Object.assign(m, { index: matchStart });
          earliestPattern = pat;
        }
      }
    }

    if (!earliestMatch || !earliestPattern) {
      nodes.push(text.slice(pos));
      break;
    }

    if (earliestMatch.index > pos) {
      nodes.push(text.slice(pos, earliestMatch.index));
    }

    const key = `token-${earliestMatch.index}`;
    const matchedText = earliestMatch[0];

    switch (earliestPattern.name) {
      case 'coord': {
        const coordM = /\br([1-9])c([1-9])\b/i.exec(matchedText);
        if (coordM) {
          nodes.push(
            <span key={key} className="coord-cell">
              <span className="coord-prefix">r</span>
              <span className="hl-num hl-row">{coordM[1]}</span>
              <span className="coord-prefix">c</span>
              <span className="hl-num hl-col">{coordM[2]}</span>
            </span>
          );
        } else {
          nodes.push(matchedText);
        }
        break;
      }

      case 'cand_cluster': {
        const clusterDigits = matchedText.slice(1, -1);
        nodes.push(
          <React.Fragment key={key}>
            (
            <span className="hl-digit-set">
              {clusterDigits.split('').map((d, i) => (
                <span key={`${key}-cd-${i}`} className="hl-num hl-digit">
                  {d}
                </span>
              ))}
            </span>
            )
          </React.Fragment>
        );
        break;
      }

      case 'chain_link': {
        const d = matchedText.charAt(1);
        nodes.push(
          <React.Fragment key={key}>
            –<span className="hl-num hl-digit">{d}</span>–
          </React.Fragment>
        );
        break;
      }

      case 'row_phrase': {
        const numPart = matchedText.replace(/^[^\d]+/, '');
        const prefix = matchedText.slice(0, matchedText.indexOf(numPart));
        nodes.push(
          <React.Fragment key={key}>
            {prefix}
            {renderNumberList(numPart, 'row', key)}
          </React.Fragment>
        );
        break;
      }

      case 'col_phrase': {
        const numPart = matchedText.replace(/^[^\d]+/, '');
        const prefix = matchedText.slice(0, matchedText.indexOf(numPart));
        nodes.push(
          <React.Fragment key={key}>
            {prefix}
            {renderNumberList(numPart, 'col', key)}
          </React.Fragment>
        );
        break;
      }

      case 'box_phrase': {
        const numPart = matchedText.replace(/^[^\d]+/, '');
        const prefix = matchedText.slice(0, matchedText.indexOf(numPart));
        nodes.push(
          <React.Fragment key={key}>
            {prefix}
            {renderNumberList(numPart, 'box', key)}
          </React.Fragment>
        );
        break;
      }

      case 'neutral': {
        nodes.push(matchedText);
        break;
      }

      case 'coord_part': {
        const letter = matchedText.charAt(0).toLowerCase();
        const num = matchedText.charAt(1);
        const type = letter === 'r' ? 'row' : letter === 'c' ? 'col' : 'box';
        nodes.push(
          <span key={key} className="coord-cell">
            <span className="coord-prefix">{letter}</span>
            <span className={`hl-num hl-${type}`}>{num}</span>
          </span>
        );
        break;
      }

      case 'digit': {
        const d = matchedText.charAt(0);
        const plural = matchedText.slice(1);
        nodes.push(
          <React.Fragment key={key}>
            <span className="hl-num hl-digit">{d}</span>
            {plural}
          </React.Fragment>
        );
        break;
      }
    }

    pos = earliestMatch.index + matchedText.length;
  }

  return nodes;
}

export function FormattedExplanation({ text, step, className }: FormattedExplanationProps) {
  const nodes = React.useMemo(() => formatExplanationText(text, step), [text, step]);
  return <span className={className}>{nodes}</span>;
}
