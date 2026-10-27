import { describe, it, expect } from 'vitest';
import React from 'react';
import { formatExplanationText } from '../src/ui/FormattedExplanation';

describe('formatExplanationText', () => {
  it('correctly styles coordinate cells r4c7 and r6c2 with row and column classes', () => {
    const nodes = formatExplanationText('Fin is at r7c6 and pivot is r6c2.');
    // Check that we got React elements for r7c6 and r6c2
    const coordNodes = nodes.filter((n) => React.isValidElement(n) && (n.props as any).className === 'coord-cell');
    expect(coordNodes.length).toBe(2);

    // Verify first coordinate r7c6
    const firstCoord = coordNodes[0] as React.ReactElement;
    const children = React.Children.toArray(firstCoord.props.children) as React.ReactElement[];
    expect(children[0].props.children).toBe('r');
    expect(children[1].props.children).toBe('7');
    expect(children[1].props.className).toContain('hl-row');
    expect(children[2].props.children).toBe('c');
    expect(children[3].props.children).toBe('6');
    expect(children[3].props.className).toContain('hl-col');
  });

  it('correctly distinguishes rows, digits, and columns in the Screenshot 1 sentence', () => {
    const text =
      'Finned X-Wing on 2: in rows 4, 7, 2 sits in columns 4, 7 (r4c4, r4c7, r7c4, r7c7) except for the fin r7c6. Either the fin is false and the fish holds, or the fin is true; a 2 that sees every fin and lies in the cover columns outside the base is false both ways.';
    const nodes = formatExplanationText(text);

    // Recursively collect all elements with hl-row, hl-col, hl-digit
    const rowDigits: string[] = [];
    const colDigits: string[] = [];
    const digitValues: string[] = [];

    function traverse(node: React.ReactNode) {
      if (!React.isValidElement(node)) return;
      const cls = (node.props as any).className || '';
      if (cls.includes('hl-row')) rowDigits.push(String((node.props as any).children));
      if (cls.includes('hl-col')) colDigits.push(String((node.props as any).children));
      if (cls.includes('hl-digit')) digitValues.push(String((node.props as any).children));
      if ((node.props as any).children) {
        React.Children.forEach((node.props as any).children, traverse);
      }
    }

    nodes.forEach(traverse);

    // Check that rows 4 and 7 were identified as row numbers, and 2 is NOT in row numbers
    expect(rowDigits).toContain('4');
    expect(rowDigits).toContain('7');
    expect(rowDigits).not.toContain('2');

    // Check that columns 4 and 7 were identified as col numbers
    expect(colDigits).toContain('4');
    expect(colDigits).toContain('7');

    // Check that 2 was identified as digit/candidate
    expect(digitValues).toContain('2');
  });

  it('correctly parses Screenshot 2 sentence "So 2 is removed from r8c4."', () => {
    const text = 'So 2 is removed from r8c4.';
    const nodes = formatExplanationText(text);

    const digitValues: string[] = [];
    const rowDigits: string[] = [];
    const colDigits: string[] = [];

    function traverse(node: React.ReactNode) {
      if (!React.isValidElement(node)) return;
      const cls = (node.props as any).className || '';
      if (cls.includes('hl-row')) rowDigits.push(String((node.props as any).children));
      if (cls.includes('hl-col')) colDigits.push(String((node.props as any).children));
      if (cls.includes('hl-digit')) digitValues.push(String((node.props as any).children));
      if ((node.props as any).children) {
        React.Children.forEach((node.props as any).children, traverse);
      }
    }

    nodes.forEach(traverse);

    // 2 is recognized as the eliminated candidate digit
    expect(digitValues).toContain('2');
    // r8c4 coordinate is recognized
    expect(rowDigits).toContain('8');
    expect(colDigits).toContain('4');
  });

  it('correctly parses Screenshot 2 sentence "Base rows: the 2s of the fish." and other walk frames', () => {
    const text = 'Base rows: the 2s of the fish.';
    const nodes = formatExplanationText(text);

    let foundDigit = false;
    function traverse(node: React.ReactNode) {
      if (!React.isValidElement(node)) return;
      const cls = (node.props as any).className || '';
      if (cls.includes('hl-digit') && (node.props as any).children === '2') {
        foundDigit = true;
      }
      if ((node.props as any).children) {
        React.Children.forEach((node.props as any).children, traverse);
      }
    }

    nodes.forEach(traverse);
    expect(foundDigit).toBe(true);

    const frame3 = "Cover columns: where the base's 2s must land.";
    const nodes3 = formatExplanationText(frame3);
    let foundDigit3 = false;
    function traverse3(node: React.ReactNode) {
      if (!React.isValidElement(node)) return;
      const cls = (node.props as any).className || '';
      if (cls.includes('hl-digit') && (node.props as any).children === '2') {
        foundDigit3 = true;
      }
      if ((node.props as any).children) {
        React.Children.forEach((node.props as any).children, traverse3);
      }
    }
    nodes3.forEach(traverse3);
    expect(foundDigit3).toBe(true);
  });

  it('correctly parses Spanish and Norwegian translations of fish patterns', () => {
    const esText =
      'Finned X-Wing en el 2: en las filas 4, 7, el 2 está en las columnas 4, 7 (r4c4, r4c7, r7c4, r7c7), salvo la aleta r7c6.';
    const esNodes = formatExplanationText(esText);

    const esRows: string[] = [];
    const esCols: string[] = [];
    const esDigits: string[] = [];
    function traverseEs(node: React.ReactNode) {
      if (!React.isValidElement(node)) return;
      const cls = (node.props as any).className || '';
      if (cls.includes('hl-row')) esRows.push(String((node.props as any).children));
      if (cls.includes('hl-col')) esCols.push(String((node.props as any).children));
      if (cls.includes('hl-digit')) esDigits.push(String((node.props as any).children));
      if ((node.props as any).children) {
        React.Children.forEach((node.props as any).children, traverseEs);
      }
    }
    esNodes.forEach(traverseEs);
    expect(esRows).toContain('4');
    expect(esRows).toContain('7');
    expect(esCols).toContain('4');
    expect(esCols).toContain('7');
    expect(esDigits).toContain('2');

    const nbText =
      'Finned X-Wing på 2: i radene 4, 7 står tallet 2 i kolonnene 4, 7 (r4c4, r4c7, r7c4, r7c7), bortsett fra finnen r7c6.';
    const nbNodes = formatExplanationText(nbText);

    const nbRows: string[] = [];
    const nbCols: string[] = [];
    const nbDigits: string[] = [];
    function traverseNb(node: React.ReactNode) {
      if (!React.isValidElement(node)) return;
      const cls = (node.props as any).className || '';
      if (cls.includes('hl-row')) nbRows.push(String((node.props as any).children));
      if (cls.includes('hl-col')) nbCols.push(String((node.props as any).children));
      if (cls.includes('hl-digit')) nbDigits.push(String((node.props as any).children));
      if ((node.props as any).children) {
        React.Children.forEach((node.props as any).children, traverseNb);
      }
    }
    nbNodes.forEach(traverseNb);
    expect(nbRows).toContain('4');
    expect(nbRows).toContain('7');
    expect(nbCols).toContain('4');
    expect(nbCols).toContain('7');
    expect(nbDigits).toContain('2');
  });

  it('leaves general numbers unstyled', () => {
    const text = 'Score is 2302 and elapsed time is 2:29.';
    const nodes = formatExplanationText(text);

    let hasSpecial = false;
    function traverse(node: React.ReactNode) {
      if (!React.isValidElement(node)) return;
      const cls = (node.props as any).className || '';
      if (cls.includes('hl-row') || cls.includes('hl-col') || cls.includes('hl-digit')) {
        hasSpecial = true;
      }
      if ((node.props as any).children) {
        React.Children.forEach((node.props as any).children, traverse);
      }
    }

    nodes.forEach(traverse);
    expect(hasSpecial).toBe(false);
  });
});
