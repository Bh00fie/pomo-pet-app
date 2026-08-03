import { createFish, STARTER_SPECIES_ID, type Fish } from '../model';
import { applyPenalty } from '../penalty';

describe('applyPenalty', () => {
  it('is a no-op when the user has zero fish', () => {
    const result = applyPenalty({ fish: [] });
    expect(result.sickenedFishId).toBeNull();
    expect(result.fish).toEqual([]);
  });

  it('marks the most recently hatched fish as sick — the closest surviving analogue to '
    + '"the fish this session would have produced" now that sessions only ever hatch, never grow', () => {
    const older = createFish(STARTER_SPECIES_ID, 1000, 'older');
    const newer = createFish(STARTER_SPECIES_ID, 2000, 'newer');

    const result = applyPenalty({ fish: [older, newer] });

    expect(result.sickenedFishId).toBe('newer');
    const updatedOlder = result.fish.find((f) => f.id === 'older')!;
    const updatedNewer = result.fish.find((f) => f.id === 'newer')!;
    expect(updatedOlder.health).toBe('healthy'); // untouched — it was never the target
    expect(updatedNewer.health).toBe('sick');
  });

  it('falls through to the next-most-recent healthy fish when the newest is already sick — two '
    + 'abandons in a row must cost two fish, not one, whenever a second healthy fish exists', () => {
    const oldest: Fish = { ...createFish(STARTER_SPECIES_ID, 1000, 'oldest'), health: 'healthy' };
    const alreadySick: Fish = { ...createFish(STARTER_SPECIES_ID, 2000, 'newest'), health: 'sick' };

    const result = applyPenalty({ fish: [oldest, alreadySick] });

    expect(result.sickenedFishId).toBe('oldest');
    expect(result.fish.find((f) => f.id === 'oldest')!.health).toBe('sick');
    expect(result.fish.find((f) => f.id === 'newest')!.health).toBe('sick'); // untouched, already sick
  });

  it('picks the most recent regardless of array order', () => {
    const newer = createFish(STARTER_SPECIES_ID, 2000, 'newer');
    const older = createFish(STARTER_SPECIES_ID, 1000, 'older');

    const result = applyPenalty({ fish: [newer, older] }); // newest listed first this time

    expect(result.sickenedFishId).toBe('newer');
  });

  it('breaks a bornAt tie toward the later array entry — fish are only ever appended, so that is '
    + 'the more recently hatched one', () => {
    // Reachable: two debug hatches, or a hatch and a merge, landing in the same millisecond.
    const first = createFish(STARTER_SPECIES_ID, 5000, 'first');
    const second = createFish(STARTER_SPECIES_ID, 5000, 'second');

    expect(applyPenalty({ fish: [first, second] }).sickenedFishId).toBe('second');
  });

  it('is a no-op, returning the same fish array reference, when every fish is already sick', () => {
    const alreadySick: Fish = { ...createFish(STARTER_SPECIES_ID, 0, 'sick-fish'), health: 'sick' };
    const input = [alreadySick];

    const result = applyPenalty({ fish: input });

    expect(result.sickenedFishId).toBeNull();
    expect(result.fish).toBe(input); // no-op: same array reference, nothing re-created
  });

  it('does not mutate the input fish array or its members', () => {
    const fish = createFish(STARTER_SPECIES_ID, 0, 'growing');
    const input = [fish];

    applyPenalty({ fish: input });

    expect(input[0].health).toBe('healthy');
    expect(fish.health).toBe('healthy');
  });
});
