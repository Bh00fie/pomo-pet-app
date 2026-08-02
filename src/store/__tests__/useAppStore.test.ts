import { GROWTH } from '@/config';
import {
  createFish,
  GOLDEN_KOI_SPECIES_ID,
  INDIGO_BETTA_SPECIES_ID,
  STARTER_SPECIES_ID,
  type Fish,
} from '@/features/pet/model';
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

describe('recordManualAbandon (M5-review fix)', () => {
  it('increments abandonedSessions without touching fish health, unlike the auto-abandon path', () => {
    useAppStore.getState().awardSessionCompletion(25 * MINUTE, 1_700_000_000_000);
    const fishId = useAppStore.getState().fish[0].id;

    useAppStore.getState().recordManualAbandon();

    expect(useAppStore.getState().stats.abandonedSessions).toBe(1);
    expect(useAppStore.getState().fish.find((f) => f.id === fishId)?.health).toBe('healthy');
  });

  it('touches no other stat', () => {
    useAppStore.getState().awardSessionCompletion(25 * MINUTE, 1_700_000_000_000);
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

describe('awardSessionCompletion — species-selection for new fry (docs/PLAN.md M6a)', () => {
  it('still hatches the starter species by default — the active species defaults to the starter', () => {
    useAppStore.getState().awardSessionCompletion(25 * MINUTE, 1_700_000_000_000);
    expect(useAppStore.getState().fish[0].speciesId).toBe(STARTER_SPECIES_ID);
  });

  it('hatches the user’s chosen active species once it is unlocked and selected', () => {
    useAppStore.getState().unlockSpecies(GOLDEN_KOI_SPECIES_ID);
    useAppStore.getState().setActiveSpecies(GOLDEN_KOI_SPECIES_ID);

    useAppStore.getState().awardSessionCompletion(25 * MINUTE, 1_700_000_000_000);

    expect(useAppStore.getState().fish[0].speciesId).toBe(GOLDEN_KOI_SPECIES_ID);
  });

  it('a second fry, once the first is capped, hatches as the active species too — not stuck on the starter forever', () => {
    useAppStore.getState().unlockSpecies(GOLDEN_KOI_SPECIES_ID);
    useAppStore.getState().setActiveSpecies(GOLDEN_KOI_SPECIES_ID);

    useAppStore.getState().awardSessionCompletion(10_000 * MINUTE, 1_700_000_000_000); // caps the first fry
    useAppStore.getState().awardSessionCompletion(25 * MINUTE, 1_700_000_100_000);

    const { fish } = useAppStore.getState();
    expect(fish).toHaveLength(2);
    expect(fish.every((f) => f.speciesId === GOLDEN_KOI_SPECIES_ID)).toBe(true);
  });

  it('falls back to the starter species if activeSpeciesId somehow names a species no longer owned', () => {
    // Defensive path: force a corrupt/stale state directly (setActiveSpecies itself would have
    // refused this) and confirm the reward path still never spawns an unowned species.
    useAppStore.setState((s) => ({ settings: { ...s.settings, activeSpeciesId: GOLDEN_KOI_SPECIES_ID } }));
    expect(useAppStore.getState().entitlements.unlockedSpeciesIds).not.toContain(GOLDEN_KOI_SPECIES_ID);

    useAppStore.getState().awardSessionCompletion(25 * MINUTE, 1_700_000_000_000);

    expect(useAppStore.getState().fish[0].speciesId).toBe(STARTER_SPECIES_ID);
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

describe('debug actions (post-M6a review — fast-forwarding real pacing during testing)', () => {
  describe('debugGrantXp', () => {
    it('produces exactly the same fish state a real session completion would for that XP amount', () => {
      // Same starting collection, one path via the real session-completion action (spending
      // xpPerFocusMinute-denominated focus time), the other via the debug grant of the resulting
      // XP directly — the two must land on identical fish state, proving the debug action routes
      // through the same underlying distribution rule rather than a parallel implementation.
      useAppStore.getState().awardSessionCompletion(25 * MINUTE, 1_700_000_000_000);
      const viaRealSession = useAppStore.getState().fish;

      useAppStore.getState().resetAll();
      useAppStore.getState().debugGrantXp(25 * GROWTH.xpPerFocusMinute, 1_700_000_000_000);
      const viaDebugGrant = useAppStore.getState().fish;

      expect(viaDebugGrant.map((f) => ({ ...f, id: undefined }))).toEqual(
        viaRealSession.map((f) => ({ ...f, id: undefined })),
      );
    });

    it('grows the current active-growth-target fish, reusing reward.ts’s first-with-room selection', () => {
      const capped = { ...createFish(STARTER_SPECIES_ID, 0, 'capped'), xp: GROWTH.xpPerStage };
      const growing = createFish(STARTER_SPECIES_ID, 0, 'growing');
      useAppStore.setState({ fish: [capped, growing] });

      useAppStore.getState().debugGrantXp(50, 1_700_000_000_000);

      const { fish } = useAppStore.getState();
      expect(fish.find((f) => f.id === 'capped')!.xp).toBe(GROWTH.xpPerStage);
      expect(fish.find((f) => f.id === 'growing')!.xp).toBe(50);
    });

    it('can cap a fish in one call with a large enough grant, including overflow into a new fish', () => {
      // Same overflow-chain guarantee as the real reward path (docs/PLAN.md M4): the grant only
      // clamps-and-discards when it *hatches* the target from scratch, so this seeds one
      // existing under-cap fish for the grant to grow (and overflow past) rather than spawn.
      useAppStore.setState({ fish: [createFish(STARTER_SPECIES_ID, 0, 'existing')] });

      useAppStore.getState().debugGrantXp(GROWTH.xpPerStage + 30, 1_700_000_000_000);

      const { fish } = useAppStore.getState();
      expect(fish).toHaveLength(2);
      expect(fish.find((f) => f.id === 'existing')!.xp).toBe(GROWTH.xpPerStage);
      expect(fish.find((f) => f.id !== 'existing')!.xp).toBe(30);
    });

    it('does not touch stats or the streak — only awardSessionCompletion does that', () => {
      useAppStore.getState().awardSessionCompletion(25 * MINUTE, 1_700_000_000_000);
      const before = useAppStore.getState().stats;

      useAppStore.getState().debugGrantXp(200, 1_700_000_100_000);

      expect(useAppStore.getState().stats).toEqual(before);
    });

    it('hatches a fresh fry as the resolved active species when there is nothing to grow', () => {
      useAppStore.getState().unlockSpecies(GOLDEN_KOI_SPECIES_ID);
      useAppStore.getState().setActiveSpecies(GOLDEN_KOI_SPECIES_ID);

      useAppStore.getState().debugGrantXp(40, 1_700_000_000_000);

      expect(useAppStore.getState().fish[0].speciesId).toBe(GOLDEN_KOI_SPECIES_ID);
    });
  });

  describe('debugCapAllFish', () => {
    it('sets every existing fish to its stage’s max XP in one call', () => {
      useAppStore.setState({
        fish: [
          createFish(STARTER_SPECIES_ID, 0, 'a'),
          { ...createFish(STARTER_SPECIES_ID, 0, 'b'), xp: 40 },
          { ...createFish(GOLDEN_KOI_SPECIES_ID, 0, 'c'), xp: GROWTH.xpPerStage },
        ],
      });

      useAppStore.getState().debugCapAllFish();

      expect(useAppStore.getState().fish.every((f) => f.xp === GROWTH.xpPerStage)).toBe(true);
      expect(useAppStore.getState().fish).toHaveLength(3);
    });

    it('is a no-op on an empty collection', () => {
      useAppStore.getState().debugCapAllFish();
      expect(useAppStore.getState().fish).toEqual([]);
    });

    it('never changes fish health — capping is not a way to cure a sick fish', () => {
      useAppStore.setState({
        fish: [{ ...createFish(STARTER_SPECIES_ID, 0, 'sick-fish'), health: 'sick' }],
      });

      useAppStore.getState().debugCapAllFish();

      expect(useAppStore.getState().fish[0].health).toBe('sick');
      expect(useAppStore.getState().fish[0].xp).toBe(GROWTH.xpPerStage);
    });

    it('makes an immediate merge selection legal — the whole point of the action', () => {
      useAppStore.setState({
        fish: [
          createFish(STARTER_SPECIES_ID, 0, 'a'),
          createFish(STARTER_SPECIES_ID, 0, 'b'),
          createFish(STARTER_SPECIES_ID, 0, 'c'),
        ],
      });

      useAppStore.getState().debugCapAllFish();
      const result = useAppStore.getState().mergeFish(['a', 'b', 'c'], 1_700_000_000_000);

      expect(result.ok).toBe(true);
      expect(useAppStore.getState().fish).toHaveLength(1);
      expect(useAppStore.getState().fish[0].stage).toBe('juvenile');
    });
  });

  describe('debugSpawnFish', () => {
    it('hatches a fresh fry of the resolved active species, unconditionally', () => {
      useAppStore.getState().unlockSpecies(GOLDEN_KOI_SPECIES_ID);
      useAppStore.getState().setActiveSpecies(GOLDEN_KOI_SPECIES_ID);

      useAppStore.getState().debugSpawnFish(1_700_000_000_000);

      const { fish } = useAppStore.getState();
      expect(fish).toHaveLength(1);
      expect(fish[0]).toMatchObject({
        speciesId: GOLDEN_KOI_SPECIES_ID,
        stage: 'fry',
        xp: 0,
        bornAt: 1_700_000_000_000,
        health: 'healthy',
      });
    });

    it('defaults to the starter species when nothing else is active', () => {
      useAppStore.getState().debugSpawnFish(1_700_000_000_000);
      expect(useAppStore.getState().fish[0].speciesId).toBe(STARTER_SPECIES_ID);
    });

    it('spawns even when an existing fish still has room to grow — unlike the real spawn rule', () => {
      useAppStore.setState({ fish: [createFish(STARTER_SPECIES_ID, 0, 'roomy')] });

      useAppStore.getState().debugSpawnFish(1_700_000_100_000);

      expect(useAppStore.getState().fish).toHaveLength(2);
      const roomy = useAppStore.getState().fish.find((f) => f.id === 'roomy')!;
      expect(roomy.xp).toBe(0); // untouched — the existing fish was not grown, a new one hatched
    });

    it('falls back to the starter species if activeSpeciesId names a species no longer owned', () => {
      useAppStore.setState((s) => ({ settings: { ...s.settings, activeSpeciesId: GOLDEN_KOI_SPECIES_ID } }));

      useAppStore.getState().debugSpawnFish(1_700_000_000_000);

      expect(useAppStore.getState().fish[0].speciesId).toBe(STARTER_SPECIES_ID);
    });

    it('assigns each spawned fish a distinct id', () => {
      useAppStore.getState().debugSpawnFish(1_700_000_000_000);
      useAppStore.getState().debugSpawnFish(1_700_000_000_001);

      const [a, b] = useAppStore.getState().fish;
      expect(a.id).not.toBe(b.id);
    });
  });
});
