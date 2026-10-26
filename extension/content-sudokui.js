// sudokUI Live Sync content script for sudokUI Pattern Lab
// (http://localhost:5173/*, http://127.0.0.1:5173/*, etc.)
// Bridges extension messages with the sudokUI page via window CustomEvents.

(function () {
  'use strict';

  if (window.__sudokui_live_sync_bridge_injected__) {
    return;
  }
  window.__sudokui_live_sync_bridge_injected__ = true;

  // Mark DOM so sudokUI knows the extension is present immediately
  function markReady() {
    if (document.documentElement) {
      document.documentElement.setAttribute('data-sudokui-live-sync-extension', 'true');
    }
    window.dispatchEvent(new CustomEvent('sudokui:extension-ready'));
  }

  markReady();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markReady);
  }

  let port = null;

  function dispatchToPage(eventName, detail) {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  function handleMessage(msg) {
    if (!msg) return;
    if (msg.type === 'LIVE_SYNC_POSITION') {
      dispatchToPage('sudokui:live-sync', {
        payload: msg.payload,
        timestamp: msg.timestamp
      });
    } else if (msg.type === 'SYNC_STATUS') {
      dispatchToPage('sudokui:sync-status', {
        connected: msg.connected,
        lastSyncTime: msg.lastSyncTime
      });
    }
  }

  function connectPort() {
    try {
      port = chrome.runtime.connect({ name: 'sudokui-tab' });
      port.onMessage.addListener(handleMessage);
      port.onDisconnect.addListener(() => {
        port = null;
        setTimeout(connectPort, 1500);
      });
    } catch (_) {
      port = null;
      setTimeout(connectPort, 1500);
    }
  }

  // Handle page requests for latest status / board
  window.addEventListener('sudokui:request-latest', () => {
    if (port) {
      try {
        port.postMessage({ type: 'REQUEST_LATEST_POSITION' });
      } catch (_) {
        port = null;
      }
    }
    try {
      chrome.runtime.sendMessage({ type: 'REQUEST_LATEST_POSITION' }, (resp) => {
        if (resp) handleMessage(resp);
      }).catch(() => {});
    } catch (_) {}
  });

  // Also listen for one-off runtime messages
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      handleMessage(msg);
    });
  } catch (_) {}

  connectPort();
})();
