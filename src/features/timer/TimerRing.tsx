import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

/**
 * The circular session-progress ring from the original 2D concept gallery (see CLAUDE.md's visual
 * references) — a coral arc sweeping clockwise from twelve o'clock over a faint full-circle track,
 * with the clock readout centred inside it. Replaces the 240×6 linear bar the M1 build shipped;
 * the concept always specified a ring, and a ring is the affordance a Pomodoro app is recognised by.
 *
 * **No frame loop, and that is deliberate.** `progress` is a plain number derived from `endsAt` by
 * `useTimer`, which already re-renders at `TIMER.tickIntervalMs`. This draws on those renders and
 * owns no clock of its own, so it does not violate the M2 "one clock per tank, never a second frame
 * driver" rule — the only `useFrameCallback` in the app is still `useAquariumClock`.
 *
 * Skia rather than `react-native-svg`: Skia is already a dependency (the tank, the shop swatch) and
 * `react-native-svg` is not, so this adds no package. The arc is one circle path drawn twice, the
 * second copy trimmed with `end` — not two paths that could drift apart.
 */
interface TimerRingProps {
  /** 0…1. Clamped here, so a caller passing a slightly-over value from float division is safe. */
  progress: number;
  /** Outer diameter, px. */
  size?: number;
  /** Stroke weight of both the track and the arc, px. */
  strokeWidth?: number;
  /** Rendered centred inside the ring — the clock, in practice. */
  children?: ReactNode;
  /** Announced to assistive tech alongside the percentage (e.g. the remaining-time string). */
  accessibilityLabel?: string;
}

/** Concept proportions: a 66px radius and a 10px stroke inside a 150px box. Kept as ratios so the
 *  ring can be resized without re-tuning its weight. */
const RADIUS_RATIO = 66 / 150;
const STROKE_RATIO = 10 / 150;

export function TimerRing({
  progress,
  size = 200,
  strokeWidth,
  children,
  accessibilityLabel,
}: TimerRingProps) {
  const stroke = strokeWidth ?? size * STROKE_RATIO;
  const radius = size * RADIUS_RATIO;
  const clamped = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));

  const path = useMemo(() => {
    const p = Skia.Path.Make();
    p.addCircle(size / 2, size / 2, radius);
    return p;
  }, [size, radius]);

  return (
    <View
      style={[styles.root, { width: size, height: size }]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <Canvas style={{ width: size, height: size }}>
        {/* `addCircle` starts at three o'clock; rotating the group a quarter turn anticlockwise
            about the centre makes the arc start at twelve, as the concept draws it. */}
        <Group transform={[{ rotate: -Math.PI / 2 }]} origin={{ x: size / 2, y: size / 2 }}>
          <Path
            path={path}
            style="stroke"
            strokeWidth={stroke}
            color={colors.surfaceRaised}
          />
          {clamped > 0 && (
            <Path
              path={path}
              style="stroke"
              strokeWidth={stroke}
              strokeCap="round"
              color={colors.coral}
              start={0}
              end={clamped}
            />
          )}
        </Group>
      </Canvas>

      {/* The readout sits in an overlay rather than inside the Canvas: Skia text needs a loaded
          font, and this is the same `Text` primitive (and the same theme tokens) as every other
          number in the app. */}
      <View style={styles.center} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
