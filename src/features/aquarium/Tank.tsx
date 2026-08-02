import { Canvas, Group, Rect } from '@shopify/react-native-skia';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { makeMutable, useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { useAquariumClock } from '@/anim';
import { AQUARIUM, GROWTH } from '@/config';
import { getSpecies, isMergeEligibleStage, type Fish, type MergeResult } from '@/features/pet';
import { useAppStore } from '@/store';
import { colors } from '@/theme';
import { FishTapTarget } from './FishTapTarget';
import { FishSprite } from './Fish';
import { MergeSequence, type MergeGhost } from './MergeSequence';
import {
  randomPointInBounds,
  seededRandom01,
  seedFromId,
  stepFishSteering,
  type FishKinematics,
  type TankBounds,
} from './steering';

interface TankFishEntry {
  fish: Fish;
  kinematics: FishKinematics;
  speed: number;
  seed: number;
}

interface PendingMergeState {
  removedFish: MergeGhost[];
  centerX: number;
  centerY: number;
  newFishId: string;
  /** Distinct per merge so `MergeSequence` fully remounts (fresh internal timers/state) rather
   *  than reusing one instance across back-to-back merges. */
  key: number;
}

export interface TankHandle {
  /**
   * Attempts to merge the current tap-selection (docs/PLAN.md M3). Returns the `MergeResult`
   * (including a rejection reason) when a merge was actually evaluated, or `null` when it
   * declined to even try — wrong selection size, or a merge animation already playing. The
   * Aquarium screen is expected to only enable its Merge button when a valid selection exists,
   * so this return value is mainly a safety net for surfacing an explanation in the rare case a
   * merge is still rejected (e.g. a race with the selection changing underneath it) rather than
   * failing silently.
   */
  mergeSelected: () => MergeResult | null;
  /** Clears the current tap-selection without attempting a merge. */
  clearSelection: () => void;
}

export interface TankProps {
  fish: Fish[];
  /** Fires whenever the tap-to-select selection changes, so the screen can render a
   *  "N/`fishPerMerge` selected" affordance and enable/disable its Merge button. */
  onSelectionChange?: (selectedIds: string[]) => void;
}

/**
 * Renders the whole aquarium on one shared `Canvas`, driven by one shared clock
 * (`useAquariumClock`). Fish steering state (position/velocity/target) lives outside React state
 * — in Reanimated mutables created lazily per fish id — so adding/growing fish never touches the
 * per-frame render path.
 *
 * M3 adds tap-to-select (a transparent `FishTapTarget` overlay per fish, tracking the same
 * kinematics) and the merge sequence: `mergeSelected` (exposed via ref) reads each selected
 * fish's *current* position, atomically applies the merge in the store, then plays
 * `MergeSequence` — converge → burst → spring-reveal — while the merge result's own steering is
 * frozen at the convergence point (`frozenFishIdSV`) and hidden (`revealScaleSV` at 0) until the
 * reveal, so there is never a duplicate sprite for the new fish.
 */
export const Tank = forwardRef<TankHandle, TankProps>(function Tank({ fish, onSelectionChange }, ref) {
  const [size, setSize] = useState<TankBounds>({ width: 0, height: 0 });
  const boundsSV = useSharedValue<TankBounds>({ width: 0, height: 0 });
  const mergeFishAction = useAppStore((s) => s.mergeFish);

  useEffect(() => {
    boundsSV.value = size;
  }, [size, boundsSV]);

  // Kinematics are keyed by fish id and created lazily outside React state (`makeMutable`, not
  // `useSharedValue`) — the fish list can grow/shrink across renders, and shared values cannot
  // be created inside a variable-length loop of hook calls.
  const registryRef = useRef<Map<string, { kinematics: FishKinematics; speed: number; seed: number }>>(
    new Map(),
  );
  // One-shot spawn points for fish that are the *result* of a merge: consumed the first time
  // that fish id gets a registry entry, so it appears exactly where the merge happened instead
  // of at a random point in the tank.
  const mergeSpawnPointsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingMerge, setPendingMerge] = useState<PendingMergeState | null>(null);

  // Only one merge can be mid-reveal at a time (the Merge button is disabled while
  // `pendingMerge` is set) — a single shared value for "which fish id is frozen/scaling" is
  // enough, no map needed. `frozenFishIdSV` gates both the steering step and the per-fish scale
  // transform below.
  const frozenFishIdSV = useSharedValue('');
  const revealScaleSV = useSharedValue(1);

  useEffect(() => {
    onSelectionChange?.(selectedIds);
  }, [selectedIds, onSelectionChange]);

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
      const spawnPoint = mergeSpawnPointsRef.current.get(f.id);
      if (spawnPoint) mergeSpawnPointsRef.current.delete(f.id);
      const start = spawnPoint ?? randomPointInBounds(size, seed);
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
      // A fish mid-reveal holds its position at the merge point until `MergeSequence` finishes
      // and the caller clears `frozenFishIdSV` — otherwise it would wander off before ever
      // being shown.
      if (entry.fish.id === frozenFishIdSV.value) continue;
      stepFishSteering(entry.kinematics, boundsSV.value, dt, entry.speed, entry.seed);
    }
  });

  const toggleFish = useCallback(
    (target: Fish) => {
      if (pendingMerge) return; // selection is locked while a merge animation plays
      if (!isMergeEligibleStage(target.stage)) return; // Elder fish can't be part of a merge

      setSelectedIds((prev) => {
        if (prev.includes(target.id)) return prev.filter((id) => id !== target.id);

        const currentStage = prev.length > 0 ? fish.find((f) => f.id === prev[0])?.stage : null;
        if (currentStage && currentStage !== target.stage) return [target.id]; // stage switch replaces the selection
        if (prev.length >= GROWTH.fishPerMerge) return prev; // already full for this stage

        return [...prev, target.id];
      });
    },
    [fish, pendingMerge],
  );

  useImperativeHandle(
    ref,
    () => ({
      mergeSelected: () => {
        if (pendingMerge) return null;
        if (selectedIds.length !== GROWTH.fishPerMerge) return null;

        // Snapshot each selected fish's *current* position before doing anything else — this is
        // what the convergence animation and the burst center are built from.
        const registry = registryRef.current;
        const positions = selectedIds.map((id) => {
          const entry = registry.get(id);
          return { id, x: entry?.kinematics.x.value ?? 0, y: entry?.kinematics.y.value ?? 0 };
        });

        // The store mutation is atomic and happens here, synchronously, before any animation —
        // if the app were killed the instant after this call returns, the merge is already
        // durably persisted. Everything below is purely the visual echo of something that
        // already happened.
        const result = mergeFishAction(selectedIds, Date.now());
        if (!result.ok) return result; // caller decides whether/how to explain the rejection

        setSelectedIds([]);

        const centerX = positions.reduce((sum, p) => sum + p.x, 0) / positions.length;
        const centerY = positions.reduce((sum, p) => sum + p.y, 0) / positions.length;

        const removedGhosts: MergeGhost[] = selectedIds.map((id) => {
          const snapshot = fish.find((f) => f.id === id)!;
          const pos = positions.find((p) => p.id === id)!;
          return { fish: snapshot, x: pos.x, y: pos.y };
        });

        mergeSpawnPointsRef.current.set(result.newFish.id, { x: centerX, y: centerY });
        frozenFishIdSV.value = result.newFish.id;
        revealScaleSV.value = 0;

        setPendingMerge({
          removedFish: removedGhosts,
          centerX,
          centerY,
          newFishId: result.newFish.id,
          key: Date.now(),
        });

        return result;
      },
      clearSelection: () => setSelectedIds([]),
    }),
    [selectedIds, fish, mergeFishAction, pendingMerge, frozenFishIdSV, revealScaleSV],
  );

  const handleMergeComplete = useCallback(() => {
    frozenFishIdSV.value = '';
    revealScaleSV.value = 1;
    setPendingMerge(null);
  }, [frozenFishIdSV, revealScaleSV]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };

  const hasSize = size.width > 0 && size.height > 0;

  return (
    <View style={styles.root} onLayout={onLayout}>
      {hasSize && (
        <Canvas style={styles.canvas}>
          <Rect x={0} y={0} width={size.width} height={size.height} color={colors.abyss} />
          {entries.map((entry) => (
            <AnimatedFishEntry
              key={entry.fish.id}
              entry={entry}
              elapsed={elapsed}
              frozenFishIdSV={frozenFishIdSV}
              revealScaleSV={revealScaleSV}
            />
          ))}
          {pendingMerge && (
            <MergeSequence
              key={pendingMerge.key}
              removedFish={pendingMerge.removedFish}
              centerX={pendingMerge.centerX}
              centerY={pendingMerge.centerY}
              elapsed={elapsed}
              revealScale={revealScaleSV}
              onComplete={handleMergeComplete}
            />
          )}
        </Canvas>
      )}
      {hasSize && (
        // `pointerEvents="none"` while a merge animation plays: selection is locked (see
        // `toggleFish`) and this keeps the overlay itself out of the way, not just the handler.
        <View style={StyleSheet.absoluteFill} pointerEvents={pendingMerge ? 'none' : 'box-none'}>
          {entries.map((entry) => {
            if (entry.fish.id === pendingMerge?.newFishId) return null; // hidden until the reveal
            const stageParams = getSpecies(entry.fish.speciesId).stageParams[entry.fish.stage];
            const targetSize = Math.max(48, stageParams.bodyLength * 1.8);
            return (
              <FishTapTarget
                key={entry.fish.id}
                kinematics={entry.kinematics}
                size={targetSize}
                selected={selectedIds.includes(entry.fish.id)}
                onPress={() => toggleFish(entry.fish)}
              />
            );
          })}
        </View>
      )}
    </View>
  );
});

/**
 * Wraps one fish sprite in a Skia `Group` so the merge reveal can scale it in from its own
 * current position (`origin` tracks the fish's live kinematics, not a fixed point) — every other
 * fish reads `frozenFishIdSV` as `''` and this collapses to a no-op `{ scale: 1 }` transform.
 */
function AnimatedFishEntry({
  entry,
  elapsed,
  frozenFishIdSV,
  revealScaleSV,
}: {
  entry: TankFishEntry;
  elapsed: SharedValue<number>;
  frozenFishIdSV: SharedValue<string>;
  revealScaleSV: SharedValue<number>;
}) {
  const { fish, kinematics, seed } = entry;

  const transform = useDerivedValue(() => [
    { scale: frozenFishIdSV.value === fish.id ? revealScaleSV.value : 1 },
  ]);
  const origin = useDerivedValue(() => ({ x: kinematics.x.value, y: kinematics.y.value }));

  return (
    <Group transform={transform} origin={origin}>
      <FishSprite fish={fish} kinematics={kinematics} elapsed={elapsed} seed={seed} />
    </Group>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  canvas: { flex: 1 },
});
