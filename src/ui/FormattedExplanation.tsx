import React from 'react';

export interface FormattedExplanationProps {
  text: string;
  className?: string;
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
export function formatExplanationText(text: string): React.ReactNode[] {
  if (!text) return [];

  // Master RegExp capturing structured Sudoku tokens:
  // 1. Cell coordinate: r[1-9]c[1-9]
  // 2. Candidate cluster: (12345)
  // 3. Chain link: –[1-9]–
  // 4. Rows phrase: (rows|filas|radene) 4, 7
  // 5. Columns phrase: (columns|columnas|kolonnene) 4, 7
  // 6. Boxes phrase: (boxes|box|cajas|boksene) 1, 2
  // 7. Tech on digit: on 2: / på 2: / en el 2:
  // 8. Digit sits: 2 sits in / står tallet 2 i / el 2 está en
  // 9. The digit of/that: the 2s of / a 2 that sees / the 2 that
  // 10. Explicit digit/candidate: digits 4, 7 / candidates 2, 5 / cifra 2 / tallet 2
  // 11. Action digit: places 2 / eliminates 2 / removes candidate 2
  // 12. Verb digit: is 2 / be 2 / assume ... is 2
  // 13. Standalone coordinate part: r4 or c7 or b3
  const tokenRegex =
    /(\br([1-9])c([1-9])\b)|(\(([1-9]{2,9})\))|([–-]([1-9])[–-])|(\b(?:in\s+|en\s+las?\s+|i\s+)?(rows?|filas?|rad(?:ene)?)\s+([1-9](?:(?:\s*,\s*|\s+(?:and|y|og|or|o|eller|\/)\s*)[1-9])*))|(\b(?:in\s+|en\s+las?\s+|i\s+)?(columns?|columnas?|kolonne(?:ne)?)\s+([1-9](?:(?:\s*,\s*|\s+(?:and|y|og|or|o|eller|\/)\s*)[1-9])*))|(\b(?:in\s+|en\s+las?\s+|i\s+)?(boxes|box|cajas?|boks(?:ene)?)\s+([1-9](?:(?:\s*,\s*|\s+(?:and|y|og|or|o|eller|\/)\s*)[1-9])*))|(\b(on|på|en\s+el)\s+([1-9])\s*([:;,]))|(\b([1-9])\s+(sits\s+in|stands\s+in|står\s+i|está\s+en)\b)|(\b(the|a|an|en|el|un|una)\s+([1-9])(s?)\s+(of|that|que|som|sees|ve|ser)\b)|(\b(digits?|cifras?|tallet|tall|candidates?|candidatos?|kandidater?)\s+([1-9](?:(?:\s*,\s*|\s+(?:and|y|og|or|o|eller|\/)\s*)[1-9])*))|(\b(places?|placing|setting|eliminates?|eliminating|removes?|removed|forces?|locks?|coloca|elimina|fjerner|plasserer)\s+((?:the\s+)?(?:candidate\s+|digit\s+)?)([1-9])(?![0-9:])\b)|(\b(is|be|takes?|sea|er)\s+([1-9])(?![0-9:])\b)|(\b([rcb])([1-9])(?![0-9:])\b)/gi;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    const matchIndex = match.index;

    // Push leading plain text
    if (matchIndex > lastIndex) {
      nodes.push(text.slice(lastIndex, matchIndex));
    }

    const key = `token-${matchIndex}`;

    // 1. Cell coordinate: r[1-9]c[1-9]
    if (match[1]) {
      const rowDigit = match[2];
      const colDigit = match[3];
      nodes.push(
        <span key={key} className="coord-cell">
          <span className="coord-prefix">r</span>
          <span className="hl-num hl-row">{rowDigit}</span>
          <span className="coord-prefix">c</span>
          <span className="hl-num hl-col">{colDigit}</span>
        </span>
      );
    }
    // 2. Candidate cluster: (12345)
    else if (match[4]) {
      const candDigits = match[5];
      nodes.push(
        <React.Fragment key={key}>
          (
          <span className="hl-digit-set">
            {candDigits.split('').map((d, i) => (
              <span key={`${key}-cd-${i}`} className="hl-num hl-digit">
                {d}
              </span>
            ))}
          </span>
          )
        </React.Fragment>
      );
    }
    // 3. Chain link: –[1-9]–
    else if (match[6]) {
      const linkDigit = match[7];
      nodes.push(
        <React.Fragment key={key}>
          –<span className="hl-num hl-digit">{linkDigit}</span>–
        </React.Fragment>
      );
    }
    // 4. Rows phrase: rows 4, 7
    else if (match[8]) {
      const fullPhrase = match[8];
      const rowNumbers = match[10];
      const prefix = fullPhrase.slice(0, fullPhrase.lastIndexOf(rowNumbers));
      nodes.push(
        <React.Fragment key={key}>
          {prefix}
          {renderNumberList(rowNumbers, 'row', key)}
        </React.Fragment>
      );
    }
    // 5. Columns phrase: columns 4, 7
    else if (match[11]) {
      const fullPhrase = match[11];
      const colNumbers = match[13];
      const prefix = fullPhrase.slice(0, fullPhrase.lastIndexOf(colNumbers));
      nodes.push(
        <React.Fragment key={key}>
          {prefix}
          {renderNumberList(colNumbers, 'col', key)}
        </React.Fragment>
      );
    }
    // 6. Boxes phrase: boxes 1, 2
    else if (match[14]) {
      const fullPhrase = match[14];
      const boxNumbers = match[16];
      const prefix = fullPhrase.slice(0, fullPhrase.lastIndexOf(boxNumbers));
      nodes.push(
        <React.Fragment key={key}>
          {prefix}
          {renderNumberList(boxNumbers, 'box', key)}
        </React.Fragment>
      );
    }
    // 7. Tech on digit: on 2:
    else if (match[17]) {
      const prefixWord = match[18];
      const digit = match[19];
      const punct = match[20];
      nodes.push(
        <React.Fragment key={key}>
          {prefixWord}{' '}
          <span className="hl-num hl-digit">{digit}</span>
          {punct}
        </React.Fragment>
      );
    }
    // 8. Digit sits: 2 sits in
    else if (match[21]) {
      const digit = match[22];
      const verb = match[23];
      nodes.push(
        <React.Fragment key={key}>
          <span className="hl-num hl-digit">{digit}</span> {verb}
        </React.Fragment>
      );
    }
    // 9. The digit of/that: the 2s of
    else if (match[24]) {
      const article = match[25];
      const digit = match[26];
      const plural = match[27] || '';
      const trail = match[28];
      nodes.push(
        <React.Fragment key={key}>
          {article}{' '}
          <span className="hl-num hl-digit">{digit}</span>
          {plural} {trail}
        </React.Fragment>
      );
    }
    // 10. Explicit digit/candidate: digits 4, 7
    else if (match[29]) {
      const fullPhrase = match[29];
      const numbers = match[31];
      const prefix = fullPhrase.slice(0, fullPhrase.lastIndexOf(numbers));
      nodes.push(
        <React.Fragment key={key}>
          {prefix}
          {renderNumberList(numbers, 'digit', key)}
        </React.Fragment>
      );
    }
    // 11. Action digit: places 2
    else if (match[32]) {
      const action = match[33];
      const extra = match[34] || '';
      const digit = match[35];
      nodes.push(
        <React.Fragment key={key}>
          {action} {extra}
          <span className="hl-num hl-digit">{digit}</span>
        </React.Fragment>
      );
    }
    // 12. Verb digit: is 2
    else if (match[36]) {
      const verb = match[37];
      const digit = match[38];
      nodes.push(
        <React.Fragment key={key}>
          {verb} <span className="hl-num hl-digit">{digit}</span>
        </React.Fragment>
      );
    }
    // 13. Standalone coordinate part: r4, c7, b3
    else if (match[39]) {
      const letter = match[40].toLowerCase();
      const num = match[41];
      const type = letter === 'r' ? 'row' : letter === 'c' ? 'col' : 'box';
      nodes.push(
        <span key={key} className="coord-cell">
          <span className="coord-prefix">{letter}</span>
          <span className={`hl-num hl-${type}`}>{num}</span>
        </span>
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  // Trailing text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function FormattedExplanation({ text, className }: FormattedExplanationProps) {
  const nodes = React.useMemo(() => formatExplanationText(text), [text]);
  return <span className={className}>{nodes}</span>;
}
