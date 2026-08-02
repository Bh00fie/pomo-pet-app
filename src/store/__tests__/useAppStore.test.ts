import { GROWTH } from '@/config';
import { STARTER_SPECIES_ID } from '@/features/pet/model';
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

  it('assigns distinct ids to fish spawned in separate sessions once a merge (M3) is out of scope here', () => {
    // Regression guard for the id generator: two spawns at different `now` values (the only way
    // a second starter fish could occur, e.g. after the first is later removed) must not collide.
    useAppStore.getState().awardSessionCompletion(25 * MINUTE, 1);
    const firstId = useAppStore.getState().fish[0].id;
    useAppStore.setState({ fish: [] });
    useAppStore.getState().awardSessionCompletion(25 * MINUTE, 2);
    const secondId = useAppStore.getState().fish[0].id;

    expect(firstId).not.toBe(secondId);
  });
});
