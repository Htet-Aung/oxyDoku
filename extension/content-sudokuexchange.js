// sudokUI Live Sync content script for Sudoku Exchange
// (https://sudokuexchange.com/*)
// Detects changes on the active board and sends extracted positions to the extension background.

(function () {
  'use strict';

  // Prevent multiple injections into the same page
  if (window.__sudokui_exchange_bridge_injected__) {
    return;
  }
  window.__sudokui_exchange_bridge_injected__ = true;

  function bit(d) {
    return 1 << (d - 1);
  }

  function parseSnapshot(initialDigits, snapshot) {
    if (typeof initialDigits !== 'string' || initialDigits.length !== 81) return null;
    const givens = initialDigits.replace(/\./g, '0');
    const values = givens.split('');
    const corner = new Array(81).fill(0);
    const center = new Array(81).fill(0);
    const colors = new Array(81).fill(0);

    if (snapshot && snapshot.trim().length > 0) {
      for (const part of snapshot.split(',')) {
        if (part.length < 3) continue;
        const r = Number(part[0]) - 1;
        const c = Number(part[1]) - 1;
        if (r < 0 || r >= 9 || c < 0 || c >= 9) continue;
        const idx = r * 9 + c;
        const isGiven = givens[idx] >= '1' && givens[idx] <= '9';
        let mode = null;
        for (let i = 2; i < part.length; i++) {
          const ch = part[i];
          if (ch === 'D') {
            const d = part[++i];
            if (!isGiven && d >= '1' && d <= '9') {
              values[idx] = d;
              corner[idx] = 0;
              center[idx] = 0;
            }
            mode = null;
          } else if (ch === 'C') {
            const cc = Number(part[++i]);
            if (cc >= 2 && cc <= 9) colors[idx] = cc - 1;
            mode = null;
          } else if (ch === 'T' || ch === 'N') {
            mode = ch;
          } else if (ch >= '1' && ch <= '9' && !isGiven && values[idx] === '0') {
            if (mode === 'T') corner[idx] |= bit(Number(ch));
            else if (mode === 'N') center[idx] |= bit(Number(ch));
          }
        }
      }
    }

    const hasCorner = corner.some((m) => m !== 0);
    const hasCenter = center.some((m) => m !== 0);
    const hasColors = colors.some((c) => c !== 0);

    return {
      v: 1,
      source: 'sudokuexchange',
      fidelity: hasCorner || hasCenter ? 'full' : 'grid-only',
      givens,
      values: values.join(''),
      ...(hasCorner ? { corner } : {}),
      ...(hasCenter ? { center } : {}),
      ...(hasColors ? { colors } : {})
    };
  }

  function extractFromDOM() {
    // Strategy 1: Check document.body dataset attributes (fastest & most direct in Sudoku Exchange)
    const initDigits = document.body?.dataset?.initialDigits;
    const currentSnap = document.body?.dataset?.currentSnapshot;
    if (initDigits && initDigits.length === 81) {
      const parsed = parseSnapshot(initDigits, currentSnap || '');
      if (parsed) return parsed;
    }

    // Strategy 2: Check localStorage save- records
    try {
      if (window.localStorage) {
        let bestSave = null;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || !key.startsWith('save-')) continue;
          try {
            const val = JSON.parse(localStorage.getItem(key) || '{}');
            if (val && typeof val.initialDigits === 'string' && val.initialDigits.length === 81) {
              if (!bestSave || (val.lastUpdatedTime || 0) >= (bestSave.lastUpdatedTime || 0)) {
                bestSave = val;
              }
            }
          } catch (_) {}
        }
        if (bestSave) {
          const parsed = parseSnapshot(bestSave.initialDigits, bestSave.currentSnapshot || '');
          if (parsed) return parsed;
        }
      }
    } catch (_) {}

    // Strategy 3: Rendered SVG DOM
    try {
      const bgs = document.querySelectorAll('#main-grid svg g.cell-bg[data-cell-index]');
      if (bgs.length === 81) {
        const ga = new Array(81).fill(false);
        const givens = new Array(81).fill('0');
        const values = new Array(81).fill('0');
        const corner = new Array(81).fill(0);
        const center = new Array(81).fill(0);
        const colors = new Array(81).fill(0);
        let x0 = 50, y0 = 50, sz = 100;

        bgs.forEach((el) => {
          const idx = Number(el.getAttribute('data-cell-index'));
          if (idx < 0 || idx >= 81) return;
          ga[idx] = el.classList.contains('given');
          const rect = el.querySelector('rect');
          if (rect) {
            if (idx === 0) {
              x0 = Number(rect.getAttribute('x')) || 50;
              y0 = Number(rect.getAttribute('y')) || 50;
              sz = Number(rect.getAttribute('width')) || 100;
            }
            const m = (rect.getAttribute('class') || '').match(/color-code-(\d)/);
            if (m && Number(m[1]) >= 2) colors[idx] = Number(m[1]) - 1;
          }
        });

        const cellAt = (el) => {
          const c = Math.floor((Number(el.getAttribute('x')) - x0) / sz);
          const r = Math.floor((Number(el.getAttribute('y')) - y0) / sz);
          return r >= 0 && r < 9 && c >= 0 && c < 9 ? r * 9 + c : -1;
        };

        document.querySelectorAll('#main-grid svg text.digit').forEach((t) => {
          const idx = cellAt(t);
          const d = (t.textContent || '').trim();
          if (idx >= 0 && d >= '1' && d <= '9') {
            values[idx] = d;
            if (t.classList.contains('given') || ga[idx]) givens[idx] = d;
          }
        });

        document.querySelectorAll('#main-grid svg text.inner-pencil, #main-grid svg g.inner-pencil text').forEach((t) => {
          const idx = cellAt(t);
          if (idx >= 0 && values[idx] === '0') {
            for (const ch of (t.textContent || '').trim()) {
              if (ch >= '1' && ch <= '9') center[idx] |= bit(Number(ch));
            }
          }
        });

        document.querySelectorAll('#main-grid svg g.outer-pencil text, #main-grid svg text.outer-pencil').forEach((t) => {
          const idx = cellAt(t);
          if (idx >= 0 && values[idx] === '0') {
            for (const ch of (t.textContent || '').trim()) {
              if (ch >= '1' && ch <= '9') corner[idx] |= bit(Number(ch));
            }
          }
        });

        const hasCorner = corner.some((m) => m !== 0);
        const hasCenter = center.some((m) => m !== 0);
        const hasColors = colors.some((c) => c !== 0);

        return {
          v: 1,
          source: 'sudokuexchange',
          fidelity: hasCorner || hasCenter ? 'full' : 'grid-only',
          givens: givens.join(''),
          values: values.join(''),
          ...(hasCorner ? { corner } : {}),
          ...(hasCenter ? { center } : {}),
          ...(hasColors ? { colors } : {})
        };
      }
    } catch (_) {}

    return null;
  }

  function computeSig(payload) {
    if (!payload) return '';
    return (
      (payload.givens || '') +
      '|' +
      (payload.values || '') +
      '|' +
      (payload.corner ? payload.corner.join(',') : '') +
      '|' +
      (payload.center ? payload.center.join(',') : '') +
      '|' +
      (payload.colors ? payload.colors.join(',') : '')
    );
  }

  let port = null;
  let lastSignature = null;
  let debounceTimeout = null;

  function connectPort() {
    try {
      port = chrome.runtime.connect({ name: 'sudokuexchange-tab' });
      port.onDisconnect.addListener(() => {
        port = null;
        setTimeout(connectPort, 1500);
      });
    } catch (_) {
      port = null;
      setTimeout(connectPort, 1500);
    }
  }

  function sendPositionUpdate(payload) {
    const message = {
      type: 'SOURCE_POSITION_UPDATE',
      payload,
      timestamp: Date.now()
    };
    if (port) {
      try {
        port.postMessage(message);
        return;
      } catch (_) {
        port = null;
      }
    }
    try {
      chrome.runtime.sendMessage(message).catch(() => {});
    } catch (_) {}
  }

  function inspectAndSync() {
    const payload = extractFromDOM();
    if (!payload) return;
    const sig = computeSig(payload);
    if (sig === lastSignature) return; // Unchanged
    lastSignature = sig;
    sendPositionUpdate(payload);
  }

  function scheduleSync() {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(inspectAndSync, 100);
  }

  // Handle direct requests from extension background (e.g. when sudokUI requests fresh status)
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.type === 'REQUEST_POSITION') {
        const payload = extractFromDOM();
        if (payload) {
          lastSignature = computeSig(payload);
          sendPositionUpdate(payload);
          sendResponse({ ok: true, payload, timestamp: Date.now() });
        } else {
          sendResponse({ ok: false, reason: 'No active board found' });
        }
      }
      return true;
    });
  } catch (_) {}

  // Setup observers
  function initObservers() {
    // 1. Observe document.body dataset changes
    if (document.body) {
      const bodyObserver = new MutationObserver(() => {
        scheduleSync();
      });
      bodyObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['data-current-snapshot', 'data-initial-digits']
      });
    }

    // 2. Observe #main-grid DOM modifications
    const gridEl = document.getElementById('main-grid');
    if (gridEl) {
      const gridObserver = new MutationObserver(() => {
        scheduleSync();
      });
      gridObserver.observe(gridEl, {
        childList: true,
        subtree: true,
        attributes: true
      });
    } else {
      // If main-grid not yet created, observe parent
      const docObserver = new MutationObserver((mutations, obs) => {
        const el = document.getElementById('main-grid');
        if (el) {
          obs.disconnect();
          initObservers();
          scheduleSync();
        }
      });
      docObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    // 3. Periodic safety interval (500ms) to ensure sync even if DOM events are throttled
    setInterval(() => {
      const snap = document.body?.dataset?.currentSnapshot || '';
      const digits = document.body?.dataset?.initialDigits || '';
      const fastSig = digits + ':' + snap;
      if (fastSig !== lastFastSig) {
        lastFastSig = fastSig;
        inspectAndSync();
      }
    }, 500);
  }

  let lastFastSig = '';

  // Initialize immediately
  connectPort();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initObservers();
      scheduleSync();
    });
  } else {
    initObservers();
    scheduleSync();
  }
})();
