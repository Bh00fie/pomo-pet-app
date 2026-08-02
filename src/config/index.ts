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

export const HEALTH = {
  /**
   * Multiplier applied to a sick fish's saturation (docs/PLAN.md M4) — desaturation, not a flat
   * recolor, is the visual tell that the leave-early penalty actually harmed a fish. Applied to
   * every color derived from the species' base saturation (`src/features/aquarium/Fish.tsx`).
   */
  sickSaturationMultiplier: 0.3,
  /** Multiplier on `AQUARIUM.tailWagFrequency` for a sick fish — a slower wag is what makes the
   *  swim read as sluggish rather than merely a different color. */
  sickTailWagMultiplier: 0.4,
} as const;

export const SHOP = {
  /**
   * USD prices for species sold in the shop (docs/PLAN.md M6a), keyed by species id
   * (`src/features/pet/model.ts`). Kept here rather than on the `Species` record itself, per
   * this file's "no magic numbers in components" rule and to sit alongside every other tunable.
   * The starter species is always unlocked and deliberately has no entry — `model.test.ts` pins
   * that every *other* id in `SPECIES` has one here, so a species can never ship unsellable by
   * omission.
   */
  speciesPriceUsd: {
    'golden-koi': 1.99,
    'indigo-betta': 2.99,
    'reef-shark': 4.49,
    clownfish: 3.99,
  } as Record<string, number>,
  /** Chance (0..1) a mock purchase fails on its own, so the shop UI has to render a real failure
   *  path rather than only ever observing success — see `MockEntitlementProvider`. */
  mockPurchaseFailureRate: 0.1,
  /** Simulated store round-trip, ms, for a mock purchase — long enough that a genuine loading
   *  state is observable rather than reading as instant. */
  mockPurchaseDelayMs: 900,
  /** Simulated round-trip for restore, ms — shorter than a purchase since there is nothing to
   *  charge, only to re-fetch. */
  mockRestoreDelayMs: 300,
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
