import { GOLDEN_KOI_SPECIES_ID, STARTER_SPECIES_ID, type Fish } from '@/features/pet/model';
import { hatchHeadline } from '../sessionComplete';

describe('hatchHeadline', () => {
  it('names the species and stage of the fish itself', () => {
    const fish: Fish = { id: 'f1', speciesId: STARTER_SPECIES_ID, stage: 'fry', bornAt: 1, health: 'healthy' };
    expect(hatchHeadline(fish)).toBe('A Coral Tetra Fry hatched.');
  });

  it('reads the species off the fish, not off any other source — the whole point post-M6a', () => {
    const fish: Fish = {
      id: 'f2',
      speciesId: GOLDEN_KOI_SPECIES_ID,
      stage: 'juvenile',
      bornAt: 2,
      health: 'healthy',
    };
    expect(hatchHeadline(fish)).toBe('A Golden Koi Juvenile hatched.');
  });

  it('names Elder correctly, the one stage not covered by the other two cases', () => {
    const fish: Fish = { id: 'f3', speciesId: STARTER_SPECIES_ID, stage: 'elder', bornAt: 3, health: 'healthy' };
    expect(hatchHeadline(fish)).toBe('A Coral Tetra Elder hatched.');
  });
});
