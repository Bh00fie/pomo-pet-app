import { Circle, Group } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import { durations, easings } from './motion';
import { useReduceMotion } from './useReduceMotion';

export interface RippleProps {
  cx: number;
  cy: number;
  color?: string;
  /** Bump to any new, non-zero value (e.g. `Date.now()`) to (re)play the ripple. */
  trigger: number;
  maxRadius?: number;
  strokeWidth?: number;
}

/**
 * An expanding, fading ring — a reusable primitive for celebration/impact moments (merge reveal,
 * growth). Not wired into any screen yet (that lands in M3/M4); this just needs to exist and
 * work, driven by its own timing rather than the shared tank clock since it fires in contexts
 * that may not have a `Tank` mounted.
 */
export function Ripple({ cx, cy, color = '#EAF4FF', trigger, maxRadius = 60, strokeWidth = 2 }: RippleProps) {
  const progress = useSharedValue(0);
  const motionScale = useReduceMotion();

  useEffect(() => {
    if (!trigger) return;
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: durations.scene * motionScale,
      easing: easings.decelerate,
    });
  }, [trigger, motionScale, progress]);

  const radius = useDerivedValue(() => 4 + progress.value * (maxRadius - 4));
  const opacity = useDerivedValue(() => 1 - progress.value);

  return (
    <Group opacity={opacity}>
      <Circle cx={cx} cy={cy} r={radius} color={color} style="stroke" strokeWidth={strokeWidth} />
    </Group>
  );
}
