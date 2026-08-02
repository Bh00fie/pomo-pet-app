import { useEffect } from 'react';
import { useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { useReduceMotion } from './useReduceMotion';

export interface AquariumClock {
  /** Seconds elapsed since the clock mounted. Drives every periodic motion (wag, bob, drift) —
   *  read it via `useDerivedValue`, never store your own running total. */
  elapsed: SharedValue<number>;
}

export type AquariumFrameCallback = (dtSeconds: number) => void;

const MAX_FRAME_DT_SECONDS = 0.05;

/**
 * The tank's single animation driver (docs/PLAN.md M2). Call this once per mounted tank, not
 * once per fish — every fish reads the same `elapsed` shared value, and any stateful per-frame
 * work (steering, etc.) should be threaded through `onFrame` rather than each consumer running
 * its own `useFrameCallback`. That is what keeps N fish on one native frame loop instead of N.
 *
 * Frame delta is clamped before use so a slow/backgrounded frame never produces a large single
 * step, and scaled by the Reduce Motion multiplier so the whole tank calms down together rather
 * than each fish reacting independently.
 */
export function useAquariumClock(onFrame?: AquariumFrameCallback): AquariumClock {
  const elapsed = useSharedValue(0);
  const motionScale = useReduceMotion();
  const motionScaleSV = useSharedValue(motionScale);

  useEffect(() => {
    motionScaleSV.value = motionScale;
  }, [motionScale, motionScaleSV]);

  useFrameCallback((frameInfo) => {
    'worklet';
    const rawDtSeconds = (frameInfo.timeSincePreviousFrame ?? 16.6) / 1000;
    const dt = Math.min(rawDtSeconds, MAX_FRAME_DT_SECONDS) * motionScaleSV.value;
    elapsed.value += dt;
    if (onFrame) onFrame(dt);
  });

  return { elapsed };
}
