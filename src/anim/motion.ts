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
  /** Celebratory motion — merge reveal, XP gain, growth pop. Deliberately underdamped relative
   *  to its stiffness so it overshoots and settles, reading as a "pop" rather than a slide. */
  celebrate: { damping: 10, stiffness: 120, mass: 1 },
  /** Negative/penalty motion — sickness, leave-early. Overdamped on purpose: it settles directly
   *  with no bounce, the opposite feeling from `celebrate`. */
  penalty: { damping: 30, stiffness: 90, mass: 1 },
} as const;

/**
 * Multiplier applied to animation durations (or per-frame deltas, for continuous motion like the
 * tank) when Reduce Motion is on. Not zero — a reduced animation should finish quickly and still
 * communicate state, never vanish outright. See `useReduceMotion`.
 */
export const REDUCED_MOTION_SCALE = 0.35;

export type DurationToken = keyof typeof durations;
