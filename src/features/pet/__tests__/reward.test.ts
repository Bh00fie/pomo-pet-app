import { GROWTH } from '@/config';
import { addXp, createFish, STARTER_SPECIES_ID, type Fish } from '../model';
import { applySessionReward, xpForFocusMs } from '../reward';

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

    // 100 XP: capped-a is already full (0 room, all 100 overflow immediately); almost-b has 5
    // XP of room, absorbing 5 and passing on 95 to a freshly hatched fry.
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
});
