import { Grid, UNITS, bit, digitsOf, sees, rowOf, colOf, cellName, cellNames } from '../board';
import { Step, CellDigit, alternatingLinks } from '../steps';
import { collectAls } from './als';
import { tr } from '../text';

/**
 * AIC with Groups (sudokuwiki.org/AIC_with_Groups) and Grouped Nice Loops.
 *
 * The AIC node set is extended with GROUP nodes: the 2–3 candidates of one
 * digit in a box∕line intersection, true when any of its cells holds the
 * digit. Links:
 * - strong, same digit: a unit's candidates for the digit split exactly into
 *   two disjoint nodes (cell–cell is the classic conjugate pair);
 * - strong, same cell: the two candidates of a bivalue cell;
 * - weak, same digit: two disjoint nodes with full mutual visibility;
 * - weak, same cell: two candidates of one cell (candidate nodes only —
 *   a group being true fixes no single cell, so it carries no cross-digit
 *   inference).
 *
 * ALS augmentation (sudokuwiki.org/AIC_with_ALSs): an Almost Locked Set
 * contributes one node per digit ("the digit is somewhere in the set").
 * Removing one digit from an ALS locks it and places every other digit, so
 * any two digit-nodes of the same ALS are STRONGLY linked; externally the
 * nodes weak-link exactly like groups (full visibility, same digit).
 *
 * Chains (strong ends): at least one end is true → candidates conflicting
 * with both ends fall. A group or ALS end's conflicts are the digit's
 * candidates in cells seeing all of the node's cells.
 *
 * Loops: continuous loops eliminate along every weak link (same-cell links
 * strip the cell's other candidates, same-digit links clear outside cells
 * seeing both nodes); a double-strong discontinuity at the start makes the
 * start node true — a candidate is placed, a group confines the digit.
 */

interface GNode {
  cells: number[];
  digit: number;
  /** index of the ALS this node belongs to, for ALS-augmented chains */
  als?: number;
}

/** node path -> candidate sets for arrow drawing */
const nodeCds = (nodes: GNode[], path: number[]): CellDigit[][] =>
  path.map((n) => nodes[n].cells.map((cell) => ({ cell, digit: nodes[n].digit })));

export function* iterGroupedAic(
  g: Grid,
  maxNodes = 10,
  filter: 'both' | 'grouped' | 'als' = 'both',
  onBudgetHit?: () => void
): Generator<Step> {
  yield* iterSearch(g, 'chain', maxNodes, filter, onBudgetHit);
}

export function findGroupedAic(g: Grid, maxNodes = 10): Step | null {
  return iterGroupedAic(g, maxNodes, 'both').next().value ?? null;
}

export function* iterGroupedNiceLoop(
  g: Grid,
  maxNodes = 10,
  onBudgetHit?: () => void
): Generator<Step> {
  yield* iterSearch(g, 'loop', maxNodes, 'both', onBudgetHit);
}

export function findGroupedNiceLoop(g: Grid, maxNodes = 10): Step | null {
  return iterGroupedNiceLoop(g, maxNodes).next().value ?? null;
}

function* iterSearch(
  g: Grid,
  mode: 'chain' | 'loop',
  maxNodes: number,
  filter: 'both' | 'grouped' | 'als',
  onBudgetHit?: () => void
): Generator<Step> {
  // ---- nodes ----
  const nodes: GNode[] = [];
  const candId = new Map<number, number>(); // cell*9+digit-1 -> node id
  for (let c = 0; c < 81; c++) {
    if (g.values[c] !== 0) continue;
    for (const d of digitsOf(g.cands[c])) {
      candId.set(c * 9 + d - 1, nodes.length);
      nodes.push({ cells: [c], digit: d });
    }
  }
  const firstGroup = nodes.length;
  for (let d = 1; d <= 9; d++) {
    const mask = bit(d);
    for (let b = 0; b < 9; b++) {
      const inBox = UNITS[18 + b].filter((c) => g.values[c] === 0 && g.cands[c] & mask);
      for (const lineOf of [rowOf, colOf]) {
        const byLine = new Map<number, number[]>();
        for (const c of inBox) {
          const l = lineOf(c);
          if (!byLine.has(l)) byLine.set(l, []);
          byLine.get(l)!.push(c);
        }
        for (const seg of byLine.values()) {
          if (seg.length >= 2) nodes.push({ cells: seg, digit: d });
        }
      }
    }
  }
  // ALS digit-nodes (chain mode only): one node per digit of each ALS,
  // internally strong-linked pairwise
  const alsPairs: [number, number][] = [];
  if (mode === 'chain' && filter !== 'grouped') {
    const alses = collectAls(g, 3, 90);
    for (let a = 0; a < alses.length; a++) {
      const ids: number[] = [];
      for (const d of digitsOf(alses[a].mask)) {
        const cells = alses[a].cells.filter((c) => g.cands[c] & bit(d));
        if (!cells.length) continue;
        ids.push(nodes.length);
        nodes.push({ cells, digit: d, als: a });
      }
      for (let x = 0; x < ids.length; x++) {
        for (let y = x + 1; y < ids.length; y++) alsPairs.push([ids[x], ids[y]]);
      }
    }
  }
  if (firstGroup === nodes.length) return; // no groups/ALS -> plain AIC covers it

  const disjoint = (a: GNode, b: GNode) => !a.cells.some((c) => b.cells.includes(c));
  const sameDigitWeak = (a: GNode, b: GNode) =>
    a.digit === b.digit &&
    disjoint(a, b) &&
    a.cells.every((ca) => b.cells.every((cb) => sees(ca, cb)));
  const weakLinked = (a: GNode, b: GNode) => {
    if (a.digit === b.digit) return sameDigitWeak(a, b);
    return (
      a.cells.length === 1 && b.cells.length === 1 && a.cells[0] === b.cells[0]
    );
  };

  // ---- strong links ----
  const strong = new Map<number, number[]>();
  const addStrong = (i: number, j: number) => {
    if (!strong.has(i)) strong.set(i, []);
    if (!strong.has(j)) strong.set(j, []);
    strong.get(i)!.push(j);
    strong.get(j)!.push(i);
  };
  for (let c = 0; c < 81; c++) {
    if (g.values[c] !== 0) continue;
    const ds = digitsOf(g.cands[c]);
    if (ds.length === 2) {
      addStrong(candId.get(c * 9 + ds[0] - 1)!, candId.get(c * 9 + ds[1] - 1)!);
    }
  }
  for (const [x, y] of alsPairs) addStrong(x, y);
  for (let d = 1; d <= 9; d++) {
    const mask = bit(d);
    const digitNodes: number[] = [];
    for (let n = 0; n < nodes.length; n++) {
      if (nodes[n].digit === d && nodes[n].als === undefined) digitNodes.push(n);
    }
    for (const unit of UNITS) {
      const uc = unit.filter((c) => g.values[c] === 0 && g.cands[c] & mask);
      if (uc.length < 2) continue;
      const inUnit = digitNodes.filter((n) => nodes[n].cells.every((c) => unit.includes(c)));
      for (let x = 0; x < inUnit.length; x++) {
        for (let y = x + 1; y < inUnit.length; y++) {
          const A = nodes[inUnit[x]];
          const B = nodes[inUnit[y]];
          if (!disjoint(A, B)) continue;
          if (A.cells.length + B.cells.length !== uc.length) continue;
          // cell–cell conjugates belong to plain AIC; require a group somewhere
          addStrong(inUnit[x], inUnit[y]);
        }
      }
    }
  }
  if (!strong.size) return;

  /** candidates conflicting with a node being true */
  const conflictsOf = (n: number): Set<number> => {
    const out = new Set<number>(); // encoded cell*9+digit-1
    const node = nodes[n];
    if (node.cells.length === 1) {
      const cell = node.cells[0];
      for (const d of digitsOf(g.cands[cell])) {
        if (d !== node.digit) out.add(cell * 9 + d - 1);
      }
    }
    for (let c = 0; c < 81; c++) {
      if (g.values[c] !== 0 || node.cells.includes(c)) continue;
      if (!(g.cands[c] & bit(node.digit))) continue;
      if (node.cells.every((nc) => sees(c, nc))) out.add(c * 9 + node.digit - 1);
    }
    return out;
  };

  const coveredByPath = (path: number[], cell: number, digit: number) =>
    path.some((p) => nodes[p].digit === digit && nodes[p].cells.includes(cell));

  const overlapsPath = (path: number[], n: number) =>
    path.some((p) => nodes[p].digit === nodes[n].digit && !disjoint(nodes[p], nodes[n]));

  const label = (n: number) =>
    `${nodes[n].digit}@${nodes[n].cells.length === 1 ? cellName(nodes[n].cells[0]) : `[${cellNames(nodes[n].cells)}]`}`;

  let budget = 40000;
  const seen = new Set<string>();

  const weakNbrs = (n: number): number[] => {
    const out: number[] = [];
    for (let m = 0; m < nodes.length; m++) {
      if (m !== n && weakLinked(nodes[n], nodes[m])) out.push(m);
    }
    return out;
  };

  for (let start = 0; start < nodes.length; start++) {
    if (!strong.has(start)) continue;
    const startConf = mode === 'chain' ? conflictsOf(start) : null;

    function* dfs(path: number[], nextType: 'strong' | 'weak'): Generator<Step> {
      if (budget-- <= 0) {
        onBudgetHit?.();
        return;
      }
      if (path.length > maxNodes) return;
      const cur = path[path.length - 1];
      const groupInPath = path.some((p) => nodes[p].cells.length > 1);

      const alsInPath = path.some((p) => nodes[p].als !== undefined);
      const matchesFilter =
        filter === 'both' ||
        (filter === 'grouped' && !alsInPath && groupInPath) ||
        (filter === 'als' && alsInPath);

      if (
        mode === 'chain' &&
        nextType === 'weak' &&
        path.length >= 4 &&
        (groupInPath || alsInPath) &&
        matchesFilter
      ) {
        const endConf = conflictsOf(cur);
        const elims: CellDigit[] = [];
        for (const id of startConf!) {
          if (!endConf.has(id)) continue;
          const cell = Math.floor(id / 9);
          const digit = (id % 9) + 1;
          if (coveredByPath(path, cell, digit)) continue;
          elims.push({ cell, digit });
        }
        if (elims.length) {
          const a = path[0];
          const b = cur;
          const pairKey = a < b ? `${a}-${b}` : `${b}-${a}`;
          const elimKey = elims.map((e) => `${e.cell}:${e.digit}`).join(',');
          const key = `chain:${alsInPath ? 'ALS' : 'GRP'}:${pairKey}:${elimKey}`;
          if (!seen.has(key)) {
            seen.add(key);
            const chain = path.map(label).join(' → ');
            yield {
              tech: alsInPath ? 'AIC_ALS' : 'AIC_GROUPED',
              placements: [],
              eliminations: elims,
              primary: path.flatMap((n) =>
                nodes[n].cells.map((cell) => ({ cell, digit: nodes[n].digit }))
              ),
              links: alternatingLinks(nodeCds(nodes, path)),
              description: alsInPath
                ? tr`AIC with ALS: ${chain}; at least one end is true, so candidates conflicting with both ends are removed.`
                : tr`Grouped AIC: ${chain}; at least one end is true, so candidates conflicting with both ends are removed.`
            };
          }
        }
      }

      if (mode === 'loop' && path.length >= 4 && groupInPath) {
        const lastWasStrong = nextType === 'weak';
        if (!lastWasStrong && (strong.get(cur) ?? []).includes(path[0])) {
          const step = loopRule2(g, nodes, path, label);
          if (step) {
            const elimKey = step.eliminations.map((e) => `${e.cell}:${e.digit}`).join(',');
            const key = `r2:${path[0]}:${elimKey}`;
            if (!seen.has(key)) {
              seen.add(key);
              yield step;
            }
          }
        }
        if (
          lastWasStrong &&
          weakLinked(nodes[cur], nodes[path[0]]) &&
          path.length % 2 === 0
        ) {
          const step = loopRule1(g, nodes, path, coveredByPath, label);
          if (step) {
            const loopKey = [...path].sort((a, b) => a - b).join(',');
            const elimKey = step.eliminations.map((e) => `${e.cell}:${e.digit}`).join(',');
            const key = `r1:${loopKey}:${elimKey}`;
            if (!seen.has(key)) {
              seen.add(key);
              yield step;
            }
          }
        }
      }

      const nexts = nextType === 'strong' ? (strong.get(cur) ?? []) : weakNbrs(cur);
      for (const next of nexts) {
        if (path.includes(next) || overlapsPath(path, next)) continue;
        yield* dfs([...path, next], nextType === 'strong' ? 'weak' : 'strong');
        if (budget <= 0) return;
      }
    }

    yield* dfs([start], 'strong');
    if (budget <= 0) return;
  }
}

/** double-strong discontinuity at the start: the start node is TRUE */
function loopRule2(
  g: Grid,
  nodes: GNode[],
  path: number[],
  label: (n: number) => string
): Step | null {
  const start = nodes[path[0]];
  const chain = path.map(label).join(' → ');
  if (start.cells.length === 1) {
    return {
      tech: 'GROUPED_NICE_LOOP',
      labels: { primary: tr`the loop, with grouped nodes` },
      placements: [{ cell: start.cells[0], digit: start.digit }],
      eliminations: [],
      primary: path.flatMap((n) => nodes[n].cells.map((cell) => ({ cell, digit: nodes[n].digit }))),
      links: alternatingLinks(nodeCds(nodes, path), 'strong'),
      description: tr`Grouped Nice Loop: ${chain} closes with two strong links at the start: denying it forces it, so it is placed.`
    };
  }
  const inPath = new Set(path.flatMap((n) => nodes[n].cells.map((c) => c * 9 + nodes[n].digit - 1)));
  const elims: CellDigit[] = [];
  for (let c = 0; c < 81; c++) {
    if (g.values[c] !== 0 || !(g.cands[c] & bit(start.digit))) continue;
    if (inPath.has(c * 9 + start.digit - 1)) continue;
    if (start.cells.every((sc) => sees(c, sc))) elims.push({ cell: c, digit: start.digit });
  }
  if (!elims.length) return null;
  return {
    tech: 'GROUPED_NICE_LOOP',
    labels: { primary: tr`the loop, with grouped nodes` },
    placements: [],
    eliminations: elims,
    primary: path.flatMap((n) => nodes[n].cells.map((cell) => ({ cell, digit: nodes[n].digit }))),
    links: alternatingLinks(nodeCds(nodes, path), 'strong'),
    description: tr`Grouped Nice Loop: ${chain} closes with two strong links at the start group, so the digit lives there and falls from every cell seeing the whole group.`
  };
}

/** continuous loop: eliminate along every weak link */
function loopRule1(
  g: Grid,
  nodes: GNode[],
  path: number[],
  coveredByPath: (path: number[], cell: number, digit: number) => boolean,
  label: (n: number) => string
): Step | null {
  const elims: CellDigit[] = [];
  const seen = new Set<string>();
  const add = (cell: number, digit: number) => {
    const key = `${cell}-${digit}`;
    if (!seen.has(key)) {
      seen.add(key);
      elims.push({ cell, digit });
    }
  };
  for (let i = 1; i < path.length; i += 2) {
    const U = nodes[path[i]];
    const V = nodes[path[(i + 1) % path.length]];
    if (U.digit !== V.digit) {
      // same-cell weak link between two candidates of one cell
      const cell = U.cells[0];
      for (const d of digitsOf(g.cands[cell])) {
        if (d !== U.digit && d !== V.digit) add(cell, d);
      }
    } else {
      const d = U.digit;
      for (let c = 0; c < 81; c++) {
        if (g.values[c] !== 0 || !(g.cands[c] & bit(d))) continue;
        if (coveredByPath(path, c, d)) continue;
        if (U.cells.every((u) => sees(c, u)) && V.cells.every((v) => sees(c, v))) add(c, d);
      }
    }
  }
  if (!elims.length) return null;
  return {
    tech: 'GROUPED_NICE_LOOP',
    labels: { primary: tr`the loop, with grouped nodes` },
    placements: [],
    eliminations: elims,
    primary: path.flatMap((n) => nodes[n].cells.map((cell) => ({ cell, digit: nodes[n].digit }))),
    links: alternatingLinks(nodeCds(nodes, path), 'weak'),
    description: tr`Grouped Nice Loop: the continuous loop ${path.map(label).join(' → ')} alternates perfectly; every weak link has exactly one true side, clearing candidates along it.`
  };
}
