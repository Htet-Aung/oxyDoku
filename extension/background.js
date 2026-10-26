// sudokUI Live Sync background service worker (Manifest V3)
// Relays position updates from Sudoku Exchange to open sudokUI tabs.
// 100% local, no remote network calls, no telemetry.

let cachedPosition = null;
let cachedSignature = null;
let lastUpdated = null;

const sudokuiPorts = new Set();
const sourcePorts = new Set();

const SOURCE_URL_PATTERNS = [
  '*://sudokuexchange.com/*',
  '*://*.sudokuexchange.com/*'
];

function computeSignature(payload) {
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

// Restore saved position on service worker start
try {
  chrome.storage.local.get(['latestPosition', 'latestSignature', 'lastUpdated'], (data) => {
    if (data && data.latestPosition) {
      cachedPosition = data.latestPosition;
      cachedSignature = data.latestSignature || computeSignature(cachedPosition);
      lastUpdated = data.lastUpdated || null;
    }
  });
} catch (_) {}

function broadcastToSudokui(message) {
  for (const port of sudokuiPorts) {
    try {
      port.postMessage(message);
    } catch (_) {
      sudokuiPorts.delete(port);
    }
  }
}

async function isSourceTabOpen() {
  if (sourcePorts.size > 0) return true;
  try {
    const tabs = await chrome.tabs.query({ url: SOURCE_URL_PATTERNS });
    return tabs.length > 0;
  } catch (_) {
    return false;
  }
}

async function notifySyncStatus() {
  const connected = await isSourceTabOpen();
  broadcastToSudokui({
    type: 'SYNC_STATUS',
    connected,
    lastSyncTime: lastUpdated
  });
}

function handlePositionUpdate(payload, timestamp) {
  if (!payload || !payload.givens || !payload.values) return;
  const sig = computeSignature(payload);
  if (sig === cachedSignature) {
    // Even if signature is unchanged, confirm status is connected
    notifySyncStatus();
    return;
  }

  cachedPosition = payload;
  cachedSignature = sig;
  lastUpdated = timestamp || Date.now();

  try {
    chrome.storage.local.set({
      latestPosition: cachedPosition,
      latestSignature: cachedSignature,
      lastUpdated
    });
  } catch (_) {}

  broadcastToSudokui({
    type: 'LIVE_SYNC_POSITION',
    payload: cachedPosition,
    timestamp: lastUpdated
  });
}

// Request latest board snapshot directly from any open Sudoku Exchange tab.
// If the tab was open prior to extension installation, inject the content script dynamically.
async function pollSourceTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: SOURCE_URL_PATTERNS });
    if (!tabs || tabs.length === 0) {
      notifySyncStatus();
      return;
    }

    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, { type: 'REQUEST_POSITION' }, async (resp) => {
        if (chrome.runtime.lastError) {
          // Tab does not have the content script injected yet (e.g. was open before extension load).
          // Dynamically inject it now!
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content-sudokuexchange.js']
            });
          } catch (_) {}
        } else if (resp && resp.payload) {
          handlePositionUpdate(resp.payload, resp.timestamp);
        }
      });
    }

    notifySyncStatus();
  } catch (_) {}
}

// Automatically inject into existing Sudoku Exchange tabs when extension is installed / reloaded
chrome.runtime.onInstalled.addListener(() => {
  pollSourceTabs();
});

// Port connections for long-lived bidirectional communication
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'sudokui-tab') {
    sudokuiPorts.add(port);

    // Initial status and latest position
    isSourceTabOpen().then((connected) => {
      port.postMessage({
        type: 'SYNC_STATUS',
        connected,
        lastSyncTime: lastUpdated
      });
    });

    if (cachedPosition) {
      port.postMessage({
        type: 'LIVE_SYNC_POSITION',
        payload: cachedPosition,
        timestamp: lastUpdated
      });
    }

    // Actively query any open Sudoku Exchange tab to ensure connection is fresh
    pollSourceTabs();

    port.onMessage.addListener((msg) => {
      if (msg && msg.type === 'REQUEST_LATEST_POSITION') {
        pollSourceTabs();
        isSourceTabOpen().then((connected) => {
          port.postMessage({
            type: 'SYNC_STATUS',
            connected,
            lastSyncTime: lastUpdated
          });
        });
        if (cachedPosition) {
          port.postMessage({
            type: 'LIVE_SYNC_POSITION',
            payload: cachedPosition,
            timestamp: lastUpdated
          });
        }
      }
    });

    port.onDisconnect.addListener(() => {
      sudokuiPorts.delete(port);
    });
  } else if (port.name === 'sudokuexchange-tab') {
    sourcePorts.add(port);
    notifySyncStatus();

    port.onMessage.addListener((msg) => {
      if (msg && msg.type === 'SOURCE_POSITION_UPDATE') {
        handlePositionUpdate(msg.payload, msg.timestamp);
      }
    });

    port.onDisconnect.addListener(() => {
      sourcePorts.delete(port);
      notifySyncStatus();
    });
  }
});

// Fallback message listener for one-off requests
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === 'SOURCE_POSITION_UPDATE') {
    handlePositionUpdate(msg.payload, msg.timestamp);
    sendResponse({ ok: true });
  } else if (msg.type === 'REQUEST_LATEST_POSITION') {
    pollSourceTabs();
    isSourceTabOpen().then((connected) => {
      sendResponse({
        type: 'LIVE_SYNC_POSITION',
        payload: cachedPosition,
        timestamp: lastUpdated,
        connected
      });
    });
  } else if (msg.type === 'GET_SYNC_STATUS') {
    isSourceTabOpen().then((connected) => {
      sendResponse({
        type: 'SYNC_STATUS',
        connected,
        lastSyncTime: lastUpdated
      });
    });
  }
  return true;
});
