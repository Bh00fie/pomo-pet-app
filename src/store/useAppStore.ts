import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { APP, TIMER } from '@/config';
// Submodule imports (not the `@/features/pet` barrel) — the barrel re-exports `useSessionReward`,
// which imports this store, and going through it here would create a module-load cycle.
import { generateFishId } from '@/features/pet/id';
import { STARTER_SPECIES_ID } from '@/features/pet/model';
import { applySessionReward } from '@/features/pet/reward';
import { SCHEMA_VERSION, migrate } from './migrations';
import { asyncStorageJSON } from './storage';
import type { PersistedState, Settings } from './types';

interface AppActions {
  setSettings: (patch: Partial<Settings>) => void;
  completeOnboarding: () => void;
  /** Applies one focus session's reward (docs/PLAN.md M2): grows an existing fish's XP, or
   *  spawns a starter Fry if the user has none yet. Called by `useSessionReward` on the timer
   *  engine's `completed` transition. */
  awardSessionCompletion: (focusMs: number, now: number) => void;
  /** Test/dev affordance — wipes persisted state back to defaults. */
  resetAll: () => void;
}

export type AppStore = PersistedState & {
  /** False until AsyncStorage has been read back, so UI can avoid flashing default state. */
  hydrated: boolean;
} & AppActions;

const initialPersisted: PersistedState = {
  fish: [],
  settings: {
    workMinutes: TIMER.defaultWorkMinutes,
    shortBreakMinutes: TIMER.defaultShortBreakMinutes,
    longBreakMinutes: TIMER.defaultLongBreakMinutes,
    hapticsEnabled: true,
    notificationsEnabled: true,
    reduceMotion: false,
  },
  stats: {
    totalFocusMs: 0,
    completedSessions: 0,
    abandonedSessions: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastCompletedLocalDate: null,
    focusMsByDate: {},
  },
  entitlements: {
    unlockedSpeciesIds: [STARTER_SPECIES_ID],
    unlockedTankIds: ['rectangular'],
  },
  onboardingCompletedAt: null,
};

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      ...initialPersisted,
      hydrated: false,

      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      completeOnboarding: () => set({ onboardingCompletedAt: Date.now() }),

      awardSessionCompletion: (focusMs, now) =>
        set((s) => {
          const result = applySessionReward({
            fish: s.fish,
            focusMs,
            now,
            idFactory: () => generateFishId(now),
          });
          return { fish: result.fish };
        }),

      resetAll: () => set({ ...initialPersisted }),
    }),
    {
      name: APP.storageKey,
      storage: asyncStorageJSON,
      version: SCHEMA_VERSION,
      migrate: (persisted, version) => migrate(persisted, version),
      // Only the persisted slice is written; `hydrated` and actions are recreated on boot.
      partialize: (s): PersistedState => ({
        fish: s.fish,
        settings: s.settings,
        stats: s.stats,
        entitlements: s.entitlements,
        onboardingCompletedAt: s.onboardingCompletedAt,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error && __DEV__) console.warn('[store] rehydrate failed', error);
        useAppStore.setState({ hydrated: true });
      },
    },
  ),
);

/** Selectors — keep components subscribing to the narrowest slice they need. */
export const selectSettings = (s: AppStore) => s.settings;
export const selectStats = (s: AppStore) => s.stats;
export const selectFish = (s: AppStore) => s.fish;
export const selectHydrated = (s: AppStore) => s.hydrated;
