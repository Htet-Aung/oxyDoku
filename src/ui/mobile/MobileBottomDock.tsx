import React from 'react';
import { useT } from '../../content/i18n';
import { MicroscopeIcon, LightbulbIcon, ToolsIcon, MenuIcon } from '../Icons';

interface MobileBottomDockProps {
  scannerOpen: boolean;
  hintActive: boolean;
  toolsOpen: boolean;
  onToggleScanner: () => void;
  onHint: () => void;
  onToggleTools: () => void;
  onOpenMenu: () => void;
}

export function MobileBottomDock({
  scannerOpen,
  hintActive,
  toolsOpen,
  onToggleScanner,
  onHint,
  onToggleTools,
  onOpenMenu
}: MobileBottomDockProps) {
  const t = useT();

  return (
    <nav className="mobile-bottom-dock" role="navigation" aria-label={t('Mobile controls dock')}>
      <button
        type="button"
        className={`mobile-dock-btn ${scannerOpen ? 'active' : ''}`}
        onClick={onToggleScanner}
        title={t('Patterns')}
        aria-pressed={scannerOpen}
      >
        <span className="mobile-dock-icon" aria-hidden="true">
          <MicroscopeIcon size={20} />
        </span>
        <span className="mobile-dock-label">{t('Patterns')}</span>
      </button>

      <button
        type="button"
        className={`mobile-dock-btn ${hintActive && !scannerOpen ? 'active' : ''}`}
        onClick={onHint}
        title={t('Hint')}
      >
        <span className="mobile-dock-icon" aria-hidden="true">
          <LightbulbIcon size={20} />
        </span>
        <span className="mobile-dock-label">{t('Hint')}</span>
      </button>

      <button
        type="button"
        className={`mobile-dock-btn ${toolsOpen ? 'active' : ''}`}
        onClick={onToggleTools}
        title={t('Assist & tools')}
        aria-pressed={toolsOpen}
      >
        <span className="mobile-dock-icon" aria-hidden="true">
          <ToolsIcon size={20} />
        </span>
        <span className="mobile-dock-label">{t('Assist')}</span>
      </button>

      <button
        type="button"
        className="mobile-dock-btn"
        onClick={onOpenMenu}
        title={t('Menu')}
        aria-label={t('Menu')}
      >
        <span className="mobile-dock-icon" aria-hidden="true">
          <MenuIcon size={20} />
        </span>
        <span className="mobile-dock-label">{t('Menu')}</span>
      </button>
    </nav>
  );
}
