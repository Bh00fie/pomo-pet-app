import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { APP, TIMER } from '@/config';
// Submodule imports (not the `@/features/pet` barrel) — the barrel re-exports `useSessionReward`,
// which imports this store, and going through it here would create a module-load cycle.
import { generateFishId } from '@/features/pet/id';
import { evaluateMerge, type MergeResult } from '@/features/pet/merge';
import { SPECIES_ORDER, STARTER_SPECIES_ID, type SpeciesId } from '@/features/pet/model';
import { applyPenalty } from '@/features/pet/penalty';
import { applySessionReward, hatchFish, pickRandomSpeciesId } from '@/features/pet/reward';
import { applyCompletedSessionToStreak, toLocalDateString } from '@/features/streak';
import { SCHEMA_VERSION, migrate } from './migrations';
import { asyncStorageJSON } from './storage';
import type { PersistedState, Settings } from './types';

/**
 * The species a short session's Fry hatches as (docs/PLAN.md M6a): the user's chosen
 * `activeSpeciesId`, re-validated against `entitlements.unlockedSpeciesIds` on every call rather
 * than trusted as stored, falling back to the starter. Factored out of `awardSessionCompletion` so
 * the debug panel's "Hatch a Fry" action reuses this exact resolution instead of a second copy of
 * it. A long session's Juvenile does not use this at all — see `pickRandomSpeciesId` in
 * `reward.ts`, which draws from the *whole* owned pool instead.
 */
function resolveSpawnSpeciesId(s: Pick<AppStore, 'settings' | 'entitlements'>): SpeciesId {
  return s.entitlements.unlockedSpeciesIds.includes(s.settings.activeSpeciesId)
    ? s.settings.activeSpeciesId
    : STARTER_SPECIES_ID;
}

/**
 * The pool a long session's (or the debug panel's) Juvenile is drawn from: `unlockedSpeciesIds`
 * filtered down to ids that still exist in `SPECIES_ORDER`, same re-validation spirit as
 * `resolveSpawnSpeciesId` above — a persisted id is never trusted as still valid on its own.
 * Falls back to the starter species if that filter ever empties the pool.
 */
function resolveOwnedCatalogSpeciesIds(s: Pick<AppStore, 'entitlements'>): SpeciesId[] {
  const owned = s.entitlements.unlockedSpeciesIds.filter((id) => SPECIES_ORDER.includes(id));
  return owned.length > 0 ? owned : [STARTER_SPECIES_ID];
}

interface AppActions {
  setSettings: (patch: Partial<Settings>) => void;
  completeOnboarding: () => void;
  /** Applies one focus session's reward (docs/PLAN.md M2, rearchitected post-M6a — see
   *  CLAUDE.md): hatches exactly one new fish, never grows an existing one. A short session
   *  hatches a Fry of the active species; a long session (>= `REWARDS.longSessionThresholdMinutes`)
   *  hatches a Juvenile of a species drawn at random from everything the user owns. Called by
   *  `useSessionReward` on the timer engine's `completed` transition. */
  awardSessionCompletion: (focusMs: number, now: number) => void;
  /**
   * Applies the M4 leave-early penalty (docs/PLAN.md M4): marks a fish `sick` (see `penalty.ts`
   * for which one, updated post-reward-rearchitecture) and counts the session as abandoned in
   * stats. Called from `useLeaveEarlyPenalty` exactly when the timer engine auto-abandons a running
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

  // --- Debug-only actions (added post-M6a review; updated for the reward rearchitecture) -------
  // TODO: remove or gate before EAS build submission. These exist only so the debug affordance
  // that makes merge and species variety reachable during on-device testing survives the XP
  // model's removal. Each one calls straight into the same hatch primitive (`hatchFish` from
  // `reward.ts`) the real session-completion path uses — never a parallel simulation of it.
  /**
   * Hatches one Fry of the resolved active species (`resolveSpawnSpeciesId`) — the same
   * stage+species a real short focus session produces. Press it `GROWTH.fishPerMerge` times to
   * assemble a mergeable trio without waiting on real sessions.
   */
  debugHatchFry: (now: number) => void;
  /**
   * Hatches one Juvenile of a species drawn uniformly at random from every species the user owns
   * — the same stage+species-selection rule a real long focus session produces
   * (`applySessionReward`'s long branch), via the same `pickRandomSpeciesId` + `hatchFish`
   * primitives.
   */
  debugHatchJuvenile: (now: number) => void;
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
          const activeSpeciesId = resolveSpawnSpeciesId(s);

          const result = applySessionReward({
            fish: s.fish,
            focusMs,
            now,
            idFactory: () => generateFishId(now),
            activeSpeciesId,
            ownedSpeciesIds: resolveOwnedCatalogSpeciesIds(s),
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

      // --- Debug-only actions (added post-M6a review; updated for the reward rearchitecture) ---
      // TODO: remove or gate before EAS build submission.
      debugHatchFry: (now) =>
        set((s) => {
          const activeSpeciesId = resolveSpawnSpeciesId(s);
          const result = hatchFish(s.fish, 'fry', activeSpeciesId, now, () => generateFishId(now));
          return { fish: result.fish };
        }),

      debugHatchJuvenile: (now) =>
        set((s) => {
          const speciesId = pickRandomSpeciesId(resolveOwnedCatalogSpeciesIds(s));
          const result = hatchFish(s.fish, 'juvenile', speciesId, now, () => generateFishId(now));
          return { fish: result.fish };
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
/**
 * The species a short session's Fry would hatch as right now — the same entitlement-validated
 * resolution `awardSessionCompletion`/`debugHatchFry` use, exposed so UI that *names* that species
 * can never disagree with what the action actually hatches. (Reading `settings.activeSpeciesId`
 * directly would: it is the one settings field that can name a species the user does not own.)
 */
export const selectSpawnSpeciesId = (s: AppStore) => resolveSpawnSpeciesId(s);
/**
 * The most recently hatched fish, or `null` on an empty collection. Shares the "max `bornAt`, ties
 * to the later array entry" tie rule with `applyPenalty` and `cureOneSickFish`, but **not** their
 * health filter: those two deliberately walk past fish of the wrong health (the penalty wants the
 * newest *healthy* one, the cure the newest *sick* one), while this is simply the newest fish there
 * is. Do not "unify" the three — the filters are the point of each.
 *
 * Returns an element of `fish` rather than a derived object, so a subscriber does not re-render on
 * every unrelated store write.
 *
 * Used by the Focus screen to name what the session just produced. It is derived rather than
 * recorded because a completed session's hatch *is* the newest fish by construction — carrying a
 * separate `lastHatchedFishId` would be a second source of truth for the same fact, and a
 * persisted-schema change for something already knowable.
 */
export const selectNewestFish = (s: AppStore) =>
  s.fish.length === 0
    ? null
    : s.fish.reduce((latest, f) => (f.bornAt >= latest.bornAt ? f : latest));
