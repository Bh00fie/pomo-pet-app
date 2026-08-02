import { REWARDS } from '@/config';
import {
  createFish,
  GOLDEN_KOI_SPECIES_ID,
  INDIGO_BETTA_SPECIES_ID,
  STARTER_SPECIES_ID,
  type Fish,
} from '@/features/pet/model';
import { useAppStore } from '../useAppStore';

const MINUTE = 60_000;
const SHORT_SESSION_MS = (REWARDS.longSessionThresholdMinutes - 5) * MINUTE;
const LONG_SESSION_MS = REWARDS.longSessionThresholdMinutes * MINUTE;

beforeEach(() => {
  useAppStore.getState().resetAll();
});

describe('awardSessionCompletion — short session hatches a Fry', () => {
  it('hatches a starter Fry on the first completed short session', () => {
    useAppStore.getState().awardSessionCompletion(SHORT_SESSION_MS, 1_700_000_000_000);

    const { fish } = useAppStore.getState();
    expect(fish).toHaveLength(1);
    expect(fish[0]).toMatchObject({ speciesId: STARTER_SPECIES_ID, stage: 'fry', health: 'healthy' });
    expect(typeof fish[0].id).toBe('string');
    expect(fish[0].id.length).toBeGreaterThan(0);
  });

  it('hatches a second, separate Fry on a later short session rather than growing the first', () => {
    useAppStore.getState().awardSessionCompletion(SHORT_SESSION_MS, 1_700_000_000_000);
    const firstId = useAppStore.getState().fish[0].id;

    useAppStore.getState().awardSessionCompletion(SHORT_SESSION_MS, 1_700_000_100_000);

    const { fish } = useAppStore.getState();
    expect(fish).toHaveLength(2);
    expect(fish.find((f) => f.id === firstId)).toBeTruthy();
    expect(fish.every((f) => f.stage === 'fry')).toBe(true);
  });

  it('assigns distinct ids to fish hatched in separate sessions', () => {
    useAppStore.getState().awardSessionCompletion(SHORT_SESSION_MS, 1);
    const firstId = useAppStore.getState().fish[0].id;
    useAppStore.setState({ fish: [] });
    useAppStore.getState().awardSessionCompletion(SHORT_SESSION_MS, 2);
    const secondId = useAppStore.getState().fish[0].id;

    expect(firstId).not.toBe(secondId);
  });

  it('hatches the user’s chosen active species once it is unlocked and selected', () => {
    useAppStore.getState().unlockSpecies(GOLDEN_KOI_SPECIES_ID);
    useAppStore.getState().setActiveSpecies(GOLDEN_KOI_SPECIES_ID);

    useAppStore.getState().awardSessionCompletion(SHORT_SESSION_MS, 1_700_000_000_000);

    expect(useAppStore.getState().fish[0].speciesId).toBe(GOLDEN_KOI_SPECIES_ID);
  });

  it('falls back to the starter species if activeSpeciesId somehow names a species no longer owned', () => {
    // Defensive path: force a corrupt/stale state directly (setActiveSpecies itself would have
    // refused this) and confirm the reward path still never hatches an unowned species.
    useAppStore.setState((s) => ({ settings: { ...s.settings, activeSpeciesId: GOLDEN_KOI_SPECIES_ID } }));
    expect(useAppStore.getState().entitlements.unlockedSpeciesIds).not.toContain(GOLDEN_KOI_SPECIES_ID);

    useAppStore.getState().awardSessionCompletion(SHORT_SESSION_MS, 1_700_000_000_000);

    expect(useAppStore.getState().fish[0].speciesId).toBe(STARTER_SPECIES_ID);
  });
});

describe('awardSessionCompletion — long session hatches a Juvenile from the owned pool', () => {
  it('hatches a Juvenile at exactly the threshold', () => {
    useAppStore.getState().awardSessionCompletion(LONG_SESSION_MS, 1_700_000_000_000);

    const { fish } = useAppStore.getState();
    expect(fish).toHaveLength(1);
    expect(fish[0].stage).toBe('juvenile');
  });

  it('draws the species from every owned species, not just the active one', () => {
    useAppStore.getState().unlockSpecies(GOLDEN_KOI_SPECIES_ID);
    useAppStore.getState().unlockSpecies(INDIGO_BETTA_SPECIES_ID);
    // Active species stays the starter — the long-session draw must not be limited to it.
    const owned = useAppStore.getState().entitlements.unlockedSpeciesIds;

    for (let i = 0; i < 30; i += 1) {
      useAppStore.setState({ fish: [] });
      useAppStore.getState().awardSessionCompletion(LONG_SESSION_MS, 1_700_000_000_000 + i);
      expect(owned).toContain(useAppStore.getState().fish[0].speciesId);
    }
  });

  it('never touches an existing fish — it always appends', () => {
    useAppStore.setState({ fish: [createFish(STARTER_SPECIES_ID, 0, 'existing')] });

    useAppStore.getState().awardSessionCompletion(LONG_SESSION_MS, 1_700_000_000_000);

    const { fish } = useAppStore.getState();
    expect(fish).toHaveLength(2);
    expect(fish.find((f) => f.id === 'existing')).toMatchObject({ stage: 'fry' });
  });
});

describe('awardSessionCompletion — stats and streak (docs/PLAN.md M4)', () => {
  it('updates totalFocusMs, completedSessions, and focusMsByDate alongside the fish reward', () => {
    const now = new Date(2026, 0, 5, 9, 0, 0).getTime();
    useAppStore.getState().awardSessionCompletion(SHORT_SESSION_MS, now);

    const { stats } = useAppStore.getState();
    expect(stats.totalFocusMs).toBe(SHORT_SESSION_MS);
    expect(stats.completedSessions).toBe(1);
    expect(stats.focusMsByDate['2026-01-05']).toBe(SHORT_SESSION_MS);
  });

  it('accumulates focusMsByDate across two sessions on the same local day', () => {
    const morning = new Date(2026, 0, 5, 9, 0, 0).getTime();
    const evening = new Date(2026, 0, 5, 20, 0, 0).getTime();

    useAppStore.getState().awardSessionCompletion(SHORT_SESSION_MS, morning);
    useAppStore.getState().awardSessionCompletion(10 * MINUTE, evening);

    const { stats } = useAppStore.getState();
    expect(stats.focusMsByDate['2026-01-05']).toBe(SHORT_SESSION_MS + 10 * MINUTE);
    expect(stats.completedSessions).toBe(2);
    expect(stats.currentStreak).toBe(1); // same calendar day — streak doesn't double-count
  });

  it('starts a streak of 1 on the first completed session ever', () => {
    useAppStore.getState().awardSessionCompletion(SHORT_SESSION_MS, new Date(2026, 0, 5, 9, 0, 0).getTime());
    expect(useAppStore.getState().stats.currentStreak).toBe(1);
    expect(useAppStore.getState().stats.lastCompletedLocalDate).toBe('2026-01-05');
  });

  it('extends the streak on consecutive local days and resets after a gap', () => {
    useAppStore.getState().awardSessionCompletion(SHORT_SESSION_MS, new Date(2026, 0, 5, 9, 0, 0).getTime());
    useAppStore.getState().awardSessionCompletion(SHORT_SESSION_MS, new Date(2026, 0, 6, 9, 0, 0).getTime());
    expect(useAppStore.getState().stats.currentStreak).toBe(2);

    // Skip a day entirely.
    useAppStore.getState().awardSessionCompletion(SHORT_SESSION_MS, new Date(2026, 0, 8, 9, 0, 0).getTime());
    expect(useAppStore.getState().stats.currentStreak).toBe(1);
    expect(useAppStore.getState().stats.longestStreak).toBe(2); // the earlier record stands
  });
});

describe('penalizeAbandonedSession (docs/PLAN.md M4, updated for the reward rearchitecture)', () => {
  it('is a no-op that still counts the abandonment when the user has no fish', () => {
    useAppStore.getState().penalizeAbandonedSession(1_700_000_000_000);

    expect(useAppStore.getState().fish).toEqual([]);
    expect(useAppStore.getState().stats.abandonedSessions).toBe(1);
  });

  it('sickens the most recently hatched fish', () => {
    useAppStore.getState().awardSessionCompletion(SHORT_SESSION_MS, 1_700_000_000_000);
    const fishId = useAppStore.getState().fish[0].id;

    useAppStore.getState().penalizeAbandonedSession(1_700_000_100_000);

    expect(useAppStore.getState().fish.find((f) => f.id === fishId)?.health).toBe('sick');
    expect(useAppStore.getState().stats.abandonedSessions).toBe(1);
  });

  it('never touches the streak or focus-time stats — only the reward path does that', () => {
    useAppStore.getState().awardSessionCompletion(SHORT_SESSION_MS, 1_700_000_000_000);
    const before = useAppStore.getState().stats;

    useAppStore.getState().penalizeAbandonedSession(1_700_000_100_000);

    const after = useAppStore.getState().stats;
    expect(after.currentStreak).toBe(before.currentStreak);
    expect(after.totalFocusMs).toBe(before.totalFocusMs);
    expect(after.completedSessions).toBe(before.completedSessions);
  });
});

describe('recordManualAbandon (M5-review fix)', () => {
  it('increments abandonedSessions without touching fish health, unlike the auto-abandon path', () => {
    useAppStore.getState().awardSessionCompletion(SHORT_SESSION_MS, 1_700_000_000_000);
    const fishId = useAppStore.getState().fish[0].id;

    useAppStore.getState().recordManualAbandon();

    expect(useAppStore.getState().stats.abandonedSessions).toBe(1);
    expect(useAppStore.getState().fish.find((f) => f.id === fishId)?.health).toBe('healthy');
  });

  it('touches no other stat', () => {
    useAppStore.getState().awardSessionCompletion(SHORT_SESSION_MS, 1_700_000_000_000);
    const before = useAppStore.getState().stats;

    useAppStore.getState().recordManualAbandon();

    const after = useAppStore.getState().stats;
    expect(after.currentStreak).toBe(before.currentStreak);
    expect(after.totalFocusMs).toBe(before.totalFocusMs);
    expect(after.completedSessions).toBe(before.completedSessions);
  });
});

describe('unlockSpecies / syncUnlockedSpeciesIds / setActiveSpecies (docs/PLAN.md M6a)', () => {
  it('unlockSpecies adds a species that is not yet owned', () => {
    expect(useAppStore.getState().entitlements.unlockedSpeciesIds).toEqual([STARTER_SPECIES_ID]);

    useAppStore.getState().unlockSpecies(GOLDEN_KOI_SPECIES_ID);

    expect(useAppStore.getState().entitlements.unlockedSpeciesIds).toEqual([
      STARTER_SPECIES_ID,
      GOLDEN_KOI_SPECIES_ID,
    ]);
  });

  it('unlockSpecies is idempotent — a duplicate call is a true no-op, not just a de-duplicated result', () => {
    useAppStore.getState().unlockSpecies(GOLDEN_KOI_SPECIES_ID);
    const before = useAppStore.getState().entitlements;

    useAppStore.getState().unlockSpecies(GOLDEN_KOI_SPECIES_ID);

    // Same object reference — confirms the second call skipped `set` entirely rather than
    // producing an equal-but-new object.
    expect(useAppStore.getState().entitlements).toBe(before);
  });

  it('setActiveSpecies switches the species new fry hatch as, once the species is owned', () => {
    useAppStore.getState().unlockSpecies(GOLDEN_KOI_SPECIES_ID);
    useAppStore.getState().setActiveSpecies(GOLDEN_KOI_SPECIES_ID);

    expect(useAppStore.getState().settings.activeSpeciesId).toBe(GOLDEN_KOI_SPECIES_ID);
  });

  it('setActiveSpecies refuses to select a species the user does not own', () => {
    useAppStore.getState().setActiveSpecies(GOLDEN_KOI_SPECIES_ID); // never unlocked

    expect(useAppStore.getState().settings.activeSpeciesId).toBe(STARTER_SPECIES_ID);
  });

  it('syncUnlockedSpeciesIds unions a restore result with what is already unlocked, never removing anything', () => {
    useAppStore.getState().unlockSpecies(GOLDEN_KOI_SPECIES_ID);

    useAppStore.getState().syncUnlockedSpeciesIds([INDIGO_BETTA_SPECIES_ID]);

    expect(useAppStore.getState().entitlements.unlockedSpeciesIds.sort()).toEqual(
      [STARTER_SPECIES_ID, GOLDEN_KOI_SPECIES_ID, INDIGO_BETTA_SPECIES_ID].sort(),
    );
  });

  it('syncUnlockedSpeciesIds always guarantees the starter species even from an empty restore result', () => {
    useAppStore.getState().syncUnlockedSpeciesIds([]);
    expect(useAppStore.getState().entitlements.unlockedSpeciesIds).toContain(STARTER_SPECIES_ID);
  });
});

describe('mergeFish', () => {
  function seedFry(id: string): Fish {
    return createFish(STARTER_SPECIES_ID, 0, id);
  }

  it('merges three same-stage fish into one of the next stage, atomically', () => {
    useAppStore.setState({ fish: [seedFry('a'), seedFry('b'), seedFry('c')] });

    const result = useAppStore.getState().mergeFish(['a', 'b', 'c'], 1_700_000_000_000);

    expect(result.ok).toBe(true);
    const { fish } = useAppStore.getState();
    expect(fish).toHaveLength(1);
    expect(fish[0].stage).toBe('juvenile');
  });

  it('leaves the collection completely untouched on a rejected merge', () => {
    const seed = [seedFry('a'), seedFry('b')];
    useAppStore.setState({ fish: seed });

    const result = useAppStore.getState().mergeFish(['a', 'b'], 1_700_000_000_000);

    expect(result.ok).toBe(false);
    expect(useAppStore.getState().fish).toEqual(seed);
  });

  it('rejects merging three Elder fish and leaves them in place', () => {
    const elders = [
      { ...seedFry('a'), stage: 'elder' as const },
      { ...seedFry('b'), stage: 'elder' as const },
      { ...seedFry('c'), stage: 'elder' as const },
    ];
    useAppStore.setState({ fish: elders });

    const result = useAppStore.getState().mergeFish(['a', 'b', 'c'], 1_700_000_000_000);

    expect(result).toMatchObject({ ok: false, reason: 'top-stage' });
    expect(useAppStore.getState().fish).toHaveLength(3);
  });

  it('rejects a mixed-stage selection', () => {
    useAppStore.setState({
      fish: [seedFry('a'), seedFry('b'), { ...seedFry('c'), stage: 'juvenile' }],
    });

    const result = useAppStore.getState().mergeFish(['a', 'b', 'c'], 1_700_000_000_000);

    expect(result).toMatchObject({ ok: false, reason: 'mixed-stages' });
    expect(useAppStore.getState().fish).toHaveLength(3);
  });
});

describe('debug actions (post-M6a review, updated for the reward rearchitecture)', () => {
  describe('debugHatchFry', () => {
    it('hatches exactly one Fry of the resolved active species', () => {
      useAppStore.getState().debugHatchFry(1_700_000_000_000);

      const { fish } = useAppStore.getState();
      expect(fish).toHaveLength(1);
      expect(fish[0]).toMatchObject({
        speciesId: STARTER_SPECIES_ID,
        stage: 'fry',
        bornAt: 1_700_000_000_000,
        health: 'healthy',
      });
    });

    it('hatches the resolved active species once it is unlocked and selected', () => {
      useAppStore.getState().unlockSpecies(GOLDEN_KOI_SPECIES_ID);
      useAppStore.getState().setActiveSpecies(GOLDEN_KOI_SPECIES_ID);

      useAppStore.getState().debugHatchFry(1_700_000_000_000);

      expect(useAppStore.getState().fish[0].speciesId).toBe(GOLDEN_KOI_SPECIES_ID);
    });

    it('falls back to the starter species if activeSpeciesId names a species no longer owned', () => {
      useAppStore.setState((s) => ({ settings: { ...s.settings, activeSpeciesId: GOLDEN_KOI_SPECIES_ID } }));

      useAppStore.getState().debugHatchFry(1_700_000_000_000);

      expect(useAppStore.getState().fish[0].speciesId).toBe(STARTER_SPECIES_ID);
    });

    it('always appends, even when an existing fish is present — unconditional, unlike a real session it just resembles', () => {
      useAppStore.setState({ fish: [createFish(STARTER_SPECIES_ID, 0, 'existing')] });

      useAppStore.getState().debugHatchFry(1_700_000_100_000);

      expect(useAppStore.getState().fish).toHaveLength(2);
    });

    it('assigns each hatched fish a distinct id, so pressing it three times gives a mergeable trio', () => {
      useAppStore.getState().debugHatchFry(1_700_000_000_000);
      useAppStore.getState().debugHatchFry(1_700_000_000_001);
      useAppStore.getState().debugHatchFry(1_700_000_000_002);

      const { fish } = useAppStore.getState();
      const ids = new Set(fish.map((f) => f.id));
      expect(ids.size).toBe(3);

      const merge = useAppStore.getState().mergeFish([...ids], 1_700_000_000_003);
      expect(merge.ok).toBe(true);
    });

    it('does not touch stats, the streak, or any fish health', () => {
      useAppStore.setState({
        fish: [{ id: 'sick', speciesId: STARTER_SPECIES_ID, stage: 'fry', bornAt: 0, health: 'sick' }],
      });
      const before = useAppStore.getState().stats;

      useAppStore.getState().debugHatchFry(1_700_000_000_000);

      expect(useAppStore.getState().stats).toEqual(before);
      expect(useAppStore.getState().fish.find((f) => f.id === 'sick')?.health).toBe('sick');
    });
  });

  describe('debugHatchJuvenile', () => {
    it('hatches exactly one Juvenile', () => {
      useAppStore.getState().debugHatchJuvenile(1_700_000_000_000);

      const { fish } = useAppStore.getState();
      expect(fish).toHaveLength(1);
      expect(fish[0].stage).toBe('juvenile');
    });

    it('draws from every owned species, not just the active one', () => {
      useAppStore.getState().unlockSpecies(GOLDEN_KOI_SPECIES_ID);
      useAppStore.getState().unlockSpecies(INDIGO_BETTA_SPECIES_ID);
      // Active species stays the starter throughout.
      const owned = useAppStore.getState().entitlements.unlockedSpeciesIds;

      for (let i = 0; i < 30; i += 1) {
        useAppStore.setState({ fish: [] });
        useAppStore.getState().debugHatchJuvenile(1_700_000_000_000 + i);
        expect(owned).toContain(useAppStore.getState().fish[0].speciesId);
      }
    });

    it('always appends, even when an existing fish is present', () => {
      useAppStore.setState({ fish: [createFish(STARTER_SPECIES_ID, 0, 'existing')] });

      useAppStore.getState().debugHatchJuvenile(1_700_000_100_000);

      expect(useAppStore.getState().fish).toHaveLength(2);
    });

    it('does not touch stats, the streak, or any fish health', () => {
      useAppStore.setState({
        fish: [{ id: 'sick', speciesId: STARTER_SPECIES_ID, stage: 'fry', bornAt: 0, health: 'sick' }],
      });
      const before = useAppStore.getState().stats;

      useAppStore.getState().debugHatchJuvenile(1_700_000_000_000);

      expect(useAppStore.getState().stats).toEqual(before);
      expect(useAppStore.getState().fish.find((f) => f.id === 'sick')?.health).toBe('sick');
    });
  });
});
