import { GROWTH } from '@/config';
import { createFish, STARTER_SPECIES_ID, type Fish } from '@/features/pet/model';
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

  it('assigns distinct ids to fish spawned in separate sessions', () => {
    // Regression guard for the id generator: two spawns at different `now` values must not
    // collide, whether that second spawn came from a reset collection or (M3) from the first
    // fish having capped out.
    useAppStore.getState().awardSessionCompletion(25 * MINUTE, 1);
    const firstId = useAppStore.getState().fish[0].id;
    useAppStore.setState({ fish: [] });
    useAppStore.getState().awardSessionCompletion(25 * MINUTE, 2);
    const secondId = useAppStore.getState().fish[0].id;

    expect(firstId).not.toBe(secondId);
  });

  it('spawns a second fish once the first is capped, rather than losing further sessions (M3)', () => {
    // A single huge session clamps at the stage cap regardless of `GROWTH.xpPerFocusMinute`.
    useAppStore.getState().awardSessionCompletion(10_000 * MINUTE, 1_700_000_000_000);
    expect(useAppStore.getState().fish).toHaveLength(1);
    expect(useAppStore.getState().fish[0].xp).toBe(GROWTH.xpPerStage);

    useAppStore.getState().awardSessionCompletion(25 * MINUTE, 1_700_000_100_000);

    const { fish } = useAppStore.getState();
    expect(fish).toHaveLength(2);
    const capped = fish.find((f) => f.xp === GROWTH.xpPerStage)!;
    const fresh = fish.find((f) => f.xp < GROWTH.xpPerStage)!;
    expect(capped).toBeTruthy();
    expect(fresh).toBeTruthy();
    expect(fresh.xp).toBe(25 * GROWTH.xpPerFocusMinute);
  });
});

describe('mergeFish', () => {
  function seedFry(id: string): Fish {
    return createFish(STARTER_SPECIES_ID, 0, id);
  }

  it('merges three same-stage fish into one of the next stage, atomically', () => {
    useAppStore.setState({ fish: [seedFry('a'), seedFry('b'), seedFry('c')] });

    const result = useAppStore.getState().mergeFish(['a', 'b', 'c'], 1_700_000_000_000);

    expect(result.ok).toBe(true);
    const { fish } = useAppStore.getState();
    expect(fish).toHaveLength(1);
    expect(fish[0].stage).toBe('juvenile');
    expect(fish[0].xp).toBe(0);
  });

  it('leaves the collection completely untouched on a rejected merge', () => {
    const seed = [seedFry('a'), seedFry('b')];
    useAppStore.setState({ fish: seed });

    const result = useAppStore.getState().mergeFish(['a', 'b'], 1_700_000_000_000);

    expect(result.ok).toBe(false);
    expect(useAppStore.getState().fish).toEqual(seed);
  });

  it('rejects merging three Elder fish and leaves them in place', () => {
    const elders = [
      { ...seedFry('a'), stage: 'elder' as const },
      { ...seedFry('b'), stage: 'elder' as const },
      { ...seedFry('c'), stage: 'elder' as const },
    ];
    useAppStore.setState({ fish: elders });

    const result = useAppStore.getState().mergeFish(['a', 'b', 'c'], 1_700_000_000_000);

    expect(result).toMatchObject({ ok: false, reason: 'top-stage' });
    expect(useAppStore.getState().fish).toHaveLength(3);
  });

  it('rejects a mixed-stage selection', () => {
    useAppStore.setState({
      fish: [seedFry('a'), seedFry('b'), { ...seedFry('c'), stage: 'juvenile' }],
    });

    const result = useAppStore.getState().mergeFish(['a', 'b', 'c'], 1_700_000_000_000);

    expect(result).toMatchObject({ ok: false, reason: 'mixed-stages' });
    expect(useAppStore.getState().fish).toHaveLength(3);
  });
});
