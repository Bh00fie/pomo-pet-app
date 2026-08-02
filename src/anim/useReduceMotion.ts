import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { selectSettings, useAppStore } from '@/store';
import { REDUCED_MOTION_SCALE } from './motion';

/**
 * Duration multiplier for time-based animation: `1` for normal motion, `REDUCED_MOTION_SCALE`
 * when Reduce Motion is on. Multiply a `withTiming` duration — or a per-frame delta, for
 * continuous motion — by this rather than branching on a boolean, so a "reduced" animation still
 * finishes and communicates state instead of being skipped outright.
 *
 * The effective setting is the user's in-app `settings.reduceMotion` preference (M5) layered over
 * the OS accessibility setting: `'system'` defers to the OS value, `'on'` forces reduced motion
 * even when the OS setting is off, and `'off'` forces full motion even when the OS setting is on
 * — a real override in both directions, not just an additional way to turn it on.
 */
export function useReduceMotion(): number {
  const preference = useAppStore(selectSettings).reduceMotion;
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

  if (preference === 'on') return REDUCED_MOTION_SCALE;
  if (preference === 'off') return 1;
  return systemPreference ? REDUCED_MOTION_SCALE : 1;
}
