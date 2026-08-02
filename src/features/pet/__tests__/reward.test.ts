import { GROWTH } from '@/config';
import { addXp, createFish, GOLDEN_KOI_SPECIES_ID, STARTER_SPECIES_ID, type Fish } from '../model';
import { applySessionReward, distributeXp, xpForFocusMs } from '../reward';

const MS_PER_MINUTE = 60_000;

describe('xpForFocusMs', () => {
  it('awards GROWTH.xpPerFocusMinute per completed minute', () => {
    expect(xpForFocusMs(25 * MS_PER_MINUTE)).toBe(25 * GROWTH.xpPerFocusMinute);
  });

  it('rounds partial minutes rather than truncating to zero', () => {
    expect(xpForFocusMs(90_000)).toBe(Math.round(1.5 * GROWTH.xpPerFocusMinute));
  });

  it('is zero for non-positive or non-finite input', () => {
    expect(xpForFocusMs(0)).toBe(0);
    expect(xpForFocusMs(-1000)).toBe(0);
    expect(xpForFocusMs(NaN)).toBe(0);
  });
});

describe('applySessionReward', () => {
  const idFactory = () => 'new-fish';

  it('spawns a starter fry when the user has no fish yet', () => {
    const result = applySessionReward({ fish: [], focusMs: 25 * MS_PER_MINUTE, now: 1000, idFactory });

    expect(result.spawned).toBe(true);
    expect(result.fish).toHaveLength(1);
    expect(result.fish[0]).toMatchObject({
      id: 'new-fish',
      speciesId: STARTER_SPECIES_ID,
      stage: 'fry',
      bornAt: 1000,
      health: 'healthy',
    });
    expect(result.fish[0].xp).toBe(xpForFocusMs(25 * MS_PER_MINUTE));
    expect(result.awardedFishId).toBe('new-fish');
  });

  it('grows an existing fish rather than spawning when one exists', () => {
    const existing: Fish = createFish(STARTER_SPECIES_ID, 0, 'existing');
    const result = applySessionReward({
      fish: [existing],
      focusMs: 10 * MS_PER_MINUTE,
      now: 2000,
      idFactory,
    });

    expect(result.spawned).toBe(false);
    expect(result.fish).toHaveLength(1);
    expect(result.fish[0].id).toBe('existing');
    expect(result.fish[0].xp).toBe(xpForFocusMs(10 * MS_PER_MINUTE));
    expect(result.awardedFishId).toBe('existing');
  });

  it('does not mutate the input fish array or its members', () => {
    const existing: Fish = createFish(STARTER_SPECIES_ID, 0, 'existing');
    const input = [existing];
    applySessionReward({ fish: input, focusMs: 10 * MS_PER_MINUTE, now: 0, idFactory });

    expect(input[0].xp).toBe(0);
    expect(existing.xp).toBe(0);
  });

  it('prefers a not-yet-capped fish over one waiting on a merge', () => {
    const capped = addXp(createFish(STARTER_SPECIES_ID, 0, 'capped'), GROWTH.xpPerStage);
    const growing = createFish(STARTER_SPECIES_ID, 0, 'growing');

    const result = applySessionReward({
      fish: [capped, growing],
      focusMs: 5 * MS_PER_MINUTE,
      now: 0,
      idFactory,
    });

    expect(result.awardedFishId).toBe('growing');
    const updatedCapped = result.fish.find((f) => f.id === 'capped')!;
    const updatedGrowing = result.fish.find((f) => f.id === 'growing')!;
    expect(updatedCapped.xp).toBe(GROWTH.xpPerStage);
    expect(updatedGrowing.xp).toBe(xpForFocusMs(5 * MS_PER_MINUTE));
  });

  it('spawns a new fry when every existing fish is already capped, rather than wasting the XP (M3)', () => {
    const capped = addXp(createFish(STARTER_SPECIES_ID, 0, 'capped'), GROWTH.xpPerStage);

    const result = applySessionReward({
      fish: [capped],
      focusMs: 25 * MS_PER_MINUTE,
      now: 5000,
      idFactory,
    });

    expect(result.spawned).toBe(true);
    expect(result.fish).toHaveLength(2);
    expect(result.awardedFishId).toBe('new-fish');

    const hatched = result.fish.find((f) => f.id === 'new-fish')!;
    expect(hatched).toMatchObject({
      speciesId: STARTER_SPECIES_ID,
      stage: 'fry',
      bornAt: 5000,
      health: 'healthy',
    });
    expect(hatched.xp).toBe(xpForFocusMs(25 * MS_PER_MINUTE));

    // The already-capped fish is left untouched, still exactly at the cap — the new session's
    // XP went to the new fry instead of being clamped away on a fish with no room left.
    const stillCapped = result.fish.find((f) => f.id === 'capped')!;
    expect(stillCapped.xp).toBe(GROWTH.xpPerStage);
  });

  it('spawns a new fry when multiple existing fish are all capped', () => {
    const cappedA = addXp(createFish(STARTER_SPECIES_ID, 0, 'capped-a'), GROWTH.xpPerStage);
    const cappedB = addXp(createFish(STARTER_SPECIES_ID, 0, 'capped-b'), GROWTH.xpPerStage);

    const result = applySessionReward({
      fish: [cappedA, cappedB],
      focusMs: 10 * MS_PER_MINUTE,
      now: 0,
      idFactory,
    });

    expect(result.spawned).toBe(true);
    expect(result.fish).toHaveLength(3);
  });
});

describe('applySessionReward — spawnSpeciesId (docs/PLAN.md M6a)', () => {
  const idFactory = () => 'new-fish';

  it('defaults to the starter species when spawnSpeciesId is omitted (pre-M6a callers/tests unaffected)', () => {
    const result = applySessionReward({ fish: [], focusMs: 25 * MS_PER_MINUTE, now: 0, idFactory });
    expect(result.fish[0].speciesId).toBe(STARTER_SPECIES_ID);
  });

  it('hatches a fresh Fry as the given spawnSpeciesId when there is nothing to grow', () => {
    const result = applySessionReward({
      fish: [],
      focusMs: 25 * MS_PER_MINUTE,
      now: 0,
      idFactory,
      spawnSpeciesId: GOLDEN_KOI_SPECIES_ID,
    });
    expect(result.spawned).toBe(true);
    expect(result.fish[0].speciesId).toBe(GOLDEN_KOI_SPECIES_ID);
  });

  it('spawns the given spawnSpeciesId once every existing fish is capped, leaving the capped fish’s own species alone', () => {
    const cappedStarter = addXp(createFish(STARTER_SPECIES_ID, 0, 'capped'), GROWTH.xpPerStage);

    const result = applySessionReward({
      fish: [cappedStarter],
      focusMs: 25 * MS_PER_MINUTE,
      now: 0,
      idFactory,
      spawnSpeciesId: GOLDEN_KOI_SPECIES_ID,
    });

    expect(result.fish).toHaveLength(2);
    const capped = result.fish.find((f) => f.id === 'capped')!;
    const hatched = result.fish.find((f) => f.id === 'new-fish')!;
    expect(capped.speciesId).toBe(STARTER_SPECIES_ID); // untouched — spawning a new species never rewrites an existing fish
    expect(hatched.speciesId).toBe(GOLDEN_KOI_SPECIES_ID);
  });

  it('grows an existing under-cap fish of a different species rather than spawning — spawnSpeciesId only applies when nothing has room', () => {
    const existingKoi = createFish(GOLDEN_KOI_SPECIES_ID, 0, 'koi');

    const result = applySessionReward({
      fish: [existingKoi],
      focusMs: 10 * MS_PER_MINUTE,
      now: 0,
      idFactory,
      spawnSpeciesId: STARTER_SPECIES_ID, // active species is the starter, but there's room on the koi
    });

    expect(result.spawned).toBe(false);
    expect(result.fish).toHaveLength(1);
    expect(result.fish[0].speciesId).toBe(GOLDEN_KOI_SPECIES_ID);
  });

  it('carries overflow into a new fry of spawnSpeciesId, not the target fish’s own species', () => {
    const almostCapped: Fish = {
      ...createFish(STARTER_SPECIES_ID, 0, 'almost'),
      xp: GROWTH.xpPerStage - 10,
    };

    const result = applySessionReward({
      fish: [almostCapped],
      focusMs: 25 * MS_PER_MINUTE,
      now: 0,
      idFactory,
      spawnSpeciesId: GOLDEN_KOI_SPECIES_ID,
    });

    const grown = result.fish.find((f) => f.id === 'almost')!;
    const overflowFry = result.fish.find((f) => f.id === 'new-fish')!;
    expect(grown.speciesId).toBe(STARTER_SPECIES_ID);
    expect(grown.xp).toBe(GROWTH.xpPerStage);
    expect(overflowFry.speciesId).toBe(GOLDEN_KOI_SPECIES_ID);
    expect(overflowFry.xp).toBe(15);
  });
});

describe('applySessionReward — XP overflow at the stage cap (M4)', () => {
  const idFactory = () => 'new-fry';

  it('carries the remainder into a new fry instead of discarding it: 110/120 + 25 -> 120, fry at 15', () => {
    const almostCapped: Fish = { ...createFish(STARTER_SPECIES_ID, 0, 'almost'), xp: GROWTH.xpPerStage - 10 };

    const result = applySessionReward({
      fish: [almostCapped],
      focusMs: 25 * MS_PER_MINUTE, // xpPerFocusMinute is 1 by default -> 25 XP awarded
      now: 5000,
      idFactory,
    });

    expect(result.fish).toHaveLength(2);
    const grown = result.fish.find((f) => f.id === 'almost')!;
    const fry = result.fish.find((f) => f.id === 'new-fry')!;
    expect(grown.xp).toBe(GROWTH.xpPerStage);
    expect(fry.xp).toBe(15);
    expect(fry.xp).not.toBe(0);
    expect(fry).toMatchObject({ speciesId: STARTER_SPECIES_ID, stage: 'fry', bornAt: 5000, health: 'healthy' });
  });

  it('does not overflow at all when the award exactly fills the remaining room', () => {
    const almostCapped: Fish = { ...createFish(STARTER_SPECIES_ID, 0, 'almost'), xp: GROWTH.xpPerStage - 25 };

    const result = applySessionReward({
      fish: [almostCapped],
      focusMs: 25 * MS_PER_MINUTE,
      now: 0,
      idFactory,
    });

    expect(result.fish).toHaveLength(1);
    expect(result.fish[0].xp).toBe(GROWTH.xpPerStage);
    expect(result.spawned).toBe(false);
  });

  it('spills overflow into a second under-cap fish rather than spawning, when one exists', () => {
    const almostCapped: Fish = { ...createFish(STARTER_SPECIES_ID, 0, 'almost'), xp: GROWTH.xpPerStage - 10 };
    const growing = createFish(STARTER_SPECIES_ID, 0, 'growing');

    const result = applySessionReward({
      fish: [almostCapped, growing],
      focusMs: 25 * MS_PER_MINUTE,
      now: 0,
      idFactory,
    });

    expect(result.fish).toHaveLength(2); // no new fry — the second fish absorbed the overflow
    const grown = result.fish.find((f) => f.id === 'almost')!;
    const spilled = result.fish.find((f) => f.id === 'growing')!;
    expect(grown.xp).toBe(GROWTH.xpPerStage);
    expect(spilled.xp).toBe(15);
  });

  it('chains overflow across multiple already-capped fish before finally spawning', () => {
    const cappedA = addXp(createFish(STARTER_SPECIES_ID, 0, 'capped-a'), GROWTH.xpPerStage);
    const almostB: Fish = { ...createFish(STARTER_SPECIES_ID, 0, 'almost-b'), xp: GROWTH.xpPerStage - 5 };

    // 100 XP: capped-a is already full, so the selection rule skips straight past it to
    // almost-b, which has 5 XP of room — it absorbs 5 and passes the remaining 95 on. With no
    // under-cap fish left after that, the overflow hatches a fresh fry holding all 95.
    const result = applySessionReward({
      fish: [cappedA, almostB],
      focusMs: 100 * MS_PER_MINUTE,
      now: 9000,
      idFactory,
    });

    expect(result.fish).toHaveLength(3);
    const a = result.fish.find((f) => f.id === 'capped-a')!;
    const b = result.fish.find((f) => f.id === 'almost-b')!;
    const fry = result.fish.find((f) => f.id === 'new-fry')!;
    expect(a.xp).toBe(GROWTH.xpPerStage);
    expect(b.xp).toBe(GROWTH.xpPerStage);
    expect(fry.xp).toBe(95);
  });

  it('cures a sick target fish by the mere act of growing it, even mid-overflow', () => {
    const sickAlmostCapped: Fish = {
      ...createFish(STARTER_SPECIES_ID, 0, 'sick-fish'),
      xp: GROWTH.xpPerStage - 10,
      health: 'sick',
    };

    const result = applySessionReward({
      fish: [sickAlmostCapped],
      focusMs: 25 * MS_PER_MINUTE,
      now: 0,
      idFactory,
    });

    const grown = result.fish.find((f) => f.id === 'sick-fish')!;
    expect(grown.health).toBe('healthy');
    expect(grown.xp).toBe(GROWTH.xpPerStage);
  });

  it('cures every sick fish the overflow chain grows, not just the first one it lands on', () => {
    // Three sick fish, each 1 XP from its cap, and a 3 XP award — the chain touches all three.
    // The naive version of this only cures the primary target and leaves the rest of the chain
    // sick despite having just been grown by a completed session.
    const sick = (id: string): Fish => ({
      ...createFish(STARTER_SPECIES_ID, 0, id),
      xp: GROWTH.xpPerStage - 1,
      health: 'sick',
    });

    const result = applySessionReward({
      fish: [sick('a'), sick('b'), sick('c')],
      focusMs: 3 * MS_PER_MINUTE,
      now: 0,
      idFactory,
    });

    expect(result.fish).toHaveLength(3); // 3 XP exactly fills all three, nothing left to spawn
    for (const f of result.fish) {
      expect(f.xp).toBe(GROWTH.xpPerStage);
      expect(f.health).toBe('healthy');
    }
  });

  it('terminates and conserves XP on a long overflow chain, without recursing unboundedly', () => {
    // The recursion's base case is "no fish has room", which hatches a fry that absorbs whatever
    // is left. Every other step both consumes at least 1 XP and removes one fish from the
    // under-cap set, so depth is bounded by the number of under-cap fish. This pins that: 60
    // fish one XP short of their cap, and an award big enough to fill all of them and spill.
    const nearlyFull = Array.from({ length: 60 }, (_, i) => ({
      ...createFish(STARTER_SPECIES_ID, 0, `f${i}`),
      xp: GROWTH.xpPerStage - 1,
    }));
    const startingXp = nearlyFull.reduce((sum, f) => sum + f.xp, 0);

    const result = applySessionReward({
      fish: nearlyFull,
      focusMs: 75 * MS_PER_MINUTE, // 75 XP: 60 to top up every fish, 15 left for a new fry
      now: 0,
      idFactory,
    });

    expect(result.fish).toHaveLength(61);
    expect(result.fish.slice(0, 60).every((f) => f.xp === GROWTH.xpPerStage)).toBe(true);
    expect(result.fish[60].xp).toBe(15);
    // Nothing evaporated and nothing was conjured.
    const endingXp = result.fish.reduce((sum, f) => sum + f.xp, 0);
    expect(endingXp).toBe(startingXp + 75);
  });
});

describe('distributeXp — exported directly for the debug panel (post-M6a review)', () => {
  // The store's `debugGrantXp` action calls this function directly with a raw XP amount instead
  // of routing an `xpForFocusMs`-derived value through `applySessionReward`. Pinning that
  // `applySessionReward` is a thin wrapper around this exact function — not a second copy of the
  // selection/overflow rule — so both callers are provably running the same logic.
  const idFactory = () => 'new-fish';

  it('produces the same result as applySessionReward for the equivalent xpForFocusMs output', () => {
    const fish = [createFish(STARTER_SPECIES_ID, 0, 'existing')];
    const xp = xpForFocusMs(25 * 60_000);

    const viaApplySessionReward = applySessionReward({
      fish,
      focusMs: 25 * 60_000,
      now: 5000,
      idFactory,
    });
    const viaDistributeXp = distributeXp(fish, xp, 5000, idFactory, STARTER_SPECIES_ID);

    expect(viaDistributeXp).toEqual({
      fish: viaApplySessionReward.fish,
      awardedFishId: viaApplySessionReward.awardedFishId,
      spawned: viaApplySessionReward.spawned,
    });
  });

  it('grows the current growth-target fish directly given a raw XP amount', () => {
    const growing = createFish(STARTER_SPECIES_ID, 0, 'growing');
    const result = distributeXp([growing], 75, 0, idFactory, STARTER_SPECIES_ID);

    expect(result.fish[0].xp).toBe(75);
    expect(result.awardedFishId).toBe('growing');
    expect(result.spawned).toBe(false);
  });
});
