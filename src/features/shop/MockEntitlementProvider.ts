/**
 * The mock `EntitlementProvider` the whole app is built against for the free phase (docs/PLAN.md
 * M6a) — swapped for `RevenueCatEntitlementProvider` only at M6b, after Apple Developer
 * enrollment. `docs/PLAN.md`'s constraint is "IAP is built against a mock entitlement provider
 * for the whole free phase"; this is that provider.
 *
 * Backed by `useAppStore`'s already-persisted `entitlements.unlockedSpeciesIds` (M0/M2) rather
 * than a second in-memory list of its own — a mock purchase has to survive an app restart for the
 * shop demo to mean anything, and there is nowhere else on-device for a provider with no real
 * backend to durably remember what it "sold" except the store the rest of the app already reads.
 * `useAppStore`/`useTimerStore` already import each other directly elsewhere in this codebase
 * (`src/features/timer/useTimerStore.ts` reads `useAppStore.getState().settings`), so this is not
 * a new architectural pattern.
 *
 * Every method is genuinely asynchronous — `purchaseSpecies` awaits a real timer-backed delay
 * before resolving, never resolves synchronously dressed up as a Promise — so a caller's loading
 * state is exercised for real rather than only ever flashing for one microtask. `wait`/`random`
 * are injected (same discipline as `idFactory`/`now` elsewhere in this codebase — see
 * `src/features/pet/reward.ts`) so tests can control timing and the failure roll deterministically
 * without needing fake timers.
 */
import { SHOP } from '@/config';
import type { SpeciesId } from '@/features/pet/model';
import { useAppStore } from '@/store';
import type { EntitlementProvider, PurchaseResult } from './EntitlementProvider';

export interface MockEntitlementProviderOptions {
  /** Defaults to a real `setTimeout`-backed delay. */
  wait?: (ms: number) => Promise<void>;
  /** Defaults to `Math.random`. Returns a value in [0, 1); a return below
   *  `SHOP.mockPurchaseFailureRate` simulates a failed purchase. */
  random?: () => number;
}

function realWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockEntitlementProvider implements EntitlementProvider {
  private readonly wait: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(options: MockEntitlementProviderOptions = {}) {
    this.wait = options.wait ?? realWait;
    this.random = options.random ?? Math.random;
  }

  async getOwnedSpeciesIds(): Promise<SpeciesId[]> {
    return [...useAppStore.getState().entitlements.unlockedSpeciesIds];
  }

  async isOwned(speciesId: SpeciesId): Promise<boolean> {
    return useAppStore.getState().entitlements.unlockedSpeciesIds.includes(speciesId);
  }

  async purchaseSpecies(speciesId: SpeciesId): Promise<PurchaseResult> {
    if (await this.isOwned(speciesId)) {
      return { ok: false, error: 'already-owned' };
    }

    await this.wait(SHOP.mockPurchaseDelayMs);

    // Simulated failure path (docs/PLAN.md M6a — "handle a failure path too"). A real purchase
    // can fail after the round trip for reasons that are not this app's fault; the UI has to cope
    // with that regardless of provider, so the mock has to actually produce it sometimes rather
    // than only ever succeeding.
    if (this.random() < SHOP.mockPurchaseFailureRate) {
      return { ok: false, error: 'unknown' };
    }

    // Deliberately does **not** write to `useAppStore` itself — the interface contract is "report
    // what happened," and the call site (the Shop screen) is what applies a successful result to
    // `entitlements`, via `unlockSpecies`. That is exactly the division of responsibility M6b's
    // real provider will need too (RevenueCat has no idea `useAppStore` exists), so there is
    // nothing to reshape when this class is swapped out — only this file changes.
    return { ok: true };
  }

  async restorePurchases(): Promise<SpeciesId[]> {
    // A mock provider has no separate server-side receipt ledger to reconcile against — the
    // persisted store already *is* the only record of what was "bought." Still a real async round
    // trip (shorter than a purchase, since nothing is being charged) so the call site's loading
    // state is exercised for real, and still a real return value the caller reconciles through
    // `syncUnlockedSpeciesIds` rather than assuming a no-op.
    await this.wait(SHOP.mockRestoreDelayMs);
    return this.getOwnedSpeciesIds();
  }
}

/** Module-level singleton, consistent with `useAppStore`/`useTimerStore` — nothing in this app
 *  uses dependency injection/context for its stores, so importing this directly is the existing
 *  convention, not a new one. */
export const mockEntitlementProvider = new MockEntitlementProvider();
