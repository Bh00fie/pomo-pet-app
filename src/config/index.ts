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
} as const;

export const ACCOUNTABILITY = {
  /**
   * Sustained `background` time before a session is penalised. Never penalise on `inactive`
   * (Control Center, notification shade, incoming call) — see docs/PLAN.md M4.
   */
  backgroundGraceMs: 8_000,
} as const;

export const GROWTH = {
  /** XP awarded per completed minute of focus. */
  xpPerFocusMinute: 1,
  /** XP needed to fill a stage bar. Filling it does NOT cross a stage — merging does. */
  xpPerStage: 120,
  /** How many same-stage fish must be merged to cross a stage boundary. */
  fishPerMerge: 3,
} as const;

export const STAGES = ['fry', 'juvenile', 'elder'] as const;
export type StageId = (typeof STAGES)[number];
