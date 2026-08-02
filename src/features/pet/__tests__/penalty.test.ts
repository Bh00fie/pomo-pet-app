import { GROWTH } from '@/config';
import { addXp, createFish, STARTER_SPECIES_ID, type Fish } from '../model';
import { applyPenalty } from '../penalty';

describe('applyPenalty', () => {
  it('is a no-op when the user has zero fish', () => {
    const result = applyPenalty({ fish: [] });
    expect(result.sickenedFishId).toBeNull();
    expect(result.fish).toEqual([]);
  });

  it('marks the first fish with room in its stage as sick — same selection as the reward rule', () => {
    const capped = addXp(createFish(STARTER_SPECIES_ID, 0, 'capped'), GROWTH.xpPerStage);
    const growing = createFish(STARTER_SPECIES_ID, 0, 'growing');

    const result = applyPenalty({ fish: [capped, growing] });

    expect(result.sickenedFishId).toBe('growing');
    const updatedCapped = result.fish.find((f) => f.id === 'capped')!;
    const updatedGrowing = result.fish.find((f) => f.id === 'growing')!;
    expect(updatedCapped.health).toBe('healthy'); // untouched — it was never the target
    expect(updatedGrowing.health).toBe('sick');
  });

  it('is a no-op when every fish is already capped — nothing this session would have grown', () => {
    const cappedA = addXp(createFish(STARTER_SPECIES_ID, 0, 'a'), GROWTH.xpPerStage);
    const cappedB = addXp(createFish(STARTER_SPECIES_ID, 0, 'b'), GROWTH.xpPerStage);

    const result = applyPenalty({ fish: [cappedA, cappedB] });

    expect(result.sickenedFishId).toBeNull();
    expect(result.fish[0].health).toBe('healthy');
    expect(result.fish[1].health).toBe('healthy');
  });

  it('is idempotent when the target is already sick, returning the same fish array reference', () => {
    const alreadySick: Fish = { ...createFish(STARTER_SPECIES_ID, 0, 'sick-fish'), health: 'sick' };
    const input = [alreadySick];

    const result = applyPenalty({ fish: input });

    expect(result.sickenedFishId).toBe('sick-fish');
    expect(result.fish).toBe(input); // no-op: same array reference, nothing re-created
  });

  it('does not mutate the input fish array or its members', () => {
    const growing = createFish(STARTER_SPECIES_ID, 0, 'growing');
    const input = [growing];

    applyPenalty({ fish: input });

    expect(input[0].health).toBe('healthy');
    expect(growing.health).toBe('healthy');
  });
});
