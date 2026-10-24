import { create } from 'zustand';
import {
  findAllPatternInstances,
  ScanResult,
  ScanOptions,
  PatternInstance
} from '../engine/scanner';
import { Tech, Category, TECHS } from '../engine/ratings';
import { useGame, contractGrid, CellState, MarkContract } from './gameStore';
import { bit } from '../engine/board';
import { ReasoningConceptId } from '../content/concepts';

export type ScanGrouping = 'technique' | 'outcome';

export interface ScannerFilter {
  query: string;
  category: Category | 'all';
  concept: ReasoningConceptId | 'all';
  useUniqueness: boolean;
  includeDisabled: boolean;
  discoveryMode: boolean;
  lookForTech?: Tech | null;
}

export interface PatternScannerState {
  isOpen: boolean;
  isScanning: boolean;
  scanResult: ScanResult | null;
  selectedInstanceId: string | null;
  boardFingerprintAtScan: string | null;
  isStale: boolean;
  groupBy: ScanGrouping;
  expandedTechs: Record<string, boolean>;
  expandedOutcomes: Record<string, boolean>;
  filter: ScannerFilter;

  // Actions
  openScanner: (options?: { lookForTech?: Tech | null; autoScan?: boolean }) => void;
  closeScanner: () => void;
  runScan: (options?: Partial<ScanOptions>) => void;
  selectInstance: (instanceId: string | null) => void;
  setGroupBy: (groupBy: ScanGrouping) => void;
  toggleTechExpanded: (tech: Tech) => void;
  toggleOutcomeExpanded: (conclusionKey: string) => void;
  setFilter: (filter: Partial<ScannerFilter>) => void;
  resetFilter: () => void;
  checkStaleness: () => void;
  applySelectedDeduction: () => boolean;
  toggleDiscoveryMode: () => void;
  setDiscoveryMode: (enabled: boolean) => void;
}

/** Compute a fast fingerprint of the grid's values and candidates to detect board changes */
export function getBoardFingerprint(
  cells: CellState[],
  autoCandidates: boolean,
  markContract: MarkContract
): string {
  const parts: string[] = [];
  for (let i = 0; i < 81; i++) {
    const c = cells[i];
    parts.push(`${c.value}:${c.corner}:${c.center}:${c.excluded}`);
  }
  return `${autoCandidates ? 1 : 0}:${markContract}:${parts.join(';')}`;
}

const DEFAULT_FILTER: ScannerFilter = {
  query: '',
  category: 'all',
  concept: 'all',
  useUniqueness: true,
  includeDisabled: false,
  discoveryMode: false,
  lookForTech: null
};

export const usePatternScanner = create<PatternScannerState>((set, get) => ({
  isOpen: false,
  isScanning: false,
  scanResult: null,
  selectedInstanceId: null,
  boardFingerprintAtScan: null,
  isStale: false,
  groupBy: 'technique',
  expandedTechs: {},
  expandedOutcomes: {},
  filter: { ...DEFAULT_FILTER },

  openScanner: (options) => {
    const current = get();
    const gameState = useGame.getState();
    const currentFp = getBoardFingerprint(
      gameState.cells,
      gameState.autoCandidates,
      gameState.markContract
    );

    const newFilter = {
      ...current.filter,
      lookForTech: options?.lookForTech ?? null
    };

    set({
      isOpen: true,
      filter: newFilter
    });

    // Auto-scan if never scanned before, or if the board position has changed
    const shouldScan =
      options?.autoScan !== false &&
      (!current.scanResult || current.boardFingerprintAtScan !== currentFp);

    if (shouldScan) {
      get().runScan();
    } else {
      get().checkStaleness();
    }
  },

  closeScanner: () => {
    // Clear any active pattern highlight on the board
    const gameState = useGame.getState();
    if (gameState.hint) {
      gameState.dismissHint();
    }
    set({
      isOpen: false,
      selectedInstanceId: null
    });
  },

  runScan: (options) => {
    const gameState = useGame.getState();
    const cells = gameState.cells;
    const auto = gameState.autoCandidates;
    const contract = gameState.markContract;
    const currentFp = getBoardFingerprint(cells, auto, contract);

    set({ isScanning: true });

    // Mark game as assisted since scanning reveals logic for the current position
    gameState.markAssisted();

    // Use setTimeout so the UI can paint the scanning status/spinner if scanning takes non-trivial time
    setTimeout(() => {
      try {
        const grid = contractGrid(cells, auto, contract);
        const filter = get().filter;

        const scanOptions: ScanOptions = {
          useUniqueness: filter.useUniqueness,
          includeDisabled: filter.includeDisabled,
          ...(filter.lookForTech ? { techniques: [filter.lookForTech] } : {}),
          ...options
        };

        const result = findAllPatternInstances(grid, scanOptions);

        // Keep selected instance if it still exists in the new scan, otherwise deselect
        const currentSelectedId = get().selectedInstanceId;
        const stillExists = currentSelectedId
          ? result.instances.some((inst) => inst.id === currentSelectedId)
          : false;

        if (!stillExists && currentSelectedId) {
          gameState.dismissHint();
        }

        // Expand technique/outcome groups that have findings by default
        const expandedTechs: Record<string, boolean> = {};
        for (const tech of Object.keys(result.byTech)) {
          expandedTechs[tech] = true;
        }

        const expandedOutcomes: Record<string, boolean> = {};
        for (const outcome of Object.keys(result.byConclusion)) {
          expandedOutcomes[outcome] = true;
        }

        set({
          isScanning: false,
          scanResult: result,
          selectedInstanceId: stillExists ? currentSelectedId : null,
          boardFingerprintAtScan: currentFp,
          isStale: false,
          expandedTechs,
          expandedOutcomes
        });
      } catch (err) {
        console.error('Pattern scan failed:', err);
        set({ isScanning: false });
      }
    }, 10);
  },

  selectInstance: (instanceId) => {
    const gameState = useGame.getState();

    if (!instanceId) {
      set({ selectedInstanceId: null });
      gameState.dismissHint();
      return;
    }

    const scanResult = get().scanResult;
    const instance = scanResult?.instances.find((i) => i.id === instanceId);
    if (!instance) return;

    set({ selectedInstanceId: instanceId });
    gameState.showStep(instance.step);
  },

  setGroupBy: (groupBy) => {
    set({ groupBy });
  },

  toggleTechExpanded: (tech) => {
    set((state) => ({
      expandedTechs: {
        ...state.expandedTechs,
        [tech]: !state.expandedTechs[tech]
      }
    }));
  },

  toggleOutcomeExpanded: (conclusionKey) => {
    set((state) => ({
      expandedOutcomes: {
        ...state.expandedOutcomes,
        [conclusionKey]: !state.expandedOutcomes[conclusionKey]
      }
    }));
  },

  setFilter: (filterUpdate) => {
    set((state) => ({
      filter: { ...state.filter, ...filterUpdate }
    }));
  },

  resetFilter: () => {
    set({ filter: { ...DEFAULT_FILTER } });
  },

  checkStaleness: () => {
    const gameState = useGame.getState();
    const currentFp = getBoardFingerprint(
      gameState.cells,
      gameState.autoCandidates,
      gameState.markContract
    );
    const atScan = get().boardFingerprintAtScan;
    const isStale = atScan !== null && atScan !== currentFp;
    if (isStale !== get().isStale) {
      set({ isStale });
    }
  },

  applySelectedDeduction: () => {
    const selectedId = get().selectedInstanceId;
    const scanResult = get().scanResult;
    if (!selectedId || !scanResult) return false;

    const instance = scanResult.instances.find((i) => i.id === selectedId);
    if (!instance) return false;

    const gameState = useGame.getState();
    const cells = gameState.cells;

    // Apply placements and eliminations to board
    const newCells = cells.map((c) => ({ ...c }));
    for (const { cell, digit } of instance.step.eliminations) {
      newCells[cell].excluded |= bit(digit);
      newCells[cell].corner &= ~bit(digit);
      newCells[cell].center &= ~bit(digit);
    }
    for (const { cell, digit } of instance.step.placements) {
      newCells[cell].value = digit;
      newCells[cell].corner = 0;
      newCells[cell].center = 0;
    }

    useGame.setState({
      cells: newCells,
      history: [...gameState.history, cells],
      future: [],
      errors: [],
      hint: null,
      hintStage: 'hidden'
    });

    // Rescan the new board state
    get().runScan();
    return true;
  },

  toggleDiscoveryMode: () => {
    set((state) => ({
      filter: {
        ...state.filter,
        discoveryMode: !state.filter.discoveryMode
      }
    }));
  },

  setDiscoveryMode: (enabled) => {
    set((state) => ({
      filter: {
        ...state.filter,
        discoveryMode: enabled
      }
    }));
  }
}));
