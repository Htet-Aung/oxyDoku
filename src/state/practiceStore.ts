/**
 * Practice Store & Local Progress Tracking for Pattern Lab.
 *
 * Implements interactive practice state and local, non-competitive progress tracking.
 * Fulfills Section 3, 5, and 6:
 * - Manages focused vs mixed practice exercises.
 * - Interactive answer assembly (selected digit, cells, eliminations).
 * - Progressive hint stepping (levels 1–4).
 * - Local-first progress tracking (attempts, successes, hints used, struggling patterns).
 * - Zero timers, zero leaderboards, zero competitive ranking.
 * - Persisted locally to `sudokui-practice-v1`.
 */

import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(name) : null;
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(name, value);
    } catch {
      // ignore storage errors in restricted or quota-full environments
    }
  },
  removeItem: (name) => {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(name);
    } catch {
      // ignore
    }
  }
};
import { Tech, TECHS } from '../engine/ratings';
import { CellDigit, Step } from '../engine/steps';
import {
  UserPracticeAnswer,
  PracticeVerificationResult,
  verifyPracticeAnswer,
  extractBoardDeductions,
  BoardCellLike
} from '../engine/practiceVerifier';
import {
  ProgressiveHintStage,
  buildProgressiveHints
} from '../engine/progressiveHints';

export type PracticeMode = 'inactive' | 'focused' | 'mixed';
export type ExerciseState = 'idle' | 'answering' | 'submitted' | 'revealed';

export interface TechProgress {
  tech: Tech;
  studiedAt?: number;
  attempts: number;
  successes: number;
  hintsUsed: number;
  lastPracticedAt?: number;
}

export interface PracticeHistoryEntry {
  id: string;
  timestamp: number;
  tech: Tech;
  mode: PracticeMode;
  success: boolean;
  hintsUsed: number;
  matchedAlternative?: boolean;
}

export interface PracticeState {
  mode: PracticeMode;
  targetTech: Tech | null;
  mixedPool: Tech[];
  exerciseState: ExerciseState;
  targetStep: Step | null;
  allValidSteps: Step[];
  initialCells: BoardCellLike[] | null;
  currentHintLevel: 0 | 1 | 2 | 3 | 4;
  userAnswer: UserPracticeAnswer;
  lastResult: PracticeVerificationResult | null;

  // Local-first, non-competitive progress tracking
  trackingEnabled: boolean;
  progress: Partial<Record<Tech, TechProgress>>;
  history: PracticeHistoryEntry[];

  // Actions
  startFocusedPractice: (tech: Tech, targetStep: Step, allValidSteps?: Step[], initialCells?: BoardCellLike[]) => void;
  startMixedPractice: (mixedPool: Tech[], targetStep: Step, allValidSteps?: Step[], initialCells?: BoardCellLike[]) => void;
  syncBoardDeductions: (currentCells: BoardCellLike[], autoCandidates: boolean) => PracticeVerificationResult | null;
  setUserDigit: (digit: number | null) => void;
  toggleUserDigit: (digit: number) => void;
  setUserCells: (cells: number[]) => void;
  toggleUserCell: (cell: number) => void;
  setUserTech: (tech: Tech) => void;
  setUserElimination: (elim: CellDigit) => void;
  clearUserAnswer: () => void;
  requestNextHint: () => ProgressiveHintStage | null;
  submitAnswer: (activeSelection?: number[], currentCells?: BoardCellLike[], autoCandidates?: boolean) => PracticeVerificationResult | null;
  revealSolution: () => void;
  exitPractice: () => void;
  recordStudied: (tech: Tech) => void;
  clearProgress: () => void;
  setTrackingEnabled: (enabled: boolean) => void;
}

export const usePractice = create<PracticeState>()(
  persist(
    (set, get) => ({
      mode: 'inactive',
      targetTech: null,
      mixedPool: [],
      exerciseState: 'idle',
      targetStep: null,
      allValidSteps: [],
      initialCells: null,
      currentHintLevel: 0,
      userAnswer: { cells: [], digits: [] },
      lastResult: null,

      trackingEnabled: true,
      progress: {},
      history: [],

      startFocusedPractice: (tech, targetStep, allValidSteps = [], initialCells) =>
        set({
          mode: 'focused',
          targetTech: tech,
          mixedPool: [],
          exerciseState: 'answering',
          targetStep,
          allValidSteps: allValidSteps.length > 0 ? allValidSteps : [targetStep],
          initialCells: initialCells ? initialCells.map((c) => ({ ...c })) : null,
          currentHintLevel: 0,
          userAnswer: { tech, cells: [], digits: [] },
          lastResult: null
        }),

      startMixedPractice: (mixedPool, targetStep, allValidSteps = [], initialCells) =>
        set({
          mode: 'mixed',
          targetTech: null,
          mixedPool,
          exerciseState: 'answering',
          targetStep,
          allValidSteps: allValidSteps.length > 0 ? allValidSteps : [targetStep],
          initialCells: initialCells ? initialCells.map((c) => ({ ...c })) : null,
          currentHintLevel: 0,
          userAnswer: { cells: [], digits: [] },
          lastResult: null
        }),

      setUserDigit: (digit) =>
        set((s) => ({
          userAnswer: {
            ...s.userAnswer,
            digit: digit ?? undefined,
            digits: digit ? [digit] : []
          }
        })),

      toggleUserDigit: (digit) =>
        set((s) => {
          const current = s.userAnswer.digits ?? [];
          const next = current.includes(digit)
            ? current.filter((d) => d !== digit)
            : [...current, digit].sort((a, b) => a - b);
          return {
            userAnswer: {
              ...s.userAnswer,
              digit: next[0],
              digits: next
            }
          };
        }),

      setUserCells: (cells) =>
        set((s) => ({
          userAnswer: {
            ...s.userAnswer,
            cells: [...cells].sort((a, b) => a - b)
          }
        })),

      toggleUserCell: (cell) =>
        set((s) => {
          const current = s.userAnswer.cells ?? [];
          const next = current.includes(cell)
            ? current.filter((c) => c !== cell)
            : [...current, cell].sort((a, b) => a - b);
          return {
            userAnswer: {
              ...s.userAnswer,
              cells: next
            }
          };
        }),

      setUserTech: (tech) =>
        set((s) => ({
          userAnswer: {
            ...s.userAnswer,
            tech
          }
        })),

      setUserElimination: (elim) =>
        set((s) => {
          const current = s.userAnswer.eliminations ?? [];
          const exists = current.some((e) => e.cell === elim.cell && e.digit === elim.digit);
          const next = exists
            ? current.filter((e) => !(e.cell === elim.cell && e.digit === elim.digit))
            : [...current, elim];
          return {
            userAnswer: {
              ...s.userAnswer,
              eliminations: next
            }
          };
        }),

      clearUserAnswer: () =>
        set((s) => ({
          userAnswer: {
            tech: s.mode === 'focused' ? s.targetTech ?? undefined : undefined,
            cells: [],
            digits: []
          },
          lastResult: null
        })),

      requestNextHint: () => {
        const s = get();
        if (!s.targetStep) return null;
        const nextLevel = Math.min(s.currentHintLevel + 1, 4) as 1 | 2 | 3 | 4;
        const hints = buildProgressiveHints(s.targetStep);
        const stage = hints.stages[nextLevel - 1];

        set({
          currentHintLevel: nextLevel,
          exerciseState: nextLevel === 4 ? 'revealed' : s.exerciseState
        });

        // Update progress hint count if tracking enabled
        if (s.trackingEnabled && s.targetStep) {
          const tech = s.targetStep.tech;
          const curr = s.progress[tech] ?? {
            tech,
            attempts: 0,
            successes: 0,
            hintsUsed: 0
          };
          set((state) => ({
            progress: {
              ...state.progress,
              [tech]: {
                ...curr,
                hintsUsed: curr.hintsUsed + 1
              }
            }
          }));
        }

        return stage;
      },

      syncBoardDeductions: (currentCells, autoCandidates) => {
        const s = get();
        if (s.mode === 'inactive' || !s.targetStep || !s.initialCells) return null;

        const deductions = extractBoardDeductions(s.initialCells, currentCells, autoCandidates);

        // If no moves made yet on the board
        if (deductions.eliminations.length === 0 && deductions.placements.length === 0) {
          if (s.lastResult?.isCorrect) return s.lastResult;
          // Clear previous board move feedback if user undid back to start
          if (s.userAnswer.eliminations?.length || s.userAnswer.placements?.length) {
            set((prev) => ({
              userAnswer: {
                ...prev.userAnswer,
                eliminations: [],
                placements: []
              },
              lastResult: null
            }));
          }
          return null;
        }

        const answer: UserPracticeAnswer = {
          ...s.userAnswer,
          tech: s.mode === 'focused' ? s.targetTech ?? undefined : s.userAnswer.tech,
          eliminations: deductions.eliminations,
          placements: deductions.placements,
          digits: deductions.eliminations.length > 0
            ? [...new Set(deductions.eliminations.map((e) => e.digit))]
            : deductions.placements.length > 0
              ? [...new Set(deductions.placements.map((p) => p.digit))]
              : s.userAnswer.digits
        };

        const result = verifyPracticeAnswer(answer, s.targetStep, s.allValidSteps);

        set({
          userAnswer: answer,
          lastResult: result,
          exerciseState: result.isCorrect ? 'submitted' : s.exerciseState
        });

        // Record progress if exact or alternative match
        if (result.isCorrect && s.trackingEnabled && s.exerciseState !== 'submitted') {
          const evaluatedTech = result.matchedStep?.tech ?? s.targetStep.tech;
          const curr = s.progress[evaluatedTech] ?? {
            tech: evaluatedTech,
            attempts: 0,
            successes: 0,
            hintsUsed: s.currentHintLevel
          };

          const updatedProgress: TechProgress = {
            ...curr,
            attempts: curr.attempts + 1,
            successes: curr.successes + 1,
            lastPracticedAt: Date.now()
          };

          const newHistoryEntry: PracticeHistoryEntry = {
            id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: Date.now(),
            tech: evaluatedTech,
            mode: s.mode,
            success: true,
            hintsUsed: s.currentHintLevel,
            matchedAlternative: result.status === 'alternative'
          };

          set((state) => ({
            progress: {
              ...state.progress,
              [evaluatedTech]: updatedProgress
            },
            history: [newHistoryEntry, ...state.history].slice(0, 50)
          }));
        }

        return result;
      },

      submitAnswer: (activeSelection, currentCells, autoCandidates) => {
        const s = get();
        if (!s.targetStep) return null;

        // If user cells empty, fall back to active board selection if passed
        let cells = s.userAnswer.cells;
        if ((!cells || cells.length === 0) && activeSelection && activeSelection.length > 0) {
          cells = [...activeSelection].sort((a, b) => a - b);
        }

        let elims = s.userAnswer.eliminations;
        let places = s.userAnswer.placements;
        if (s.initialCells && currentCells && autoCandidates !== undefined) {
          const deductions = extractBoardDeductions(s.initialCells, currentCells, autoCandidates);
          if (deductions.eliminations.length > 0) elims = deductions.eliminations;
          if (deductions.placements.length > 0) places = deductions.placements;
        }

        const answerToVerify: UserPracticeAnswer = {
          ...s.userAnswer,
          cells,
          eliminations: elims,
          placements: places
        };

        const result = verifyPracticeAnswer(
          answerToVerify,
          s.targetStep,
          s.allValidSteps
        );

        set({
          userAnswer: answerToVerify,
          lastResult: result,
          exerciseState: 'submitted'
        });

        // Record progress if enabled
        if (s.trackingEnabled) {
          const evaluatedTech = result.matchedStep?.tech ?? s.targetStep.tech;
          const curr = s.progress[evaluatedTech] ?? {
            tech: evaluatedTech,
            attempts: 0,
            successes: 0,
            hintsUsed: s.currentHintLevel
          };

          const updatedProgress: TechProgress = {
            ...curr,
            attempts: curr.attempts + 1,
            successes: result.isCorrect ? curr.successes + 1 : curr.successes,
            lastPracticedAt: Date.now()
          };

          const newHistoryEntry: PracticeHistoryEntry = {
            id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: Date.now(),
            tech: evaluatedTech,
            mode: s.mode,
            success: result.isCorrect,
            hintsUsed: s.currentHintLevel,
            matchedAlternative: result.status === 'alternative'
          };

          set((state) => ({
            progress: {
              ...state.progress,
              [evaluatedTech]: updatedProgress
            },
            history: [newHistoryEntry, ...state.history].slice(0, 50)
          }));
        }

        return result;
      },

      revealSolution: () =>
        set((s) => ({
          currentHintLevel: 4,
          exerciseState: 'revealed'
        })),

      exitPractice: () =>
        set({
          mode: 'inactive',
          targetTech: null,
          exerciseState: 'idle',
          targetStep: null,
          allValidSteps: [],
          initialCells: null,
          currentHintLevel: 0,
          userAnswer: { cells: [], digits: [] },
          lastResult: null
        }),

      recordStudied: (tech) =>
        set((s) => {
          if (!s.trackingEnabled) return s;
          const curr = s.progress[tech] ?? {
            tech,
            attempts: 0,
            successes: 0,
            hintsUsed: 0
          };
          return {
            progress: {
              ...s.progress,
              [tech]: {
                ...curr,
                studiedAt: Date.now()
              }
            }
          };
        }),

      clearProgress: () =>
        set({
          progress: {},
          history: []
        }),

      setTrackingEnabled: (enabled) =>
        set({
          trackingEnabled: enabled
        })
    }),
    {
      name: 'sudokui-practice-v1',
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (s) => ({
        trackingEnabled: s.trackingEnabled,
        progress: s.progress,
        history: s.history
      }),
      merge: (persisted, current) => {
        const sanitized = sanitizePracticePersistedState(persisted);
        return {
          ...current,
          ...sanitized
        };
      }
    }
  )
);

/** Sanitize and normalize potentially corrupted or outdated practice store data from localStorage */
export function sanitizePracticePersistedState(raw: unknown): {
  trackingEnabled: boolean;
  progress: Partial<Record<Tech, TechProgress>>;
  history: PracticeHistoryEntry[];
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { trackingEnabled: true, progress: {}, history: [] };
  }
  const obj = raw as Record<string, unknown>;
  const trackingEnabled = typeof obj.trackingEnabled === 'boolean' ? obj.trackingEnabled : true;
  const cleanProgress: Partial<Record<Tech, TechProgress>> = {};
  if (obj.progress && typeof obj.progress === 'object' && !Array.isArray(obj.progress)) {
    for (const [k, v] of Object.entries(obj.progress as Record<string, unknown>)) {
      if (
        Object.prototype.hasOwnProperty.call(TECHS, k) &&
        v &&
        typeof v === 'object' &&
        !Array.isArray(v)
      ) {
        const entry = v as Record<string, unknown>;
        const attempts =
          typeof entry.attempts === 'number' && Number.isFinite(entry.attempts) && entry.attempts >= 0
            ? entry.attempts
            : 0;
        const successes =
          typeof entry.successes === 'number' && Number.isFinite(entry.successes) && entry.successes >= 0
            ? Math.min(entry.successes, attempts)
            : 0;
        const hintsUsed =
          typeof entry.hintsUsed === 'number' && Number.isFinite(entry.hintsUsed) && entry.hintsUsed >= 0
            ? entry.hintsUsed
            : 0;
        cleanProgress[k as Tech] = {
          tech: k as Tech,
          attempts,
          successes,
          hintsUsed,
          ...(typeof entry.lastPracticedAt === 'number' ? { lastPracticedAt: entry.lastPracticedAt } : {}),
          ...(typeof entry.studiedAt === 'number' ? { studiedAt: entry.studiedAt } : {})
        };
      }
    }
  }
  const cleanHistory: PracticeHistoryEntry[] = [];
  if (Array.isArray(obj.history)) {
    for (const item of obj.history) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as Record<string, unknown>).id === 'string' &&
        typeof (item as Record<string, unknown>).tech === 'string' &&
        Object.prototype.hasOwnProperty.call(TECHS, (item as Record<string, unknown>).tech as string)
      ) {
        const h = item as Record<string, unknown>;
        cleanHistory.push({
          id: h.id as string,
          timestamp: typeof h.timestamp === 'number' ? h.timestamp : 0,
          tech: h.tech as Tech,
          mode: h.mode === 'mixed' ? 'mixed' : 'focused',
          success: Boolean(h.success),
          hintsUsed: typeof h.hintsUsed === 'number' ? h.hintsUsed : 0,
          ...(typeof h.matchedAlternative === 'boolean' ? { matchedAlternative: h.matchedAlternative } : {})
        });
      }
    }
  }
  return {
    trackingEnabled,
    progress: cleanProgress,
    history: cleanHistory.slice(0, 50)
  };
}

/** Get techniques where the user repeatedly struggles (low success or high hint usage) */
export function getStrugglingTechniques(
  progress: Partial<Record<Tech, TechProgress>>
): Tech[] {
  const struggling: Tech[] = [];
  for (const tech of Object.keys(progress) as Tech[]) {
    const entry = progress[tech];
    if (!entry) continue;
    // Considered struggling if attempted at least twice with < 60% success or > 2 hints average
    if (entry.attempts >= 2) {
      const successRate = entry.successes / entry.attempts;
      const avgHints = entry.hintsUsed / entry.attempts;
      if (successRate < 0.6 || avgHints >= 2) {
        struggling.push(tech);
      }
    }
  }
  return struggling;
}

/** Get techniques the user has successfully practiced */
export function getProficientTechniques(
  progress: Partial<Record<Tech, TechProgress>>
): Tech[] {
  const proficient: Tech[] = [];
  for (const tech of Object.keys(progress) as Tech[]) {
    const entry = progress[tech];
    if (!entry) continue;
    if (entry.attempts >= 2 && entry.successes / entry.attempts >= 0.75) {
      proficient.push(tech);
    }
  }
  return proficient;
}
