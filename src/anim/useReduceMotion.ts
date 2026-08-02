import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { selectSettings, useAppStore } from '@/store';

/**
 * True when animation should be reduced — either the OS accessibility setting is on, or the
 * user turned it on in app settings. Consumers should degrade to a static/eased-out state,
 * never simply skip rendering.
 */
export function useReduceMotion(): boolean {
  const userPreference = useAppStore(selectSettings).reduceMotion;
  const [systemPreference, setSystemPreference] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setSystemPreference(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemPreference);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return systemPreference || userPreference;
}
