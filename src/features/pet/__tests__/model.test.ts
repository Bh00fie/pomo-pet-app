import { SHOP, STAGES } from '@/config';
import {
  createFish,
  createFishAtStage,
  getSpecies,
  GOLDEN_KOI_SPECIES_ID,
  INDIGO_BETTA_SPECIES_ID,
  SHARK_SPECIES_ID,
  CLOWNFISH_SPECIES_ID,
  isMaxStage,
  nextStage,
  SPECIES,
  SPECIES_ORDER,
  stageIndex,
  STARTER_SPECIES_ID,
  type Fish,
} from '../model';

describe('createFish', () => {
  it('hatches at the first stage, healthy', () => {
    const fish = createFish(STARTER_SPECIES_ID, 1000, 'fish-1');
    expect(fish).toEqual<Fish>({
      id: 'fish-1',
      speciesId: STARTER_SPECIES_ID,
      stage: STAGES[0],
      bornAt: 1000,
      health: 'healthy',
    });
  });
});

describe('createFishAtStage', () => {
  it('hatches at the given stage, healthy — the primitive every hatch path goes through', () => {
    const fish = createFishAtStage(STARTER_SPECIES_ID, 'juvenile', 1000, 'fish-1');
    expect(fish).toEqual<Fish>({
      id: 'fish-1',
      speciesId: STARTER_SPECIES_ID,
      stage: 'juvenile',
      bornAt: 1000,
      health: 'healthy',
    });
  });

  it('createFish is exactly createFishAtStage pinned to the first stage', () => {
    expect(createFish(STARTER_SPECIES_ID, 5, 'x')).toEqual(
      createFishAtStage(STARTER_SPECIES_ID, STAGES[0], 5, 'x'),
    );
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

describe('SPECIES catalog (docs/PLAN.md M6a — shop sells species)', () => {
  it('has five species: the starter plus four shop species', () => {
    expect(Object.keys(SPECIES).sort()).toEqual(
      [
        STARTER_SPECIES_ID,
        GOLDEN_KOI_SPECIES_ID,
        INDIGO_BETTA_SPECIES_ID,
        SHARK_SPECIES_ID,
        CLOWNFISH_SPECIES_ID,
      ].sort(),
    );
  });

  it('SPECIES_ORDER lists every species in SPECIES, starter first, with no extras', () => {
    expect(SPECIES_ORDER[0]).toBe(STARTER_SPECIES_ID);
    expect(SPECIES_ORDER.slice().sort()).toEqual(Object.keys(SPECIES).sort());
  });

  it('every species defines visual params for every stage, with a positive body size', () => {
    for (const id of SPECIES_ORDER) {
      const species = getSpecies(id);
      for (const stage of STAGES) {
        const params = species.stageParams[stage];
        expect(params).toBeDefined();
        expect(params.bodyLength).toBeGreaterThan(0);
        expect(params.bodyHeight).toBeGreaterThan(0);
        expect(params.tailSpan).toBeGreaterThan(0);
        expect(params.dorsalFinScale).toBeGreaterThan(0);
        expect(params.pectoralFinScale).toBeGreaterThan(0);
      }
    }
  });

  it('every non-starter species has a shop price, and the starter has none', () => {
    for (const id of SPECIES_ORDER) {
      if (id === STARTER_SPECIES_ID) {
        expect(SHOP.speciesPriceUsd[id]).toBeUndefined();
      } else {
        expect(SHOP.speciesPriceUsd[id]).toBeGreaterThan(0);
      }
    }
  });

  it('every species has a distinct hue, so the shop and tank never show two look-alikes', () => {
    const hues = SPECIES_ORDER.map((id) => getSpecies(id).hue);
    expect(new Set(hues).size).toBe(hues.length);
  });

  it('Golden Koi reads as warm gold/orange, distinct from the starter’s coral hue', () => {
    const koi = getSpecies(GOLDEN_KOI_SPECIES_ID);
    expect(koi.name).toBe('Golden Koi');
    expect(koi.hue).toBeGreaterThanOrEqual(25);
    expect(koi.hue).toBeLessThanOrEqual(55);
  });

  it('Indigo Betta reads as a cold indigo/blue hue, and has larger fins than either other species', () => {
    const betta = getSpecies(INDIGO_BETTA_SPECIES_ID);
    expect(betta.name).toBe('Indigo Betta');
    expect(betta.hue).toBeGreaterThanOrEqual(200);
    expect(betta.hue).toBeLessThanOrEqual(280);

    for (const stage of STAGES) {
      expect(betta.stageParams[stage].dorsalFinScale).toBeGreaterThan(
        getSpecies(STARTER_SPECIES_ID).stageParams[stage].dorsalFinScale,
      );
      expect(betta.stageParams[stage].dorsalFinScale).toBeGreaterThan(
        getSpecies(GOLDEN_KOI_SPECIES_ID).stageParams[stage].dorsalFinScale,
      );
      expect(betta.stageParams[stage].pectoralFinScale).toBeGreaterThan(
        getSpecies(STARTER_SPECIES_ID).stageParams[stage].pectoralFinScale,
      );
      expect(betta.stageParams[stage].pectoralFinScale).toBeGreaterThan(
        getSpecies(GOLDEN_KOI_SPECIES_ID).stageParams[stage].pectoralFinScale,
      );
    }
  });

  it('the three original species have dorsalFinScale === pectoralFinScale at every stage — the '
    + 'fin-scale split must not change their behavior', () => {
    for (const id of [STARTER_SPECIES_ID, GOLDEN_KOI_SPECIES_ID, INDIGO_BETTA_SPECIES_ID]) {
      const species = getSpecies(id);
      for (const stage of STAGES) {
        const params = species.stageParams[stage];
        expect(params.dorsalFinScale).toBe(params.pectoralFinScale);
        expect(params.tailShape).toBeUndefined();
        expect(params.pattern).toBeUndefined();
      }
    }
  });

  it('Reef Shark reads as a cool, low-saturation grey/blue-grey, with an elongated body, a '
    + 'proportionally larger dorsal fin than pectoral fins, and a crescent tail', () => {
    const shark = getSpecies(SHARK_SPECIES_ID);
    expect(shark.name).toBe('Reef Shark');
    expect(shark.saturation).toBeLessThanOrEqual(25);
    expect(shark.hue).toBeGreaterThanOrEqual(180);
    expect(shark.hue).toBeLessThanOrEqual(240);

    for (const stage of STAGES) {
      const params = shark.stageParams[stage];
      expect(params.tailShape).toBe('crescent');
      expect(params.dorsalFinScale).toBeGreaterThan(params.pectoralFinScale);
      // Elongated torpedo body: length-to-height ratio well past every other species' ~1.5-1.8.
      expect(params.bodyLength / params.bodyHeight).toBeGreaterThan(2.2);
    }
  });

  it('Clownfish is a vivid orange with a white stripe pattern at every stage', () => {
    const clownfish = getSpecies(CLOWNFISH_SPECIES_ID);
    expect(clownfish.name).toBe('Clownfish');
    expect(clownfish.saturation).toBeGreaterThan(70);

    for (const stage of STAGES) {
      expect(clownfish.stageParams[stage].pattern).toBe('stripes');
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

