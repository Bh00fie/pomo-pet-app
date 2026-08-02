import { GROWTH, STAGES } from '@/config';
import {
  addXp,
  createFish,
  getSpecies,
  isMaxStage,
  isReadyToMerge,
  nextStage,
  SPECIES,
  stageIndex,
  stageProgress,
  STARTER_SPECIES_ID,
  type Fish,
} from '../model';

describe('createFish', () => {
  it('hatches at the first stage, zero XP, healthy', () => {
    const fish = createFish(STARTER_SPECIES_ID, 1000, 'fish-1');
    expect(fish).toEqual<Fish>({
      id: 'fish-1',
      speciesId: STARTER_SPECIES_ID,
      stage: STAGES[0],
      xp: 0,
      bornAt: 1000,
      health: 'healthy',
    });
  });
});

describe('getSpecies', () => {
  it('resolves the starter species', () => {
    expect(getSpecies(STARTER_SPECIES_ID)).toBe(SPECIES[STARTER_SPECIES_ID]);
  });

  it('falls back to the starter species for an unknown id rather than throwing', () => {
    expect(getSpecies('does-not-exist')).toBe(SPECIES[STARTER_SPECIES_ID]);
  });

  it('defines visual params for every stage', () => {
    const species = getSpecies(STARTER_SPECIES_ID);
    for (const stage of STAGES) {
      expect(species.stageParams[stage]).toBeDefined();
      expect(species.stageParams[stage].bodyLength).toBeGreaterThan(0);
    }
  });
});

describe('stage helpers', () => {
  it('orders stages fry < juvenile < elder', () => {
    expect(stageIndex('fry')).toBe(0);
    expect(stageIndex('juvenile')).toBe(1);
    expect(stageIndex('elder')).toBe(2);
  });

  it('isMaxStage is only true at elder', () => {
    expect(isMaxStage('fry')).toBe(false);
    expect(isMaxStage('juvenile')).toBe(false);
    expect(isMaxStage('elder')).toBe(true);
  });

  it('nextStage walks fry->juvenile->elder->null', () => {
    expect(nextStage('fry')).toBe('juvenile');
    expect(nextStage('juvenile')).toBe('elder');
    expect(nextStage('elder')).toBeNull();
  });
});

describe('addXp', () => {
  const base = createFish(STARTER_SPECIES_ID, 0, 'f1');

  it('adds XP', () => {
    const grown = addXp(base, 10);
    expect(grown.xp).toBe(10);
  });

  it('does not mutate the input fish', () => {
    const grown = addXp(base, 10);
    expect(base.xp).toBe(0);
    expect(grown).not.toBe(base);
  });

  it('clamps at GROWTH.xpPerStage — growth never crosses a stage on its own', () => {
    const almostFull = { ...base, xp: GROWTH.xpPerStage - 5 };
    const grown = addXp(almostFull, 1000);
    expect(grown.xp).toBe(GROWTH.xpPerStage);
    expect(grown.stage).toBe(almostFull.stage);
  });

  it('is a no-op for zero or negative amounts, returning the same reference', () => {
    expect(addXp(base, 0)).toBe(base);
    expect(addXp(base, -5)).toBe(base);
  });

  it('returns the same reference when already at the cap (no-op update)', () => {
    const capped = { ...base, xp: GROWTH.xpPerStage };
    expect(addXp(capped, 10)).toBe(capped);
  });
});

describe('stageProgress / isReadyToMerge', () => {
  it('reports 0 for a fresh fish and 1 at the cap', () => {
    const fresh = createFish(STARTER_SPECIES_ID, 0, 'f1');
    expect(stageProgress(fresh)).toBe(0);
    expect(isReadyToMerge(fresh)).toBe(false);

    const capped = addXp(fresh, GROWTH.xpPerStage);
    expect(stageProgress(capped)).toBe(1);
    expect(isReadyToMerge(capped)).toBe(true);
  });

  it('is proportional between 0 and the cap', () => {
    const half = addXp(createFish(STARTER_SPECIES_ID, 0, 'f1'), GROWTH.xpPerStage / 2);
    expect(stageProgress(half)).toBeCloseTo(0.5);
  });
});
