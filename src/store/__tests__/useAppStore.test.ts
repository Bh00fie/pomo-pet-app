import { GROWTH } from '@/config';
import { createFish, STARTER_SPECIES_ID, type Fish } from '@/features/pet/model';
import { useAppStore } from '../useAppStore';

const MINUTE = 60_000;

beforeEach(() => {
  useAppStore.getState().resetAll();
});

describe('awardSessionCompletion', () => {
  it('spawns a starter fish on the first completed session', () => {
    useAppStore.getState().awardSessionCompletion(25 * MINUTE, 1_700_000_000_000);

    const { fish } = useAppStore.getState();
    expect(fish).toHaveLength(1);
    expect(fish[0]).toMatchObject({
      speciesId: STARTER_SPECIES_ID,
      stage: 'fry',
      xp: 25 * GROWTH.xpPerFocusMinute,
      health: 'healthy',
    });
    expect(typeof fish[0].id).toBe('string');
    expect(fish[0].id.length).toBeGreaterThan(0);
  });

  it('grows the existing fish on a later session instead of spawning a second one', () => {
    useAppStore.getState().awardSessionCompletion(25 * MINUTE, 1_700_000_000_000);
    const firstId = useAppStore.getState().fish[0].id;

    useAppStore.getState().awardSessionCompletion(10 * MINUTE, 1_700_000_100_000);

    const { fish } = useAppStore.getState();
    expect(fish).toHaveLength(1);
    expect(fish[0].id).toBe(firstId);
    expect(fish[0].xp).toBe(35 * GROWTH.xpPerFocusMinute);
  });

  it('assigns distinct ids to fish spawned in separate sessions', () => {
    // Regression guard for the id generator: two spawns at different `now` values must not
    // collide, whether that second spawn came from a reset collection or (M3) from the first
    // fish having capped out.
    useAppStore.getState().awardSessionCompletion(25 * MINUTE, 1);
    const firstId = useAppStore.getState().fish[0].id;
    useAppStore.setState({ fish: [] });
    useAppStore.getState().awardSessionCompletion(25 * MINUTE, 2);
    const secondId = useAppStore.getState().fish[0].id;

    expect(firstId).not.toBe(secondId);
  });

  it('spawns a second fish once the first is capped, rather than losing further sessions (M3)', () => {
    // A single huge session clamps at the stage cap regardless of `GROWTH.xpPerFocusMinute`.
    useAppStore.getState().awardSessionCompletion(10_000 * MINUTE, 1_700_000_000_000);
    expect(useAppStore.getState().fish).toHaveLength(1);
    expect(useAppStore.getState().fish[0].xp).toBe(GROWTH.xpPerStage);

    useAppStore.getState().awardSessionCompletion(25 * MINUTE, 1_700_000_100_000);

    const { fish } = useAppStore.getState();
    expect(fish).toHaveLength(2);
    const capped = fish.find((f) => f.xp === GROWTH.xpPerStage)!;
    const fresh = fish.find((f) => f.xp < GROWTH.xpPerStage)!;
    expect(capped).toBeTruthy();
    expect(fresh).toBeTruthy();
    expect(fresh.xp).toBe(25 * GROWTH.xpPerFocusMinute);
  });
});

describe('awardSessionCompletion — stats and streak (docs/PLAN.md M4)', () => {
  it('updates totalFocusMs, completedSessions, and focusMsByDate alongside the fish reward', () => {
    const now = new Date(2026, 0, 5, 9, 0, 0).getTime();
    useAppStore.getState().awardSessionCompletion(25 * MINUTE, now);

    const { stats } = useAppStore.getState();
    expect(stats.totalFocusMs).toBe(25 * MINUTE);
    expect(stats.completedSessions).toBe(1);
    expect(stats.focusMsByDate['2026-01-05']).toBe(25 * MINUTE);
  });

  it('accumulates focusMsByDate across two sessions on the same local day', () => {
    const morning = new Date(2026, 0, 5, 9, 0, 0).getTime();
    const evening = new Date(2026, 0, 5, 20, 0, 0).getTime();

    useAppStore.getState().awardSessionCompletion(25 * MINUTE, morning);
    useAppStore.getState().awardSessionCompletion(10 * MINUTE, evening);

    const { stats } = useAppStore.getState();
    expect(stats.focusMsByDate['2026-01-05']).toBe(35 * MINUTE);
    expect(stats.completedSessions).toBe(2);
    expect(stats.currentStreak).toBe(1); // same calendar day — streak doesn't double-count
  });

  it('starts a streak of 1 on the first completed session ever', () => {
    useAppStore.getState().awardSessionCompletion(25 * MINUTE, new Date(2026, 0, 5, 9, 0, 0).getTime());
    expect(useAppStore.getState().stats.currentStreak).toBe(1);
    expect(useAppStore.getState().stats.lastCompletedLocalDate).toBe('2026-01-05');
  });

  it('extends the streak on consecutive local days and resets after a gap', () => {
    useAppStore.getState().awardSessionCompletion(25 * MINUTE, new Date(2026, 0, 5, 9, 0, 0).getTime());
    useAppStore.getState().awardSessionCompletion(25 * MINUTE, new Date(2026, 0, 6, 9, 0, 0).getTime());
    expect(useAppStore.getState().stats.currentStreak).toBe(2);

    // Skip a day entirely.
    useAppStore.getState().awardSessionCompletion(25 * MINUTE, new Date(2026, 0, 8, 9, 0, 0).getTime());
    expect(useAppStore.getState().stats.currentStreak).toBe(1);
    expect(useAppStore.getState().stats.longestStreak).toBe(2); // the earlier record stands
  });

  it('recovers a sick fish the next time it is selected as the grow target', () => {
    useAppStore.getState().awardSessionCompletion(25 * MINUTE, 1_700_000_000_000);
    useAppStore.setState((s) => ({
      fish: s.fish.map((f) => ({ ...f, health: 'sick' as const })),
    }));
    expect(useAppStore.getState().fish[0].health).toBe('sick');

    useAppStore.getState().awardSessionCompletion(10 * MINUTE, 1_700_000_100_000);

    expect(useAppStore.getState().fish[0].health).toBe('healthy');
  });
});

describe('penalizeAbandonedSession (docs/PLAN.md M4)', () => {
  it('is a no-op that still counts the abandonment when the user has no fish', () => {
    useAppStore.getState().penalizeAbandonedSession(1_700_000_000_000);

    expect(useAppStore.getState().fish).toEqual([]);
    expect(useAppStore.getState().stats.abandonedSessions).toBe(1);
  });

  it('sickens the first under-cap fish — the same target reward would have grown', () => {
    useAppStore.getState().awardSessionCompletion(25 * MINUTE, 1_700_000_000_000);
    const fishId = useAppStore.getState().fish[0].id;

    useAppStore.getState().penalizeAbandonedSession(1_700_000_100_000);

    expect(useAppStore.getState().fish.find((f) => f.id === fishId)?.health).toBe('sick');
    expect(useAppStore.getState().stats.abandonedSessions).toBe(1);
  });

  it('never touches the streak or focus-time stats — only the reward path does that', () => {
    useAppStore.getState().awardSessionCompletion(25 * MINUTE, 1_700_000_000_000);
    const before = useAppStore.getState().stats;

    useAppStore.getState().penalizeAbandonedSession(1_700_000_100_000);

    const after = useAppStore.getState().stats;
    expect(after.currentStreak).toBe(before.currentStreak);
    expect(after.totalFocusMs).toBe(before.totalFocusMs);
    expect(after.completedSessions).toBe(before.completedSessions);
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
    expect(fish[0].xp).toBe(0);
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
