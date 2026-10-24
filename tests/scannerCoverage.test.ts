import { describe, it, expect } from 'vitest';
import {
  emptyGrid,
  cloneGrid,
  bit,
  parseGrid,
  setValue
} from '../src/engine/board';
import { solve } from '../src/engine/bruteForce';
import {
  findNextStep,
  applyStep,
  findAllPatternInstances,
  findPatternInstancesForTech,
  patternInstanceKey,
  IMPLEMENTED_TECHS,
  TECH_SCANNER_META
} from '../src/engine/humanSolver';
import { TECHS, Tech } from '../src/engine/ratings';

describe('Phase 2 — Expanded Pattern Enumeration Coverage (tests/scannerCoverage.test.ts)', () => {
  describe('1. Basic Techniques (Singles, Intersections, Subsets & Irreducibility)', () => {
    it('enumerates multiple Full Houses, Naked Singles, and Hidden Singles simultaneously', () => {
      const g = emptyGrid();
      // Row 0 has 8 placed values (1..8 in c0..c7), leaving r1c9 (cell 8) as a Full House for 9
      for (let c = 0; c < 8; c++) {
        g.values[c] = c + 1;
        g.cands[c] = 0;
      }
      g.cands[8] = bit(9);

      // Naked Singles at cell 20 (digit 4) and cell 30 (digit 7)
      g.cands[20] = bit(4);
      g.cands[30] = bit(7);

      // Hidden Singles in Row 8: digit 1 only at r9c2 (73), digit 2 only at r9c5 (76)
      for (let c = 0; c < 9; c++) {
        if (c !== 1) g.cands[8 * 9 + c] &= ~bit(1);
        if (c !== 4) g.cands[8 * 9 + c] &= ~bit(2);
      }

      const scan = findAllPatternInstances(g, {
        techniques: ['FULL_HOUSE', 'NAKED_SINGLE', 'HIDDEN_SINGLE']
      });
      expect(scan.byTech.FULL_HOUSE?.instances.length).toBeGreaterThanOrEqual(1);
      expect(
        scan.byTech.FULL_HOUSE?.instances.some(
          (i) => i.step.placements[0].cell === 8 && i.step.placements[0].digit === 9
        )
      ).toBe(true);

      const nakedCells = scan.byTech.NAKED_SINGLE!.instances.map(
        (i) => i.step.placements[0].cell
      );
      expect(nakedCells).toEqual(expect.arrayContaining([8, 20, 30]));

      const hiddenPlacements = scan.byTech.HIDDEN_SINGLE!.instances.map(
        (i) => `${i.step.placements[0].cell}:${i.step.placements[0].digit}`
      );
      expect(hiddenPlacements).toEqual(expect.arrayContaining(['73:1', '76:2']));
    });

    it('enumerates multiple Pointing (LOCKED_CANDIDATES_1) and Claiming (LOCKED_CANDIDATES_2) instances across rows and columns', () => {
      const g = emptyGrid();
      // Pointing #1 (Box 0 -> Row 0 on digit 1): remove 1 from rows 1,2 of Box 0
      for (const c of [9, 10, 11, 18, 19, 20]) g.cands[c] &= ~bit(1);
      // Pointing #2 (Box 4 -> Col 4 on digit 2): remove 2 from cols 3,5 of Box 4
      for (const c of [30, 32, 39, 41, 48, 50]) g.cands[c] &= ~bit(2);

      // Claiming #1 (Row 6 -> Box 6 on digit 3): remove 3 from cols 3..8 of Row 6
      for (let c = 3; c < 9; c++) g.cands[6 * 9 + c] &= ~bit(3);
      // Claiming #2 (Col 8 -> Box 8 on digit 4): remove 4 from rows 0..5 of Col 8
      for (let r = 0; r < 6; r++) g.cands[r * 9 + 8] &= ~bit(4);

      const scan = findAllPatternInstances(g, {
        techniques: ['LOCKED_CANDIDATES_1', 'LOCKED_CANDIDATES_2']
      });
      const pointingDigits = scan.byTech.LOCKED_CANDIDATES_1!.instances.map((i) => i.digits[0]);
      expect(pointingDigits).toEqual(expect.arrayContaining([1, 2]));

      const claimingDigits = scan.byTech.LOCKED_CANDIDATES_2!.instances.map((i) => i.digits[0]);
      expect(claimingDigits).toEqual(expect.arrayContaining([3, 4]));
    });

    it('enumerates irreducible Naked/Hidden Triples & Quads and filters out reducible composite subsets', () => {
      const g = emptyGrid();
      // In Row 0:
      // - r1c1 (0) and r1c2 (1) form a Naked Pair on {1, 2}
      // - r1c4 (3) has {1, 2, 3} -> {0, 1, 3} is a REDUCIBLE Naked Triple (contains Naked Pair {0, 1})!
      g.cands[0] = bit(1) | bit(2);
      g.cands[1] = bit(1) | bit(2);
      g.cands[3] = bit(1) | bit(2) | bit(3);

      // In Row 3:
      // Genuine irreducible Naked Triple on {4, 5, 6} at r4c1 (27)={4,5}, r4c4 (30)={5,6}, r4c7 (33)={4,6}
      g.cands[27] = bit(4) | bit(5);
      g.cands[30] = bit(5) | bit(6);
      g.cands[33] = bit(4) | bit(6);

      // In Row 6:
      // Genuine irreducible Hidden Triple on {7, 8, 9} confined to r7c1 (54), r7c4 (57), r7c7 (60)
      for (let c = 0; c < 9; c++) {
        const cell = 6 * 9 + c;
        if (![54, 57, 60].includes(cell)) {
          g.cands[cell] &= ~(bit(7) | bit(8) | bit(9));
        }
      }
      // Make it non-degenerate (each cell holds 2 of {7,8,9} + extras {1,2,3})
      g.cands[54] = bit(7) | bit(8) | bit(1) | bit(2);
      g.cands[57] = bit(8) | bit(9) | bit(1) | bit(2);
      g.cands[60] = bit(7) | bit(9) | bit(1) | bit(2);

      const scan = findAllPatternInstances(g, {
        techniques: ['NAKED_TRIPLE', 'HIDDEN_TRIPLE'],
        irreducibleOnly: true
      });

      // Row 0's composite {0, 1, 3} must NOT be reported as a Naked Triple
      const row0NakedTriples = scan.byTech.NAKED_TRIPLE!.instances.filter(
        (i) => i.patternCells.includes(0) && i.patternCells.includes(1) && i.patternCells.includes(3)
      );
      expect(row0NakedTriples.length).toBe(0);

      // Row 3's genuine Naked Triple {27, 30, 33} MUST be reported
      const row3NakedTriples = scan.byTech.NAKED_TRIPLE!.instances.filter(
        (i) =>
          i.patternCells.length === 3 &&
          i.patternCells.includes(27) &&
          i.patternCells.includes(30) &&
          i.patternCells.includes(33)
      );
      expect(row3NakedTriples.length).toBe(1);

      // Row 6's genuine Hidden Triple {54, 57, 60} on {7,8,9} MUST be reported
      const row6HiddenTriples = scan.byTech.HIDDEN_TRIPLE!.instances.filter(
        (i) =>
          i.patternCells.includes(54) &&
          i.patternCells.includes(57) &&
          i.patternCells.includes(60)
      );
      expect(row6HiddenTriples.length).toBe(1);
    });
  });

  describe('2. Fish Patterns (Basic, Finned, Sashimi, Franken — Both Orientations)', () => {
    it('enumerates both row-based and column-based Swordfish and Jellyfish in one position', () => {
      const g = emptyGrid();
      // 1) Row-based Irreducible Swordfish on digit 1: rows 0, 3, 6 on cols 0, 3, 6
      for (let c = 0; c < 9; c++) {
        g.cands[0 * 9 + c] &= ~bit(1);
        g.cands[3 * 9 + c] &= ~bit(1);
        g.cands[6 * 9 + c] &= ~bit(1);
      }
      g.cands[0 * 9 + 0] |= bit(1);
      g.cands[0 * 9 + 3] |= bit(1);
      g.cands[3 * 9 + 3] |= bit(1);
      g.cands[3 * 9 + 6] |= bit(1);
      g.cands[6 * 9 + 0] |= bit(1);
      g.cands[6 * 9 + 6] |= bit(1);

      // 2) Column-based Irreducible Swordfish on digit 2: cols 1, 4, 7 on rows 1, 4, 7
      for (let r = 0; r < 9; r++) {
        g.cands[r * 9 + 1] &= ~bit(2);
        g.cands[r * 9 + 4] &= ~bit(2);
        g.cands[r * 9 + 7] &= ~bit(2);
      }
      g.cands[1 * 9 + 1] |= bit(2);
      g.cands[4 * 9 + 1] |= bit(2);
      g.cands[4 * 9 + 4] |= bit(2);
      g.cands[7 * 9 + 4] |= bit(2);
      g.cands[1 * 9 + 7] |= bit(2);
      g.cands[7 * 9 + 7] |= bit(2);

      // 3) Row-based Irreducible Jellyfish on digit 3: rows 0, 2, 5, 8 on cols 0, 2, 5, 8
      const jfLines = [0, 2, 5, 8];
      for (const r of jfLines) {
        for (let c = 0; c < 9; c++) g.cands[r * 9 + c] &= ~bit(3);
      }
      for (let i = 0; i < 4; i++) {
        const r = jfLines[i];
        const cA = jfLines[i];
        const cB = jfLines[(i + 1) % 4];
        g.cands[r * 9 + cA] |= bit(3);
        g.cands[r * 9 + cB] |= bit(3);
      }

      const scan = findAllPatternInstances(g, {
        techniques: ['SWORDFISH', 'JELLYFISH']
      });
      const sfDigits = scan.byTech.SWORDFISH!.instances.map((i) => i.digits[0]).sort();
      expect(sfDigits).toEqual([1, 2]);
      expect(scan.byTech.JELLYFISH!.instances.some((i) => i.digits[0] === 3)).toBe(true);
    });

    it('enumerates Finned Swordfish, Sashimi Swordfish, and Franken X-Wing across orientations', () => {
      const g = emptyGrid();
      // Finned Swordfish on digit 5 (rows 0, 3, 6 on cols 0, 3, 6 + fin at r1c2 (cell 1) in Box 0):
      for (const r of [0, 3, 6]) {
        for (let c = 0; c < 9; c++) g.cands[r * 9 + c] &= ~bit(5);
      }
      g.cands[0 * 9 + 0] |= bit(5);
      g.cands[0 * 9 + 3] |= bit(5);
      g.cands[0 * 9 + 1] |= bit(5); // fin in Box 0
      g.cands[3 * 9 + 3] |= bit(5);
      g.cands[3 * 9 + 6] |= bit(5);
      g.cands[6 * 9 + 0] |= bit(5);
      g.cands[6 * 9 + 6] |= bit(5);

      // Sashimi Swordfish on digit 6 (rows 0, 3, 6 on cols 0, 3, 6 where row 0 only has col 3 + fin at r1c1 (cell 0)?
      // Wait: if fin is at r1c2 (cell 1) and cover cols are 0, 3, 6, and row 0 only has col 0 (cell 0) in cover?
      // No, if row 0 has ONLY cell 0 (col 0) and fin cell 1 (col 1) in Box 0, and cover cols are {0, 3, 6},
      // then row 0 has only 1 cell in the cover cols (cell 0), making it a SASHIMI Swordfish!
      for (const r of [0, 3, 6]) {
        for (let c = 0; c < 9; c++) g.cands[r * 9 + c] &= ~bit(6);
      }
      g.cands[0 * 9 + 0] |= bit(6); // only 1 cell in cover cols {0,3,6} for row 0!
      g.cands[0 * 9 + 1] |= bit(6); // fin in Box 0 (col 1)
      g.cands[3 * 9 + 0] |= bit(6);
      g.cands[3 * 9 + 3] |= bit(6);
      g.cands[3 * 9 + 6] |= bit(6);
      g.cands[6 * 9 + 3] |= bit(6);
      g.cands[6 * 9 + 6] |= bit(6);

      // Franken X-Wing on digit 7: Base = Row 0 and Box 3 (rows 3,4,5 cols 0,1,2), Cover = Col 0 and Col 1
      for (let c = 0; c < 9; c++) g.cands[0 * 9 + c] &= ~bit(7);
      for (const c of [27, 28, 29, 36, 37, 38, 45, 46, 47]) g.cands[c] &= ~bit(7);
      g.cands[0] |= bit(7);
      g.cands[1] |= bit(7);
      g.cands[27] |= bit(7);
      g.cands[37] |= bit(7);

      const scan = findAllPatternInstances(g, {
        techniques: ['FINNED_SWORDFISH', 'SASHIMI_SWORDFISH', 'FRANKEN_X_WING']
      });
      expect(scan.byTech.FINNED_SWORDFISH!.instances.some((i) => i.digits[0] === 5)).toBe(true);
      expect(scan.byTech.SASHIMI_SWORDFISH!.instances.some((i) => i.digits[0] === 6)).toBe(true);
      expect(scan.byTech.FRANKEN_X_WING!.instances.some((i) => i.digits[0] === 7)).toBe(true);
    });
  });

  describe('3. Single-Digit Patterns (Skyscraper, 2-String Kite, Turbot Fish, Empty Rectangle)', () => {
    it('enumerates multiple 2-String Kites and Empty Rectangles in a single position', () => {
      const g = emptyGrid();
      // 2-String Kite #1 on digit 1:
      // Row 0 has 1 only at r1c2 (1, Box 0) and r1c6 (5, Box 1)
      // Col 0 has 1 only at r2c1 (9, Box 0) and r6c1 (45, Box 6)
      // Inner ends 1 and 9 share Box 0; outer ends 5 and 45 eliminate 1 from r6c6 (50)!
      for (let c = 0; c < 9; c++) if (c !== 1 && c !== 5) g.cands[0 * 9 + c] &= ~bit(1);
      for (let r = 0; r < 9; r++) if (r !== 1 && r !== 5) g.cands[r * 9 + 0] &= ~bit(1);

      // 2-String Kite #2 on digit 2:
      // Row 8 has 2 only at r9c8 (79, Box 8) and r9c4 (75, Box 7)
      // Col 8 has 2 only at r8c9 (71, Box 8) and r4c9 (35, Box 5)
      // Inner ends 79 and 71 share Box 8; outer ends 75 and 35 eliminate 2 from r4c4 (30)!
      for (let c = 0; c < 9; c++) if (c !== 7 && c !== 3) g.cands[8 * 9 + c] &= ~bit(2);
      for (let r = 0; r < 9; r++) if (r !== 7 && r !== 3) g.cands[r * 9 + 8] &= ~bit(2);

      // Empty Rectangle on digit 3 in Box 0 (cross at r1c1: row 0, col 0):
      // Box 0 has digit 3 at r1c2 (1), r1c3 (2), r2c1 (9), r3c1 (18) (4 cells -> not a conjugate pair)
      for (const c of [0, 10, 11, 19, 20]) g.cands[c] &= ~bit(3);
      // Conjugate pair in Col 4 (aligned with erRow = 0 at r1c5 (4) and r6c5 (49)):
      for (let r = 0; r < 9; r++) if (r !== 0 && r !== 5) g.cands[r * 9 + 4] &= ~bit(3);

      const scan = findAllPatternInstances(g, {
        techniques: ['TWO_STRING_KITE', 'EMPTY_RECTANGLE']
      });
      const kiteDigits = scan.byTech.TWO_STRING_KITE!.instances.map((i) => i.digits[0]);
      expect(kiteDigits).toEqual(expect.arrayContaining([1, 2]));
      expect(scan.byTech.EMPTY_RECTANGLE!.instances.some((i) => i.digits[0] === 3)).toBe(true);
    });
  });

  describe('4. Wings (XY-Wing, XYZ-Wing, W-Wing, WXYZ-Wing)', () => {
    it('enumerates multiple XYZ-Wings and multiple W-Wings (including two W-Wings with different strong links eliminating the same candidate)', () => {
      const g = emptyGrid();
      // XYZ-Wing #1: Pivot r1c1 (0) = {1,2,3}, Pincer1 r1c2 (1, Box 0) = {1,3}, Pincer2 r1c5 (4, Row 0) = {2,3}
      // Eliminates 3 from r1c3 (2) which sees 0, 1, and 4!
      g.cands[0] = bit(1) | bit(2) | bit(3);
      g.cands[1] = bit(1) | bit(3);
      g.cands[4] = bit(2) | bit(3);

      // XYZ-Wing #2: Pivot r9c9 (80) = {7,8,9}, Pincer1 r9c8 (79, Box 8) = {7,9}, Pincer2 r9c4 (75, Row 8) = {8,9}
      // Eliminates 9 from r9c7 (78) which sees 80, 79, and 75!
      g.cands[80] = bit(7) | bit(8) | bit(9);
      g.cands[79] = bit(7) | bit(9);
      g.cands[75] = bit(8) | bit(9);

      // Two W-Wings on the SAME bivalue pair A = r4c1 (27) = {4,5} and B = r5c4 (39) = {4,5}
      // eliminating 5 from r4c4 (30) and r5c1 (36) via TWO DIFFERENT strong links on 4:
      // Strong link #1 on 4 in Row 2: r3c1 (18) and r3c4 (21)
      // Strong link #2 on 4 in Row 6: r7c1 (54) and r7c4 (57)
      g.cands[27] = bit(4) | bit(5);
      g.cands[39] = bit(4) | bit(5);
      for (let c = 0; c < 9; c++) {
        if (c !== 0 && c !== 3) {
          g.cands[2 * 9 + c] &= ~bit(4);
          g.cands[6 * 9 + c] &= ~bit(4);
        }
      }

      const scan = findAllPatternInstances(g, {
        techniques: ['XYZ_WING', 'W_WING']
      });
      expect(scan.byTech.XYZ_WING!.instances.length).toBeGreaterThanOrEqual(2);

      // Both W-Wing bridges (Row 2 and Row 6) for the pair (27, 39) must be preserved as distinct instances!
      const wWingsFor27And39 = scan.byTech.W_WING!.instances.filter(
        (i) => i.patternCells.includes(27) && i.patternCells.includes(39)
      );
      expect(wWingsFor27And39.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('5. Uniqueness (UR Types 1–6, Irreducible UR Type 3, Hidden/Avoidable/Extended Rectangles, BUG+1)', () => {
    it('enforces irreducibility on UR Type 3 so composite helper subsets are not falsely reported', () => {
      const g = emptyGrid();
      // UR on {1, 2} at r1c1 (0), r2c1 (9), r1c4 (3), r2c4 (12):
      // Floor at 0 and 9 = {1, 2}
      // Roof at 3 = {1, 2, 3} and 12 = {1, 2, 4} -> Roof extras E = {3, 4} in Col 3!
      g.cands[0] = bit(1) | bit(2);
      g.cands[9] = bit(1) | bit(2);
      g.cands[3] = bit(1) | bit(2) | bit(3);
      g.cands[12] = bit(1) | bit(2) | bit(4);

      // In Col 3:
      // - Helper cell r4c4 (30) = {3, 4} -> forms an irreducible k=1 Locked Pair with roof E={3,4}!
      // - Another cell r5c4 (39) = {3, 4, 5} -> {30, 39} has mask {3,4,5} (size 3 = k+1 for k=2),
      //   which is REDUCIBLE because {30} already locks with E={3,4}!
      g.cands[30] = bit(3) | bit(4);
      g.cands[39] = bit(3) | bit(4) | bit(5);

      const scan = findAllPatternInstances(g, {
        techniques: ['UNIQUENESS_3']
      });
      const ur3Instances = scan.byTech.UNIQUENESS_3!.instances;
      expect(ur3Instances.length).toBe(1);
      expect(ur3Instances[0].step.secondary).toEqual([
        { cell: 30, digit: 3 },
        { cell: 30, digit: 4 }
      ]);
    });

    it('enumerates multiple Avoidable Rectangles and Hidden Rectangles in one position', () => {
      const g = emptyGrid();
      // Avoidable Rectangle Type 1 #1 at r1c1 (0), r1c4 (3), r2c1 (9), r2c4 (12):
      // Place non-given digits: 0=1, 3=2, 9=2, and leave 12 unsolved with {1, 3}
      setValue(g, 0, 1);
      setValue(g, 3, 2);
      setValue(g, 9, 2);
      g.given[0] = 0;
      g.given[3] = 0;
      g.given[9] = 0;
      g.cands[12] = bit(1) | bit(3);

      // Avoidable Rectangle Type 1 #2 at r7c4 (57), r7c7 (60), r9c4 (75), r9c7 (78) (spans Box 7 and Box 8):
      // Place non-given digits: 57=8, 60=9, 75=9, and leave 78 unsolved with {7, 8}
      setValue(g, 57, 8);
      setValue(g, 60, 9);
      setValue(g, 75, 9);
      g.given[57] = 0;
      g.given[60] = 0;
      g.given[75] = 0;
      g.cands[78] = bit(7) | bit(8);

      const scan = findAllPatternInstances(g, {
        techniques: ['AVOIDABLE_RECTANGLE_1']
      });
      expect(scan.byTech.AVOIDABLE_RECTANGLE_1!.instances.length).toBe(2);
    });
  });

  describe('6. Coloring, Chains, Loops, ALS & Forcing Deductions', () => {
    it('enumerates multiple Simple Colors deductions (Wrap + Trap) without parity-swap duplication', () => {
      const g = emptyGrid();
      // Create a Simple Colors cluster on digit 1:
      // Row 0 conjugate pair: r1c1 (0) == r1c4 (3)
      // Col 3 conjugate pair: r1c4 (3) == r4c4 (30)
      // Row 3 conjugate pair: r4c4 (30) == r4c2 (28)
      // Color 0 = {0, 30}, Color 1 = {3, 28}.
      // Cell r2c2 (10) in Box 0 & Col 1 sees 0 (via Box 0, Color 0) and 28 (via Col 1, Color 1) -> Color Trap!
      for (let c = 0; c < 9; c++) {
        if (c !== 0 && c !== 3) g.cands[0 * 9 + c] &= ~bit(1);
        if (c !== 1 && c !== 3) g.cands[3 * 9 + c] &= ~bit(1);
      }
      for (let r = 0; r < 9; r++) {
        if (r !== 0 && r !== 3) g.cands[r * 9 + 3] &= ~bit(1);
      }
      g.cands[10] |= bit(1);

      const scan = findAllPatternInstances(g, { techniques: ['SIMPLE_COLORS'] });
      const d1Steps = scan.byTech.SIMPLE_COLORS!.instances.filter((i) => i.digits[0] === 1);
      expect(d1Steps.length).toBe(1);
      expect(d1Steps[0].step.eliminations).toContainEqual({ cell: 10, digit: 1 });
    });

    it('preserves distinct Cell Forcing Chains from different starting cells that prove the same conclusion', () => {
      const g = emptyGrid();
      // Target cell r3c4 (21, Box 1, Col 3) holds {1, 9}.
      // Origin cell A = r4c4 (30, Col 3, Box 4) holds {2, 3}:
      // - If 30=2 -> forces r5c4 (39)={2,9} to be 9 -> eliminates 9 from r3c4 (21) via Col 3
      // - If 30=3 -> forces r6c4 (48)={3,9} to be 9 -> eliminates 9 from r3c4 (21) via Col 3
      g.cands[30] = bit(2) | bit(3);
      g.cands[39] = bit(2) | bit(9);
      g.cands[48] = bit(3) | bit(9);

      // Origin cell B = r1c5 (4, Box 1, Col 4) holds {4, 5}:
      // - If 4=4 -> forces r1c6 (5)={4,9} to be 9 -> eliminates 9 from r3c4 (21) via Box 1
      // - If 4=5 -> forces r2c6 (14)={5,9} to be 9 -> eliminates 9 from r3c4 (21) via Box 1
      g.cands[4] = bit(4) | bit(5);
      g.cands[5] = bit(4) | bit(9);
      g.cands[14] = bit(5) | bit(9);

      g.cands[21] = bit(1) | bit(9);

      const scan = findAllPatternInstances(g, {
        techniques: ['CELL_FORCING_CHAIN']
      });
      const fromCell30 = scan.byTech.CELL_FORCING_CHAIN!.instances.find((i) =>
        i.step.primary?.some((cd) => cd.cell === 30)
      );
      const fromCell4 = scan.byTech.CELL_FORCING_CHAIN!.instances.find((i) =>
        i.step.primary?.some((cd) => cd.cell === 4)
      );
      expect(fromCell30).toBeDefined();
      expect(fromCell4).toBeDefined();
      expect(fromCell30!.id).not.toBe(fromCell4!.id);
    });

    it('classifies GROUPED_X_CYCLES Rule 3 (weak-start, weak-close) as discontinuous loop2 in patternInstanceKey', () => {
      const stepRule3 = {
        tech: 'GROUPED_X_CYCLES' as const,
        placements: [],
        eliminations: [
          { cell: 0, digit: 5 },
          { cell: 1, digit: 5 }
        ],
        primary: [
          { cell: 0, digit: 5 },
          { cell: 1, digit: 5 },
          { cell: 9, digit: 5 },
          { cell: 11, digit: 5 }
        ],
        links: [
          {
            from: [
              { cell: 0, digit: 5 },
              { cell: 1, digit: 5 }
            ],
            to: [{ cell: 9, digit: 5 }],
            strong: false
          },
          {
            from: [{ cell: 9, digit: 5 }],
            to: [{ cell: 11, digit: 5 }],
            strong: true
          },
          {
            from: [{ cell: 11, digit: 5 }],
            to: [
              { cell: 0, digit: 5 },
              { cell: 1, digit: 5 }
            ],
            strong: false
          }
        ],
        description: 'test'
      };
      const key = patternInstanceKey(stepRule3);
      expect(key).toBe('GROUPED_X_CYCLES|loop2|0:5,1:5|E:0:5,E:1:5');
    });
  });

  describe('7. Deterministic Ordering, Soundness & Runtime Profiling on Difficult Positions', () => {
    it('produces deterministic ordering, zero grid mutation, and 100% sound conclusions within practical runtime bounds', () => {
      // Representative hard/unfair/extreme puzzles
      const HARD_PUZZLES = [
        // Inkala / AI Escargot style hard position
        '1....7.9..3..2...8..96..5....53..9...1..8...26....4...3......1..4......7..7...3..',
        // Unfair / Extreme multi-pattern position
        '..53.....8......2..7..1.5..4....53...1..7...6..32...8..6.5....9..4....3......97..'
      ];

      for (const puzzle of HARD_PUZZLES) {
        const g = parseGrid(puzzle)!;
        const solution = solve(cloneGrid(g))!;
        expect(solution).not.toBeNull();

        // Advance past trivial singles to reach the rich mid-game position where advanced patterns coexist
        while (true) {
          const s = findNextStep(g, ['FULL_HOUSE', 'NAKED_SINGLE', 'HIDDEN_SINGLE']);
          if (!s) break;
          applyStep(g, s);
        }

        const candsSnapshot = new Uint16Array(g.cands);
        const valuesSnapshot = new Uint8Array(g.values);

        const t0 = performance.now();
        const scan1 = findAllPatternInstances(g, { includeDisabled: true });
        const elapsedMs = performance.now() - t0;

        const scan2 = findAllPatternInstances(g, { includeDisabled: true });

        // 1. Strict non-mutation
        expect(g.cands).toEqual(candsSnapshot);
        expect(g.values).toEqual(valuesSnapshot);

        // 2. Deterministic ordering across repeated runs
        expect(scan1.instances.map((i) => i.id)).toEqual(scan2.instances.map((i) => i.id));
        expect(scan1.scannedTechniques).toEqual(scan2.scannedTechniques);
        expect(scan1.scannedTechniques.length).toBe(76);

        // 3. No duplicate canonical patternInstanceKey within the same scan
        const uniqueIds = new Set(scan1.instances.map((i) => i.id));
        expect(uniqueIds.size).toBe(scan1.instances.length);

        // 4. Every placement and elimination across all 76 techniques agrees with the unique solution
        expect(scan1.instances.length).toBeGreaterThan(5);
        for (const inst of scan1.instances) {
          for (const { cell, digit } of inst.step.placements) {
            expect(
              solution.values[cell],
              `${inst.tech} placed wrong digit ${digit} at cell ${cell}`
            ).toBe(digit);
          }
          for (const { cell, digit } of inst.step.eliminations) {
            expect(
              solution.values[cell],
              `${inst.tech} eliminated solution digit ${digit} from cell ${cell}`
            ).not.toBe(digit);
          }
        }

        // 5. Full 76-technique scan completes within a practical desktop interactive budget (< 3000 ms)
        expect(elapsedMs).toBeLessThan(3000);
      }
    });

    it('verifies every entry in IMPLEMENTED_TECHS is callable via findPatternInstancesForTech without error', () => {
      const g = parseGrid(
        '52...6.........7.13...........4..8..6......5...........418.........3..2...87.....'
      )!;
      for (const tech of Object.keys(TECHS) as Tech[]) {
        const res = findPatternInstancesForTech(tech, g);
        expect(res.tech).toBe(tech);
        expect(res.implemented).toBe(TECH_SCANNER_META[tech].implemented);
        expect(res.coverage).toBe(TECH_SCANNER_META[tech].coverage);
        if (!IMPLEMENTED_TECHS.includes(tech)) {
          expect(res.instances).toEqual([]);
        }
      }
    });
  });
});
