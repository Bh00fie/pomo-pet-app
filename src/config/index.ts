/**
 * Single source of truth for tunable app constants.
 * Nothing in `features/` should hardcode a duration, threshold, or key.
 */

export const APP = {
  /** Placeholder product name — see docs/MVP.md, rename everywhere once decided. */
  name: 'Pomo Pet',
  storageKey: 'pomo-pet-store',
} as const;

export const TIMER = {
  defaultWorkMinutes: 25,
  defaultShortBreakMinutes: 5,
  defaultLongBreakMinutes: 15,
  sessionsBeforeLongBreak: 4,
  minMinutes: 5,
  maxMinutes: 90,
  /** Increment used by the +/- length controls on the Focus screen. */
  stepMinutes: 5,
  /**
   * UI refresh cadence while running. The clock is *derived* from `endsAt` on every tick, so
   * this only controls smoothness — never accuracy. Sub-second so the seconds digit never
   * visibly lags by a full beat.
   */
  tickIntervalMs: 250,
} as const;

export const NOTIFICATIONS = {
  /** Attached to scheduled notifications so ours can be told apart from anything else's. */
  sessionEndCategory: 'session-end',
  focus: {
    title: 'Focus session complete',
    body: 'Nice work. Your fish grew — take a break.',
  },
  break: {
    title: 'Break over',
    body: 'Ready for another session?',
  },
} as const;

export const ACCOUNTABILITY = {
  /**
   * Sustained `background` time before a session is penalised. Never penalise on `inactive`
   * (Control Center, notification shade, incoming call) — see docs/PLAN.md M4.
   */
  backgroundGraceMs: 8_000,
} as const;

export const GROWTH = {
  /** XP awarded per completed minute of focus. This is the whole session→reward formula for M2 —
   *  see `src/features/pet/reward.ts`, which is the only place that reads it. */
  xpPerFocusMinute: 1,
  /** XP needed to fill a stage bar. Filling it does NOT cross a stage — merging does. */
  xpPerStage: 120,
  /** How many same-stage fish must be merged to cross a stage boundary. */
  fishPerMerge: 3,
} as const;

export const STAGES = ['fry', 'juvenile', 'elder'] as const;
export type StageId = (typeof STAGES)[number];

export const AQUARIUM = {
  /** Inset from the tank edge fish steer within, so fins/tails don't clip the glass. */
  tankPaddingPx: 28,
  wander: {
    /** px/s cruising speed range; picked once per fish from a stable per-fish seed. */
    minSpeed: 30,
    maxSpeed: 58,
    /** Max heading change per second while steering toward a target — caps how sharply a fish
     *  can turn, so direction changes read as a steer rather than a snap. */
    turnRateMax: 3.2,
    /** Distance to the current target at which a fish picks a new random one. */
    retargetRadius: 20,
    /** Frame delta is clamped to this before integrating steering, so resuming from a
     *  backgrounded/slow frame never produces a large single-frame jump. */
    maxFrameDtMs: 50,
  },
  bob: { amplitudePx: 4, speedHz: 0.8 },
  /** Multiplier on `speed*4` driving tail-wag frequency — matches the reference canvas fish. */
  tailWagFrequency: 4,
} as const;
