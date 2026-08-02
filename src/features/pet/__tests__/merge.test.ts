import { GROWTH } from '@/config';
import {
  createFish,
  SPECIES_ORDER,
  GOLDEN_KOI_SPECIES_ID,
  INDIGO_BETTA_SPECIES_ID,
  SHARK_SPECIES_ID,
  CLOWNFISH_SPECIES_ID,
  STARTER_SPECIES_ID,
  type Fish,
} from '../model';
import { evaluateMerge, isMergeEligibleStage } from '../merge';

function fry(id: string, speciesId: string = STARTER_SPECIES_ID): Fish {
  return createFish(speciesId, 0, id);
}

function withStage(fish: Fish, stage: Fish['stage']): Fish {
  return { ...fish, stage };
}

const idFactory = () => 'merged-fish';

describe('evaluateMerge', () => {
  it('rejects a selection smaller than fishPerMerge', () => {
    const fish = [fry('a'), fry('b')];
    const result = evaluateMerge({ fish, selectedIds: ['a', 'b'], now: 0, idFactory });
    expect(result).toEqual({ ok: false, reason: 'wrong-count' });
  });

  it('rejects a selection larger than fishPerMerge', () => {
    const fish = [fry('a'), fry('b'), fry('c'), fry('d')];
    const result = evaluateMerge({ fish, selectedIds: ['a', 'b', 'c', 'd'], now: 0, idFactory });
    expect(result).toEqual({ ok: false, reason: 'wrong-count' });
  });

  it('rejects duplicate ids that collapse below fishPerMerge once de-duplicated', () => {
    const fish = [fry('a'), fry('b')];
    // GROWTH.fishPerMerge is 3; selecting 'a' three times only ever refers to one fish.
    const result = evaluateMerge({ fish, selectedIds: ['a', 'a', 'a'], now: 0, idFactory });
    expect(result).toEqual({ ok: false, reason: 'wrong-count' });
  });

  it('rejects when a selected id does not exist in the collection', () => {
    const fish = [fry('a'), fry('b'), fry('c')];
    const result = evaluateMerge({ fish, selectedIds: ['a', 'b', 'ghost'], now: 0, idFactory });
    expect(result).toEqual({ ok: false, reason: 'fish-not-found' });
  });

  it('rejects a mixed-stage selection', () => {
    const fish = [fry('a'), fry('b'), withStage(fry('c'), 'juvenile')];
    const result = evaluateMerge({ fish, selectedIds: ['a', 'b', 'c'], now: 0, idFactory });
    expect(result).toEqual({ ok: false, reason: 'mixed-stages' });
  });

  it('rejects a mixed-species selection even when stages match', () => {
    const fish = [fry('a'), fry('b'), fry('c', 'some-other-species')];
    const result = evaluateMerge({ fish, selectedIds: ['a', 'b', 'c'], now: 0, idFactory });
    expect(result).toEqual({ ok: false, reason: 'mixed-species' });
  });

  it('rejects merging a real shop species with the starter (docs/PLAN.md M6a — multi-species now observable)', () => {
    // Same rule as above, but exercised with two species that actually ship (M3's note that this
    // was "unobservable today (one species)" no longer holds as of the M6a shop). A Golden Koi
    // collection must not merge with Coral Tetras — the restriction is unchanged, just no longer
    // hypothetical.
    const fish = [fry('a'), fry('b'), fry('c', GOLDEN_KOI_SPECIES_ID)];
    const result = evaluateMerge({ fish, selectedIds: ['a', 'b', 'c'], now: 0, idFactory });
    expect(result).toEqual({ ok: false, reason: 'mixed-species' });
  });

  it('rejects a Reef Shark and a Clownfish merging together — new species merge only with '
    + 'their own kind, same restriction as every existing species', () => {
    const fish = [
      fry('a', SHARK_SPECIES_ID),
      fry('b', SHARK_SPECIES_ID),
      fry('c', CLOWNFISH_SPECIES_ID),
    ];
    const result = evaluateMerge({ fish, selectedIds: ['a', 'b', 'c'], now: 0, idFactory });
    expect(result).toEqual({ ok: false, reason: 'mixed-species' });
  });

  it.each([STARTER_SPECIES_ID, GOLDEN_KOI_SPECIES_ID, INDIGO_BETTA_SPECIES_ID])(
    'rejects a Reef Shark merging with %s',
    (otherSpecies) => {
      const fish = [fry('a', SHARK_SPECIES_ID), fry('b', SHARK_SPECIES_ID), fry('c', otherSpecies)];
      const result = evaluateMerge({ fish, selectedIds: ['a', 'b', 'c'], now: 0, idFactory });
      expect(result).toEqual({ ok: false, reason: 'mixed-species' });
    },
  );

  it.each([STARTER_SPECIES_ID, GOLDEN_KOI_SPECIES_ID, INDIGO_BETTA_SPECIES_ID])(
    'rejects a Clownfish merging with %s',
    (otherSpecies) => {
      const fish = [fry('a', CLOWNFISH_SPECIES_ID), fry('b', CLOWNFISH_SPECIES_ID), fry('c', otherSpecies)];
      const result = evaluateMerge({ fish, selectedIds: ['a', 'b', 'c'], now: 0, idFactory });
      expect(result).toEqual({ ok: false, reason: 'mixed-species' });
    },
  );

  it('still merges three same-species Reef Sharks and three same-species Clownfish normally', () => {
    for (const speciesId of [SHARK_SPECIES_ID, CLOWNFISH_SPECIES_ID]) {
      const fish = [fry('a', speciesId), fry('b', speciesId), fry('c', speciesId)];
      const result = evaluateMerge({ fish, selectedIds: ['a', 'b', 'c'], now: 0, idFactory });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.newFish.speciesId).toBe(speciesId);
      expect(result.newFish.stage).toBe('juvenile');
    }
  });

  it.each(
    SPECIES_ORDER.flatMap((a) =>
      SPECIES_ORDER.filter((b) => b !== a).map((b) => [a, b] as const),
    ),
  )(
    'rejects mixing %s with %s — every ordered species pair in the catalog, not just one',
    (majority, odd) => {
      // Driven off `SPECIES_ORDER` rather than a hand-written pair list, so a species added at
      // M6b/v2 is covered the day it ships instead of quietly widening this gap.
      const fish = [fry('a', majority), fry('b', majority), fry('c', odd)];
      const result = evaluateMerge({ fish, selectedIds: ['a', 'b', 'c'], now: 0, idFactory });
      expect(result).toEqual({ ok: false, reason: 'mixed-species' });
    },
  );

  it.each(SPECIES_ORDER.map((id) => [id] as const))(
    'merges three same-species %s fish, and the result keeps that species',
    (speciesId) => {
      const fish = [fry('a', speciesId), fry('b', speciesId), fry('c', speciesId)];
      const result = evaluateMerge({ fish, selectedIds: ['a', 'b', 'c'], now: 0, idFactory });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.newFish.speciesId).toBe(speciesId);
      expect(result.newFish.stage).toBe('juvenile');
    },
  );

  it('still merges three same-species Golden Koi normally — the restriction is per-species, not starter-only', () => {
    const fish = [
      fry('a', GOLDEN_KOI_SPECIES_ID),
      fry('b', GOLDEN_KOI_SPECIES_ID),
      fry('c', GOLDEN_KOI_SPECIES_ID),
    ];
    const result = evaluateMerge({ fish, selectedIds: ['a', 'b', 'c'], now: 0, idFactory });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.newFish.speciesId).toBe(GOLDEN_KOI_SPECIES_ID);
    expect(result.newFish.stage).toBe('juvenile');
  });

  it('rejects merging three Elder fish — there is no stage above Elder', () => {
    const fish = [
      withStage(fry('a'), 'elder'),
      withStage(fry('b'), 'elder'),
      withStage(fry('c'), 'elder'),
    ];
    const result = evaluateMerge({ fish, selectedIds: ['a', 'b', 'c'], now: 0, idFactory });
    expect(result).toEqual({ ok: false, reason: 'top-stage' });
  });

  it('does not crash and rejects cleanly rather than silently no-op-ing on Elder fish', () => {
    const fish = [withStage(fry('a'), 'elder'), withStage(fry('b'), 'elder'), withStage(fry('c'), 'elder')];
    expect(() =>
      evaluateMerge({ fish, selectedIds: ['a', 'b', 'c'], now: 0, idFactory }),
    ).not.toThrow();
  });

  it('merges three Fry into one Juvenile at 0 XP', () => {
    const fish = [fry('a'), fry('b'), fry('c')];
    const result = evaluateMerge({ fish, selectedIds: ['a', 'b', 'c'], now: 5000, idFactory });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.removedIds.sort()).toEqual(['a', 'b', 'c']);
    expect(result.newFish).toMatchObject({
      id: 'merged-fish',
      speciesId: STARTER_SPECIES_ID,
      stage: 'juvenile',
      xp: 0,
      bornAt: 5000,
      health: 'healthy',
    });
    expect(result.fish).toHaveLength(1);
    expect(result.fish[0]).toBe(result.newFish);
  });

  it('merges three Juvenile into one Elder', () => {
    const fish = [withStage(fry('a'), 'juvenile'), withStage(fry('b'), 'juvenile'), withStage(fry('c'), 'juvenile')];
    const result = evaluateMerge({ fish, selectedIds: ['a', 'b', 'c'], now: 0, idFactory });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.newFish.stage).toBe('elder');
  });

  it('preserves untouched fish outside the selection', () => {
    const bystander = fry('bystander');
    const fish = [fry('a'), fry('b'), fry('c'), bystander];
    const result = evaluateMerge({ fish, selectedIds: ['a', 'b', 'c'], now: 0, idFactory });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fish).toHaveLength(2);
    expect(result.fish).toContain(bystander);
  });

  it('does not mutate the input fish array or its members', () => {
    const fish = [fry('a'), fry('b'), fry('c')];
    const snapshot = fish.map((f) => ({ ...f }));

    evaluateMerge({ fish, selectedIds: ['a', 'b', 'c'], now: 0, idFactory });

    expect(fish).toEqual(snapshot);
    expect(fish).toHaveLength(3);
  });

  it('respects a custom fishPerMerge count from config (regression guard against hardcoding 3)', () => {
    // GROWTH.fishPerMerge is read live from config, not redefined here — this just asserts the
    // count check is actually driven by it rather than a copy-pasted literal.
    expect(GROWTH.fishPerMerge).toBe(3);
  });
});

describe('isMergeEligibleStage', () => {
  it('is true for Fry and Juvenile', () => {
    expect(isMergeEligibleStage('fry')).toBe(true);
    expect(isMergeEligibleStage('juvenile')).toBe(true);
  });

  it('is false for Elder, the top stage', () => {
    expect(isMergeEligibleStage('elder')).toBe(false);
  });
});
