import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { selectSettings, useAppStore } from '@/store';
import { REDUCED_MOTION_SCALE } from './motion';

/**
 * Duration multiplier for time-based animation: `1` for normal motion, `REDUCED_MOTION_SCALE`
 * when Reduce Motion is on (from the OS accessibility setting or the in-app override). Multiply
 * a `withTiming` duration — or a per-frame delta, for continuous motion — by this rather than
 * branching on a boolean, so a "reduced" animation still finishes and communicates state instead
 * of being skipped outright.
 */
export function useReduceMotion(): number {
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

  return systemPreference || userPreference ? REDUCED_MOTION_SCALE : 1;
}
