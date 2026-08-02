import { REWARDS } from '@/config';
import { GOLDEN_KOI_SPECIES_ID, INDIGO_BETTA_SPECIES_ID, STARTER_SPECIES_ID, type Fish } from '../model';
import { applyPenalty } from '../penalty';
import {
  applySessionReward,
  classifySessionLength,
  cureOneSickFish,
  hatchFish,
  pickRandomSpeciesId,
  stageForSessionLength,
} from '../reward';

function fishAt(id: string, bornAt: number, health: 'healthy' | 'sick'): Fish {
  return { id, speciesId: STARTER_SPECIES_ID, stage: 'fry', bornAt, health };
}

const MS_PER_MINUTE = 60_000;

describe('classifySessionLength', () => {
  it('classifies below the threshold as short', () => {
    expect(classifySessionLength(REWARDS.longSessionThresholdMinutes - 1)).toBe('short');
    expect(classifySessionLength(0)).toBe('short');
  });

  it('classifies exactly at the threshold as long — "at or above" per spec, the boundary is long', () => {
    expect(classifySessionLength(REWARDS.longSessionThresholdMinutes)).toBe('long');
  });

  it('classifies above the threshold as long', () => {
    expect(classifySessionLength(REWARDS.longSessionThresholdMinutes + 1)).toBe('long');
    expect(classifySessionLength(9999)).toBe('long');
  });
});

describe('stageForSessionLength', () => {
  it('short sessions hatch a Fry, long sessions hatch a Juvenile', () => {
    expect(stageForSessionLength('short')).toBe('fry');
    expect(stageForSessionLength('long')).toBe('juvenile');
  });
});

describe('pickRandomSpeciesId', () => {
  it('throws on an empty pool rather than silently returning undefined', () => {
    expect(() => pickRandomSpeciesId([])).toThrow();
  });

  it('returns the only option from a single-species pool', () => {
    expect(pickRandomSpeciesId([STARTER_SPECIES_ID])).toBe(STARTER_SPECIES_ID);
  });

  it('uses the injected random source to select a specific index deterministically', () => {
    const pool = [STARTER_SPECIES_ID, GOLDEN_KOI_SPECIES_ID, INDIGO_BETTA_SPECIES_ID];
    expect(pickRandomSpeciesId(pool, () => 0)).toBe(STARTER_SPECIES_ID);
    expect(pickRandomSpeciesId(pool, () => 0.4)).toBe(GOLDEN_KOI_SPECIES_ID);
    // 0.999... must still land on the last index, never run past the end of the pool.
    expect(pickRandomSpeciesId(pool, () => 0.999999)).toBe(INDIGO_BETTA_SPECIES_ID);
  });

  it('never returns an id outside the pool across many real-random draws', () => {
    const pool = [STARTER_SPECIES_ID, GOLDEN_KOI_SPECIES_ID, INDIGO_BETTA_SPECIES_ID];
    for (let i = 0; i < 300; i += 1) {
      expect(pool).toContain(pickRandomSpeciesId(pool));
    }
  });

  it('actually varies across many calls rather than always returning the same species', () => {
    const pool = [STARTER_SPECIES_ID, GOLDEN_KOI_SPECIES_ID, INDIGO_BETTA_SPECIES_ID];
    const seen = new Set(Array.from({ length: 300 }, () => pickRandomSpeciesId(pool)));
    // With 300 draws across 3 species, the odds of a genuinely random source landing on only one
    // are astronomically small (1/3)^299 — this fails fast against a hardcoded/broken draw.
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('hatchFish', () => {
  it('creates one fish at the given stage/species and appends it, never mutating the input', () => {
    const idFactory = () => 'new-fish';
    const input: Fish[] = [];

    const result = hatchFish(input, 'juvenile', GOLDEN_KOI_SPECIES_ID, 1000, idFactory);

    expect(input).toEqual([]); // untouched
    expect(result.fish).toHaveLength(1);
    expect(result.hatched).toEqual({
      id: 'new-fish',
      speciesId: GOLDEN_KOI_SPECIES_ID,
      stage: 'juvenile',
      bornAt: 1000,
      health: 'healthy',
    });
    expect(result.fish[0]).toBe(result.hatched);
  });

  it('appends onto an existing non-empty collection without touching the existing fish', () => {
    const existing: Fish = {
      id: 'existing',
      speciesId: STARTER_SPECIES_ID,
      stage: 'elder',
      bornAt: 0,
      health: 'healthy',
    };

    const result = hatchFish([existing], 'fry', STARTER_SPECIES_ID, 500, () => 'fresh');

    expect(result.fish).toHaveLength(2);
    expect(result.fish[0]).toBe(existing);
    expect(result.fish[1].id).toBe('fresh');
  });
});

describe('cureOneSickFish (docs/MVP.md feature 5 — "recovers on the next completed session")', () => {
  it('is a no-op on an empty collection, returning the same array reference', () => {
    const input: Fish[] = [];
    const result = cureOneSickFish(input);
    expect(result.curedFishId).toBeNull();
    expect(result.fish).toBe(input);
  });

  it('is a no-op when nothing is sick, returning the same array reference', () => {
    const input = [fishAt('a', 1000, 'healthy'), fishAt('b', 2000, 'healthy')];
    const result = cureOneSickFish(input);
    expect(result.curedFishId).toBeNull();
    expect(result.fish).toBe(input);
  });

  it('heals the sick fish', () => {
    const result = cureOneSickFish([fishAt('a', 1000, 'sick')]);
    expect(result.curedFishId).toBe('a');
    expect(result.fish[0].health).toBe('healthy');
  });

  it('heals exactly one fish per call — the most recently hatched sick one, mirroring applyPenalty', () => {
    const result = cureOneSickFish([
      fishAt('oldest-sick', 1000, 'sick'),
      fishAt('newest-sick', 3000, 'sick'),
      fishAt('newest-healthy', 4000, 'healthy'),
    ]);

    expect(result.curedFishId).toBe('newest-sick');
    expect(result.fish.find((f) => f.id === 'newest-sick')!.health).toBe('healthy');
    // The older sick fish stays sick: one abandon sickens one fish, one session cures one fish.
    expect(result.fish.find((f) => f.id === 'oldest-sick')!.health).toBe('sick');
  });

  it('ignores a healthier-but-newer fish rather than skipping the cure entirely', () => {
    // Guards the "look at the newest fish, cure it if sick" mis-implementation, which would
    // leave the sick fish sick forever whenever a healthy fish is newer.
    const result = cureOneSickFish([fishAt('sick', 1000, 'sick'), fishAt('healthy', 9000, 'healthy')]);
    expect(result.curedFishId).toBe('sick');
  });

  it('breaks a bornAt tie toward the later array entry, same rule as applyPenalty', () => {
    const result = cureOneSickFish([fishAt('first', 5000, 'sick'), fishAt('second', 5000, 'sick')]);
    expect(result.curedFishId).toBe('second');
  });

  it('does not mutate its input', () => {
    const input = [fishAt('a', 1000, 'sick')];
    cureOneSickFish(input);
    expect(input[0].health).toBe('sick');
  });
});

describe('applySessionReward — sick-fish recovery (docs/MVP.md feature 5)', () => {
  const idFactory = () => 'new-fish';

  it('cures a sick fish as well as hatching, so the penalty loop is not one-way', () => {
    const result = applySessionReward({
      fish: [fishAt('sickened', 1000, 'sick')],
      focusMs: 25 * MS_PER_MINUTE,
      now: 5000,
      idFactory,
      activeSpeciesId: STARTER_SPECIES_ID,
      ownedSpeciesIds: [STARTER_SPECIES_ID],
    });

    expect(result.curedFishId).toBe('sickened');
    expect(result.fish).toHaveLength(2);
    expect(result.fish.find((f) => f.id === 'sickened')!.health).toBe('healthy');
  });

  it('cures on a long session too, not just a short one', () => {
    const result = applySessionReward({
      fish: [fishAt('sickened', 1000, 'sick')],
      focusMs: REWARDS.longSessionThresholdMinutes * MS_PER_MINUTE,
      now: 5000,
      idFactory,
      activeSpeciesId: STARTER_SPECIES_ID,
      ownedSpeciesIds: [STARTER_SPECIES_ID],
    });

    expect(result.length).toBe('long');
    expect(result.curedFishId).toBe('sickened');
    expect(result.fish.find((f) => f.id === 'sickened')!.health).toBe('healthy');
  });

  it('reports a null curedFishId when nothing was sick', () => {
    const result = applySessionReward({
      fish: [fishAt('fine', 1000, 'healthy')],
      focusMs: 25 * MS_PER_MINUTE,
      now: 5000,
      idFactory,
      activeSpeciesId: STARTER_SPECIES_ID,
      ownedSpeciesIds: [STARTER_SPECIES_ID],
    });
    expect(result.curedFishId).toBeNull();
  });

  it('never cures the fish it just hatched — that one was already healthy', () => {
    const result = applySessionReward({
      fish: [],
      focusMs: 25 * MS_PER_MINUTE,
      now: 5000,
      idFactory,
      activeSpeciesId: STARTER_SPECIES_ID,
      ownedSpeciesIds: [STARTER_SPECIES_ID],
    });
    expect(result.curedFishId).toBeNull();
    expect(result.hatchedFishId).toBe('new-fish');
  });

  it('a penalty followed by a completed session leaves the collection fully healthy again', () => {
    // The round trip docs/MVP.md's on-device checklist step 4 asks the user to watch for.
    const sickened = applyPenalty({ fish: [fishAt('a', 1000, 'healthy')] });
    expect(sickened.fish[0].health).toBe('sick');

    const recovered = applySessionReward({
      fish: sickened.fish,
      focusMs: 25 * MS_PER_MINUTE,
      now: 2000,
      idFactory,
      activeSpeciesId: STARTER_SPECIES_ID,
      ownedSpeciesIds: [STARTER_SPECIES_ID],
    });

    expect(recovered.fish.every((f) => f.health === 'healthy')).toBe(true);
  });
});

describe('applySessionReward — short session (below the threshold)', () => {
  const idFactory = () => 'new-fish';

  it('hatches exactly one Fry of the active species, appended to the collection', () => {
    const result = applySessionReward({
      fish: [],
      focusMs: 25 * MS_PER_MINUTE, // well under the 50-minute threshold
      now: 1000,
      idFactory,
      activeSpeciesId: GOLDEN_KOI_SPECIES_ID,
      ownedSpeciesIds: [STARTER_SPECIES_ID, GOLDEN_KOI_SPECIES_ID],
    });

    expect(result.length).toBe('short');
    expect(result.speciesId).toBe(GOLDEN_KOI_SPECIES_ID);
    expect(result.hatchedFishId).toBe('new-fish');
    expect(result.fish).toEqual([
      { id: 'new-fish', speciesId: GOLDEN_KOI_SPECIES_ID, stage: 'fry', bornAt: 1000, health: 'healthy' },
    ]);
  });

  it('never grows an existing fish — it always appends a new one, even with fish already present', () => {
    const existing: Fish = {
      id: 'existing',
      speciesId: STARTER_SPECIES_ID,
      stage: 'fry',
      bornAt: 0,
      health: 'healthy',
    };

    const result = applySessionReward({
      fish: [existing],
      focusMs: 10 * MS_PER_MINUTE,
      now: 2000,
      idFactory,
      activeSpeciesId: STARTER_SPECIES_ID,
      ownedSpeciesIds: [STARTER_SPECIES_ID],
    });

    expect(result.fish).toHaveLength(2);
    expect(result.fish[0]).toBe(existing); // untouched by reference
    expect(result.fish[1].stage).toBe('fry');
  });

  it('does not mutate the input fish array', () => {
    const input: Fish[] = [];
    applySessionReward({
      fish: input,
      focusMs: 10 * MS_PER_MINUTE,
      now: 0,
      idFactory,
      activeSpeciesId: STARTER_SPECIES_ID,
      ownedSpeciesIds: [STARTER_SPECIES_ID],
    });
    expect(input).toEqual([]);
  });

  it('defaults to the starter species when activeSpeciesId is omitted', () => {
    const result = applySessionReward({ fish: [], focusMs: 10 * MS_PER_MINUTE, now: 0, idFactory });
    expect(result.speciesId).toBe(STARTER_SPECIES_ID);
  });

  it('a session exactly one minute under the threshold is still short', () => {
    const result = applySessionReward({
      fish: [],
      focusMs: (REWARDS.longSessionThresholdMinutes - 1) * MS_PER_MINUTE,
      now: 0,
      idFactory,
      activeSpeciesId: STARTER_SPECIES_ID,
      ownedSpeciesIds: [STARTER_SPECIES_ID],
    });
    expect(result.length).toBe('short');
    expect(result.fish[0].stage).toBe('fry');
  });
});

describe('applySessionReward — long session (at/above the threshold)', () => {
  const idFactory = () => 'new-fish';
  const pool = [STARTER_SPECIES_ID, GOLDEN_KOI_SPECIES_ID, INDIGO_BETTA_SPECIES_ID];

  it('hatches exactly one Juvenile, at exactly the threshold', () => {
    const result = applySessionReward({
      fish: [],
      focusMs: REWARDS.longSessionThresholdMinutes * MS_PER_MINUTE,
      now: 1000,
      idFactory,
      activeSpeciesId: STARTER_SPECIES_ID,
      ownedSpeciesIds: pool,
    });

    expect(result.length).toBe('long');
    expect(result.fish).toHaveLength(1);
    expect(result.fish[0].stage).toBe('juvenile');
  });

  it('draws the species from the owned pool, not necessarily the active species', () => {
    const result = applySessionReward({
      fish: [],
      focusMs: 90 * MS_PER_MINUTE,
      now: 0,
      idFactory,
      activeSpeciesId: STARTER_SPECIES_ID, // active species is the starter...
      ownedSpeciesIds: pool,
      random: () => 0.4, // ...but the draw picks the middle of the pool instead
    });

    expect(result.speciesId).toBe(GOLDEN_KOI_SPECIES_ID);
    expect(result.fish[0].speciesId).toBe(GOLDEN_KOI_SPECIES_ID);
  });

  it('never picks a species outside ownedSpeciesIds, across many real-random calls', () => {
    for (let i = 0; i < 200; i += 1) {
      const result = applySessionReward({
        fish: [],
        focusMs: 60 * MS_PER_MINUTE,
        now: 0,
        idFactory,
        activeSpeciesId: STARTER_SPECIES_ID,
        ownedSpeciesIds: pool,
      });
      expect(pool).toContain(result.speciesId);
    }
  });

  it('is actually randomized across many calls — not always the same species', () => {
    const seen = new Set(
      Array.from({ length: 200 }, () =>
        applySessionReward({
          fish: [],
          focusMs: 60 * MS_PER_MINUTE,
          now: 0,
          idFactory,
          activeSpeciesId: STARTER_SPECIES_ID,
          ownedSpeciesIds: pool,
        }).speciesId,
      ),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it('draws from the full owned pool even when only one species is currently active', () => {
    // Owning more species should matter for long sessions specifically, independent of which one
    // is "active" — this pins that the pool passed in, not activeSpeciesId, drives the draw.
    const result = applySessionReward({
      fish: [],
      focusMs: 60 * MS_PER_MINUTE,
      now: 0,
      idFactory,
      activeSpeciesId: STARTER_SPECIES_ID,
      ownedSpeciesIds: [INDIGO_BETTA_SPECIES_ID], // only species owned, and it's not active
      random: () => 0,
    });
    expect(result.speciesId).toBe(INDIGO_BETTA_SPECIES_ID);
  });

  it('does not mutate the input fish array', () => {
    const input: Fish[] = [];
    applySessionReward({
      fish: input,
      focusMs: 60 * MS_PER_MINUTE,
      now: 0,
      idFactory,
      activeSpeciesId: STARTER_SPECIES_ID,
      ownedSpeciesIds: pool,
    });
    expect(input).toEqual([]);
  });
});
