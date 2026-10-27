// User preferences, persisted to localStorage. Kept separate from the game
// store so changing a setting never touches game state or undo history.
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { Tech } from '../engine/ratings';
import {
  MasterySettings,
  Familiarity,
  DEFAULT_MASTERY_SETTINGS,
  buildPresetStatus,
  sanitizeMasterySettings
} from '../content/mastery';

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

export const DEFAULT_PALETTE: readonly string[] = [
  '#e05563', // 1: coral / red
  '#e8934a', // 2: orange
  '#e6c74c', // 3: yellow
  '#67b96a', // 4: green
  '#4fc1b0', // 5: teal
  '#5b8fe0', // 6: blue
  '#9b74d8', // 7: purple
  '#d873b8', // 8: pink
  '#9aa3b5'  // 9: slate
];

const msg = (s: string) => s;

export interface PalettePreset {
  id: string;
  name: string;
  colors: readonly string[];
}

export const PALETTE_PRESETS: readonly PalettePreset[] = [
  {
    id: 'default',
    name: msg('Classic'),
    colors: DEFAULT_PALETTE
  },
  {
    id: 'vivid',
    name: msg('Vivid'),
    colors: [
      '#ef4444',
      '#f97316',
      '#eab308',
      '#22c55e',
      '#06b6d4',
      '#3b82f6',
      '#a855f7',
      '#ec4899',
      '#64748b'
    ]
  },
  {
    id: 'pastel',
    name: msg('Pastel'),
    colors: [
      '#f87171',
      '#fb923c',
      '#facc15',
      '#4ade80',
      '#2dd4bf',
      '#60a5fa',
      '#c084fc',
      '#f472b6',
      '#94a3b8'
    ]
  },
  {
    id: 'colorblind',
    name: msg('Colorblind Friendly'),
    colors: [
      '#d55e00',
      '#e69f00',
      '#f0e442',
      '#009e73',
      '#56b4e9',
      '#0072b2',
      '#cc79a7',
      '#882255',
      '#7f7f7f'
    ]
  }
];

export type MarkLayer = 'center' | 'corner';

export type Theme = 'dark' | 'light' | 'rose' | 'forest' | 'cyberpunk' | 'chess' | 'aquarium' | 'midnight' | 'retro';

export interface ThemeMeta {
  id: Theme;
  name: string;
  description: string;
  primaryColor: string;
  surfaceColor: string;
  textColor: string;
}

export const THEMES: readonly ThemeMeta[] = [
  {
    id: 'dark',
    name: msg('Dark'),
    description: msg('Clean dark slate with balanced high-contrast accents'),
    primaryColor: '#6366f1',
    surfaceColor: '#1e2230',
    textColor: '#e6edf3'
  },
  {
    id: 'light',
    name: msg('Daylight'),
    description: msg('Bright paper aesthetic with crisp readable typography'),
    primaryColor: '#4f46e5',
    surfaceColor: '#f1f5f9',
    textColor: '#0f172a'
  },
  {
    id: 'rose',
    name: msg('Rosé'),
    description: msg('Warm dusty rose tones with soft ambient contrast'),
    primaryColor: '#e11d48',
    surfaceColor: '#2b1d24',
    textColor: '#fdf2f8'
  },
  {
    id: 'forest',
    name: msg('Forest'),
    description: msg('Deep woodland pine and moss greens for focused solving'),
    primaryColor: '#10b981',
    surfaceColor: '#14231c',
    textColor: '#ecfdf5'
  },
  {
    id: 'cyberpunk',
    name: msg('Cyberpunk'),
    description: msg('High-tech neon cyan and vivid electric magenta on obsidian'),
    primaryColor: '#00f0ff',
    surfaceColor: '#120f24',
    textColor: '#fcee0a'
  },
  {
    id: 'chess',
    name: msg('Chess'),
    description: msg('Classic wooden tournament board with warm ivory and espresso'),
    primaryColor: '#ffffff',
    surfaceColor: '#121316',
    textColor: '#f4f5f7'
  },
  {
    id: 'aquarium',
    name: msg('Aquarium'),
    description: msg('Deep oceanic abyss with luminous seafoam and vibrant coral'),
    primaryColor: '#2dd4bf',
    surfaceColor: '#0b1928',
    textColor: '#e0f2fe'
  },
  {
    id: 'midnight',
    name: msg('Midnight'),
    description: msg('True pure-black AMOLED with sapphire highlights'),
    primaryColor: '#38bdf8',
    surfaceColor: '#000000',
    textColor: '#f8fafc'
  },
  {
    id: 'retro',
    name: msg('Terminal'),
    description: msg('Phosphor green CRT monochrome with vintage retro glow'),
    primaryColor: '#22c55e',
    surfaceColor: '#0c160c',
    textColor: '#4ade80'
  }
];

export const THEME_IDS: readonly Theme[] = THEMES.map((t) => t.id);

/** typefaces already on the device: nothing to download, works offline */
export type Font = 'classic' | 'rounded' | 'serif' | 'mono' | 'hand';

/** the app's language: the interface, the hints and every other sentence the
 *  engine writes, and the Learn section (docs/translations.md) */
export type Lang = 'en' | 'nb' | 'es';

/** the device's language, when it is one we have */
export function deviceLang(): Lang {
  const tag = (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase();
  if (tag.startsWith('nb') || tag.startsWith('nn') || tag.startsWith('no')) return 'nb';
  if (tag.startsWith('es')) return 'es';
  return 'en';
}

export type LayoutMode = 'auto' | 'desktop' | 'mobile';
export type NumpadInputMode = 'cellFirst' | 'digitFirst';

interface Settings {
  /** UI layout mode: auto-detect by screen/pointer, or force desktop / mobile */
  layoutMode: LayoutMode;
  /** numpad interaction model: cell-first (tap numbers to highlight) or digit-first (select number first, then tap cells) */
  numpadInputMode: NumpadInputMode;
  /** the app's language */
  lang: Lang;
  /** board theme: dark, daylight or rosé */
  theme: Theme;
  /** typeface of the app, including board digits, keypad and UI text */
  font: Font;
  /** tint the row/column/box of a single selected cell */
  highlightPeers: boolean;
  /** tint all cells holding the same digit as the selection */
  highlightSameDigit: boolean;
  /** show an entered digit in red while it repeats within its row, column
   *  or box: a rule check, not a solution lookup, so it never counts as help */
  showConflicts: boolean;
  showTimer: boolean;
  /** when auto candidates are switched off, write the current candidate
   *  state into pencil marks so play continues seamlessly */
  autoOffMaterialize: boolean;
  /** which mark layer receives those candidates. Centre is the convention
   *  for exhaustive candidate lists; corner puts them in the digit-bound
   *  3×3 layout that hint highlights align with */
  materializeLayer: MarkLayer;
  /** practice mode jumps straight to the position where the chosen
   *  technique is the next step; off = play the puzzle from the start */
  practiceFastForward: boolean;
  /** the one-time "keep your candidates?" prompt on first auto-off has been
   *  answered */
  autoOffPromptDone: boolean;
  /** hide the difficulty badge and rating while playing (revealed on solve) —
   *  knowing a puzzle is rated 1200 tells you to expect advanced techniques */
  hideRating: boolean;
  /** show Nutella, the resident poodle, beneath the board */
  showPoodle: boolean;
  /** draw a thin frame around highlighted candidates (the held digit's
   *  pencil occurrences) — bold + colour alone can be hard to spot */
  frameHighlights: boolean;
  /** ring every unsolved cell whose marks leave exactly two candidates:
   *  where wings, chains and remote pairs begin, what a stuck player scans
   *  for. A view of the player's own marks (or of the auto candidates),
   *  never of the solution, so it never counts as help; drawn only while
   *  the marks are complete (src/state/bivalue.ts) */
  highlightBivalue: boolean;
  /** two palette colours are two sets of cells, and a line under the board
   *  counts them, says what each still needs and whether they must hold the
   *  same digits (src/engine/sets.ts, src/ui/SetTracker.tsx). A view of the
   *  player's own board, never of the solution, so it never counts as help */
  setTracker: boolean;
  /** the palette indices of the two sets (0..8; key n paints index n - 1) */
  setColors: [number, number];
  /** the first assist in a clean game asks first: it says what the button
   *  does (touch screens have no hover) and guards against a stray tap */
  confirmAssist: boolean;
  /** hints, Steps, Scan, the why-not proofs and the credit of a move may use
   *  the uniqueness family (unique rectangles, BUG+1 and their kin). Off,
   *  they find another way, as many solvers prefer: uniqueness leans on the
   *  puzzle having exactly one solution. The rating is HoDoKu's either way */
  useUniqueness: boolean;
  /** give each digit 1 to 9 a slight colour of its own on the board */
  digitTints: boolean;
  /** how much of the digit's own hue is mixed in, in percent */
  tintStrength: number;
  /** count this device's plays, offline ones included (src/state/telemetry.ts):
   *  the queue it keeps and the day it began exist only while this is on */
  countPlays: boolean;
  /** the win screen has pointed at that switch, once */
  countPlaysAsked: boolean;
  /** this device sends no counted lines at all (src/state/telemetry.ts): for
   *  the owner's and testers' devices, and for anyone who would rather not
   *  be counted. Kept at the player's request, like every setting */
  dontCount: boolean;

  /** 9 custom palette colours for cell colouring (palette indices 0..8 corresponding to digits 1..9) */
  customPalette: string[];
  setPaletteColor: (index: number, color: string) => void;
  setCustomPalette: (palette: string[]) => void;
  resetPalette: () => void;

  mastery: MasterySettings;
  setTechniqueFamiliarity: (tech: Tech, familiarity: Familiarity) => void;
  setTechniqueFamiliarityBatch: (techs: Tech[], familiarity: Familiarity) => void;
  applyMasteryPreset: (presetId: string) => void;
  setIncludeLearning: (include: boolean) => void;

  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  set: (p: Partial<Omit<Settings, 'toggleTheme' | 'set'>>) => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      layoutMode: 'auto',
      numpadInputMode: 'cellFirst',
      lang: deviceLang(),
      theme: 'dark',
      font: 'classic',
      highlightPeers: true,
      highlightSameDigit: true,
      showConflicts: true,
      showTimer: true,
      autoOffMaterialize: true,
      materializeLayer: 'corner',
      practiceFastForward: true,
      autoOffPromptDone: false,
      hideRating: false,
      showPoodle: false,
      frameHighlights: true,
      highlightBivalue: false,
      setTracker: false,
      // blue and orange: keys 6 and 2 in Colour mode
      setColors: [5, 1],
      confirmAssist: true,
      useUniqueness: true,
      digitTints: false,
      tintStrength: 50,
      countPlays: false,
      countPlaysAsked: false,
      dontCount: false,
      customPalette: [...DEFAULT_PALETTE],
      setPaletteColor: (index, color) =>
        set((s) => {
          const current = s.customPalette && s.customPalette.length === 9 ? s.customPalette : [...DEFAULT_PALETTE];
          const next = [...current];
          next[index] = color;
          return { customPalette: next };
        }),
      setCustomPalette: (palette) => set({ customPalette: [...palette] }),
      resetPalette: () => set({ customPalette: [...DEFAULT_PALETTE] }),
      mastery: { ...DEFAULT_MASTERY_SETTINGS },
      setTechniqueFamiliarity: (tech, familiarity) =>
        set((s) => ({
          mastery: {
            ...s.mastery,
            setupCompleted: true,
            status: {
              ...(s.mastery?.status ?? {}),
              [tech]: familiarity
            }
          }
        })),
      setTechniqueFamiliarityBatch: (techs, familiarity) =>
        set((s) => {
          const newStatus = { ...(s.mastery?.status ?? {}) };
          for (const t of techs) {
            newStatus[t] = familiarity;
          }
          return {
            mastery: {
              ...s.mastery,
              setupCompleted: true,
              status: newStatus
            }
          };
        }),
      applyMasteryPreset: (presetId) =>
        set((s) => ({
          mastery: {
            ...s.mastery,
            setupCompleted: true,
            activePreset: presetId,
            status: buildPresetStatus(presetId)
          }
        })),
      setIncludeLearning: (include) =>
        set((s) => ({
          mastery: {
            ...s.mastery,
            includeLearning: include
          }
        })),
      toggleTheme: () =>
        set((s) => {
          const idx = THEMES.findIndex((item) => item.id === s.theme);
          const next = THEMES[(idx + 1) % THEMES.length].id;
          return { theme: next };
        }),
      setTheme: (theme) => set({ theme }),
      set: (p) => set(p)
    }),
    {
      name: 'sudokui-settings-v1',
      storage: createJSONStorage(() => safeLocalStorage),
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== 'object' || Array.isArray(persisted)) {
          return current;
        }
        const p = persisted as Partial<Settings>;
        return {
          ...current,
          ...p,
          customPalette:
            Array.isArray(p.customPalette) && p.customPalette.length === 9
              ? p.customPalette
              : current.customPalette ?? [...DEFAULT_PALETTE],
          mastery: sanitizeMasterySettings(p.mastery)
        };
      }
    }
  )
);

// A setting changed in another tab, or in the installed app's window, is
// taken here too, so a switch such as leaving the device out of the counts
// holds in every open window at once, and this window's next write of its
// settings does not put the old value back
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'sudokui-settings-v1') void useSettings.persist.rehydrate();
  });
}
