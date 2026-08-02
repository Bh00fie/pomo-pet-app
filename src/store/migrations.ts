// Submodule import (not the `@/features/pet` barrel) — the barrel pulls in `useSessionReward`,
// which imports the store, which imports this file. Same reason as in `useAppStore.ts`.
import { STARTER_SPECIES_ID } from '@/features/pet/model';
import type { PersistedState } from './types';

/**
 * Bump this whenever the persisted shape *or* a persisted default's meaning changes, and add a
 * matching entry to `migrations`. Versioned from commit one on purpose (docs/PLAN.md M0) —
 * retrofitting migrations onto already-shipped user data is the expensive version of this problem.
 */
export const SCHEMA_VERSION = 3;

/** The placeholder species id shipped in the v1 default `entitlements.unlockedSpeciesIds`. It
 *  never matched a real species — the species catalog did not exist until M2 — so any stored copy
 *  of it has to be rewritten to the real starter id. See migration 1 below. */
const LEGACY_STARTER_SPECIES_ID = 'starter';

/**
 * Each migration takes the state as persisted at `fromVersion` and returns it at
 * `fromVersion + 1`. They are applied in order, so each one only has to know about its own step.
 *
 * Input is `unknown` by design: old payloads do not match the current `PersistedState` type,
 * and pretending otherwise is how migrations silently corrupt data.
 */
export type Migration = (state: unknown) => unknown;

export const migrations: Record<number, Migration> = {
  /**
   * v1 → v2 (M2). `Fish`'s shape is unchanged, but v1 shipped `entitlements.unlockedSpeciesIds`
   * defaulting to the literal `'starter'`, which matches no species in the M2 catalog. The
   * default was corrected in code, and zustand's `persist` merges stored state *over* the
   * initial state — so a device that already wrote v1 state would keep the dead id forever and
   * show the starter species as locked once the shop reads entitlements (M6a). Rewrite it.
   */
  1: (state) => {
    if (typeof state !== 'object' || state === null) return state;
    const s = state as Partial<PersistedState>;
    const stored = Array.isArray(s.entitlements?.unlockedSpeciesIds)
      ? s.entitlements.unlockedSpeciesIds
      : [];
    const remapped = stored.map((id) =>
      id === LEGACY_STARTER_SPECIES_ID ? STARTER_SPECIES_ID : id,
    );
    // The starter species is always owned — guarantee it even if the stored array was empty,
    // absent, or corrupt.
    if (!remapped.includes(STARTER_SPECIES_ID)) remapped.unshift(STARTER_SPECIES_ID);

    return {
      ...s,
      entitlements: {
        ...s.entitlements,
        unlockedSpeciesIds: Array.from(new Set(remapped)),
        unlockedTankIds: s.entitlements?.unlockedTankIds ?? ['rectangular'],
      },
    };
  },

  /**
   * v2 → v3 (M5). `settings.reduceMotion` changes from a boolean ("also force reduced motion on
   * top of whatever the OS says") to a tri-state preference — `'system' | 'on' | 'off'` — so a
   * user can force *full* motion even when the OS's own Reduce Motion setting is on, not just
   * force reduced motion on. See `src/anim/useReduceMotion.ts`.
   *
   * A stored `true` becomes `'on'`. A stored `false` (or anything else — missing, corrupt) becomes
   * `'system'`, never `'off'`: v2's `false` only ever meant "no extra override on top of the OS
   * setting", and `'off'` is a new capability ("ignore the OS setting entirely") that no v2
   * payload could have meant, so mapping `false` to it would silently change behaviour for anyone
   * who has the OS setting on.
   */
  2: (state) => {
    if (typeof state !== 'object' || state === null) return state;
    const s = state as Record<string, unknown>;
    const storedSettings = (s.settings ?? {}) as Record<string, unknown>;
    return {
      ...s,
      settings: {
        ...storedSettings,
        reduceMotion: storedSettings.reduceMotion === true ? 'on' : 'system',
      },
    };
  },
};

/**
 * Sentinel returned when persisted state cannot be migrated. Zustand's `merge` treats an
 * empty object as "use the store's initial state".
 */
export const DISCARD = {} as PersistedState;

/** Walks `state` from `fromVersion` up to `SCHEMA_VERSION`. */
export function migrate(state: unknown, fromVersion: number): PersistedState {
  let next = state;
  for (let v = fromVersion; v < SCHEMA_VERSION; v += 1) {
    const step = migrations[v];
    if (!step) {
      // No path from this version — fall back to defaults rather than crashing on rehydrate.
      if (__DEV__) {
        console.warn(`[store] no migration from schema v${v}; discarding persisted state`);
      }
      return DISCARD;
    }
    next = step(next);
  }
  return next as PersistedState;
}
