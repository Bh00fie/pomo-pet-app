import type { PersistedState } from './types';

/**
 * Bump this whenever the persisted shape changes, and add a matching entry to `migrations`.
 * Versioned from commit one on purpose (docs/PLAN.md M0) — retrofitting migrations onto
 * already-shipped user data is the expensive version of this problem.
 */
export const SCHEMA_VERSION = 1;

/**
 * Each migration takes the state as persisted at `fromVersion` and returns it at
 * `fromVersion + 1`. They are applied in order, so each one only has to know about its own step.
 *
 * Input is `unknown` by design: old payloads do not match the current `PersistedState` type,
 * and pretending otherwise is how migrations silently corrupt data.
 */
export type Migration = (state: unknown) => unknown;

export const migrations: Record<number, Migration> = {
  // Example of the intended shape, for when the first real migration lands:
  //
  // 1: (state) => {
  //   const s = state as PersistedState & { stats: { focusMsByDate?: Record<string, number> } };
  //   return { ...s, stats: { ...s.stats, focusMsByDate: s.stats.focusMsByDate ?? {} } };
  // },
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
