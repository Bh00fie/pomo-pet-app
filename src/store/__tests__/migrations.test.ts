import { STARTER_SPECIES_ID } from '@/features/pet/model';
import { DISCARD, SCHEMA_VERSION, migrate, migrations } from '../migrations';
import type { PersistedState } from '../types';

/** A realistic v1 payload: the shape the store persisted at M0/M1, including the dead
 *  `'starter'` species id that never matched a real species. */
function v1State(overrides: Record<string, unknown> = {}): unknown {
  return {
    fish: [],
    settings: {
      workMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
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
    entitlements: { unlockedSpeciesIds: ['starter'], unlockedTankIds: ['rectangular'] },
    onboardingCompletedAt: null,
    ...overrides,
  };
}

describe('migrate', () => {
  it('has a migration for every version below SCHEMA_VERSION', () => {
    for (let v = 0; v < SCHEMA_VERSION; v += 1) {
      // v0 predates the store shipping at all; only v1+ needs a path.
      if (v === 0) continue;
      expect(migrations[v]).toBeDefined();
    }
  });

  it('rewrites the dead v1 "starter" species id to the real starter species', () => {
    const result = migrate(v1State(), 1);

    expect(result.entitlements.unlockedSpeciesIds).toEqual([STARTER_SPECIES_ID]);
    expect(result.entitlements.unlockedSpeciesIds).not.toContain('starter');
  });

  it('preserves other unlocked species and tanks, and never duplicates the starter', () => {
    const result = migrate(
      v1State({
        entitlements: {
          unlockedSpeciesIds: ['starter', 'neon-guppy', STARTER_SPECIES_ID],
          unlockedTankIds: ['rectangular', 'bowl'],
        },
      }),
      1,
    );

    expect(result.entitlements.unlockedSpeciesIds).toEqual([STARTER_SPECIES_ID, 'neon-guppy']);
    expect(result.entitlements.unlockedTankIds).toEqual(['rectangular', 'bowl']);
  });

  it('guarantees the starter species even if the stored entitlements were empty or missing', () => {
    expect(
      migrate(v1State({ entitlements: { unlockedSpeciesIds: [], unlockedTankIds: [] } }), 1)
        .entitlements.unlockedSpeciesIds,
    ).toEqual([STARTER_SPECIES_ID]);

    const noEntitlements = migrate(v1State({ entitlements: undefined }), 1);
    expect(noEntitlements.entitlements.unlockedSpeciesIds).toEqual([STARTER_SPECIES_ID]);
    expect(noEntitlements.entitlements.unlockedTankIds).toEqual(['rectangular']);
  });

  it('leaves every other persisted slice untouched', () => {
    const before = v1State({ onboardingCompletedAt: 12345 }) as PersistedState;
    const after = migrate(before, 1);

    expect(after.fish).toEqual(before.fish);
    expect(after.settings).toEqual(before.settings);
    expect(after.stats).toEqual(before.stats);
    expect(after.onboardingCompletedAt).toBe(12345);
  });

  it('is a no-op for state already at the current version', () => {
    const current = v1State({
      entitlements: { unlockedSpeciesIds: [STARTER_SPECIES_ID], unlockedTankIds: ['rectangular'] },
    });

    expect(migrate(current, SCHEMA_VERSION)).toEqual(current);
  });

  it('discards state from a version with no migration path rather than crashing', () => {
    // The dev-only warning is the intended behaviour here; silence it so it isn't mistaken for
    // a failure in the test output.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(migrate(v1State(), 0)).toBe(DISCARD);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
