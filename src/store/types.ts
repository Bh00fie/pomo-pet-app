// `Fish` is the pet/zoo domain type (docs/PLAN.md M2) — defined once in `src/features/pet/model`
// and re-exported here so the persisted shape and the domain model can never drift apart.
import type { Fish, SpeciesId } from '@/features/pet/model';
export type { Fish, FishHealth, SpeciesId } from '@/features/pet/model';

/**
 * User override of the OS "Reduce Motion" accessibility setting (M5). `'system'` defers to
 * `AccessibilityInfo.isReduceMotionEnabled`; `'on'` forces reduced motion even when the OS
 * setting is off; `'off'` forces full motion even when the OS setting is on. See
 * `src/anim/useReduceMotion.ts`, the only place that reads this.
 */
export type ReduceMotionPreference = 'system' | 'on' | 'off';

export interface Settings {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  hapticsEnabled: boolean;
  notificationsEnabled: boolean;
  reduceMotion: ReduceMotionPreference;
}

export interface Stats {
  totalFocusMs: number;
  completedSessions: number;
  abandonedSessions: number;
  currentStreak: number;
  longestStreak: number;
  /** Local calendar date (YYYY-MM-DD) of the last completed session. */
  lastCompletedLocalDate: string | null;
  /** Focus ms keyed by local calendar date, used by the weekly bars on the stats screen. */
  focusMsByDate: Record<string, number>;
}

export interface Entitlements {
  /** Species unlocked via IAP. The starter species is always present. */
  unlockedSpeciesIds: SpeciesId[];
  /** Tank/container shapes unlocked via IAP — see docs/3D_AQUARIUM_REPORT.md. */
  unlockedTankIds: string[];
}

/**
 * The slice of state that is written to AsyncStorage. Transient things (the running timer's
 * tick, animation values) are deliberately excluded — the timer rehydrates from `endsAt`.
 */
export interface PersistedState {
  fish: Fish[];
  settings: Settings;
  stats: Stats;
  entitlements: Entitlements;
  onboardingCompletedAt: number | null;
}
