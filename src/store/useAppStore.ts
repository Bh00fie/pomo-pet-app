import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { APP, GROWTH, TIMER } from '@/config';
// Submodule imports (not the `@/features/pet` barrel) — the barrel re-exports `useSessionReward`,
// which imports this store, and going through it here would create a module-load cycle.
import { generateFishId } from '@/features/pet/id';
import { evaluateMerge, type MergeResult } from '@/features/pet/merge';
import { addXp, createFish, STARTER_SPECIES_ID, type SpeciesId } from '@/features/pet/model';
import { applyPenalty } from '@/features/pet/penalty';
import { applySessionReward, distributeXp } from '@/features/pet/reward';
import { applyCompletedSessionToStreak, toLocalDateString } from '@/features/streak';
import { SCHEMA_VERSION, migrate } from './migrations';
import { asyncStorageJSON } from './storage';
import type { PersistedState, Settings } from './types';

/**
 * The species a fresh Fry hatches as (docs/PLAN.md M6a): the user's chosen `activeSpeciesId`,
 * re-validated against `entitlements.unlockedSpeciesIds` on every call rather than trusted as
 * stored, falling back to the starter. Factored out of `awardSessionCompletion` so the debug
 * panel's "Spawn fish" action reuses this exact resolution instead of a second copy of it.
 */
function resolveSpawnSpeciesId(s: Pick<AppStore, 'settings' | 'entitlements'>): SpeciesId {
  return s.entitlements.unlockedSpeciesIds.includes(s.settings.activeSpeciesId)
    ? s.settings.activeSpeciesId
    : STARTER_SPECIES_ID;
}

interface AppActions {
  setSettings: (patch: Partial<Settings>) => void;
  completeOnboarding: () => void;
  /** Applies one focus session's reward (docs/PLAN.md M2): grows an existing fish's XP, or
   *  spawns a starter Fry if the user has none yet. Called by `useSessionReward` on the timer
   *  engine's `completed` transition. */
  awardSessionCompletion: (focusMs: number, now: number) => void;
  /**
   * Applies the M4 leave-early penalty (docs/PLAN.md M4): marks the same fish a completed
   * session would have grown as `sick` instead, and counts the session as abandoned in stats.
   * Called from `useLeaveEarlyPenalty` exactly when the timer engine auto-abandons a running
   * session for staying backgrounded past `ACCOUNTABILITY.backgroundGraceMs` — never for a
   * manual "Give up", which has its own counter-only action below.
   */
  penalizeAbandonedSession: (now: number) => void;
  /**
   * Counts a manual "Give up" as an abandoned session — the M5-review fix for a counter literally
   * named `abandonedSessions` that used to under-report by not counting every way a session gets
   * abandoned. Deliberately does **not** touch `fish` health: the decision that give-up stays
   * exempt from sickening a fish (the reward is already withheld, which is its own consequence)
   * is unchanged. Called from `useTimerStore.abandon`, the manual-only path — the auto-abandon
   * path already counts the session via `penalizeAbandonedSession` above.
   */
  recordManualAbandon: () => void;
  /**
   * Evaluates and, if legal, atomically applies a merge (docs/PLAN.md M3): combining
   * `GROWTH.fishPerMerge` same-stage, same-species fish into one fish of the next stage. Always
   * returns the full result — including a rejection reason on failure — so the caller (the
   * Aquarium screen) can react, e.g. only playing the merge animation when `ok` is true and
   * showing feedback otherwise. State only ever changes when the merge is legal; a rejected
   * merge leaves the fish collection completely untouched, never partially edited.
   */
  mergeFish: (selectedIds: string[], now: number) => MergeResult;
  /**
   * Adds a species to `entitlements.unlockedSpeciesIds` (docs/PLAN.md M6a). Idempotent — a no-op
   * (no `set` at all) if the species is already owned, e.g. a duplicate purchase attempt. Does
   * **not** talk to any `EntitlementProvider`; callers (the Shop screen) resolve the purchase
   * through the provider first and call this only once it reports success — same shape the call
   * site will need again once `MockEntitlementProvider` is swapped for a real one at M6b.
   */
  unlockSpecies: (speciesId: SpeciesId) => void;
  /**
   * Re-syncs `entitlements.unlockedSpeciesIds` from a restore-purchases result (docs/PLAN.md
   * M6a): a **union**, never a replace — a provider's restore result is everything it knows the
   * user owns, not the complete truth of every id already unlocked locally (a real provider could
   * be temporarily behind; there is no reason a restore should ever *remove* something already
   * unlocked). The starter species is always guaranteed present.
   */
  syncUnlockedSpeciesIds: (speciesIds: SpeciesId[]) => void;
  /**
   * Sets which species a fresh Fry hatches as (docs/PLAN.md M6a — see `Settings.activeSpeciesId`
   * and `awardSessionCompletion` below). A no-op if the species isn't in
   * `entitlements.unlockedSpeciesIds` — the Shop screen only ever offers this for owned species,
   * but the guard lives here too so it can never be bypassed by a stray call.
   */
  setActiveSpecies: (speciesId: SpeciesId) => void;
  /** Test/dev affordance — wipes persisted state back to defaults. */
  resetAll: () => void;

  // --- Debug-only actions (added post-M6a review) ---------------------------------------------
  // TODO: remove or gate before EAS build submission. These exist only so the real pacing in
  // `GROWTH` (untouched — see CLAUDE.md "THE BIG ONE AT THE GATE") doesn't block the user from
  // actually reaching merge and a purchased species during on-device testing. Each one calls
  // straight into the same pure functions the real reward/spawn flow uses
  // (`distributeXp`/`addXp`/`createFish`) — never a parallel simulation of them.
  /**
   * Grants `xp` to the current active-growth-target fish via the exact same `distributeXp`
   * selection/overflow logic `awardSessionCompletion` uses — the only difference is the XP comes
   * from a raw number instead of `xpForFocusMs(focusMs)`. Deliberately does **not** touch stats
   * or the streak (unlike `awardSessionCompletion`): this is a shortcut through the reward
   * *distribution* rule, not a fake extra session.
   */
  debugGrantXp: (xp: number, now: number) => void;
  /**
   * Instantly sets every existing fish's `xp` to its stage cap via `addXp` (the same clamp the
   * real reward path uses), so a merge becomes available without waiting through real sessions.
   * Never touches `health` — capping a fish is not a way to cure it; that stays exclusive to
   * being picked as a real grow target.
   */
  debugCapAllFish: () => void;
  /**
   * Hatches one fresh Fry of the resolved active species via the same `createFish` primitive
   * `distributeXp`'s spawn branch calls, unconditionally rather than only when every fish is
   * capped — so a just-purchased species can be seen immediately instead of waiting on the real
   * M3 spawn rule.
   */
  debugSpawnFish: (now: number) => void;
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
    reduceMotion: 'system',
    activeSpeciesId: STARTER_SPECIES_ID,
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
    (set, get) => ({
      ...initialPersisted,
      hydrated: false,

      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      completeOnboarding: () => set({ onboardingCompletedAt: Date.now() }),

      awardSessionCompletion: (focusMs, now) =>
        set((s) => {
          // The species a fresh Fry hatches as (docs/PLAN.md M6a). Re-validated against
          // ownership on every call, not just when it's set (`setActiveSpecies` already guards
          // its own write) — a species could stop being owned by some future path this store
          // doesn't have yet (e.g. a refund), and a stale unowned id must never reach `reward.ts`.
          const spawnSpeciesId = resolveSpawnSpeciesId(s);

          const result = applySessionReward({
            fish: s.fish,
            focusMs,
            now,
            idFactory: () => generateFishId(now),
            spawnSpeciesId,
          });

          // Streak + basic stats update alongside the fish reward, in the same `set` — one
          // completed session, one write, so the two can never drift out of sync from two
          // separately-tested code paths (docs/PLAN.md M4).
          const streak = applyCompletedSessionToStreak({
            lastCompletedLocalDate: s.stats.lastCompletedLocalDate,
            currentStreak: s.stats.currentStreak,
            longestStreak: s.stats.longestStreak,
            now: new Date(now),
          });
          const dateKey = toLocalDateString(new Date(now));

          return {
            fish: result.fish,
            stats: {
              ...s.stats,
              totalFocusMs: s.stats.totalFocusMs + focusMs,
              completedSessions: s.stats.completedSessions + 1,
              focusMsByDate: {
                ...s.stats.focusMsByDate,
                [dateKey]: (s.stats.focusMsByDate[dateKey] ?? 0) + focusMs,
              },
              currentStreak: streak.currentStreak,
              longestStreak: streak.longestStreak,
              lastCompletedLocalDate: streak.lastCompletedLocalDate,
            },
          };
        }),

      penalizeAbandonedSession: (_now) =>
        set((s) => {
          const result = applyPenalty({ fish: s.fish });
          return {
            fish: result.fish,
            stats: { ...s.stats, abandonedSessions: s.stats.abandonedSessions + 1 },
          };
        }),

      recordManualAbandon: () =>
        set((s) => ({ stats: { ...s.stats, abandonedSessions: s.stats.abandonedSessions + 1 } })),

      mergeFish: (selectedIds, now) => {
        // Evaluated against a single read of current state, then applied in one `set` — the
        // merge either lands as a whole (removed fish gone, new fish present) or `set` is never
        // called at all, so a rejected merge can never leave the collection half-edited.
        const result = evaluateMerge({
          fish: get().fish,
          selectedIds,
          now,
          idFactory: () => generateFishId(now),
        });
        if (result.ok) set({ fish: result.fish });
        return result;
      },

      unlockSpecies: (speciesId) => {
        if (get().entitlements.unlockedSpeciesIds.includes(speciesId)) return;
        set((s) => ({
          entitlements: {
            ...s.entitlements,
            unlockedSpeciesIds: [...s.entitlements.unlockedSpeciesIds, speciesId],
          },
        }));
      },

      syncUnlockedSpeciesIds: (speciesIds) =>
        set((s) => ({
          entitlements: {
            ...s.entitlements,
            unlockedSpeciesIds: Array.from(
              new Set([STARTER_SPECIES_ID, ...s.entitlements.unlockedSpeciesIds, ...speciesIds]),
            ),
          },
        })),

      setActiveSpecies: (speciesId) => {
        if (!get().entitlements.unlockedSpeciesIds.includes(speciesId)) return;
        set((s) => ({ settings: { ...s.settings, activeSpeciesId: speciesId } }));
      },

      resetAll: () => set({ ...initialPersisted }),

      // --- Debug-only actions (added post-M6a review) ------------------------------------------
      // TODO: remove or gate before EAS build submission.
      debugGrantXp: (xp, now) =>
        set((s) => {
          const spawnSpeciesId = resolveSpawnSpeciesId(s);
          const result = distributeXp(s.fish, xp, now, () => generateFishId(now), spawnSpeciesId);
          return { fish: result.fish };
        }),

      debugCapAllFish: () =>
        set((s) => ({ fish: s.fish.map((f) => addXp(f, GROWTH.xpPerStage)) })),

      debugSpawnFish: (now) =>
        set((s) => {
          const spawnSpeciesId = resolveSpawnSpeciesId(s);
          const hatched = createFish(spawnSpeciesId, now, generateFishId(now));
          return { fish: [...s.fish, hatched] };
        }),
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
