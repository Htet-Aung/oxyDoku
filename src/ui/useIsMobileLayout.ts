import { useState, useEffect } from 'react';
import { useSettings } from '../state/settings';

const MOBILE_MEDIA_QUERY = '(max-width: 860px), (pointer: coarse) and (max-width: 1024px)';

export function useIsMobileLayout(): boolean {
  const layoutMode = useSettings((s) => s.layoutMode);

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (layoutMode === 'mobile') return true;
    if (layoutMode === 'desktop') return false;
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  });

  useEffect(() => {
    if (layoutMode === 'mobile') {
      setIsMobile(true);
      return;
    }
    if (layoutMode === 'desktop') {
      setIsMobile(false);
      return;
    }

    const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
    };

    setIsMobile(mq.matches);

    if (mq.addEventListener) {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      // legacy browser fallback
      mq.addListener(handler);
      return () => mq.removeListener(handler);
    }
  }, [layoutMode]);

  return isMobile;
}
