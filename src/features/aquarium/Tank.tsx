import { Canvas, Rect } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { makeMutable, useSharedValue } from 'react-native-reanimated';

import { useAquariumClock } from '@/anim';
import { AQUARIUM } from '@/config';
import type { Fish } from '@/features/pet';
import { colors } from '@/theme';
import { FishSprite } from './Fish';
import { randomPointInBounds, seededRandom01, stepFishSteering, type FishKinematics, type TankBounds } from './steering';

/** Cheap deterministic string hash → [0,1), used so each fish's steering seed is stable across
 *  re-renders/re-mounts (keyed by id, not array index — index would shift if fish are removed). */
function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
  return h % 100000;
}

interface TankFishEntry {
  fish: Fish;
  kinematics: FishKinematics;
  speed: number;
  seed: number;
}

export interface TankProps {
  fish: Fish[];
}

/**
 * Renders the whole aquarium on one shared `Canvas`, driven by one shared clock
 * (`useAquariumClock`). Fish steering state (position/velocity/target) lives outside React state
 * — in Reanimated mutables created lazily per fish id — so adding/growing fish never touches the
 * per-frame render path.
 */
export function Tank({ fish }: TankProps) {
  const [size, setSize] = useState<TankBounds>({ width: 0, height: 0 });
  const boundsSV = useSharedValue<TankBounds>({ width: 0, height: 0 });

  useEffect(() => {
    boundsSV.value = size;
  }, [size, boundsSV]);

  // Kinematics are keyed by fish id and created lazily outside React state (`makeMutable`, not
  // `useSharedValue`) — the fish list can grow/shrink across renders, and shared values cannot
  // be created inside a variable-length loop of hook calls.
  const registryRef = useRef<Map<string, { kinematics: FishKinematics; speed: number; seed: number }>>(
    new Map(),
  );

  const entries: TankFishEntry[] = useMemo(() => {
    if (size.width <= 0 || size.height <= 0) return [];

    const registry = registryRef.current;
    const activeIds = new Set(fish.map((f) => f.id));
    for (const id of registry.keys()) {
      if (!activeIds.has(id)) registry.delete(id);
    }

    for (const f of fish) {
      if (registry.has(f.id)) continue;
      const seed = seedFromId(f.id);
      const start = randomPointInBounds(size, seed);
      const speedRange = AQUARIUM.wander.maxSpeed - AQUARIUM.wander.minSpeed;
      const speed = AQUARIUM.wander.minSpeed + seededRandom01(seed + 7.7) * speedRange;
      registry.set(f.id, {
        seed,
        speed,
        kinematics: {
          x: makeMutable(start.x),
          y: makeMutable(start.y),
          vx: makeMutable(0),
          vy: makeMutable(0),
          targetX: makeMutable(start.x),
          targetY: makeMutable(start.y),
        },
      });
    }

    return fish.map((f) => {
      const entry = registry.get(f.id)!;
      return { fish: f, kinematics: entry.kinematics, speed: entry.speed, seed: entry.seed };
    });
    // `size.width`/`size.height` must be dependencies, not just a mount-time guard: the tank
    // starts at 0×0 (before the first `onLayout`), so the transition to a real measured size has
    // to re-run this even when `fish` itself hasn't changed since mount — otherwise fish already
    // in the store at mount time would never get kinematics created.
  }, [fish, size.width, size.height]);

  const { elapsed } = useAquariumClock((dt) => {
    'worklet';
    for (const entry of entries) {
      stepFishSteering(entry.kinematics, boundsSV.value, dt, entry.speed, entry.seed);
    }
  });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };

  return (
    <View style={styles.root} onLayout={onLayout}>
      {size.width > 0 && size.height > 0 && (
        <Canvas style={styles.canvas}>
          <Rect x={0} y={0} width={size.width} height={size.height} color={colors.abyss} />
          {entries.map((entry) => (
            <FishSprite
              key={entry.fish.id}
              fish={entry.fish}
              kinematics={entry.kinematics}
              elapsed={elapsed}
              seed={entry.seed}
            />
          ))}
        </Canvas>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  canvas: { flex: 1 },
});
