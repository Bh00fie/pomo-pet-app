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

  it('leaves every other persisted slice untouched (except settings.reduceMotion and activeSpeciesId, migrated separately by steps 2 and 3)', () => {
    const before = v1State({ onboardingCompletedAt: 12345 }) as PersistedState;
    const after = migrate(before, 1);

    expect(after.fish).toEqual(before.fish);
    expect(after.settings).toEqual({
      ...before.settings,
      reduceMotion: 'system',
      activeSpeciesId: STARTER_SPECIES_ID,
    });
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

/** A realistic v2 payload: the shape the store persisted from M2 through M4, with the already-
 *  corrected starter species id and the boolean `reduceMotion` that migration 2 (M5) rewrites. */
function v2State(overrides: Record<string, unknown> = {}): unknown {
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
    entitlements: { unlockedSpeciesIds: [STARTER_SPECIES_ID], unlockedTankIds: ['rectangular'] },
    onboardingCompletedAt: null,
    ...overrides,
  };
}

describe('migrate — v2 -> v3, reduceMotion tri-state (M5)', () => {
  it('rewrites a stored `true` to the "on" preference', () => {
    const result = migrate(v2State({ settings: { reduceMotion: true } }), 2);
    expect(result.settings.reduceMotion).toBe('on');
  });

  it('rewrites a stored `false` to "system", not "off" — v2 never meant "ignore the OS setting"', () => {
    const result = migrate(v2State({ settings: { reduceMotion: false } }), 2);
    expect(result.settings.reduceMotion).toBe('system');
  });

  it('defaults to "system" when the field is missing or the settings object is absent', () => {
    const missingField = migrate(v2State({ settings: {} }), 2);
    expect(missingField.settings.reduceMotion).toBe('system');

    const missingSettings = migrate(v2State({ settings: undefined }), 2);
    expect(missingSettings.settings.reduceMotion).toBe('system');
  });

  it('leaves every other settings field untouched', () => {
    const before = v2State() as PersistedState;
    const after = migrate(before, 2);
    expect(after.settings).toEqual({
      ...before.settings,
      reduceMotion: 'system',
      activeSpeciesId: STARTER_SPECIES_ID,
    });
  });

  it('walking from v1 all the way to v3 applies both migrations in order', () => {
    const result = migrate(v1State({ settings: { reduceMotion: true } }), 1);
    expect(result.entitlements.unlockedSpeciesIds).toEqual([STARTER_SPECIES_ID]);
    expect(result.settings.reduceMotion).toBe('on');
  });
});

/** A realistic v3 payload: the shape persisted from M5 through the close of M6a's build, before
 *  `settings.activeSpeciesId` existed at all. */
function v3State(overrides: Record<string, unknown> = {}): unknown {
  return {
    fish: [],
    settings: {
      workMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      hapticsEnabled: true,
      notificationsEnabled: true,
      reduceMotion: 'system',
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
    entitlements: { unlockedSpeciesIds: [STARTER_SPECIES_ID], unlockedTankIds: ['rectangular'] },
    onboardingCompletedAt: null,
    ...overrides,
  };
}

describe('migrate — v3 -> v4, activeSpeciesId (M6a)', () => {
  it('defaults to the starter species when the field is missing (every v3 payload)', () => {
    const result = migrate(v3State(), 3);
    expect(result.settings.activeSpeciesId).toBe(STARTER_SPECIES_ID);
  });

  it('defaults to the starter species even if the settings object itself is absent', () => {
    const result = migrate(v3State({ settings: undefined }), 3);
    expect(result.settings.activeSpeciesId).toBe(STARTER_SPECIES_ID);
  });

  it('leaves every other settings field untouched', () => {
    const before = v3State() as PersistedState;
    const after = migrate(before, 3);
    expect(after.settings).toEqual({ ...before.settings, activeSpeciesId: STARTER_SPECIES_ID });
  });

  it('walking from v1 all the way to v4 applies all three migrations in order', () => {
    const result = migrate(v1State({ settings: { reduceMotion: true } }), 1);
    expect(result.entitlements.unlockedSpeciesIds).toEqual([STARTER_SPECIES_ID]);
    expect(result.settings.reduceMotion).toBe('on');
    expect(result.settings.activeSpeciesId).toBe(STARTER_SPECIES_ID);
  });
});

/** A realistic v4 payload: the shape persisted from the close of M6a through the post-M6a species
 *  pass and debug panel, before the reward rearchitecture dropped `Fish.xp`. */
function v4State(overrides: Record<string, unknown> = {}): unknown {
  return {
    fish: [
      { id: 'a', speciesId: STARTER_SPECIES_ID, stage: 'fry', xp: 45, bornAt: 1000, health: 'healthy' },
      { id: 'b', speciesId: STARTER_SPECIES_ID, stage: 'juvenile', xp: 120, bornAt: 2000, health: 'sick' },
    ],
    settings: {
      workMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
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
    entitlements: { unlockedSpeciesIds: [STARTER_SPECIES_ID], unlockedTankIds: ['rectangular'] },
    onboardingCompletedAt: null,
    ...overrides,
  };
}

describe('migrate — v4 -> v5, Fish.xp removed (post-M6a reward rearchitecture)', () => {
  it('drops the xp field from every persisted fish', () => {
    const result = migrate(v4State(), 4);

    expect(result.fish).toHaveLength(2);
    for (const f of result.fish) {
      expect(f).not.toHaveProperty('xp');
    }
  });

  it('preserves every other field on each fish untouched', () => {
    const result = migrate(v4State(), 4);

    expect(result.fish[0]).toEqual({
      id: 'a',
      speciesId: STARTER_SPECIES_ID,
      stage: 'fry',
      bornAt: 1000,
      health: 'healthy',
    });
    expect(result.fish[1]).toEqual({
      id: 'b',
      speciesId: STARTER_SPECIES_ID,
      stage: 'juvenile',
      bornAt: 2000,
      health: 'sick',
    });
  });

  it('handles an empty or missing fish array without crashing', () => {
    expect(migrate(v4State({ fish: [] }), 4).fish).toEqual([]);
    expect(migrate(v4State({ fish: undefined }), 4).fish).toEqual([]);
  });

  it('leaves every other persisted slice untouched', () => {
    const before = v4State() as PersistedState;
    const after = migrate(before, 4);

    expect(after.settings).toEqual(before.settings);
    expect(after.stats).toEqual(before.stats);
    expect(after.entitlements).toEqual(before.entitlements);
    expect(after.onboardingCompletedAt).toBe(before.onboardingCompletedAt);
  });

  it('walking from v1 all the way to v5 applies all four migrations in order', () => {
    const result = migrate(v1State({ settings: { reduceMotion: true } }), 1);
    expect(result.entitlements.unlockedSpeciesIds).toEqual([STARTER_SPECIES_ID]);
    expect(result.settings.reduceMotion).toBe('on');
    expect(result.settings.activeSpeciesId).toBe(STARTER_SPECIES_ID);
    expect(result.fish).toEqual([]);
  });
});
