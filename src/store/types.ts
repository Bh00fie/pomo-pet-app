import type { StageId } from '@/config';

export type SpeciesId = string;

export type FishHealth = 'healthy' | 'sick';

export interface Fish {
  id: string;
  speciesId: SpeciesId;
  stage: StageId;
  /** XP accrued *within* the current stage. Never crosses a stage on its own — merging does that. */
  xp: number;
  bornAt: number;
  health: FishHealth;
}

export interface Settings {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  hapticsEnabled: boolean;
  notificationsEnabled: boolean;
  /** User override; the OS "Reduce Motion" setting is honoured independently of this. */
  reduceMotion: boolean;
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
