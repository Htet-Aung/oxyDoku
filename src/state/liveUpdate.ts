/**
 * Live updates for native mobile builds (Capacitor).
 *
 * Downloads OTA web asset bundles from GitHub Releases in the background
 * without requiring the user to reinstall APK files.
 */
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { useAppStatus } from './appStatus';

declare const __APP_VERSION__: string;

const UPDATE_MANIFEST_URL = 'https://github.com/Htet-Aung/oxyDoku/releases/download/v1.0.0-apk/live-update.json';

/**
 * Confirm to the native container that JS loaded successfully.
 * Must be called as early as possible on bundle execution.
 */
export async function notifyLiveUpdateReady(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await CapacitorUpdater.notifyAppReady();
  } catch (err) {
    console.warn('[live-update] notifyAppReady error:', err);
  }
}

/**
 * Check for updates in the background.
 */
export async function checkForLiveUpdate(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !navigator.onLine) return;

  try {
    const res = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    if (!res.ok) return;

    const manifest = (await res.json()) as { version?: string; url?: string; checksum?: string };
    if (!manifest.version || !manifest.url || !manifest.checksum) return;

    // Check currently active bundle version
    const current = await CapacitorUpdater.current().catch(() => null);
    const activeVersion = current?.bundle?.version;

    // Skip if we are already running this version
    if (activeVersion === manifest.version) return;

    // If running the APK's built-in bundle, compare with compile-time __APP_VERSION__
    if (!activeVersion || activeVersion === 'builtin') {
      if (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ === manifest.version) {
        return;
      }
    }

    console.log('[live-update] Downloading bundle:', manifest.version);
    // Download the new bundle zip in the background
    const bundle = await CapacitorUpdater.download({
      url: manifest.url,
      version: manifest.version,
      checksum: manifest.checksum
    });

    if (bundle && bundle.id) {
      console.log('[live-update] Staging update for next launch:', bundle.id);
      // Stage the update to activate automatically on next app restart or background switch
      await CapacitorUpdater.next({ id: bundle.id });

      // Connect to AppStatus so the player can choose to reload immediately if they want
      useAppStatus.getState().setReload(async () => {
        try {
          await CapacitorUpdater.reload();
        } catch {
          window.location.reload();
        }
      });
      useAppStatus.getState().setUpdateReady('update');
    }
  } catch (err) {
    console.warn('[live-update] check or download failed:', err);
  }
}

/**
 * Initialize live update listeners and trigger an initial background check.
 */
export function initLiveUpdates(): void {
  if (!Capacitor.isNativePlatform()) return;

  notifyLiveUpdateReady();

  // Defer the network check slightly so it doesn't contend with initial game rendering
  setTimeout(() => {
    checkForLiveUpdate();
  }, 3000);

  // Check periodically while app remains open
  const CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes
  setInterval(() => {
    if (navigator.onLine) checkForLiveUpdate();
  }, CHECK_INTERVAL);

  // Check when returning to the app
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      checkForLiveUpdate();
    }
  });
}
