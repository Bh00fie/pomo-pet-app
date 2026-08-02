/**
 * The Shop screen's **write split** (docs/PLAN.md M6a), which is the seam M6b swaps for real
 * RevenueCat calls.
 *
 * `MockEntitlementProvider.purchaseSpecies` deliberately never writes to `useAppStore`; it only
 * reports what happened, and this screen is what applies a success via `unlockSpecies`. That is
 * the right division of responsibility for a real provider — but it means there is a window in
 * which the provider considers a purchase made and the local store does not yet know. Against the
 * mock that window is unobservable, because the mock reads its ownership *out of the same store*
 * — the two literally cannot disagree. Against RevenueCat they are different machines, and a
 * skipped write is a user who paid and got nothing.
 *
 * So these tests pin the call site's half of the contract directly, since the provider half can
 * never expose it while the mock is store-backed: the write happens on success, happens exactly
 * once per tap, survives the screen unmounting mid-purchase, and never happens on any failure.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

/**
 * Skia ships ESM that `jest-expo`'s `transformIgnorePatterns` does not transform, and its own
 * `jestSetup.js` wants a real CanvasKit wasm build loaded into `global`. Neither is worth pulling
 * in here: everything this screen draws with Skia — the per-species `SpeciesSwatch` preview and
 * the unlock `ParticleBurst` — is decoration over the purchase logic under test, and not one
 * assertion below reads a pixel. Stubbed to inert host components so the tree still mounts.
 */
jest.mock('@shopify/react-native-skia', () => {
  const inert = () => null;
  const path = {
    moveTo: inert,
    lineTo: inert,
    quadTo: inert,
    addCircle: inert,
    addOval: inert,
    close: inert,
    reset: inert,
  };
  return {
    __esModule: true,
    Canvas: ({ children }: { children?: React.ReactNode }) => children ?? null,
    Group: ({ children }: { children?: React.ReactNode }) => children ?? null,
    Circle: inert,
    Oval: inert,
    Path: inert,
    Rect: inert,
    Skia: { Path: { Make: () => path } },
  };
});

import { SHOP } from '@/config';
import { GOLDEN_KOI_SPECIES_ID, INDIGO_BETTA_SPECIES_ID, STARTER_SPECIES_ID } from '@/features/pet/model';
import { useAppStore } from '@/store';
import type { PurchaseFailureReason, PurchaseResult } from '../EntitlementProvider';
import { mockEntitlementProvider } from '../MockEntitlementProvider';
import { ShopScreen } from '../ShopScreen';

const KOI_PRICE = `Buy $${SHOP.speciesPriceUsd[GOLDEN_KOI_SPECIES_ID].toFixed(2)}`;

/** A purchase whose resolution the test controls, so the pending window — the whole point of the
 *  write split — is a real, inspectable state rather than something to race. */
function deferredPurchase() {
  let settle: (value: PurchaseResult) => void = () => {};
  let fail: (reason: unknown) => void = () => {};
  const spy = jest.spyOn(mockEntitlementProvider, 'purchaseSpecies').mockImplementation(
    () =>
      new Promise<PurchaseResult>((resolve, reject) => {
        settle = resolve;
        fail = reject;
      }),
  );
  return {
    spy,
    resolveOk: async () => {
      await act(async () => settle({ ok: true }));
    },
    resolveFailed: async (error: PurchaseFailureReason) => {
      await act(async () => settle({ ok: false, error }));
    },
    reject: async () => {
      await act(async () => fail(new Error('provider blew up')));
    },
  };
}

const unlocked = () => useAppStore.getState().entitlements.unlockedSpeciesIds;

/**
 * The Shop's press handlers are `async`, so `fireEvent.press` hands back the promise they return
 * and awaiting `fireEvent.press(...)` directly would block until the *whole* purchase settles —
 * precisely the thing these tests need to observe mid-flight. Press inside `act` and discard the
 * returned promise instead, so only React's own work is flushed.
 */
async function press(element: Parameters<typeof fireEvent.press>[0]) {
  // React logs "overlapping act() calls" here — `fireEvent` opens its own act inside this one.
  // Cosmetic and unavoidable at this RNTL version; pressing *outside* an act instead loses the
  // flush and leaks state between tests, which is much worse than a console line.
  await act(async () => {
    fireEvent.press(element);
  });
}

beforeEach(() => {
  useAppStore.getState().resetAll();
  useAppStore.setState({ hydrated: true });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ShopScreen — the purchase write split (docs/PLAN.md M6a)', () => {
  it('applies a successful purchase to the store, which the provider never does itself', async () => {
    const purchase = deferredPurchase();
    await render(<ShopScreen />);

    await press(screen.getByText(KOI_PRICE));
    // Mid-flight: the provider has been asked, and nothing is owned yet. This is the window.
    expect(purchase.spy).toHaveBeenCalledWith(GOLDEN_KOI_SPECIES_ID);
    expect(unlocked()).not.toContain(GOLDEN_KOI_SPECIES_ID);

    await purchase.resolveOk();
    expect(unlocked()).toContain(GOLDEN_KOI_SPECIES_ID);
  });

  it('writes the unlock even if the screen unmounts mid-purchase', async () => {
    // The failure this guards: a tab switch during the ~1s round trip. If the write were behind
    // an is-mounted check (or inside a `useEffect` cleanup-cancelled path), the provider would
    // consider the species bought and the device would have no record of it — recoverable at M6b
    // only via Restore, and at M6a not at all.
    const purchase = deferredPurchase();
    const view = await render(<ShopScreen />);

    await press(screen.getByText(KOI_PRICE));
    await act(async () => {
      view.unmount();
    });

    await purchase.resolveOk();
    expect(unlocked()).toContain(GOLDEN_KOI_SPECIES_ID);
  });

  it('fires exactly one purchase for two taps landing in the same frame', async () => {
    // `disabled={pending}` is React state and does not exist yet for the second tap — the two
    // presses below are deliberately *not* awaited separately, so no render is committed between
    // them. Against the mock a double purchase is invisible; at M6b it is a double charge.
    const purchase = deferredPurchase();
    await render(<ShopScreen />);
    const buyButton = screen.getByText(KOI_PRICE);

    await act(async () => {
      fireEvent.press(buyButton);
      fireEvent.press(buyButton);
    });

    expect(purchase.spy).toHaveBeenCalledTimes(1);

    await purchase.resolveOk();
    expect(unlocked()).toContain(GOLDEN_KOI_SPECIES_ID);
    expect(unlocked().filter((id) => id === GOLDEN_KOI_SPECIES_ID)).toHaveLength(1);
  });

  it('releases the in-flight guard once a purchase settles, so a failure can be retried', async () => {
    // The mirror of the test above: a guard that never clears would be worse than no guard, since
    // one failed purchase would lock the row out for the life of the screen.
    const first = deferredPurchase();
    await render(<ShopScreen />);

    await press(screen.getByText(KOI_PRICE));
    await first.resolveFailed('network');
    expect(screen.getByText('Network error — check your connection and try again.')).toBeTruthy();

    await press(screen.getByText(KOI_PRICE));
    expect(first.spy).toHaveBeenCalledTimes(2);

    await first.resolveOk();
    expect(unlocked()).toContain(GOLDEN_KOI_SPECIES_ID);
  });

  it('never writes on a reported failure, and reaches a terminal state', async () => {
    const purchase = deferredPurchase();
    await render(<ShopScreen />);

    await press(screen.getByText(KOI_PRICE));
    await purchase.resolveFailed('cancelled');

    expect(unlocked()).not.toContain(GOLDEN_KOI_SPECIES_ID);
    expect(screen.getByText('Purchase cancelled.')).toBeTruthy();
    expect(screen.queryByText('Buying…')).toBeNull(); // terminal, not stuck
  });

  it('never writes on a provider rejection, and still reaches a terminal state', async () => {
    // `EntitlementProvider` documents that `purchaseSpecies` resolves rather than rejects, but
    // RevenueCat's `purchasePackage` throws on cancellation — the M6b provider will break that
    // documented contract on the single most common failure path.
    const purchase = deferredPurchase();
    await render(<ShopScreen />);

    await press(screen.getByText(KOI_PRICE));
    await purchase.reject();

    expect(unlocked()).not.toContain(GOLDEN_KOI_SPECIES_ID);
    expect(screen.getByText('The purchase failed. Try again.')).toBeTruthy();
    expect(screen.queryByText('Buying…')).toBeNull();
  });

  it('never shows a stale purchase error on a row that is now owned', async () => {
    const purchase = deferredPurchase();
    await render(<ShopScreen />);

    await press(screen.getByText(KOI_PRICE));
    await purchase.resolveFailed('network');
    expect(screen.getByText('Network error — check your connection and try again.')).toBeTruthy();

    // The species becomes owned by some other path while the error is still on screen — a restore
    // landing, or (at M6b) a webhook-driven refresh. The row must not read "Unlocked" and
    // "Network error" at the same time.
    await act(async () => {
      useAppStore.getState().unlockSpecies(GOLDEN_KOI_SPECIES_ID);
    });

    expect(screen.queryByText('Network error — check your connection and try again.')).toBeNull();
    expect(screen.getByText('Unlocked')).toBeTruthy();
  });
});

describe('ShopScreen — restore and active species (docs/PLAN.md M6a)', () => {
  it('restore is a union that can never remove an already-unlocked species', async () => {
    useAppStore.getState().unlockSpecies(INDIGO_BETTA_SPECIES_ID);
    // A provider that has *forgotten* Indigo Betta — impossible for the store-backed mock, which
    // is exactly why it has to be forced here. This is the only place the union in
    // `syncUnlockedSpeciesIds` is exercised through the real screen rather than the store alone.
    jest.spyOn(mockEntitlementProvider, 'restorePurchases').mockResolvedValue([GOLDEN_KOI_SPECIES_ID]);

    await render(<ShopScreen />);
    await press(screen.getByText('Restore purchases'));
    await act(async () => {});

    expect(unlocked()).toEqual(
      expect.arrayContaining([STARTER_SPECIES_ID, GOLDEN_KOI_SPECIES_ID, INDIGO_BETTA_SPECIES_ID]),
    );
  });

  it('restore against the real mock is observably a no-op — it reads the same store it writes', async () => {
    // Not a criticism of the mock, but the honest description of what the Restore button does in
    // the free phase: `restorePurchases` resolves with `useAppStore`'s own `unlockedSpeciesIds`,
    // so unioning it back in cannot change the set. Nothing on this device can make it do more
    // until a provider with its own ledger exists (M6b).
    useAppStore.getState().unlockSpecies(GOLDEN_KOI_SPECIES_ID);
    const before = [...unlocked()].sort();

    await render(<ShopScreen />);
    await press(screen.getByText('Restore purchases'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, SHOP.mockRestoreDelayMs + 50));
    });

    expect([...unlocked()].sort()).toEqual(before);
  });

  it('only offers "Set active" for owned species, and switching it changes what new fry hatch as', async () => {
    useAppStore.getState().unlockSpecies(GOLDEN_KOI_SPECIES_ID);
    await render(<ShopScreen />);

    // Starter is owned and active; Golden Koi is owned and not; Indigo Betta is locked and so
    // offers a Buy button rather than a toggle at all.
    expect(screen.getByText('Hatching next')).toBeTruthy();
    expect(screen.getAllByText('Set active')).toHaveLength(1);
    expect(screen.getByText(`Buy $${SHOP.speciesPriceUsd[INDIGO_BETTA_SPECIES_ID].toFixed(2)}`)).toBeTruthy();

    await press(screen.getByText('Set active'));
    expect(useAppStore.getState().settings.activeSpeciesId).toBe(GOLDEN_KOI_SPECIES_ID);
  });
});
