// Compact, quiet Live Sync status indicator in the top header
// Displays real-time connection status with Sudoku Exchange and allows toggling auto-sync.

import React, { useState, useEffect, useRef } from 'react';
import { useLiveSync } from '../state/syncStore';
import { translator } from '../content/i18n';
import { CloseIcon } from './Icons';

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

export const LiveSyncIndicator: React.FC = () => {
  const t = translator();
  const isExtensionDetected = useLiveSync((s) => s.isExtensionDetected);
  const isSourceConnected = useLiveSync((s) => s.isSourceConnected);
  const enabled = useLiveSync((s) => s.enabled);
  const lastSyncTime = useLiveSync((s) => s.lastSyncTime);
  const syncCount = useLiveSync((s) => s.syncCount);
  const lastImportFidelity = useLiveSync((s) => s.lastImportFidelity);
  const lastPositionSummary = useLiveSync((s) => s.lastPositionSummary);
  const setEnabled = useLiveSync((s) => s.setEnabled);
  const requestLatest = useLiveSync((s) => s.requestLatest);

  const [isOpen, setIsOpen] = useState(false);
  const [relativeTime, setRelativeTime] = useState(formatRelativeTime(lastSyncTime));
  const containerRef = useRef<HTMLDivElement>(null);

  // Update relative time display every 3 seconds
  useEffect(() => {
    setRelativeTime(formatRelativeTime(lastSyncTime));
    const interval = setInterval(() => {
      setRelativeTime(formatRelativeTime(lastSyncTime));
    }, 3000);
    return () => clearInterval(interval);
  }, [lastSyncTime]);

  // Close popover on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  let statusClass = 'sync-offline';
  let statusLabel = t('Live Sync offline');
  let dotSymbol = '○';

  if (!enabled) {
    statusClass = 'sync-paused';
    statusLabel = t('Live Sync paused');
    dotSymbol = '‖';
  } else if (isExtensionDetected && isSourceConnected) {
    statusClass = 'sync-active';
    statusLabel = lastSyncTime ? t('Synced {time}', { time: relativeTime }) : t('Live Sync active');
    dotSymbol = '●';
  } else if (isExtensionDetected) {
    statusClass = 'sync-waiting';
    statusLabel = t('Waiting for Sudoku Exchange');
    dotSymbol = '◌';
  }

  return (
    <div className="live-sync-indicator-container" ref={containerRef}>
      <button
        type="button"
        className={`live-sync-pill ${statusClass}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title={t('Sudoku Exchange Live Sync — click for status and options')}
      >
        <span className="sync-dot" aria-hidden="true">
          {dotSymbol}
        </span>
        <span className="sync-label">{statusLabel}</span>
      </button>

      {isOpen && (
        <div className="live-sync-popover" role="dialog" aria-label={t('Live Sync Status')}>
          <div className="live-sync-header">
            <h4>{t('Sudoku Exchange Live Sync')}</h4>
            <button
              type="button"
              className="live-sync-close"
              onClick={() => setIsOpen(false)}
              aria-label={t('Close')}
            >
              <CloseIcon size={12} />
            </button>
          </div>

          <div className="live-sync-body">
            <div className="live-sync-row">
              <span className="live-sync-prop">{t('Extension Bridge')}</span>
              <span className={`live-sync-val ${isExtensionDetected ? 'text-ok' : 'text-muted'}`}>
                {isExtensionDetected ? t('Connected') : t('Not detected')}
              </span>
            </div>

            <div className="live-sync-row">
              <span className="live-sync-prop">{t('Sudoku Exchange')}</span>
              <span className={`live-sync-val ${isSourceConnected ? 'text-ok' : 'text-amber'}`}>
                {isSourceConnected ? t('Tab connected') : t('Tab not found')}
              </span>
            </div>

            {lastSyncTime && (
              <div className="live-sync-row">
                <span className="live-sync-prop">{t('Last Synced')}</span>
                <span className="live-sync-val">
                  {relativeTime} ({new Date(lastSyncTime).toLocaleTimeString()})
                </span>
              </div>
            )}

            {lastPositionSummary && (
              <div className="live-sync-row">
                <span className="live-sync-prop">{t('Board Details')}</span>
                <span className="live-sync-val">
                  {lastPositionSummary.givenCount} {t('givens')}, {lastPositionSummary.entryCount}{' '}
                  {t('entries')}
                  {lastPositionSummary.markedCellCount > 0 &&
                    `, ${lastPositionSummary.markedCellCount} ${t('with notes')}`}
                </span>
              </div>
            )}

            {lastImportFidelity && (
              <div className="live-sync-row">
                <span className="live-sync-prop">{t('Note Fidelity')}</span>
                <span className="live-sync-val">
                  {lastImportFidelity === 'full'
                    ? t('Full (Corner & Centre notes)')
                    : t('Grid-only (Candidates computed)')}
                </span>
              </div>
            )}

            <div className="live-sync-toggle-row">
              <label className="live-sync-toggle-label">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <span>{t('Enable automatic board synchronization')}</span>
              </label>
            </div>

            {!isExtensionDetected && (
              <div className="live-sync-install-tip">
                <p>
                  {t(
                    'Load the unpacked extension from the "extension" folder in this repo into Chrome/Brave/Edge to enable instant live sync.'
                  )}
                </p>
              </div>
            )}

            {isExtensionDetected && !isSourceConnected && (
              <div className="live-sync-install-tip">
                <p>
                  {t(
                    'Sudoku Exchange tab not connected. Make sure https://sudokuexchange.com/play/ is open, and refresh (F5) the Sudoku Exchange tab once.'
                  )}
                </p>
              </div>
            )}
          </div>

          <div className="live-sync-footer">
            <button
              type="button"
              className="live-sync-btn-refresh"
              onClick={() => {
                requestLatest();
              }}
            >
              {t('Check for Updates')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
