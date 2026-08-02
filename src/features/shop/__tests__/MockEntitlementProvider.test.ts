import AsyncStorage from '@react-native-async-storage/async-storage';

import { APP, SHOP } from '@/config';
import { GOLDEN_KOI_SPECIES_ID, INDIGO_BETTA_SPECIES_ID, STARTER_SPECIES_ID } from '@/features/pet/model';
import { useAppStore } from '@/store';
import { SCHEMA_VERSION } from '@/store/migrations';
import { MockEntitlementProvider } from '../MockEntitlementProvider';

/** A controllable "wait" so tests can assert on the pending state of a purchase/restore instead
 *  of racing a real timer. Resolves only when the test calls `release()`. */
function deferredWait() {
  let release: () => void = () => {};
  const wait = jest.fn(() => new Promise<void>((resolve) => { release = resolve; }));
  return { wait, release: () => release() };
}

beforeEach(() => {
  useAppStore.getState().resetAll();
});

describe('MockEntitlementProvider — ownership reads (docs/PLAN.md M6a)', () => {
  it('owns exactly the starter species before any purchase', async () => {
    const provider = new MockEntitlementProvider();
    expect(await provider.getOwnedSpeciesIds()).toEqual([STARTER_SPECIES_ID]);
    expect(await provider.isOwned(STARTER_SPECIES_ID)).toBe(true);
    expect(await provider.isOwned(GOLDEN_KOI_SPECIES_ID)).toBe(false);
  });

  it('reads through the live store rather than a cached copy of its own', async () => {
    const provider = new MockEntitlementProvider();
    expect(await provider.isOwned(GOLDEN_KOI_SPECIES_ID)).toBe(false);

    useAppStore.getState().unlockSpecies(GOLDEN_KOI_SPECIES_ID);

    expect(await provider.isOwned(GOLDEN_KOI_SPECIES_ID)).toBe(true);
  });
});

describe('MockEntitlementProvider.purchaseSpecies — success (docs/PLAN.md M6a)', () => {
  it('resolves ok after the simulated delay, for a species not yet owned', async () => {
    const provider = new MockEntitlementProvider({ wait: jest.fn().mockResolvedValue(undefined), random: () => 1 });
    const result = await provider.purchaseSpecies(GOLDEN_KOI_SPECIES_ID);
    expect(result).toEqual({ ok: true });
  });

  it('does not itself write to the store — the call site applies a successful result via unlockSpecies', async () => {
    // This is the load-bearing design decision for the M6b swap: the provider only ever reports
    // what happened, it never reaches into `useAppStore` on success. If this provider secretly
    // unlocked the species itself, a real RevenueCat provider swapped in later would need the
    // call site reshaped to do it instead — exactly the kind of change the interface is meant to
    // avoid needing.
    const provider = new MockEntitlementProvider({ wait: jest.fn().mockResolvedValue(undefined), random: () => 1 });
    await provider.purchaseSpecies(GOLDEN_KOI_SPECIES_ID);
    expect(useAppStore.getState().entitlements.unlockedSpeciesIds).not.toContain(GOLDEN_KOI_SPECIES_ID);
  });

  it('is genuinely asynchronous — the returned promise stays pending until the delay resolves', async () => {
    const { wait, release } = deferredWait();
    const provider = new MockEntitlementProvider({ wait, random: () => 1 });

    let settled = false;
    const promise = provider.purchaseSpecies(GOLDEN_KOI_SPECIES_ID).then((r) => {
      settled = true;
      return r;
    });

    await Promise.resolve(); // let the microtask queue drain up to the `await this.wait(...)` point
    expect(settled).toBe(false); // still pending — the delay has not been released yet
    expect(wait).toHaveBeenCalledWith(SHOP.mockPurchaseDelayMs);

    release();
    const result = await promise;
    expect(settled).toBe(true);
    expect(result).toEqual({ ok: true });
  });

  it('rejects an attempt to buy a species already owned, without even waiting', async () => {
    const wait = jest.fn().mockResolvedValue(undefined);
    const provider = new MockEntitlementProvider({ wait, random: () => 1 });

    const result = await provider.purchaseSpecies(STARTER_SPECIES_ID); // always owned
    expect(result).toEqual({ ok: false, error: 'already-owned' });
    expect(wait).not.toHaveBeenCalled();
  });
});

describe('MockEntitlementProvider.purchaseSpecies — failure (docs/PLAN.md M6a)', () => {
  it('can fail after the delay, so the UI has a real failure path to handle', async () => {
    const provider = new MockEntitlementProvider({
      wait: jest.fn().mockResolvedValue(undefined),
      random: () => 0, // always below SHOP.mockPurchaseFailureRate (which is > 0)
    });

    const result = await provider.purchaseSpecies(GOLDEN_KOI_SPECIES_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('unknown');
  });

  it('never unlocks the species on a failed purchase', async () => {
    const provider = new MockEntitlementProvider({ wait: jest.fn().mockResolvedValue(undefined), random: () => 0 });
    await provider.purchaseSpecies(GOLDEN_KOI_SPECIES_ID);
    expect(useAppStore.getState().entitlements.unlockedSpeciesIds).not.toContain(GOLDEN_KOI_SPECIES_ID);
  });

  it('the failure roll is driven by SHOP.mockPurchaseFailureRate, not a hardcoded threshold', async () => {
    // A value exactly at the boundary should succeed — the check is `random() < rate`, strictly
    // less than, so landing exactly on the rate is not a failure.
    const provider = new MockEntitlementProvider({
      wait: jest.fn().mockResolvedValue(undefined),
      random: () => SHOP.mockPurchaseFailureRate,
    });
    const result = await provider.purchaseSpecies(GOLDEN_KOI_SPECIES_ID);
    expect(result.ok).toBe(true);
  });
});

describe('MockEntitlementProvider.restorePurchases (docs/PLAN.md M6a)', () => {
  it('resolves with the currently owned species after a real delay', async () => {
    useAppStore.getState().unlockSpecies(GOLDEN_KOI_SPECIES_ID);
    const wait = jest.fn().mockResolvedValue(undefined);
    const provider = new MockEntitlementProvider({ wait });

    const owned = await provider.restorePurchases();

    expect(owned.sort()).toEqual([STARTER_SPECIES_ID, GOLDEN_KOI_SPECIES_ID].sort());
    expect(wait).toHaveBeenCalledWith(SHOP.mockRestoreDelayMs);
  });

  it('is genuinely asynchronous too, not just wrapped in an already-resolved promise', async () => {
    const { wait, release } = deferredWait();
    const provider = new MockEntitlementProvider({ wait });

    let settled = false;
    const promise = provider.restorePurchases().then((r) => {
      settled = true;
      return r;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    release();
    await promise;
    expect(settled).toBe(true);
  });

  it('is closer to a refresh than a real restore for a provider with no separate ledger — it never invents ownership', async () => {
    const provider = new MockEntitlementProvider({ wait: jest.fn().mockResolvedValue(undefined) });
    const owned = await provider.restorePurchases();
    expect(owned).toEqual([STARTER_SPECIES_ID]); // nothing was ever purchased
  });
});

describe('persistence across a simulated restart (docs/PLAN.md M6a)', () => {
  it('a species purchased in a previous session is still owned after the store rehydrates from disk', async () => {
    // Simulate: a previous app session purchased Golden Koi and `persist` wrote that to disk.
    // Writing the raw AsyncStorage payload directly (rather than going through the live store)
    // is what makes this a restart simulation rather than just reading current memory — the live
    // store below never calls `unlockSpecies` at all.
    const current = useAppStore.getState();
    const onDisk = {
      state: {
        fish: current.fish,
        settings: current.settings,
        stats: current.stats,
        entitlements: {
          unlockedSpeciesIds: [STARTER_SPECIES_ID, GOLDEN_KOI_SPECIES_ID],
          unlockedTankIds: current.entitlements.unlockedTankIds,
        },
        onboardingCompletedAt: current.onboardingCompletedAt,
      },
      version: SCHEMA_VERSION,
    };
    await AsyncStorage.setItem(APP.storageKey, JSON.stringify(onDisk));

    // Simulate the app relaunching: a fresh boot's `persist` middleware reads this exact key
    // during hydration. `persist.rehydrate()` re-runs that same read-and-merge path on the
    // already-mounted store, without needing a full module reload to prove the point.
    await useAppStore.persist.rehydrate();

    const provider = new MockEntitlementProvider();
    expect(await provider.isOwned(GOLDEN_KOI_SPECIES_ID)).toBe(true);
    expect(await provider.getOwnedSpeciesIds()).toEqual(
      expect.arrayContaining([STARTER_SPECIES_ID, GOLDEN_KOI_SPECIES_ID]),
    );
  });

  it('restorePurchases surfaces a species that reappeared via rehydration, not just ones unlocked this session', async () => {
    const current = useAppStore.getState();
    const onDisk = {
      state: {
        fish: current.fish,
        settings: current.settings,
        stats: current.stats,
        entitlements: {
          unlockedSpeciesIds: [STARTER_SPECIES_ID, INDIGO_BETTA_SPECIES_ID],
          unlockedTankIds: current.entitlements.unlockedTankIds,
        },
        onboardingCompletedAt: current.onboardingCompletedAt,
      },
      version: SCHEMA_VERSION,
    };
    await AsyncStorage.setItem(APP.storageKey, JSON.stringify(onDisk));
    await useAppStore.persist.rehydrate();

    const provider = new MockEntitlementProvider({ wait: jest.fn().mockResolvedValue(undefined) });
    const owned = await provider.restorePurchases();
    expect(owned).toContain(INDIGO_BETTA_SPECIES_ID);
  });
});
