/**
 * The IAP surface the app is built against for the whole free phase (docs/PLAN.md M6a), so the
 * shop can be fully demoed with zero Apple Developer spend. `MockEntitlementProvider` is the only
 * implementation for now; `RevenueCatEntitlementProvider` at M6b implements this exact interface
 * — the point of it existing at all is that swapping providers should be a one-line change at the
 * call site, not a rewrite.
 *
 * Deliberately shaped after what a real IAP SDK actually exposes (RevenueCat's `Purchases` API is
 * the concrete reference: `getCustomerInfo`, `purchasePackage`/`purchaseStoreProduct`,
 * `restorePurchases`), not after this app's own store shape — `unlockedSpeciesIds` is a
 * `useAppStore` concept, not an IAP one. Every method here returns species ids, never touches
 * `useAppStore` itself, and every method is async, because none of this can be synchronous once
 * it is talking to an actual App Store — a caller (the Shop screen) is expected to sync whatever
 * a provider reports into `useAppStore`'s `entitlements`, not the other way around.
 */
import type { SpeciesId } from '@/features/pet/model';

/** Reasons a purchase can fail without being a bug — the ones a real storefront also surfaces,
 *  not implementation details like a thrown exception. `'unknown'` is the catch-all for anything
 *  a real StoreKit/RevenueCat error could report that doesn't fit the other three. */
export type PurchaseFailureReason = 'cancelled' | 'network' | 'already-owned' | 'unknown';

export interface PurchaseResult {
  ok: boolean;
  /** Present only when `ok` is false. */
  error?: PurchaseFailureReason;
}

export interface EntitlementProvider {
  /**
   * Every species id this provider currently believes the signed-in user owns. The source of
   * truth a caller re-syncs `useAppStore`'s `entitlements.unlockedSpeciesIds` against — analogous
   * to reading `CustomerInfo.entitlements` from RevenueCat, or `Transaction.currentEntitlements`
   * from StoreKit.
   */
  getOwnedSpeciesIds: () => Promise<SpeciesId[]>;
  /** Convenience over `getOwnedSpeciesIds` for a single id — checking one species shouldn't
   *  require the caller to fetch and search the whole list. */
  isOwned: (speciesId: SpeciesId) => Promise<boolean>;
  /**
   * Attempts to purchase one species. **Resolves, never rejects**, with a typed result — a real
   * purchase can fail for reasons that are not exceptions (the user cancelled the system sheet,
   * the network dropped mid-purchase), and the UI has to render *something* for every one of
   * those, not just a happy path plus an unhandled promise rejection.
   */
  purchaseSpecies: (speciesId: SpeciesId) => Promise<PurchaseResult>;
  /**
   * Re-fetches everything the signed-in user has legitimately bought — across reinstalls/devices
   * for a real provider, which is the entire point of a restore button existing. Returns the
   * resulting owned list (not a diff) so the caller can reconcile `entitlements` as a union
   * (never a downgrade — see `useAppStore.syncUnlockedSpeciesIds`).
   */
  restorePurchases: () => Promise<SpeciesId[]>;
}
