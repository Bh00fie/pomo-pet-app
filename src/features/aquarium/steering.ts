/**
 * Wander-toward-target steering for the tank. Every function here runs inside the tank's single
 * `useFrameCallback` worklet (see `Tank.tsx` / `src/anim/useAquariumClock.ts`) — fish never run
 * their own animation driver, they just get stepped from one shared loop.
 *
 * Not unit-tested with the rest of `src/features/pet`: these are Reanimated worklets operating
 * on `SharedValue`s, which only exist on the UI thread — there is nothing meaningful to assert
 * against under Jest without a mounted native runtime. The plain-number math this composes with
 * (fish shape parameters) lives in `src/features/pet/geometry.ts` and *is* tested.
 */
import type { SharedValue } from 'react-native-reanimated';

import { AQUARIUM } from '@/config';

export interface FishKinematics {
  x: SharedValue<number>;
  y: SharedValue<number>;
  vx: SharedValue<number>;
  vy: SharedValue<number>;
  targetX: SharedValue<number>;
  targetY: SharedValue<number>;
}

export interface TankBounds {
  width: number;
  height: number;
}

/** Cheap deterministic pseudo-random in [0,1) — steering must not use `Math.random()` directly
 *  inside a worklet loop in a way that makes behaviour irreproducible across re-renders. Also
 *  used from the JS thread (`Tank.tsx`) to seed a new fish's starting position/speed, so it is
 *  a plain function rather than worklet-only — `'worklet'`-directive functions remain callable
 *  normally, they just gain the ability to also run on the UI thread. */
export function seededRandom01(seed: number): number {
  'worklet';
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function randomPointInBounds(bounds: TankBounds, seed: number): { x: number; y: number } {
  'worklet';
  const pad = AQUARIUM.tankPaddingPx;
  const w = Math.max(1, bounds.width - pad * 2);
  const h = Math.max(1, bounds.height - pad * 2);
  return {
    x: pad + seededRandom01(seed) * w,
    y: pad + seededRandom01(seed + 100.7) * h,
  };
}

function approach(current: number, target: number, maxDelta: number): number {
  'worklet';
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

/**
 * One steering step for a single fish: seeks its current target at a capped turn rate, and picks
 * a fresh random target once it arrives (or if it hasn't moved yet, `retargetRadius` distance
 * away from wherever it currently is). `speed` is a constant per fish (picked once from its
 * seed, not animated) so cruising pace varies across the school without extra state.
 */
export function stepFishSteering(
  fish: FishKinematics,
  bounds: TankBounds,
  dt: number,
  speed: number,
  seed: number,
): void {
  'worklet';
  if (dt <= 0 || bounds.width <= 0 || bounds.height <= 0) return;

  const dx = fish.targetX.value - fish.x.value;
  const dy = fish.targetY.value - fish.y.value;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < AQUARIUM.wander.retargetRadius) {
    const next = randomPointInBounds(bounds, seed + fish.x.value * 0.013 + fish.y.value * 0.029);
    fish.targetX.value = next.x;
    fish.targetY.value = next.y;
    return;
  }

  const desiredVx = (dx / dist) * speed;
  const desiredVy = (dy / dist) * speed;

  // Turn rate is scaled by speed so it reads as an angular cap (rad/s-ish) rather than a fixed
  // px/s delta that would make fast fish turn crisply and slow fish turn sluggishly.
  const maxDelta = AQUARIUM.wander.turnRateMax * speed * dt;
  fish.vx.value = approach(fish.vx.value, desiredVx, maxDelta);
  fish.vy.value = approach(fish.vy.value, desiredVy, maxDelta);

  fish.x.value += fish.vx.value * dt;
  fish.y.value += fish.vy.value * dt;

  // A hard clamp keeps a fish inside the glass even if something nudged it there externally
  // (e.g. the tank resized), rather than relying only on gradual steering to bring it back.
  const pad = AQUARIUM.tankPaddingPx;
  fish.x.value = clamp(fish.x.value, pad, Math.max(pad, bounds.width - pad));
  fish.y.value = clamp(fish.y.value, pad, Math.max(pad, bounds.height - pad));
}
