import { useEffect, useRef, useState } from 'react';
import { makeMutable, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

import { ParticleBurst, Ripple, durations, easings, springs, useReduceMotion } from '@/anim';
import type { Fish } from '@/features/pet';
import { colors } from '@/theme';
import { FishSprite } from './Fish';
import { seedFromId, type FishKinematics } from './steering';

export interface MergeGhost {
  fish: Fish;
  x: number;
  y: number;
}

export interface MergeSequenceProps {
  /** The fish that were merged away, snapshotted at their on-screen position the instant the
   *  merge was confirmed (the store mutation has *already* happened by the time this mounts —
   *  this is purely the visual echo of fish that no longer exist in the collection). */
  removedFish: MergeGhost[];
  centerX: number;
  centerY: number;
  /** The tank's single shared clock — ghosts still wag/bob like a normal swimming fish while
   *  converging, rather than going stiff. */
  elapsed: SharedValue<number>;
  /** Tank's shared value applied as a scale transform to the *real* new fish entry (already
   *  live in the store/registry, held at `centerX`/`centerY` and hidden at scale 0 by the
   *  caller before this mounts) — this is what actually pops in during the reveal phase, so
   *  there is never a duplicate sprite for the merge result. */
  revealScale: SharedValue<number>;
  /** Called once the whole sequence (or, under reduced motion, immediately) is done — the
   *  caller un-freezes the new fish's steering and clears this component. */
  onComplete: () => void;
}

/**
 * The M3 merge "hero" sequence: selected fish converge on a point, a burst/ripple flashes, and
 * the merge result pops in with an overshoot spring — then the caller lets it settle into normal
 * wander steering. Reuses `ParticleBurst`/`Ripple` (built at M2, unused until now) and
 * `springs.celebrate`.
 *
 * The data mutation already happened in the store before this ever mounts (`useAppStore.mergeFish`
 * is synchronous and atomic) — this component only ever plays a visual echo of something that is
 * already durably true. If the app were killed mid-animation, the merge would already be saved.
 *
 * Respects `useReduceMotion()`: when motion is reduced, this skips straight to calling
 * `onComplete` on mount and renders nothing, rather than a slowed-down version of the sequence.
 * In practice `Tank` already declines to mount it at all under Reduce Motion (so the merge result
 * is never hidden even for a frame) — this branch is the belt-and-braces half of that.
 */
export function MergeSequence({
  removedFish,
  centerX,
  centerY,
  elapsed,
  revealScale,
  onComplete,
}: MergeSequenceProps) {
  const motionScale = useReduceMotion();
  const reduced = motionScale !== 1;

  const [ghostsVisible, setGhostsVisible] = useState(true);
  const [burstTrigger, setBurstTrigger] = useState(0);
  const [rippleTrigger, setRippleTrigger] = useState(0);

  // `onComplete` is what un-freezes the merge result and clears this component. It must run
  // exactly once, and it must run even if the sequence is torn down early (the `Canvas`
  // unmounting on a 0×0 relayout, say) — otherwise the tank is left permanently holding the new
  // fish frozen at scale 0, invisible, with selection locked out until the app restarts.
  // Callers must pass a stable `onComplete` (Tank's is a `useCallback`): the effect below runs
  // once per mount, so it is the mount-time identity that gets called.
  const completedRef = useRef(false);
  const finish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  };

  const ghostKinematicsRef = useRef<Map<string, FishKinematics> | null>(null);
  if (ghostKinematicsRef.current === null) {
    const map = new Map<string, FishKinematics>();
    for (const { fish, x, y } of removedFish) {
      map.set(fish.id, {
        x: makeMutable(x),
        y: makeMutable(y),
        vx: makeMutable(centerX >= x ? 1 : -1),
        vy: makeMutable(0),
        targetX: makeMutable(centerX),
        targetY: makeMutable(centerY),
      });
    }
    ghostKinematicsRef.current = map;
  }

  useEffect(() => {
    if (reduced) {
      finish();
      return;
    }

    const convergeMs = durations.slow;
    for (const k of ghostKinematicsRef.current!.values()) {
      k.x.value = withTiming(centerX, { duration: convergeMs, easing: easings.standard });
      k.y.value = withTiming(centerY, { duration: convergeMs, easing: easings.standard });
    }

    const revealTimer = setTimeout(() => {
      setGhostsVisible(false);
      const now = Date.now();
      setBurstTrigger(now);
      setRippleTrigger(now);
      revealScale.value = withSpring(1, springs.celebrate);
    }, convergeMs);

    const completeTimer = setTimeout(finish, convergeMs + durations.scene);

    return () => {
      clearTimeout(revealTimer);
      clearTimeout(completeTimer);
      // Torn down before the sequence finished — hand the tank back its end state anyway rather
      // than stranding the merge result frozen and invisible. A no-op on the normal path, where
      // `completeTimer` has already run `finish`.
      finish();
    };
    // Runs exactly once per mount — this component is only ever mounted for the lifetime of one
    // merge sequence (the caller keys it and unmounts it on `onComplete`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (reduced) return null;

  return (
    <>
      {ghostsVisible &&
        removedFish.map(({ fish }) => (
          <FishSprite
            key={fish.id}
            fish={fish}
            kinematics={ghostKinematicsRef.current!.get(fish.id)!}
            elapsed={elapsed}
            seed={seedFromId(fish.id)}
          />
        ))}
      {!ghostsVisible && (
        <>
          <Ripple cx={centerX} cy={centerY} trigger={rippleTrigger} color={colors.sun} maxRadius={70} />
          <ParticleBurst cx={centerX} cy={centerY} trigger={burstTrigger} color={colors.sun} count={14} radius={58} />
        </>
      )}
    </>
  );
}
