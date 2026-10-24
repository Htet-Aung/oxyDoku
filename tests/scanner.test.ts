import { describe, it, expect } from 'vitest';
import {
  emptyGrid,
  cloneGrid,
  bit,
  parseGrid
} from '../src/engine/board';
import { solve } from '../src/engine/bruteForce';
import {
  findNextStep,
  findAllSteps,
  applyStep,
  ratePuzzle,
  findAllPatternInstances,
  scanPosition,
  findPatternInstancesForTech,
  IMPLEMENTED_TECHS,
  DISABLED_IMPLEMENTED_TECHS,
  UNIMPLEMENTED_TECHS,
  TECH_SCANNER_META
} from '../src/engine/humanSolver';
import { TECHS, SOLVE_ORDER, Tech } from '../src/engine/ratings';
import { engineGrid, contractGrid, CellState } from '../src/state/gameStore';
import { hasSolution, hasSolutionWithout } from './solutionOracle';

describe('Phase 1 — Pattern Scanner Engine API (src/engine/scanner.ts)', () => {
  describe('1. Catalogue & coverage metadata', () => {
    it('accurately classifies all 80 TECHS into 76 implemented human techniques (72 enabled + 4 disabled), 3 unimplemented, and 1 solver fallback', () => {
      const allKeys = Object.keys(TECHS) as Tech[];
      expect(allKeys.length).toBe(80);
      expect(SOLVE_ORDER.length).toBe(73); // 72 human techniques + BRUTE_FORCE
      expect(IMPLEMENTED_TECHS.length).toBe(76);
      expect(DISABLED_IMPLEMENTED_TECHS).toEqual([
        'SQUIRMBAG',
        'WHALE',
        'LEVIATHAN',
        'DOUBLE_EXOCET'
      ]);
      expect(UNIMPLEMENTED_TECHS).toEqual([
        'TWINNED_XY_CHAIN',
        'SK_LOOP',
        'FORCING_CHAIN'
      ]);

      expect(TECH_SCANNER_META.BRUTE_FORCE.implemented).toBe(false);
      expect(TECH_SCANNER_META.BRUTE_FORCE.coverage).toBe('unimplemented');

      for (const tech of UNIMPLEMENTED_TECHS) {
        expect(TECH_SCANNER_META[tech].implemented).toBe(false);
        expect(TECH_SCANNER_META[tech].coverage).toBe('unimplemented');
      }

      let exhaustiveCount = 0;
      let boundedCount = 0;
      for (const tech of IMPLEMENTED_TECHS) {
        const meta = TECH_SCANNER_META[tech];
        expect(meta.implemented).toBe(true);
        if (meta.coverage === 'exhaustive') exhaustiveCount++;
        else if (meta.coverage === 'bounded') boundedCount++;
      }
      expect(exhaustiveCount).toBe(55);
      expect(boundedCount).toBe(21);
    });

    it('reports unimplemented techniques explicitly without throwing or fabricating steps', () => {
      const g = emptyGrid();
      const res = findAllPatternInstances(g, {
        techniques: ['X_WING', 'TWINNED_XY_CHAIN', 'SK_LOOP', 'FORCING_CHAIN', 'BRUTE_FORCE']
      });
      expect(res.scannedTechniques).toEqual(['X_WING']);
      expect(res.unimplementedTechniques).toEqual([
        'TWINNED_XY_CHAIN',
        'SK_LOOP',
        'FORCING_CHAIN',
        'BRUTE_FORCE'
      ]);
      for (const unimp of res.unimplementedTechniques) {
        expect(res.byTech[unimp]?.implemented).toBe(false);
        expect(res.byTech[unimp]?.coverage).toBe('unimplemented');
        expect(res.byTech[unimp]?.instances).toEqual([]);
      }
    });
  });

  describe('2. Multiple instances of the same technique in one position', () => {
    it('finds 3 simultaneous X-Wings (2 row-based and 1 column-based) in a single unchanged position', () => {
      const g = emptyGrid();
      // 1) Row-based X-Wing on digit 2: base rows 0 and 3, cover cols 1 and 6
      for (let c = 0; c < 9; c++) {
        if (c !== 1 && c !== 6) {
          g.cands[0 * 9 + c] &= ~bit(2);
          g.cands[3 * 9 + c] &= ~bit(2);
        }
      }
      // 2) Row-based X-Wing on digit 5: base rows 1 and 5, cover cols 2 and 7
      for (let c = 0; c < 9; c++) {
        if (c !== 2 && c !== 7) {
          g.cands[1 * 9 + c] &= ~bit(5);
          g.cands[5 * 9 + c] &= ~bit(5);
        }
      }
      // 3) Column-based X-Wing on digit 8: base cols 0 and 4, cover rows 2 and 8
      for (let r = 0; r < 9; r++) {
        if (r !== 2 && r !== 8) {
          g.cands[r * 9 + 0] &= ~bit(8);
          g.cands[r * 9 + 4] &= ~bit(8);
        }
      }

      const res = findAllPatternInstances(g, { techniques: ['X_WING'] });
      expect(res.instances.length).toBe(3);
      expect(res.byTech.X_WING?.instances.length).toBe(3);

      const byDigit = new Map(res.instances.map((inst) => [inst.digits[0], inst]));
      expect([...byDigit.keys()].sort()).toEqual([2, 5, 8]);

      // Check row-based X-Wing on 2
      const xw2 = byDigit.get(2)!;
      expect(xw2.patternCells).toEqual([1, 6, 28, 33]);
      expect(xw2.step.units).toEqual([
        { unit: 0, role: 'primary' },
        { unit: 3, role: 'primary' },
        { unit: 9 + 1, role: 'secondary' },
        { unit: 9 + 6, role: 'secondary' }
      ]);

      // Check column-based X-Wing on 8
      const xw8 = byDigit.get(8)!;
      expect(xw8.patternCells).toEqual([18, 22, 72, 76]);
      expect(xw8.step.units).toEqual([
        { unit: 9 + 0, role: 'primary' },
        { unit: 9 + 4, role: 'primary' },
        { unit: 2, role: 'secondary' },
        { unit: 8, role: 'secondary' }
      ]);
    });

    it('finds multiple XY-Wings, including two distinct XY-Wings that produce the exact same elimination', () => {
      const g = emptyGrid();
      // Target cell r2c4 (cell 12) has candidate 3.
      // XY-Wing #1: Pivot r1c1 (0) = {1,2}, Pincer1 r1c4 (3) = {1,3} (sees 0 via row 0),
      // Pincer2 r2c1 (9) = {2,3} (sees 0 via col 0 & box 0).
      // Both pincers (3 and 9) see r2c4 (12): cell 3 via col 3 & box 1, cell 9 via row 1!
      g.cands[0] = bit(1) | bit(2);
      g.cands[3] = bit(1) | bit(3);
      g.cands[9] = bit(2) | bit(3);

      // XY-Wing #2: Pivot r5c8 (43) = {4,5}, Pincer1 r2c8 (16) = {3,4} (sees 43 via col 7),
      // Pincer2 r5c4 (39) = {3,5} (sees 43 via row 4).
      // Both pincers (16 and 39) also see r2c4 (12): cell 16 via row 1, cell 39 via col 3!
      g.cands[43] = bit(4) | bit(5);
      g.cands[16] = bit(3) | bit(4);
      g.cands[39] = bit(3) | bit(5);

      // Keep only cell 12 with candidate 3 among common peers so both XY-Wings have the exact same elimination E:12:3
      for (let c = 0; c < 81; c++) {
        if (![0, 3, 9, 12, 16, 39, 43].includes(c)) {
          g.cands[c] &= ~bit(3);
        }
      }
      g.cands[12] = bit(3) | bit(8) | bit(9);

      const res = findAllPatternInstances(g, { techniques: ['XY_WING'] });
      expect(res.instances.length).toBe(2);
      expect(res.instances[0].conclusionKey).toBe('E:12:3');
      expect(res.instances[1].conclusionKey).toBe('E:12:3');
      expect(res.instances[0].id).not.toBe(res.instances[1].id);
      expect(res.byConclusion['E:12:3']?.length).toBe(2);
    });

    it('finds multiple Skyscrapers in one position without reverse-traversal duplication', () => {
      const g = emptyGrid();
      // Skyscraper #1 on digit 4 (row-based):
      // Row 0 has 4 only in c0 (0) and c3 (3, r1c4 in Box 1)
      // Row 3 has 4 only in c0 (27) and c4 (31, r4c5 in Box 4)
      // Bridge: 0 and 27 in Col 0. Free ends: 3 (Box 1, Col 3) and 31 (Box 4, Col 4) do not see each other,
      // and eliminate 4 from r2c5 (13), r3c5 (22), r5c4 (39), r6c4 (48)!
      for (let c = 0; c < 9; c++) {
        if (c !== 0 && c !== 3) g.cands[0 * 9 + c] &= ~bit(4);
        if (c !== 0 && c !== 4) g.cands[3 * 9 + c] &= ~bit(4);
      }

      // Skyscraper #2 on digit 7 (column-based):
      // Col 1 has 7 only in r0 (1) and r3 (28, r4c2 in Box 3)
      // Col 4 has 7 only in r0 (4) and r4 (40, r5c5 in Box 4)
      // Bridge: 1 and 4 in Row 0. Free ends: 28 (Box 3, Row 3) and 40 (Box 4, Row 4) do not see each other,
      // and eliminate 7 from r5c2 (37) and r4c5 (31)!
      for (let r = 0; r < 9; r++) {
        if (r !== 0 && r !== 3) g.cands[r * 9 + 1] &= ~bit(7);
        if (r !== 0 && r !== 4) g.cands[r * 9 + 4] &= ~bit(7);
      }

      const res = findAllPatternInstances(g, { techniques: ['SKYSCRAPER'] });
      expect(res.instances.length).toBe(2);
      expect(res.instances.map((i) => i.digits[0]).sort()).toEqual([4, 7]);
    });

    it('finds multiple Unique Rectangles simultaneously and skips uniqueness techniques when useUniqueness is false', () => {
      const g = emptyGrid();
      // UR Type 1 #1 on {1, 2} at r1c1 (0), r1c2 (1), r4c1 (27), r4c2 (28, roof with {1,2,3})
      g.cands[0] = bit(1) | bit(2);
      g.cands[1] = bit(1) | bit(2);
      g.cands[27] = bit(1) | bit(2);
      g.cands[28] = bit(1) | bit(2) | bit(3);

      // UR Type 1 #2 on {8, 9} at r1c7 (6), r1c8 (7), r4c7 (33), r4c8 (34, roof with {7,8,9})
      g.cands[6] = bit(8) | bit(9);
      g.cands[7] = bit(8) | bit(9);
      g.cands[33] = bit(8) | bit(9);
      g.cands[34] = bit(7) | bit(8) | bit(9);

      const withUniq = findAllPatternInstances(g, {
        techniques: ['UNIQUENESS_1'],
        useUniqueness: true
      });
      expect(withUniq.instances.length).toBe(2);

      const withoutUniq = findAllPatternInstances(g, {
        techniques: ['UNIQUENESS_1'],
        useUniqueness: false
      });
      expect(withoutUniq.instances.length).toBe(0);
      expect(withoutUniq.scannedTechniques).toEqual([]);
    });
  });

  describe('3. Multiple different techniques & overlapping eliminations', () => {
    it('preserves overlapping techniques that explain the same elimination and indexes them in byConclusion', () => {
      const g = emptyGrid();
      // Create a position on digit 6 where:
      // - In Box 0, digit 6 is confined to r1c1 (0) and r1c2 (1) -> Locked Candidates Type 1 (Pointing)
      //   eliminates 6 from the rest of Row 0, including r1c5 (4).
      // - In Row 0, cells r1c1 (0) and r1c2 (1) both hold ONLY {6, 9} -> Locked Pair / Naked Pair
      //   ALSO eliminates 6 (and 9) from r1c5 (4) and the rest of Row 0 & Box 0!
      for (const c of [2, 9, 10, 11, 18, 19, 20]) {
        g.cands[c] &= ~bit(6);
      }
      g.cands[0] = bit(6) | bit(9);
      g.cands[1] = bit(6) | bit(9);

      // Also add an X-Wing on digit 3 in rows 3 and 6 (cols 2 and 5)
      for (let c = 0; c < 9; c++) {
        if (c !== 2 && c !== 5) {
          g.cands[3 * 9 + c] &= ~bit(3);
          g.cands[6 * 9 + c] &= ~bit(3);
        }
      }

      const res = scanPosition(g, {
        techniques: ['LOCKED_CANDIDATES_1', 'LOCKED_PAIR', 'X_WING']
      });

      expect(res.byTech.LOCKED_CANDIDATES_1?.instances.length).toBeGreaterThanOrEqual(1);
      expect(res.byTech.LOCKED_PAIR?.instances.length).toBe(1);
      expect(res.byTech.X_WING?.instances.length).toBe(1);

      // Both LOCKED_CANDIDATES_1 (on 6 in Box 0 -> Row 0) and LOCKED_PAIR (on {6,9} at r1c1,r1c2)
      // eliminate digit 6 from r1c5 (cell 4) -> key 'E:4:6'!
      const overlappingForCell4Digit6 = res.byConclusion['E:4:6'] ?? [];
      const overlappingTechs = new Set(overlappingForCell4Digit6.map((inst) => inst.tech));
      expect(overlappingTechs.has('LOCKED_CANDIDATES_1')).toBe(true);
      expect(overlappingTechs.has('LOCKED_PAIR')).toBe(true);
    });
  });

  describe('4. Finned vs Sashimi classification & Irreducibility (degenerate fish/subsets)', () => {
    it('cleanly separates FINNED_X_WING from SASHIMI_X_WING and preserves fin metadata', () => {
      const g = emptyGrid();
      // Row-based Finned X-Wing on digit 1:
      // Row 0 has 1 at c0 (0), c3 (3), and fin c1 (1) in box 0
      // Row 2 has 1 at c0 (18) and c3 (21)
      // Cover cols 0 and 3 -> eliminates 1 from r2c1 (9) in box 0
      for (let c = 0; c < 9; c++) {
        if (![0, 1, 3].includes(c)) g.cands[0 * 9 + c] &= ~bit(1);
        if (![0, 3].includes(c)) g.cands[2 * 9 + c] &= ~bit(1);
      }

      // Column-based Sashimi X-Wing on digit 2:
      // Col 8 has 2 at r1 (17) and r4 (44)
      // Col 6 has 2 at r4 (42) and fin r0 (6) in box 2
      // Cover rows 1 and 4 -> eliminates 2 from r2c8 (16) in box 2
      for (let r = 0; r < 9; r++) {
        if (![1, 4].includes(r)) g.cands[r * 9 + 8] &= ~bit(2);
        if (![0, 4].includes(r)) g.cands[r * 9 + 6] &= ~bit(2);
      }

      const res = findAllPatternInstances(g, {
        techniques: ['FINNED_X_WING', 'SASHIMI_X_WING']
      });
      expect(res.byTech.FINNED_X_WING?.instances.length).toBeGreaterThanOrEqual(1);
      expect(res.byTech.SASHIMI_X_WING?.instances.length).toBeGreaterThanOrEqual(1);

      const finned1 = res.byTech.FINNED_X_WING!.instances.find((i) => i.digits.includes(1))!;
      expect(finned1).toBeDefined();
      expect(finned1.step.fins).toEqual([{ cell: 1, digit: 1 }]);
      expect(finned1.step.eliminations).toContainEqual({ cell: 9, digit: 1 });

      const sashimi2 = res.byTech.SASHIMI_X_WING!.instances.find(
        (i) => i.digits.includes(2) && i.step.fins?.[0]?.cell === 6
      )!;
      expect(sashimi2).toBeDefined();
      expect(sashimi2.step.fins).toEqual([{ cell: 6, digit: 2 }]);
      expect(sashimi2.step.eliminations).toContainEqual({ cell: 16, digit: 2 });
    });

    it('filters out reducible Swordfish (an X-Wing combined with a 3rd row) when irreducibleOnly is true', () => {
      const g = emptyGrid();
      // Digit 4 has an X-Wing in rows 0 and 1 on columns 0 and 1,
      // and row 2 has candidates on columns 0, 1, and 2.
      for (let c = 0; c < 9; c++) {
        if (![0, 1].includes(c)) {
          g.cands[0 * 9 + c] &= ~bit(4);
          g.cands[1 * 9 + c] &= ~bit(4);
        }
        if (![0, 1, 2].includes(c)) {
          g.cands[2 * 9 + c] &= ~bit(4);
        }
      }

      const resIrreducible = findAllPatternInstances(g, {
        techniques: ['X_WING', 'SWORDFISH'],
        irreducibleOnly: true
      });
      expect(resIrreducible.byTech.X_WING?.instances.length).toBe(1);
      expect(resIrreducible.byTech.SWORDFISH?.instances.length).toBe(0);

      const resReducible = findAllPatternInstances(g, {
        techniques: ['SWORDFISH'],
        irreducibleOnly: false
      });
      expect(resReducible.byTech.SWORDFISH?.instances.length).toBeGreaterThan(0);
    });
  });

  describe('5. Disabled-by-default implemented techniques and instance caps', () => {
    it('scans SQUIRMBAG, WHALE, LEVIATHAN when includeDisabled is true or explicitly requested', () => {
      const g = emptyGrid();
      // Size-5 Squirmbag on digit 5 (rows 0..4 confined to cols 0..4)
      for (let r = 0; r < 5; r++) {
        for (let c = 5; c < 9; c++) {
          g.cands[r * 9 + c] &= ~bit(5);
        }
      }

      const defaultScan = findAllPatternInstances(g);
      expect(defaultScan.scannedTechniques).not.toContain('SQUIRMBAG');
      expect(defaultScan.byTech.SQUIRMBAG).toBeUndefined();

      const withDisabled = findAllPatternInstances(g, {
        techniques: ['SQUIRMBAG', 'JELLYFISH']
      });
      expect(withDisabled.byTech.SQUIRMBAG?.instances.length).toBeGreaterThanOrEqual(1);
      // And the complementary 4x4 Jellyfish in cols 5..8 / rows 5..8 also exists!
      expect(withDisabled.byTech.JELLYFISH?.instances.length).toBeGreaterThanOrEqual(1);
    });

    it('honours maxInstancesPerTech and sets truncated = true with truncationReason = instance-cap', () => {
      const g = emptyGrid();
      // Create 3 Naked Singles
      g.cands[0] = bit(1);
      g.cands[10] = bit(2);
      g.cands[20] = bit(3);

      const summary = findPatternInstancesForTech('NAKED_SINGLE', g, {
        maxInstancesPerTech: 2
      });
      expect(summary.instances.length).toBe(2);
      expect(summary.truncated).toBe(true);
      expect(summary.truncationReason).toBe('instance-cap');
    });
  });

  describe('6. Deduplication of symmetric traversal paths', () => {
    it('does not duplicate a Naked Pair or Locked Pair shared by a row and a box', () => {
      const g = emptyGrid();
      // r1c1 (0) and r1c2 (1) share both Row 0 and Box 0
      g.cands[0] = bit(1) | bit(2);
      g.cands[1] = bit(1) | bit(2);
      // Eliminate 1 and 2 from rest of Box 0 so it's a pure Naked Pair (only eliminates in Row 0)
      for (const c of [2, 9, 10, 11, 18, 19, 20]) {
        g.cands[c] &= ~(bit(1) | bit(2));
      }

      const nakedRes = findAllPatternInstances(g, { techniques: ['NAKED_PAIR', 'LOCKED_PAIR'] });
      expect(nakedRes.byTech.NAKED_PAIR?.instances.length).toBe(1);
      expect(nakedRes.byTech.LOCKED_PAIR?.instances.length).toBe(0);

      // Now restore candidates in Box 0 so it eliminates in both Row 0 and Box 0 (Locked Pair)
      g.cands[9] |= bit(1);
      const lockedRes = findAllPatternInstances(g, { techniques: ['NAKED_PAIR', 'LOCKED_PAIR'] });
      expect(lockedRes.byTech.LOCKED_PAIR?.instances.length).toBe(1);
      expect(lockedRes.byTech.NAKED_PAIR?.instances.length).toBe(0);
    });

    it('does not duplicate a W-Wing when its strong link is a conjugate pair in both a row and a box', () => {
      // Bivalue cells A = r4c1 (27, Box 3) and B = r7c2 (55, Box 6) — do not see each other!
      // e1 = r1c1 (0) and e2 = r1c2 (1) are the ONLY places for digit 1 in BOTH Row 0 and Box 0.
      const g = emptyGrid();
      g.cands[27] = bit(1) | bit(2); // r4c1 (Box 3)
      g.cands[55] = bit(1) | bit(2); // r7c2 (Box 6)
      for (let c = 2; c < 9; c++) g.cands[c] &= ~bit(1);
      for (const c of [9, 10, 11, 18, 19, 20]) g.cands[c] &= ~bit(1);

      const res = findAllPatternInstances(g, { techniques: ['W_WING'] });
      const matching = res.instances.filter(
        (i) => i.patternCells.includes(27) && i.patternCells.includes(55)
      );
      expect(matching.length).toBe(1);
    });

    it('does not re-report a Skyscraper as a Turbot Fish when one of its strong links lies in a single box', () => {
      const g = emptyGrid();
      // Col 0 has digit 5 only at r1c1 (0) and r3c1 (18) — both in Box 0, so strong link in Col 0 AND Box 0!
      // Col 3 has digit 5 only at r2c4 (12) and r3c4 (21) — both in Box 1, so strong link in Col 3!
      // Weak link between 18 (r3c1) and 21 (r3c4) in Row 2.
      // Free ends are 0 (r1c1, Row 0, Box 0) and 12 (r2c4, Row 1, Box 1),
      // which eliminate digit 5 from r1c5 (4), r1c6 (5) in Box 1!
      for (let r = 0; r < 9; r++) {
        if (r !== 0 && r !== 2) g.cands[r * 9 + 0] &= ~bit(5);
        if (r !== 1 && r !== 2) g.cands[r * 9 + 3] &= ~bit(5);
      }
      for (const c of [1, 2, 9, 10, 11, 19, 20]) g.cands[c] &= ~bit(5);

      const res = findAllPatternInstances(g, {
        techniques: ['SKYSCRAPER', 'TURBOT_FISH'],
        irreducibleOnly: true
      });
      expect(res.byTech.SKYSCRAPER?.instances.length).toBe(1);
      expect(res.byTech.TURBOT_FISH?.instances.length).toBe(0);
    });
  });

  describe('7. Strict non-mutation and candidate-state contract', () => {
    it('never mutates grid.values, grid.cands, or grid.given during a full scan', () => {
      const puzzle =
        '52...6.........7.13...........4..8..6......5...........418.........3..2...87.....';
      const g = parseGrid(puzzle)!;
      // Advance a few steps to reach a non-trivial mid-solve state
      for (let i = 0; i < 10; i++) {
        const step = findNextStep(g);
        if (step) applyStep(g, step);
      }
      // Also manually strip a candidate bit to verify custom candidate masks are untouched
      const customCell = g.values.findIndex((v) => v === 0);
      g.cands[customCell] &= ~bit(9);

      const valuesBefore = new Uint8Array(g.values);
      const candsBefore = new Uint16Array(g.cands);
      const givenBefore = new Uint8Array(g.given);

      const res = findAllPatternInstances(g, { includeDisabled: true });
      expect(res.instances.length).toBeGreaterThan(0);

      expect(g.values).toEqual(valuesBefore);
      expect(g.cands).toEqual(candsBefore);
      expect(g.given).toEqual(givenBefore);
    });

    it('respects the candidate contract (engineGrid vs contractGrid open/exhaustive) and never recomputes stripped candidates', () => {
      const cells: CellState[] = Array.from({ length: 81 }, () => ({
        given: false,
        value: 0,
        corner: 0,
        center: 0,
        excluded: 0,
        colors: []
      }));
      // Suppose the user wrote partial corner marks {1, 2} in r1c1 (0) and r1c2 (1)
      cells[0].corner = bit(1) | bit(2);
      cells[1].corner = bit(1) | bit(2);

      // Under 'open' contract (Snyder notes), cells 0 and 1 still have all 9 candidates -> no Naked Pair
      const openGrid = contractGrid(cells, false, 'open');
      const openScan = findAllPatternInstances(openGrid, { techniques: ['LOCKED_PAIR', 'NAKED_PAIR'] });
      expect(openScan.instances.length).toBe(0);

      // Under 'exhaustive' contract, cells 0 and 1 are narrowed to {1, 2} -> Locked Pair fires!
      const exhaustiveGrid = contractGrid(cells, false, 'exhaustive');
      const exhaustiveScan = findAllPatternInstances(exhaustiveGrid, {
        techniques: ['LOCKED_PAIR', 'NAKED_PAIR']
      });
      expect(exhaustiveScan.byTech.LOCKED_PAIR?.instances.length).toBe(1);

      // With explicit candidate exclusions on auto-candidates (engineGrid), excluded candidates stay excluded
      for (let d = 3; d <= 9; d++) {
        cells[0].excluded |= bit(d);
        cells[1].excluded |= bit(d);
      }
      const autoGrid = engineGrid(cells);
      const autoScan = findAllPatternInstances(autoGrid, { techniques: ['LOCKED_PAIR'] });
      expect(autoScan.byTech.LOCKED_PAIR?.instances.length).toBe(1);
    });
  });

  describe('8. Oracle soundness across all discovered instances & solver preservation', () => {
    it('every placement and elimination returned by findAllPatternInstances is 100% sound on real puzzles', () => {
      const PUZZLES = [
        '52...6.........7.13...........4..8..6......5...........418.........3..2...87.....',
        '4.....8.5.3..........7......2.....6.....8.4......1.......6.3.7.5..2.....1.4......',
        '..53.....8......2..7..1.5..4....53...1..7...6..32...8..6.5....9..4....3......97..'
      ];

      let totalInstancesChecked = 0;
      const techsSeen = new Set<Tech>();

      for (const puzzleStr of PUZZLES) {
        const g = parseGrid(puzzleStr)!;
        const solution = solve(cloneGrid(g))!;
        expect(solution).not.toBeNull();

        // Advance past initial singles and scan at several mid-game checkpoints
        for (let stepIdx = 0; stepIdx < 25; stepIdx++) {
          const next = findNextStep(g);
          if (!next) break;
          if (stepIdx === 0 || stepIdx === 8 || stepIdx === 16) {
            const scan = findAllPatternInstances(g, { includeDisabled: true });
            for (const inst of scan.instances) {
              totalInstancesChecked++;
              techsSeen.add(inst.tech);
              for (const { cell, digit } of inst.step.placements) {
                expect(
                  solution.values[cell],
                  `${inst.tech} placed wrong digit ${digit} at cell ${cell}`
                ).toBe(digit);
                // Oracle verification: no valid completion exists without this digit
                expect(hasSolutionWithout(g.values, g.cands, cell, digit)).toBe(false);
              }
              for (const { cell, digit } of inst.step.eliminations) {
                expect(
                  solution.values[cell],
                  `${inst.tech} eliminated solution digit ${digit} from cell ${cell}`
                ).not.toBe(digit);
                // Oracle verification: no valid completion has this digit in this cell
                expect(hasSolution(g.values, g.cands, cell, digit)).toBe(false);
              }
              // Pattern evidence sanity checks
              expect(inst.digits.length).toBeGreaterThan(0);
              expect(inst.conclusionCells.length).toBeGreaterThan(0);
              expect(inst.step.description.length).toBeGreaterThan(0);
            }
          }
          applyStep(g, next);
        }
      }

      expect(totalInstancesChecked).toBeGreaterThan(20);
      expect(techsSeen.size).toBeGreaterThan(3);
    });

    it('preserves findNextStep, findAllSteps, and ratePuzzle behaviour identically', () => {
      const puzzleStr =
        '52...6.........7.13...........4..8..6......5...........418.........3..2...87.....';
      const g = parseGrid(puzzleStr)!;
      const next = findNextStep(g);
      expect(next).not.toBeNull();

      const allOnePerTech = findAllSteps(g);
      expect(allOnePerTech.length).toBeGreaterThan(0);
      expect(allOnePerTech[0]).toEqual(next);

      const rating = ratePuzzle(puzzleStr);
      expect(rating).not.toBeNull();
      expect(rating!.solvable).toBe(true);
      expect(rating!.score).toBeGreaterThan(0);
    });
  });
});
