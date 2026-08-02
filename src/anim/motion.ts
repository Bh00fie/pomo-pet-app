import { Easing } from 'react-native-reanimated';

/**
 * Motion tokens. Every animation in the app pulls its duration/easing from here so timing stays
 * coherent across the timer, the tank, and the merge sequence (docs/PLAN.md M2).
 */
export const durations = {
  instant: 90,
  fast: 180,
  base: 280,
  slow: 480,
  scene: 900,
} as const;

export const easings = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  decelerate: Easing.out(Easing.cubic),
  accelerate: Easing.in(Easing.cubic),
  /** Water-like: slow in, slow out, no overshoot. */
  drift: Easing.inOut(Easing.sin),
} as const;

export const springs = {
  gentle: { damping: 18, stiffness: 120, mass: 1 },
  snappy: { damping: 14, stiffness: 220, mass: 0.8 },
} as const;

export type DurationToken = keyof typeof durations;
