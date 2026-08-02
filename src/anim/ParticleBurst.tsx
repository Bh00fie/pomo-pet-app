import { Path, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import { durations, easings } from './motion';
import { useReduceMotion } from './useReduceMotion';

export interface ParticleBurstProps {
  cx: number;
  cy: number;
  color?: string;
  /** Bump to any new, non-zero value (e.g. `Date.now()`) to (re)play the burst. */
  trigger: number;
  count?: number;
  radius?: number;
}

/**
 * A burst of small particles flying outward from a point and fading — a reusable primitive for
 * celebration moments (merge reveal, XP gain). Not wired into any screen yet (M3/M4); this just
 * needs to exist and work. All particles are drawn as one `Path` (circles unioned via
 * `addCircle`) so a burst costs one draw call regardless of `count`.
 */
export function ParticleBurst({ cx, cy, color = '#FFD166', trigger, count = 10, radius = 46 }: ParticleBurstProps) {
  const progress = useSharedValue(0);
  const motionScale = useReduceMotion();

  // Deterministic per-particle angle/speed spread — stable across re-renders, no Math.random().
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        angle: (i / count) * Math.PI * 2 + ((i % 3) - 1) * 0.12,
        speed: 0.55 + ((i * 37) % 10) / 10,
      })),
    [count],
  );

  useEffect(() => {
    if (!trigger) return;
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: durations.scene * motionScale,
      easing: easings.decelerate,
    });
  }, [trigger, motionScale, progress]);

  const path = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const eased = progress.value;
    for (const seed of seeds) {
      const dist = eased * radius * seed.speed;
      const px = cx + Math.cos(seed.angle) * dist;
      const py = cy + Math.sin(seed.angle) * dist;
      const r = Math.max(0, 3 * (1 - eased));
      if (r > 0) p.addCircle(px, py, r);
    }
    return p;
  }, [cx, cy, radius, seeds]);

  const opacity = useDerivedValue(() => 1 - progress.value);

  return <Path path={path} color={color} opacity={opacity} />;
}
