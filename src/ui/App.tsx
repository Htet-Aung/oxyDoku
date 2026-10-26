// App shell: top bar (brand, difficulty/score, timer, quick toggles), the
// board + side panel layout, global keyboard handling, dialog routing,
// toast display and the first-visit bootstrap game.
import React, { Suspense, useEffect, useState, useRef } from 'react';
import { SLOP_PX } from './touchIntent';
import { useGame, rateImport, validatePuzzle, Proof, playedOn, type EntryMode } from '../state/gameStore';
import { cellName, PEERS } from '../engine/board';
import { dailyPuzzle } from '../engine/daily';
import { useSettings, THEMES, type Theme } from '../state/settings';
import { useAppStatus } from '../state/appStatus';
import { useT, translator, rich, langRoot } from '../content/i18n';
import type { Translator } from '../content/i18n';
import { Grid } from './Grid';
import { ColorPaletteBar } from './ColorPaletteBar';
import { SetTracker } from './SetTracker';
import { Poodle } from './Poodle';
import { Controls } from './Controls';
import { HintPanel, ChainPanel } from './HintPanel';
import { RatingGauge, useRatingFit } from './RatingGauge';
import {
  useNewGame,
  warmSeededPools,
  NewGameDialog,
  PracticeDialog,
  ImportDialog,
  ShareDialog,
  GeneratingDialog,
  VictoryDialog,
  SolutionPathDialog,
  ContractDialog,
  PositionImportConfirmDialog
} from './Dialogs';
import { SettingsDialog, InfoDialog } from './SettingsInfo';
import { POSITION_IMPORT_HASH_PARAM } from '../content/sudokuExchangeImport';
import { ReportDialog } from './ReportDialog';
import type { ReportKind } from './report';
import type { Step } from '../engine/steps';
import { ProgressDialog } from './Progress';
import { usePatternScanner } from '../state/scannerStore';
import { PatternScannerPanel } from './PatternScannerPanel';
import {
  GraduationCapIcon,
  SunIcon,
  FlowerIcon,
  TreeIcon,
  MoonIcon,
  GearIcon,
  LinkIcon,
  TargetIcon,
  CheckIcon,
  ZapIcon,
  ChessKnightIcon,
  FishIcon,
  SparklesIcon,
  TerminalIcon,
  InfoIcon
} from './Icons';
import { PracticePanel } from './PracticePanel';
import { usePractice } from '../state/practiceStore';
import { isTechniqueVisibleInScan, INTERMEDIATE_TECHS } from '../content/mastery';
import { findAllPatternInstances } from '../engine/scanner';
import { engineGrid } from '../state/gameStore';
import { MyTechniquesDialog } from './MyTechniquesDialog';
import { LiveSyncIndicator } from './LiveSyncIndicator';
import { Modal } from './Dialogs';
import type { LearnTarget } from './Learn';
import { useIsMobileLayout } from './useIsMobileLayout';
import { MobileNumpad } from './mobile/MobileNumpad';
import { MobileBottomDock } from './mobile/MobileBottomDock';
import { MobileFloatingPanel, type FloatingPanelTab } from './mobile/MobileFloatingPanel';

// the guide is a third of the app's code and prose: fetched the first time
// it opens (and precached for offline), never as part of loading the game
const LearnDialog = React.lazy(() => import('./Learn').then((m) => ({ default: m.LearnDialog })));
import { PRACTICE_TECHS, Tech, Level, LEVELS, pickOf } from '../engine/ratings';
import { techFromParam } from '../content/slugs';
import { parseShareUrl, sharePath, clockOf } from '../content/share';
import { localDateKey, dateOfKey, loadDailies, findDaily, dailyNumber, parseDailyUrl, dailyPath } from '../content/dailies';
import { useDailyStats } from '../state/dailyStats';
import { useTelemetry } from '../state/telemetry';
import { RATING_URL, PRIVACY_URL } from '../content/staticRoutes';

/** the name: "oxy" and a coloured "Doku", with "OD" mark */
const BRAND = ['oxy', 'Doku'] as const;
const BRAND_MARK = 'OD';
/** a no-break space: the &nbsp; after the rating's word in the top bar */
const NBSP = String.fromCharCode(160);

/** #learn=<technique key or slug> | intuition | glossary | rating | term:<glossary term> */
function parseLearnParam(param: string): LearnTarget {
  if (param === 'glossary') return { tab: 'glossary' };
  if (param === 'intuition') return { tab: 'intuition' };
  if (param === 'rating') return { tab: 'rating' };
  if (param.startsWith('term:')) return { tab: 'glossary', term: param.slice(5) };
  return { tab: 'techniques', tech: techFromParam(param) };
}

/** why a wrong digit is wrong, in a line (docs/technique-stats.md) */
function proofText(p: Proof, t: Translator): string {
  const cell = cellName(p.cell);
  const { wrong, right } = p;
  if (p.conflict !== null) return t('{cell} cannot be {wrong}: {other} already holds it.', { cell, wrong, other: cellName(p.conflict) });
  if (!p.tech) return t('{cell} should be {right}, not {wrong}. The proof is beyond a quick search.', { cell, right, wrong });
  // the easier steps played before the proof itself
  const n = p.steps.length - 1;
  const last = p.steps[p.steps.length - 1];
  // the drawn line shows the way to the contradiction, but the board may
  // need singles off it as well, so no count of moves is claimed
  if (p.trail) return t('{cell} cannot be {wrong}: place it and the singles it forces break the board.', { cell, wrong });
  const vars = { cell, right, wrong, tech: t.tech(p.tech), n };
  if (p.places)
    return t(
      n < 1
        ? '{cell} is {right}, not {wrong}: a {tech} places it.'
        : n === 1
          ? '{cell} is {right}, not {wrong}: a {tech} places it after {n} easier step.'
          : '{cell} is {right}, not {wrong}: a {tech} places it after {n} easier steps.',
      vars
    );
  // the digit may go by a placement in a peer rather than by a removal
  const peer = last.placements.find((q) => q.digit === p.wrong && PEERS[p.cell].includes(q.cell));
  return peer
    ? t(
        n < 1
          ? '{cell} cannot be {wrong}: a {tech} puts the {wrong} in {peer}.'
          : n === 1
            ? '{cell} cannot be {wrong}: a {tech} puts the {wrong} in {peer} after {n} easier step.'
            : '{cell} cannot be {wrong}: a {tech} puts the {wrong} in {peer} after {n} easier steps.',
        { ...vars, peer: cellName(peer.cell) }
      )
    : t(
        n < 1
          ? '{cell} cannot be {wrong}: a {tech} removes it.'
          : n === 1
            ? '{cell} cannot be {wrong}: a {tech} removes it after {n} easier step.'
            : '{cell} cannot be {wrong}: a {tech} removes it after {n} easier steps.',
        vars
      );
}

/** a new version waiting, or a file this version can no longer load: the
 *  player decides when to reload; the game is saved either way */
function UpdateBar() {
  const updateReady = useAppStatus((s) => s.updateReady);
  const reason = useAppStatus((s) => s.reason);
  const offlineReady = useAppStatus((s) => s.offlineReady);
  const reload = useAppStatus((s) => s.reload);
  const dismiss = useAppStatus((s) => s.dismiss);
  const t = useT();
  // the offline note is good news, not a decision: it goes by itself
  useEffect(() => {
    if (!offlineReady || updateReady) return;
    const id = setTimeout(dismiss, 6000);
    return () => clearTimeout(id);
  }, [offlineReady, updateReady, dismiss]);
  if (updateReady) {
    return (
      <div className="update-bar" role="status">
        <span>
          {t(
            reason === 'chunk'
              ? 'sudokUI was updated while this tab was open, and a part of it could not load. Reload to continue; your game is saved.'
              : 'A new version of sudokUI is ready. Reload when it suits you; your game is saved.'
          )}
        </span>
        <button onClick={reload}>{t('Reload')}</button>
        <button className="ghost" onClick={dismiss}>
          {t('Later')}
        </button>
      </div>
    );
  }
  if (offlineReady) {
    return (
      <div className="update-bar" role="status">
        <span>{t('sudokUI is ready to play offline.')}</span>
        <button className="ghost" onClick={dismiss}>
          OK
        </button>
      </div>
    );
  }
  return null;
}

function Timer() {
  const elapsedMs = useGame((s) => s.elapsedMs);
  const paused = useGame((s) => s.paused);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const secs = Math.floor(elapsedMs() / 1000);
  const mm = Math.floor(secs / 60);
  const ss = String(secs % 60).padStart(2, '0');
  return (
    <span className={`timer ${paused ? 'paused' : ''}`}>
      {mm}:{ss}
    </span>
  );
}

function renderThemeIcon(t: Theme, size = 16) {
  switch (t) {
    case 'dark':
      return <MoonIcon size={size} />;
    case 'light':
      return <SunIcon size={size} />;
    case 'rose':
      return <FlowerIcon size={size} />;
    case 'forest':
      return <TreeIcon size={size} />;
    case 'cyberpunk':
      return <ZapIcon size={size} />;
    case 'chess':
      return <ChessKnightIcon size={size} />;
    case 'aquarium':
      return <FishIcon size={size} />;
    case 'midnight':
      return <SparklesIcon size={size} />;
    case 'retro':
      return <TerminalIcon size={size} />;
    default:
      return <MoonIcon size={size} />;
  }
}

export default function App() {
  const info = useGame((s) => s.info);
  const won = useGame((s) => s.won);
  const paused = useGame((s) => s.paused);
  const togglePause = useGame((s) => s.togglePause);
  const input = useGame((s) => s.input);
  const erase = useGame((s) => s.erase);
  const wipe = useGame((s) => s.wipe);
  const notice = useGame((s) => s.notice);
  const clearNotice = useGame((s) => s.clearNotice);
  const undo = useGame((s) => s.undo);
  const redo = useGame((s) => s.redo);
  const setMode = useGame((s) => s.setMode);
  const setTempMode = useGame((s) => s.setTempMode);
  const zDownRef = useRef(false);
  const [zHeld, setZHeld] = useState(false);
  const mode = useGame((s) => s.mode);
  const errors = useGame((s) => s.errors);
  const revertIndex = useGame((s) => s.revertIndex);
  const revertToValid = useGame((s) => s.revertToValid);
  const dismissRevert = useGame((s) => s.dismissRevert);
  const proofs = useGame((s) => s.proofs);
  const showProof = useGame((s) => s.showProof);
  const practiceFound = useGame((s) => s.practiceFound);
  const chain = useGame((s) => s.chain);
  const scanPreview = useGame((s) => s.scanPreview);
  const scanDoubts = useGame((s) => s.scanDoubts);
  const practiceTarget = useGame((s) => s.practiceTarget);
  const startChain = useGame((s) => s.startChain);
  const requestHint = useGame((s) => s.requestHint);
  const hint = useGame((s) => s.hint);
  const hintStage = useGame((s) => s.hintStage);
  const selection = useGame((s) => s.selection);
  const select = useGame((s) => s.select);
  const custom = useGame((s) => s.custom);
  const contractPrompt = useGame((s) => s.contractPrompt);
  const contractFor = useGame((s) => s.contractFor);
  const answerContract = useGame((s) => s.answerContract);
  const dismissContractPrompt = useGame((s) => s.dismissContractPrompt);
  const convertMarks = useGame((s) => s.convertMarks);
  const startCustomEntry = useGame((s) => s.startCustomEntry);
  const cancelCustomEntry = useGame((s) => s.cancelCustomEntry);
  const finishCustomEntry = useGame((s) => s.finishCustomEntry);
  const givenCount = useGame((s) =>
    s.custom ? s.cells.filter((c) => c.value > 0).length : 0
  );
  const { theme, font, toggleTheme, setTheme, showTimer, hideRating, showPoodle, lang } = useSettings();
  const t = useT();
  const { start, genState, cancel } = useNewGame();
  // the hardest bands start from seeds: stock their pools while idle, so
  // even the first Nightmare on this device starts at once
  useEffect(() => {
    const t = setTimeout(() => warmSeededPools(), 4000);
    return () => clearTimeout(t);
  }, []);

  const [dialog, setDialog] = useState<
    'none' | 'new' | 'practice' | 'io' | 'share' | 'settings' | 'info' | 'restart' | 'steps' | 'scan' | 'learn' | 'progress' | 'my-techniques'
  >('none');
  const [learnTarget, setLearnTarget] = useState<LearnTarget>({ tab: 'techniques' });
  // a technique the guide asked Scan to look for on the board
  const [scanFor, setScanFor] = useState<Tech | null>(null);
  const openLearn = (target: LearnTarget = { tab: 'techniques' }) => {
    setLearnTarget(target);
    setDialog('learn');
  };
  // footer links are real URLs (crawlable, and they open the static page in
  // a new tab on a modified click); a plain click opens the in-app dialog
  const learnLink = (target: LearnTarget) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    openLearn(target);
  };
  const restart = useGame((s) => s.restart);
  const pendingPositionImport = useGame((s) => s.pendingPositionImport);
  const scannerOpen = usePatternScanner((s) => s.isOpen);
  const openScanner = usePatternScanner((s) => s.openScanner);
  const closeScanner = usePatternScanner((s) => s.closeScanner);
  const [victoryDismissed, setVictoryDismissed] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);

  const isMobile = useIsMobileLayout();
  const [floatingTab, setFloatingTab] = useState<FloatingPanelTab | null>(null);

  const [practiceMode, setPracticeMode] = [usePractice((s) => s.mode), usePractice.setState];
  useEffect(() => {
    if (isMobile) {
      if (scannerOpen) {
        setFloatingTab('patterns');
      } else if (info?.practiceTech && practiceMode !== 'inactive') {
        setFloatingTab('practice');
      }
    }
  }, [scannerOpen, isMobile, info?.practiceTech, practiceMode]);

  useEffect(() => {
    if (!showThemePicker) return;
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.header-theme-picker-container')) return;
      setShowThemePicker(false);
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [showThemePicker]);

  useEffect(() => {
    if (!showHeaderMenu || isMobile) return;
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.header-menu-container')) return;
      setShowHeaderMenu(false);
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [showHeaderMenu, isMobile]);
  const [customError, setCustomError] = useState<string | null>(null);
  // the report dialog, with the hint it is about when it came from "Looks wrong?"
  const [report, setReport] = useState<{ kind: ReportKind; hint?: Step } | null>(null);
  const startPracticeMode = (tech: Tech | 'mixed') => {
    setDialog('none');
    if (tech === 'mixed') {
      const mastery = useSettings.getState().mastery;
      const eligible = PRACTICE_TECHS.filter((t) => isTechniqueVisibleInScan(mastery, t, false));
      const pool = eligible.length > 0 ? eligible : INTERMEDIATE_TECHS.filter((t) => PRACTICE_TECHS.includes(t));
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      usePractice.setState({ mode: 'mixed', mixedPool: pool });
      start({ kind: 'tech', tech: chosen });
    } else {
      usePractice.setState({ mode: 'focused', targetTech: tech });
      start({ kind: 'tech', tech });
    }
  };

  useEffect(() => {
    if (info?.practiceTech && practiceTarget) {
      const g = engineGrid(useGame.getState().cells);
      const scanRes = findAllPatternInstances(g, { useUniqueness: true, includeDisabled: true });
      const currentMode = usePractice.getState().mode;
      if (currentMode === 'mixed') {
        const pool = usePractice.getState().mixedPool;
        usePractice.getState().startMixedPractice(pool, practiceTarget, scanRes.instances.map((i) => i.step));
      } else {
        usePractice.getState().startFocusedPractice(info.practiceTech, practiceTarget, scanRes.instances.map((i) => i.step));
      }
    } else if (!info?.practiceTech) {
      if (usePractice.getState().mode !== 'inactive') {
        usePractice.getState().exitPractice();
      }
    }
  }, [info?.practiceTech, practiceTarget]);
  // first visit only, and never over a shared or deep link: those visitors
  // arrived with a purpose
  const [welcome, setWelcome] = useState(
    () =>
      !localStorage.getItem('sudokui-welcomed') &&
      !window.location.hash.match(/(^#|&)(p=|s=|import-position=|learn=|practice=|daily|scan|scanner|pattern-lab|my-techniques|techniques)/) &&
      !parseShareUrl(window.location) &&
      !parseDailyUrl(window.location)
  );
  const dismissWelcome = () => {
    localStorage.setItem('sudokui-welcomed', '1');
    setWelcome(false);
  };
  // today's published daily and its band, for the welcome: a first visit
  // never starts in a puzzle that needs more than the basics. undefined
  // while it is read; the band is null when today has no published daily
  // (the derived one is not worked out just for this). The day is kept
  // with it, so a welcome left open past midnight starts the daily it named
  const [welcomeDaily, setWelcomeDaily] = useState<{ key: string; level: Level | null } | undefined>(undefined);
  useEffect(() => {
    if (!welcome) return;
    let live = true;
    const key = localDateKey();
    loadDailies().then((list) => live && setWelcomeDaily({ key, level: findDaily(list, key)?.level ?? null }));
    return () => {
      live = false;
    };
  }, [welcome]);
  /** the daily needs more than the basics (Hard or harder), or its level is not known */
  const hardDaily =
    !!welcomeDaily && (welcomeDaily.level === null || LEVELS.indexOf(welcomeDaily.level) >= LEVELS.indexOf('Hard'));
  /** a game on the board someone has begun and not finished, or a puzzle being typed in: the welcome never replaces it */
  const underWay = useGame((s) => s.custom || (!!s.info && !s.won && playedOn(s)));
  /** the welcome's daily: started, unless it is already on the board, under
   *  way or solved, which is kept, not restarted (closing the welcome then
   *  shows a solved one's win screen, with its time still to send) */
  const playWelcomeDaily = () => {
    if (!welcomeDaily) return;
    dismissWelcome();
    const g = useGame.getState();
    if (!g.custom && g.info?.dailyKey === welcomeDaily.key) return;
    // another game's win does not show its screen while the daily is fetched
    if (g.won) setVictoryDismissed(true);
    startDaily(welcomeDaily.key);
  };
  /** the welcome's easy start: a first visit's own game is an easy one, kept;
   *  a game above Easy, practice, or one already won, none of them begun,
   *  makes way for one (a game still being made is that easy one) */
  const startEasyFirst = () => {
    dismissWelcome();
    const g = useGame.getState();
    if (g.info && (g.won || g.info.practiceTech || LEVELS.indexOf(g.info.level) > LEVELS.indexOf('Easy'))) {
      // an earlier visit's win does not show its screen while the easy one is made
      if (g.won) setVictoryDismissed(true);
      start({ kind: 'level', level: 'Easy' });
    }
  };
  /** the band on a hard day, unless it is unknown or the player hides it before a solve */
  const welcomeDailyLabel =
    hardDaily && welcomeDaily?.level && !hideRating
      ? t("Today's daily ({level})", { level: t.level(welcomeDaily.level) })
      : t("Play today's daily");
  // the daily for a day, today's unless a date is given: the published
  // puzzle (src/content/dailies.ts), which has global statistics; or, for
  // a day the published list does not cover, the one derived from the date
  // as before (src/engine/daily.ts), which has none
  const startDaily = async (date = localDateKey()) => {
    const published = findDaily(await loadDailies(), date);
    const no = dailyNumber(date);
    if (published && no) {
      useGame.getState().startGame(published.puzzle, published.score, published.level, null, date);
      useGame.setState((s) => ({ info: s.info && { ...s.info, dailyNo: no } }));
    } else {
      const d = dailyPuzzle(dateOfKey(date) ?? new Date());
      useGame.getState().startGame(d.puzzle, d.score, d.level, null, date);
    }
    // translator(), not the render's t: the boot effect calls this from its
    // first render's closure
    const t = translator();
    useGame.setState({
      notice:
        date === localDateKey()
          ? t('Daily puzzle for {date}. Everyone gets this same board today', { date })
          : t('The daily for {date}', { date })
    });
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.font = font;
  }, [font]);

  // boot: a shared link wins over everything — #s= carries a full position
  // (entries, marks, colours), /p/<puzzle> and #p= just the puzzle, and a
  // share path may carry a challenger's time (src/content/share.ts);
  // otherwise a saved game resumes (or a puzzle being typed in, which has
  // no address of its own), otherwise start an easy one. The
  // /learn/ pages deep-link in with #practice=<technique> (start practising
  // it) and #learn=<topic> (open the guide there). StrictMode-guarded.
  useEffect(() => {
    if ((window as any).__sudokuiBooted) return;
    (window as any).__sudokuiBooted = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const learn = params.get('learn');
    if (learn) openLearn(parseLearnParam(learn));
    if (params.has('scan') || params.has('scanner') || params.has('pattern-lab')) openScanner();
    if (params.has('my-techniques') || params.has('techniques')) setDialog('my-techniques');
    const practice = techFromParam(params.get('practice') ?? '');
    if (practice && PRACTICE_TECHS.includes(practice)) {
      start({ kind: 'tech', tech: practice });
      return;
    }
    const importPos = params.get(POSITION_IMPORT_HASH_PARAM);
    if (importPos !== null) {
      try {
        const cleanParams = new URLSearchParams(window.location.hash.slice(1));
        cleanParams.delete(POSITION_IMPORT_HASH_PARAM);
        const rem = cleanParams.toString();
        const newUrl = window.location.pathname + window.location.search + (rem ? `#${rem}` : '');
        window.history.replaceState(null, '', newUrl);
      } catch (_) {}

      const res = useGame.getState().importPositionPayload(importPos);
      if (!res.ok) {
        useGame.setState({ notice: res.reason });
      } else {
        return;
      }
    }
    const sharedPosition = params.get('s');
    if (sharedPosition) {
      try {
        const cleanParams = new URLSearchParams(window.location.hash.slice(1));
        cleanParams.delete('s');
        const rem = cleanParams.toString();
        const newUrl = window.location.pathname + window.location.search + (rem ? `#${rem}` : '');
        window.history.replaceState(null, '', newUrl);
      } catch (_) {}

      if (useGame.getState().loadPosition(sharedPosition)) return;
    }
    const share = parseShareUrl(window.location);
    // a puzzle string may write its empty cells as zeros; the app writes dots
    const shared = (share?.puzzle ?? params.get('p') ?? '').replace(/[^0-9.]/g, '').replace(/0/g, '.');
    const game = useGame.getState();
    /** the challenger's time becomes the one to beat, and the player is told */
    const challenge = (vs: number) => {
      const t = translator();
      useGame.setState((s) => ({
        info: s.info && { ...s.info, challenge: vs },
        notice: t('A challenge: solve it faster than {time}', { time: clockOf(vs) })
      }));
    };
    /** a game nobody has touched: its clock may have run, nothing else has happened */
    const untouched = () => game.cells.every((c) => c.given || (!c.value && !c.corner && !c.center && !c.colors.length));
    /** the challenger's time over the game already on the board */
    const challengeCurrent = (vs: number) => {
      // a finished game, or one not yet begun, starts over against that
      // time; one under way keeps its moves and takes the time on
      if (game.won || untouched()) game.restart();
      challenge(vs);
    };
    // a daily's address, or #daily for today's: that day's board, unless it
    // is the one already on the board (a reload lands here), and a
    // challenger's time once the board is there
    const daily = parseDailyUrl(window.location) ?? (params.has('daily') ? { lang: 'en' as const, date: localDateKey() } : null);
    if (daily) {
      if (game.info?.dailyKey === daily.date) {
        if (daily.vs) challengeCurrent(daily.vs);
        return;
      }
      void startDaily(daily.date).then(() => {
        if (daily.vs) challenge(daily.vs);
      });
      return;
    }
    if (shared && shared === game.info?.puzzle) {
      // the puzzle already on the board (a reload lands here), perhaps with
      // a challenger's time for it
      if (share?.vs) challengeCurrent(share.vs);
      return;
    }
    if (shared) {
      const v = shared.length === 81 ? validatePuzzle(shared) : null;
      if (v && v.ok) {
        game.startGame(shared, v.score, v.level);
        if (share?.vs) challenge(share.vs);
        return;
      }
      // a share page promised a puzzle the app cannot play (no solution,
      // several, too few clues): say so, then go on as with no link
      if (share) {
        const t = translator();
        useGame.setState({ notice: t('The shared puzzle could not be opened. {reason}', { reason: v ? v.reason : '' }).trim() });
      }
    }
    const now = useGame.getState();
    if (!now.info && !now.custom) start({ kind: 'level', level: 'Easy' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => setVictoryDismissed(false), [info?.puzzle]);

  // a shared link opened in this tab: load it, unless a game is under way
  useEffect(() => {
    const onHash = () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const importPos = params.get(POSITION_IMPORT_HASH_PARAM);
      if (importPos !== null) {
        try {
          const cleanParams = new URLSearchParams(window.location.hash.slice(1));
          cleanParams.delete(POSITION_IMPORT_HASH_PARAM);
          const rem = cleanParams.toString();
          const newUrl = window.location.pathname + window.location.search + (rem ? `#${rem}` : '');
          window.history.replaceState(null, '', newUrl);
        } catch (_) {}

        const res = useGame.getState().importPositionPayload(importPos);
        if (!res.ok) useGame.setState({ notice: res.reason });
        return;
      }
      const shared = (params.get('p') ?? '').replace(/[^0-9.]/g, '').replace(/0/g, '.');
      const g = useGame.getState();
      if (shared.length !== 81 || shared === g.info?.puzzle) return;
      if (g.history.length > 0 && !g.won) {
        const t = translator();
        useGame.setState({ notice: t('A puzzle link was opened. Finish or restart this game first, or open the link in a new tab') });
        return;
      }
      const rating = rateImport(shared);
      if (rating) g.startGame(shared, rating.score, rating.level);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // keep the address bar shareable: it always points at the current
  // puzzle, at the address that previews when pasted into a chat, in the
  // app's language (the Worker and the service worker both answer it with
  // the app, src/content/home.ts). The band and the score stay out of it
  // while the rating is hidden and the game is on (the share dialog still
  // puts them in a link made for someone else), and so does a challenger's
  // time: the player's own copy of the link should not carry it. The
  // tab's title, which a share page sets to its puzzle, goes back to the
  // app's own, so it never names a puzzle that has left the board. A
  // puzzle being typed in has no address yet: the bar shows the home page,
  // so a reload keeps the entry (the boot, above) rather than reopening the
  // game that was on the board before it.
  useEffect(() => {
    const homeTitle = () =>
      import('../content/home')
        .then((m) => {
          document.title = m.HOME[lang].title;
        })
        .catch(() => {});
    if (custom) {
      try {
        window.history.replaceState(null, '', langRoot(lang));
      } catch {
        // an origin that allows no path of its own (a file:// build): at
        // least the old puzzle's hash goes, so a reload does not reopen it
        window.history.replaceState(null, '', window.location.pathname);
      }
      homeTitle();
      return;
    }
    if (!info?.puzzle) return;
    const rated = !(hideRating && !won);
    try {
      // a published daily's address is its day (src/content/dailies.ts)
      const path =
        info.dailyNo && info.dailyKey
          ? dailyPath(lang, info.dailyKey)
          : sharePath({ lang, puzzle: info.puzzle, level: rated ? info.level : undefined, score: rated ? info.score : undefined });
      window.history.replaceState(null, '', path);
    } catch {
      // an origin that allows no path of its own (a file:// build): the
      // hash link still names the puzzle, and the app still reads it
      window.history.replaceState(null, '', `#p=${info.puzzle}`);
    }
    homeTitle();
  }, [custom, info?.puzzle, info?.level, info?.score, info?.dailyNo, info?.dailyKey, lang, hideRating, won]);

  // a daily result that could not be sent goes on the next open, and when
  // the connection comes back (src/state/dailyStats.ts)
  useEffect(() => {
    const flush = () => void useDailyStats.getState().flushPending();
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, []);

  // the plays counted (src/state/telemetry.ts): what waits goes on the
  // open, when the app is hidden or left, and when the connection comes back
  useEffect(() => {
    const flush = () => void useTelemetry.getState().flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    flush();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    window.addEventListener('online', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('online', flush);
    };
  }, []);

  // toasts fade after a few seconds
  useEffect(() => {
    if (!notice) return;
    // long notices stay long enough to be read
    const id = setTimeout(clearNotice, Math.max(3500, notice.length * 70));
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  // hold-modifier temporary modes: Shift = corner, Ctrl/Alt = centre,
  // Z = colour; Shift together with Ctrl/Alt = colour; release returns to the base mode
  useEffect(() => {
    const applyModifiers = (e: KeyboardEvent) => {
      if (e.metaKey) {
        zDownRef.current = false;
        setZHeld(false);
        return void setTempMode(null); // leave Cmd shortcuts alone
      }
      if (zDownRef.current) {
        setTempMode('color');
        return;
      }
      const other = e.ctrlKey || e.altKey;
      setTempMode(
        e.shiftKey && other ? 'color' : e.shiftKey ? 'corner' : other ? 'center' : null
      );
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyZ') {
        zDownRef.current = false;
        setZHeld(false);
      }
      applyModifiers(e);
    };
    const onBlur = () => {
      zDownRef.current = false;
      setZHeld(false);
      setTempMode(null);
    };
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [setTempMode]);

  /** the top bar's rating group: how much of the rating it has room for (RatingGauge.tsx) */
  const metaRef = useRef<HTMLDivElement>(null);
  useRatingFit(metaRef, [!!info, info?.level, info?.score, info?.practiceTech, hideRating, won, lang]);

  /** where a pointer landed on the empty space around the board, until it lifts */
  const layoutTap = useRef<{ x: number; y: number } | null>(null);
  const emptySpace = (el: EventTarget | null) =>
    el instanceof HTMLElement && (el.classList.contains('layout') || el.classList.contains('board-col'));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // a dialog is open: its keys must not act on the board behind it
      // (N stays live, for "next puzzle" from the victory dialog)
      if (document.querySelector('.modal-backdrop') && e.code !== 'KeyN') {
        if (zDownRef.current) {
          zDownRef.current = false;
          setZHeld(false);
          setTempMode(null);
        }
        return;
      }
      const targetEl = e.target instanceof HTMLElement ? e.target : null;
      if (
        targetEl &&
        (targetEl.tagName === 'INPUT' ||
          targetEl.tagName === 'TEXTAREA' ||
          targetEl.tagName === 'SELECT' ||
          targetEl.isContentEditable ||
          targetEl.getAttribute('role') === 'textbox' ||
          targetEl.getAttribute('role') === 'searchbox')
      ) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (!mod && e.code === 'KeyZ') {
        e.preventDefault();
        zDownRef.current = true;
        setZHeld(true);
        setTempMode('color');
        return;
      }
      if (!e.metaKey) {
        if (zDownRef.current) {
          setTempMode('color');
        } else {
          const other = e.ctrlKey || e.altKey;
          setTempMode(
            e.shiftKey && other ? 'color' : e.shiftKey ? 'corner' : other ? 'center' : null
          );
        }
      }
      // walking a hint: the arrow keys step through its frames, Escape
      // returns to the whole drawing
      const walking = useGame.getState().hintStage === 'walk';
      if (walking && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
        e.preventDefault();
        useGame.getState().walkHint(e.code === 'ArrowRight' ? 1 : -1);
        return;
      }
      if (walking && e.code === 'Escape') {
        useGame.getState().revealHint();
        return;
      }
      if ((mod && e.code === 'KeyZ' && !e.shiftKey) || (!mod && e.code === 'BracketLeft'))
        return void (e.preventDefault(), undo());
      if (
        (mod && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) ||
        (!mod && e.code === 'BracketRight')
      )
        return void (e.preventDefault(), redo());
      if (mod && e.code === 'KeyA')
        return void (e.preventDefault(), select(Array.from({ length: 81 }, (_, i) => i), false));
      if (e.code.startsWith('Digit') || e.code.startsWith('Numpad')) {
        const d = Number(e.code.replace('Digit', '').replace('Numpad', ''));
        if (d >= 1 && d <= 9) {
          e.preventDefault();
          const ctrlOrMeta = e.ctrlKey || e.metaKey;
          const shift = e.shiftKey;
          let entryAs: EntryMode | undefined;
          if (zDownRef.current || (shift && ctrlOrMeta)) {
            entryAs = 'color';
          } else if (ctrlOrMeta) {
            entryAs = 'center';
          } else if (shift) {
            entryAs = 'corner';
          }
          input(d, entryAs);
          return;
        }
      }
      switch (e.code) {
        case 'Backspace':
        case 'Delete':
          if (useGame.getState().chain) {
            e.preventDefault();
            useGame.getState().chainUndo();
            break;
          }
          e.preventDefault();
          // held modifiers route through the temporary mode, so
          // Shift+Backspace erases corner marks, Ctrl+Backspace centre
          // marks, both together colours — full wipe lives on W
          erase();
          break;
        case 'KeyW':
          wipe();
          break;
        case 'KeyD':
          // deselect — the Escape alternative for fullscreen browsers,
          // where Escape exits fullscreen instead
          select([], false);
          useGame.getState().clearArmedDigits();
          break;
        case 'KeyN': {
          const tech = useGame.getState().info?.practiceTech;
          if (tech) {
            if (practiceMode === 'mixed') startPracticeMode('mixed');
            else startPracticeMode(tech);
          }
          break;
        }
        case 'Space': {
          e.preventDefault();
          const order = ['digit', 'corner', 'center', 'color'] as const;
          setMode(order[(order.indexOf(useGame.getState().mode) + 1) % order.length]);
          break;
        }
        case 'Period':
        case 'NumpadDecimal':
          if (!mod) {
            e.preventDefault();
            useGame.getState().convertCornerToCenter();
          }
          break;
        case 'KeyH': {
          // H walks the hint: ask, then reveal, then apply; the first
          // assist of a clean game asks the same question the button does
          const g = useGame.getState();
          if (g.hintStage === 'tech') g.revealHint();
          else if (g.hintStage === 'full' || g.hintStage === 'walk') g.applyHint();
          else if (g.assisted || !useSettings.getState().confirmAssist) requestHint();
          else g.askAssist('Hint');
          break;
        }
        case 'KeyS':
          convertMarks(); // swap corner ↔ centre marks (selection or board)
          break;
        case 'KeyP':
          togglePause();
          break;
        case 'KeyL':
          openLearn();
          break;
        case 'KeyB': {
          // the ring around cells with two candidates, on or off
          if (mod || e.altKey) break;
          useGame.getState().setBivalueHighlight(!useSettings.getState().highlightBivalue);
          break;
        }
        case 'Escape': {
          const g = useGame.getState();
          if (g.chain) g.endChain();
          else {
            select([], false);
            g.clearArmedDigits();
          }
          break;
        }
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault();
          const cur = selection.length ? selection[selection.length - 1] : 40;
          let r = Math.floor(cur / 9);
          let c = cur % 9;
          if (e.code === 'ArrowUp') r = (r + 8) % 9;
          if (e.code === 'ArrowDown') r = (r + 1) % 9;
          if (e.code === 'ArrowLeft') c = (c + 8) % 9;
          if (e.code === 'ArrowRight') c = (c + 1) % 9;
          select([r * 9 + c], e.shiftKey || e.metaKey || e.ctrlKey);
          break;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [input, erase, wipe, undo, redo, setMode, requestHint, select, selection, togglePause, convertMarks, start]);

  return (
    <div className={`app ${isMobile ? 'is-mobile-layout' : 'is-desktop-layout'}`}>
      {isMobile ? (
        <div className="mobile-shell">
          <header className="mobile-topbar">
            <div className="brand-group">
              <div className="brand">
                <span className="brand-mark">{BRAND_MARK}</span>
                <h1>
                  {BRAND[0]}<span className="brand-ui">{BRAND[1]}</span>
                </h1>
              </div>
            </div>

            <div className="mobile-header-center">
              <button
                type="button"
                className="board-status-badge mobile-badge"
                onClick={() => openLearn({ tab: 'rating' })}
                title={t('How the HoDoKu rating works, in full')}
              >
                <span className="status-dot" aria-hidden="true">●</span>
                <span className="status-text">
                  {custom
                    ? t('Custom')
                    : info
                      ? `${t.level(pickOf(info.level, info.score))} · ${info.score}`
                      : ''}
                </span>
                {info?.practiceTech && (
                  <span className="practice-badge"> · {t('Practice: {tech}', { tech: t.tech(info.practiceTech) })}</span>
                )}
              </button>
            </div>

            <div className="mobile-topbar-right">
              {showTimer && (
                <button
                  type="button"
                  className="mobile-timer-badge"
                  onClick={togglePause}
                  title={paused ? t('Paused') : t('Pause')}
                  aria-label={paused ? t('Paused') : t('Pause')}
                >
                  <Timer />
                </button>
              )}
              <div className="header-theme-picker-container">
                <button
                  className="icon-btn theme-btn"
                  onClick={() => setShowThemePicker(!showThemePicker)}
                  title={t('Theme')}
                  aria-label={t('Theme')}
                  aria-expanded={showThemePicker}
                >
                  {renderThemeIcon(theme, 16)}
                </button>
                {showThemePicker && (
                  <div className="theme-picker-popover mobile-theme-popover" role="dialog" aria-label={t('Theme')}>
                    <div className="theme-picker-header">
                      <h4>{t('Theme')}</h4>
                      <span className="theme-current-pill">
                        {THEMES.find((item) => item.id === theme)?.name ?? theme}
                      </span>
                    </div>
                    <div className="theme-picker-grid" role="menu">
                      {THEMES.map((item) => {
                        const isSelected = item.id === theme;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            role="menuitem"
                            className={`theme-card-option${isSelected ? ' active' : ''}`}
                            onClick={() => {
                              setTheme(item.id);
                              setShowThemePicker(false);
                            }}
                          >
                            <div className="theme-card-swatches">
                              <span
                                className="theme-swatch-circle"
                                style={{
                                  backgroundColor: item.surfaceColor,
                                  borderColor: item.primaryColor
                                }}
                              >
                                <span
                                  className="theme-swatch-dot"
                                  style={{ backgroundColor: item.primaryColor }}
                                />
                              </span>
                            </div>
                            <div className="theme-card-info">
                              <span className="theme-card-name">{t(item.name)}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <button
                className="icon-btn restart-btn"
                onClick={() => setDialog('restart')}
                title={t('Restart')}
                aria-label={t('Restart')}
              >
                <span style={{ fontSize: '15px', lineHeight: 1 }}>↺</span>
              </button>
              <button
                className="icon-btn gear"
                onClick={() => setShowHeaderMenu(!showHeaderMenu)}
                title={t('Options')}
                aria-label={t('Options')}
                aria-expanded={showHeaderMenu}
              >
                <GearIcon size={16} />
              </button>
            </div>
          </header>

          <main className="mobile-main">
            <div className="mobile-board-container">
              <Grid />
              <SetTracker />
              {showPoodle && (!paused || won) && <Poodle />}
            </div>

            <MobileNumpad />

            <MobileFloatingPanel
              activeTab={floatingTab}
              onClose={() => {
                setFloatingTab(null);
                if (scannerOpen) closeScanner();
              }}
              onOpenTab={(tab) => setFloatingTab(tab)}
              onLearn={(tech) => openLearn({ tab: 'techniques', tech })}
              onOpenMastery={() => setDialog('my-techniques')}
              onShowSteps={info && !custom ? () => setDialog('steps') : undefined}
              onStartPractice={(tech) => startPracticeMode(tech)}
              onReportHint={(hint) => setReport({ kind: 'hint', hint })}
            />
          </main>

          <MobileBottomDock
            scannerOpen={scannerOpen || floatingTab === 'patterns'}
            hintActive={!!(hint && hintStage !== 'hidden') || floatingTab === 'hint'}
            toolsOpen={floatingTab === 'tools'}
            onToggleScanner={() => {
              if (floatingTab === 'patterns') {
                setFloatingTab(null);
                closeScanner();
              } else {
                setFloatingTab('patterns');
                openScanner({ autoScan: true });
              }
            }}
            onHint={() => {
              setFloatingTab('hint');
              const g = useGame.getState();
              if (g.hintStage === 'tech') g.revealHint();
              else if (g.hintStage === 'full' || g.hintStage === 'walk') g.applyHint();
              else requestHint();
            }}
            onToggleTools={() => setFloatingTab(floatingTab === 'tools' ? null : 'tools')}
            onOpenMenu={() => setShowHeaderMenu(true)}
          />
        </div>
      ) : (
        <>
          <header className="topbar analysis-topbar">
        <div className="brand-group">
          <div className="brand">
            <span className="brand-mark">{BRAND_MARK}</span>
            <h1>
              {BRAND[0]}<span className="brand-ui">{BRAND[1]}</span>
            </h1>
          </div>
        </div>

        <div className="header-center">
          <button
            type="button"
            className="board-status-badge"
            onClick={() => openLearn({ tab: 'rating' })}
            title={t('How the HoDoKu rating works, in full')}
          >
            <span className="status-dot" aria-hidden="true">●</span>
            <span className="status-text">
              {custom
                ? t('Custom')
                : info
                  ? `${t.level(pickOf(info.level, info.score))} · ${info.score}`
                  : ''}
            </span>
            {info?.practiceTech && (
              <span className="practice-badge"> · {t('Practice: {tech}', { tech: t.tech(info.practiceTech) })}</span>
            )}
          </button>
          <LiveSyncIndicator />
          <button
            className="header-import-btn"
            onClick={() => setDialog('io')}
            title={t('Import a puzzle')}
          >
            <span className="btn-icon">⇅</span>
            <span>{t('Import')}</span>
          </button>
        </div>

        <div className="topbar-right">
          <button
            className="header-nav-btn"
            onClick={() => openLearn({ tab: 'techniques' })}
            title={t('Your path, practice and the theory of every technique')}
          >
            <span className="btn-icon"><GraduationCapIcon size={16} /></span>
            <span>{t('Learn')}</span>
          </button>

          <div className="header-theme-picker-container">
            <button
              className="icon-btn theme-btn"
              onClick={() => setShowThemePicker(!showThemePicker)}
              title={t('Theme')}
              aria-label={t('Theme')}
              aria-expanded={showThemePicker}
            >
              {renderThemeIcon(theme, 16)}
            </button>
            {showThemePicker && (
              <div className="theme-picker-popover" role="dialog" aria-label={t('Theme')}>
                <div className="theme-picker-header">
                  <h4>{t('Theme')}</h4>
                  <span className="theme-current-pill">
                    {THEMES.find((item) => item.id === theme)?.name ?? theme}
                  </span>
                </div>
                <div className="theme-grid-list" role="menu">
                  {THEMES.map((item) => {
                    const isSelected = item.id === theme;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitem"
                        className={`theme-card-option${isSelected ? ' active' : ''}`}
                        onClick={() => {
                          setTheme(item.id);
                          setShowThemePicker(false);
                        }}
                      >
                        <div className="theme-card-swatches">
                          <span
                            className="theme-swatch-circle"
                            style={{
                              backgroundColor: item.surfaceColor,
                              borderColor: item.primaryColor
                            }}
                          >
                            <span
                              className="theme-swatch-dot"
                              style={{ backgroundColor: item.primaryColor }}
                            />
                          </span>
                        </div>
                        <div className="theme-card-info">
                          <span className="theme-card-name">{t(item.name)}</span>
                          <span className="theme-card-desc">{t(item.description)}</span>
                        </div>
                        {isSelected && (
                          <span className="theme-card-check">
                            <CheckIcon size={14} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            className="icon-btn"
            onClick={() => setDialog('info')}
            title={t('How to play, modes & shortcuts')}
            aria-label={t('How to play, modes and shortcuts')}
          >
            <InfoIcon size={16} />
          </button>

          <div className="header-menu-container">
            <button
              className="icon-btn gear"
              onClick={() => setShowHeaderMenu(!showHeaderMenu)}
              title={t('Options')}
              aria-label={t('Options')}
              aria-expanded={showHeaderMenu}
            >
              <GearIcon size={16} />
            </button>
            {showHeaderMenu && (
              <div className="header-dropdown-menu" role="menu">
                <button
                  onClick={() => {
                    setShowHeaderMenu(false);
                    setDialog('settings');
                  }}
                >
                  <span className="menu-icon"><GearIcon size={16} /></span> {t('Settings')}
                </button>
                <button
                  onClick={() => {
                    setShowHeaderMenu(false);
                    setDialog('my-techniques');
                  }}
                >
                  <span className="menu-icon"><GraduationCapIcon size={16} /></span> {t('My Techniques')}
                </button>
                <hr className="dropdown-divider" />
                <button
                  onClick={() => {
                    setShowHeaderMenu(false);
                    setDialog('new');
                  }}
                >
                  <span className="menu-icon">▦</span> {t('New')}
                </button>
                <button
                  onClick={() => {
                    setShowHeaderMenu(false);
                    setDialog('restart');
                  }}
                >
                  <span className="menu-icon">↺</span> {t('Restart')}
                </button>
                <button
                  onClick={() => {
                    setShowHeaderMenu(false);
                    setDialog('share');
                  }}
                >
                  <span className="menu-icon"><LinkIcon size={16} /></span> {t('Share')}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main
        className={`layout${scannerOpen ? ' has-scanner' : ''}`}
        // touch has no Escape key: a tap on the empty space around the
        // board clears the selection. A tap, not any touch: a scroll that
        // starts beside the board (on a tablet, or in multi-select, where
        // the board keeps its own touches) ends in a pointercancel, never
        // here, and leaves the selection as it was
        onPointerDown={(e) => {
          layoutTap.current = emptySpace(e.target) ? { x: e.clientX, y: e.clientY } : null;
        }}
        onPointerUp={(e) => {
          const down = layoutTap.current;
          layoutTap.current = null;
          if (down && emptySpace(e.target) && Math.hypot(e.clientX - down.x, e.clientY - down.y) <= SLOP_PX) {
            select([], false);
            useGame.getState().clearArmedDigits();
          }
        }}
      >
        <div className="board-col">
          <Grid />
          <ColorPaletteBar zHeld={zHeld} />
          <SetTracker />
          {/* while paused, Nutella moves onto the pause card instead */}
          {showPoodle && (!paused || won) && <Poodle />}
        </div>
        <aside
          className={`side${paused && !won ? ' paused' : ''}${scannerOpen ? ' scanner-open' : ''}${info?.practiceTech && practiceMode !== 'inactive' ? ' practice-open' : ''}`}
        >
          <Controls
            onShowSteps={info && !custom ? () => setDialog('steps') : undefined}
            onScan={
              info && !custom
                ? () => {
                    if (scannerOpen) {
                      usePatternScanner.getState().runScan();
                    } else {
                      openScanner({ autoScan: true });
                    }
                  }
                : undefined
            }
            onHint={
              info && !custom
                ? () => {
                    if (scannerOpen) closeScanner();
                    const g = useGame.getState();
                    if (g.hintStage === 'tech') g.revealHint();
                    else if (g.hintStage === 'full' || g.hintStage === 'walk') g.applyHint();
                    else requestHint();
                  }
                : undefined
            }
            scannerOpen={scannerOpen}
            hintActive={!!(hint && hintStage !== 'hidden')}
          />
          {info?.practiceTech && !custom && practiceMode !== 'inactive' ? (
            <PracticePanel
              onNextPuzzle={() => {
                if (practiceMode === 'mixed') {
                  startPracticeMode('mixed');
                } else {
                  startPracticeMode(info.practiceTech!);
                }
              }}
              onOpenLearn={(tech) => openLearn({ tab: 'techniques', tech })}
              onOpenMastery={() => setDialog('my-techniques')}
            />
          ) : info?.practiceTech && !custom ? (
            <div className="practice-bar">
              <span className="practice-label">
                {rich(t('Practicing {tech}'), { tech: <strong>{t.tech(info.practiceTech)}</strong> })}
                {practiceFound && <span className="practice-found"> · {t('found||the technique being practised')} <TargetIcon size={14} /></span>}
              </span>
              <div className="practice-actions">
                {!practiceFound &&
                  !chain &&
                  practiceTarget?.links?.length &&
                  practiceTarget.links.every((l) => l.from.length === 1 && l.to.length === 1) && (
                    <button
                      className="ghost"
                      onClick={() => startChain(practiceTarget.eliminations)}
                      title={t("Open the chain trainer with this technique's removal as the goal")}
                    >
                      {t('Build it yourself')}
                    </button>
                  )}
                <button onClick={() => startPracticeMode(info.practiceTech!)}>
                  {t('Next puzzle (N)')}
                </button>
              </div>
            </div>
          ) : null}
          {scannerOpen ? (
            <PatternScannerPanel
              onClose={closeScanner}
              onLearn={(tech) => openLearn({ tab: 'techniques', tech })}
              onOpenMastery={() => setDialog('my-techniques')}
            />
          ) : chain ? (
            <ChainPanel />
          ) : (
            <HintPanel onLearn={(tech) => openLearn({ tab: 'techniques', tech })} onReport={(hint) => setReport({ kind: 'hint', hint })} />
          )}
          {custom && (
            <div className="hint-panel">
              <div className="hint-head">
                <strong>{t('Custom puzzle')}</strong>
              </div>
              <div className="hint-body">
                {scanPreview && (
                  <div className="scan-check">
                    <img src={scanPreview} alt={t('The scanned grid, as the scanner saw it')} />
                    <p>
                      {t(
                        scanDoubts.length > 0
                          ? "The photo, straightened. Compare it with the board; the red cells are the scanner's doubts: a digit it was unsure of, or ink it could not read."
                          : 'The photo, straightened. Compare it with the board.'
                      )}
                    </p>
                  </div>
                )}
                <p>
                  {t(
                    'Type the givens onto the board ({n} so far). When you are done, sudokUI verifies the puzzle has exactly one solution and rates it before play begins.',
                    { n: givenCount }
                  )}
                </p>
                {customError && <p className="dialog-error">{customError}</p>}
                <div className="hint-actions">
                  <button
                    onClick={() => setCustomError(finishCustomEntry())}
                  >
                    <CheckIcon size={14} /> {t('Check & play')}
                  </button>
                  <button
                    className="ghost"
                    onClick={() => {
                      setCustomError(null);
                      cancelCustomEntry();
                      // the game from before the entry comes back, a reload
                      // or not; with none (a save from before the backup was
                      // kept), a fresh easy one
                      if (!useGame.getState().info) start({ kind: 'level', level: 'Easy' });
                    }}
                  >
                    {t('Cancel')}
                  </button>
                </div>
              </div>
            </div>
          )}
          {errors.length > 0 && (revertIndex !== null || proofs.length > 0) && (
            <div className="hint-panel" role="region" aria-label={t('Mistakes found')}>
              <div className="hint-head">
                <strong>{t('Mistakes found')}</strong>
              </div>
              <div className="hint-body">
                {proofs.length > 0 && (
                  <ul className="proof-list">
                    {proofs.map((p, k) => (
                      <li key={p.cell}>
                        <span>{proofText(p, t)}</span>
                        {(p.conflict !== null || p.steps.length > 0) && (
                          <button className="ghost" onClick={() => showProof(k)}>
                            {t('Show me')}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {revertIndex !== null && (
                  <p>
                    {t(
                      'Jump back to the last position where everything was correct? Your later entries are removed. Ctrl+Z brings them back.'
                    )}
                  </p>
                )}
                <div className="hint-actions">
                  {revertIndex !== null && <button onClick={revertToValid}>↩ {t('Back to correct')}</button>}
                  <button className="ghost" onClick={dismissRevert}>
                    {t('Keep looking')}
                  </button>
                </div>
              </div>
            </div>
          )}
          <footer className="app-footer">
            {/* the static pages exist in every language: /learn/, /nb/learn/, /es/learn/ */}
            <nav className="footer-learn" aria-label={t('Learn sudoku')}>
              <span>{t('Learn:')} </span>
              <a href={`${langRoot(t.lang)}learn/`} onClick={learnLink({ tab: 'techniques' })}>
                {t('Techniques')}
              </a>
              <span aria-hidden="true"> · </span>
              <a href={`${langRoot(t.lang)}learn/intuition/`} onClick={learnLink({ tab: 'intuition' })}>
                {t('Intuition')}
              </a>
              <span aria-hidden="true"> · </span>
              <a href={`${langRoot(t.lang)}learn/glossary/`} onClick={learnLink({ tab: 'glossary' })}>
                {t('Glossary')}
              </a>
              <span aria-hidden="true"> · </span>
              <a href={`${langRoot(t.lang)}${RATING_URL.slice(1)}`} onClick={learnLink({ tab: 'rating' })}>
                {t('HoDoKu rating')}
              </a>
            </nav>
            <a href="https://github.com/AImenes/sudokUI" target="_blank" rel="noreferrer">
              {t('Open source on GitHub')}
            </a>
            <span aria-hidden="true"> · </span>
            <button className="link-button" onClick={() => setReport({ kind: 'problem' })}>
              {t('Send feedback')}
            </button>
            <span aria-hidden="true"> · </span>
            {/* what the app sends, exactly: a static page in the app's language */}
            <a href={`${langRoot(t.lang)}${PRIVACY_URL.slice(1)}`}>{t('Privacy')}</a>
          </footer>
        </aside>
      </main>
      </>
      )}

      {/* Mobile Menu Modal */}
      {showHeaderMenu && isMobile && (
        <Modal title={t('Menu')} onClose={() => setShowHeaderMenu(false)}>
          <div className="mobile-menu-modal-list">
            <button
              type="button"
              className="mobile-menu-modal-item"
              onClick={() => {
                setShowHeaderMenu(false);
                setDialog('new');
              }}
            >
              <span className="menu-icon" aria-hidden="true">▦</span>
              <div className="mobile-menu-modal-text">
                <strong>{t('New puzzle')}</strong>
                <small>{t('Pick difficulty or daily challenge')}</small>
              </div>
            </button>

            <button
              type="button"
              className="mobile-menu-modal-item"
              onClick={() => {
                setShowHeaderMenu(false);
                openLearn({ tab: 'techniques' });
              }}
            >
              <span className="menu-icon" aria-hidden="true"><GraduationCapIcon size={18} /></span>
              <div className="mobile-menu-modal-text">
                <strong>{t('Learn')}</strong>
                <small>{t('Technique guides, intuition & glossary')}</small>
              </div>
            </button>

            <button
              type="button"
              className="mobile-menu-modal-item"
              onClick={() => {
                setShowHeaderMenu(false);
                setDialog('my-techniques');
              }}
            >
              <span className="menu-icon" aria-hidden="true"><GraduationCapIcon size={18} /></span>
              <div className="mobile-menu-modal-text">
                <strong>{t('My Techniques')}</strong>
                <small>{t('Personal mastery settings')}</small>
              </div>
            </button>

            <button
              type="button"
              className="mobile-menu-modal-item"
              onClick={() => {
                setShowHeaderMenu(false);
                setDialog('settings');
              }}
            >
              <span className="menu-icon" aria-hidden="true"><GearIcon size={18} /></span>
              <div className="mobile-menu-modal-text">
                <strong>{t('Settings')}</strong>
                <small>{t('Colours, themes, font & assists')}</small>
              </div>
            </button>

            <button
              type="button"
              className="mobile-menu-modal-item"
              onClick={() => {
                setShowHeaderMenu(false);
                setDialog('io');
              }}
            >
              <span className="menu-icon" aria-hidden="true">⇅</span>
              <div className="mobile-menu-modal-text">
                <strong>{t('Import puzzle')}</strong>
                <small>{t('From clipboard or Sudoku Exchange')}</small>
              </div>
            </button>

            <button
              type="button"
              className="mobile-menu-modal-item"
              onClick={() => {
                setShowHeaderMenu(false);
                setDialog('restart');
              }}
            >
              <span className="menu-icon" aria-hidden="true">↺</span>
              <div className="mobile-menu-modal-text">
                <strong>{t('Restart puzzle')}</strong>
                <small>{t('Reset board to starting clues')}</small>
              </div>
            </button>

            <button
              type="button"
              className="mobile-menu-modal-item"
              onClick={() => {
                setShowHeaderMenu(false);
                setDialog('share');
              }}
            >
              <span className="menu-icon" aria-hidden="true"><LinkIcon size={18} /></span>
              <div className="mobile-menu-modal-text">
                <strong>{t('Share puzzle')}</strong>
                <small>{t('Challenge friends with a link')}</small>
              </div>
            </button>
          </div>
        </Modal>
      )}

      {dialog === 'new' && (
        <NewGameDialog
          onClose={() => setDialog('none')}
          onStart={(level) => {
            setDialog('none');
            start({ kind: 'level', level });
          }}
          onDaily={() => {
            setDialog('none');
            startDaily();
          }}
          onCustom={() => {
            setDialog('none');
            setCustomError(null);
            startCustomEntry();
          }}
        />
      )}
      {dialog === 'practice' && (
        <PracticeDialog
          onClose={() => setDialog('none')}
          onStart={(tech) => {
            setDialog('none');
            startPracticeMode(tech);
          }}
          onStartMixed={() => startPracticeMode('mixed')}
          onLearn={() => openLearn()}
          onPath={() => setDialog('progress')}
        />
      )}
      {dialog === 'learn' && (
        <Suspense fallback={null}>
          <LearnDialog
            target={learnTarget}
            onClose={() => setDialog('none')}
            onPractice={(tech) => {
              setDialog('none');
              startPracticeMode(tech);
            }}
            hub={{ onPractice: () => setDialog('practice'), onPath: () => setDialog('progress') }}
            onScan={
              info && !custom
                ? (tech) => {
                    setDialog('none');
                    openScanner({ lookForTech: tech, autoScan: true });
                  }
                : undefined
            }
            onExample={async (tech) => {
              // the example's own puzzle, started as practice of its technique:
              // with "Jump to the technique" on, that is the pictured position
              const EXAMPLES = await import('../content/examples').then((m) => m.EXAMPLES).catch(() => null);
              const example = EXAMPLES?.[tech];
              const rating = example && rateImport(example.puzzle);
              if (!example || !rating) return;
              setDialog('none');
              useGame.getState().startGame(example.puzzle, rating.score, rating.level, tech);
            }}
          />
        </Suspense>
      )}
      {dialog === 'io' && <ImportDialog onClose={() => setDialog('none')} />}
      {dialog === 'share' && <ShareDialog onClose={() => setDialog('none')} />}
      {dialog === 'steps' && <SolutionPathDialog onClose={() => setDialog('none')} />}
      {welcome && (
        <Modal title={t('Welcome to sudokUI')} onClose={dismissWelcome}>
          <p className="dialog-note">
            {t('A free, open-source sudoku studio. No ads, no account, and it works offline once loaded.')}
          </p>
          <ul className="welcome-list">
            <li>
              <strong>{t('Hints that teach.')}</strong>{' '}
              {t('77 solving techniques, each one explained and drawn on the board when you ask.')}
            </li>
            <li>
              <strong>{t('Practice what you struggle with.')}</strong>{' '}
              {t('Pick any of {n} techniques and get a puzzle that truly needs it.', { n: PRACTICE_TECHS.length })}
            </li>
            <li>
              <strong>{t('One daily puzzle for the whole world.')}</strong>{' '}
              {t('Same board for everyone, every day. Race your friends.')}
            </li>
          </ul>
          <p className="dialog-note">
            {t(
              'Learn, under the board, is where you follow your path, practise a technique and read the theory of every technique and the words solvers use; ⓘ in the top bar covers modes, shortcuts and the candidate system.'
            )}
          </p>
          {/* the buttons wait the moment it takes to read today's band. A
              game under way stays first, whatever the day; then, on a hard
              day, an easy puzzle; else the daily */}
          {welcomeDaily !== undefined && (
            <div className="hint-actions">
              {underWay ? (
                <button onClick={dismissWelcome}>{t('Just play')}</button>
              ) : hardDaily ? (
                <button onClick={startEasyFirst}>{t('Start with an easy puzzle')}</button>
              ) : (
                <button onClick={playWelcomeDaily}>{welcomeDailyLabel}</button>
              )}
              {underWay || hardDaily ? (
                <button className="ghost" onClick={playWelcomeDaily}>
                  {welcomeDailyLabel}
                </button>
              ) : (
                <button className="ghost" onClick={dismissWelcome}>
                  {t('Just play')}
                </button>
              )}
            </div>
          )}
        </Modal>
      )}
      {dialog === 'settings' && (
        <SettingsDialog
          onClose={() => setDialog('none')}
          onMyTechniques={() => setDialog('my-techniques')}
        />
      )}
      {dialog === 'my-techniques' && (
        <MyTechniquesDialog
          onClose={() => setDialog('none')}
          onLearn={(tech) => openLearn({ tab: 'techniques', tech })}
        />
      )}
      {dialog === 'info' && (
        <InfoDialog
          onClose={() => setDialog('none')}
          onLearn={openLearn}
          onFeedback={() => {
            setDialog('none');
            setReport({ kind: 'problem' });
          }}
        />
      )}
      {report && <ReportDialog kind={report.kind} hint={report.hint} onClose={() => setReport(null)} />}
      {dialog === 'progress' && (
        <ProgressDialog
          onClose={() => setDialog('none')}
          onLearn={openLearn}
          onPracticeList={() => setDialog('practice')}
          onPractice={(tech) => {
            setDialog('none');
            startPracticeMode(tech);
          }}
        />
      )}
      {dialog === 'restart' && (
        <Modal title={t('Restart puzzle?')} onClose={() => setDialog('none')}>
          <p className="dialog-note">
            {t(
              info?.practiceTech
                ? 'The board and timer reset to the beginning of the practice position. Your progress on this puzzle is lost.'
                : 'The board and timer reset to the beginning. Your progress on this puzzle is lost.'
            )}
          </p>
          <div className="hint-actions">
            <button
              onClick={() => {
                setDialog('none');
                restart();
              }}
            >
              {t('Restart')}
            </button>
            <button className="ghost" onClick={() => setDialog('none')}>
              {t('Keep playing')}
            </button>
          </div>
        </Modal>
      )}
      {genState && !welcome && (
        <GeneratingDialog label={genState.label} attempts={genState.attempts} onCancel={cancel} />
      )}
      {/* the welcome first: a game won on an earlier visit does not cover it */}
      {won && !victoryDismissed && !welcome && (
        <VictoryDialog
          onNewGame={() => {
            setVictoryDismissed(true);
            setDialog('new');
          }}
          onAnother={
            info?.practiceTech
              ? () => {
                  setVictoryDismissed(true);
                  startPracticeMode(practiceMode === 'mixed' ? 'mixed' : info.practiceTech!);
                }
              : undefined
          }
          onClose={() => setVictoryDismissed(true)}
          onSettings={() => {
            setVictoryDismissed(true);
            setDialog('settings');
          }}
          onProgress={() => {
            setVictoryDismissed(true);
            setDialog('progress');
          }}
        />
      )}
      {/* last among the dialogs, so it paints above the one that raised it
          (the Settings dialog's toggle asks it too) */}
      {contractPrompt && (
        <ContractDialog onAnswer={answerContract} onClose={dismissContractPrompt} forHighlight={contractFor === 'highlight'} />
      )}
      {pendingPositionImport && (
        <PositionImportConfirmDialog
          onClose={() => setDialog('none')}
          onScan={() => {
            setDialog('none');
            openScanner();
          }}
        />
      )}
      <UpdateBar />
      {notice && (
        <div className="toast" role="status" aria-live="polite">
          {notice}
        </div>
      )}
    </div>
  );
}
