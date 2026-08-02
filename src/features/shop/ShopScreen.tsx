import { Canvas } from '@shopify/react-native-skia';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { durations, ParticleBurst, springs, useReduceMotion } from '@/anim';
import { SHOP } from '@/config';
import { getSpecies, SPECIES_ORDER, STARTER_SPECIES_ID, type SpeciesId } from '@/features/pet';
import { useAppStore } from '@/store';
import { colors, radius, spacing } from '@/theme';
import { Button, Card, Screen, Text } from '@/ui';
import type { PurchaseResult } from './EntitlementProvider';
import { mockEntitlementProvider } from './MockEntitlementProvider';
import { SpeciesSwatch } from './SpeciesSwatch';

type PurchaseState = { status: 'idle' } | { status: 'pending' } | { status: 'error'; message: string };

interface Celebration {
  x: number;
  y: number;
  trigger: number;
}

type RowLayout = { x: number; y: number; width: number; height: number };

/** `SHOP.speciesPriceUsd` is typed `Record<string, number>`, so an id with no entry type-checks
 *  as a `number` and would blow up on `.toFixed` at runtime — crashing the whole Shop screen, not
 *  just the row. Unreachable today (the starter is the only unpriced species and it is always
 *  owned, so no price is ever rendered for it), but a species added to `SPECIES_ORDER` without a
 *  price should degrade to an un-buyable row, never a white screen. */
function priceLabel(speciesId: SpeciesId): string | null {
  const usd = SHOP.speciesPriceUsd[speciesId];
  return typeof usd === 'number' ? `$${usd.toFixed(2)}` : null;
}

function purchaseErrorMessage(error: string | undefined): string {
  switch (error) {
    case 'already-owned':
      return 'You already own this species.';
    case 'network':
      return 'Network error — check your connection and try again.';
    case 'cancelled':
      return 'Purchase cancelled.';
    default:
      return 'The purchase failed. Try again.';
  }
}

/**
 * M6a — the shop, against `MockEntitlementProvider` (docs/PLAN.md). Lists every species: the
 * starter as always-owned, unlocked species with a "Set active" toggle (which species new fry
 * hatch as — see `reward.ts`/`awardSessionCompletion`), and locked species with a price and a Buy
 * action that shows a real loading state before resolving to success or a real failure.
 */
export function ShopScreen() {
  const entitlements = useAppStore((s) => s.entitlements);
  const activeSpeciesId = useAppStore((s) => s.settings.activeSpeciesId);
  const unlockSpecies = useAppStore((s) => s.unlockSpecies);
  const setActiveSpecies = useAppStore((s) => s.setActiveSpecies);
  const syncUnlockedSpeciesIds = useAppStore((s) => s.syncUnlockedSpeciesIds);

  const [purchaseStates, setPurchaseStates] = useState<Partial<Record<SpeciesId, PurchaseState>>>({});
  const [restoring, setRestoring] = useState(false);
  const [celebration, setCelebration] = useState<Celebration | null>(null);

  // Duration *multiplier*, never a boolean directly — same convention as `Tank.tsx`. Compared
  // against 1 only because the unlock burst, like the M3 merge reveal, is skipped outright under
  // Reduce Motion rather than played in a scaled-down form.
  const reduced = useReduceMotion() !== 1;

  // Tear the burst overlay down once it has finished playing. Without this, one purchase leaves a
  // full-bleed Skia `Canvas` mounted over the list for the rest of the screen's life — invisible
  // and `pointerEvents="none"`, so harmless to interaction, but a live canvas nonetheless. Keyed
  // on `trigger` so a second purchase restarts the timer rather than inheriting the first one's.
  useEffect(() => {
    if (!celebration) return;
    const timeout = setTimeout(() => setCelebration(null), durations.scene);
    return () => clearTimeout(timeout);
  }, [celebration]);

  const rowLayoutsRef = useRef<Partial<Record<SpeciesId, RowLayout>>>({});
  const handleRowLayout = useCallback((speciesId: SpeciesId, event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    rowLayoutsRef.current[speciesId] = { x, y, width, height };
  }, []);

  /** Species with a purchase currently in flight. A **ref**, not the `purchaseStates` this
   *  renders from, because that is React state and only reflects a tap one render later — see
   *  `handleBuy`. */
  const inFlightRef = useRef<Set<SpeciesId>>(new Set());

  const handleBuy = useCallback(
    async (speciesId: SpeciesId) => {
      // The row's `disabled={pending}` is derived from React state, so it does not exist yet for
      // a second tap landing in the same frame as the first — both get through and both call the
      // provider. Against the mock that is invisible (its `isOwned` check still reads false for
      // the second call, and `unlockSpecies` is idempotent), which is exactly why it has to be
      // closed *now*: at M6b this line calls RevenueCat's `purchasePackage`, and calling it twice
      // for one product is a double charge, not a no-op. Same lesson as the M3 merge double-tap —
      // **React state is not a lock, a ref is.** Keyed per species so two different rows can
      // still be bought independently; serializing across species is a real-provider question
      // (see docs/PLAN.md M6a), not something to invent against a mock.
      if (inFlightRef.current.has(speciesId)) return;
      inFlightRef.current.add(speciesId);

      setPurchaseStates((prev) => ({ ...prev, [speciesId]: { status: 'pending' } }));

      // Only the provider call is inside the `try`. Anything after it is local bookkeeping, and
      // sweeping that into the same `catch` would report a purchase that *succeeded and was
      // applied* as a failure — the one lie this screen must never tell.
      let result: PurchaseResult;
      try {
        result = await mockEntitlementProvider.purchaseSpecies(speciesId);
      } catch {
        // `EntitlementProvider.purchaseSpecies` is documented to resolve rather than reject, and
        // the mock honours that — but a *rejection* is the one outcome that would otherwise leave
        // this row stuck on "Buying…" with its button disabled and no way back short of killing
        // the app. That is not hypothetical for M6b: RevenueCat's `purchasePackage` throws on a
        // user cancellation. Never leave the UI without a terminal state.
        setPurchaseStates((prev) => ({
          ...prev,
          [speciesId]: { status: 'error', message: purchaseErrorMessage(undefined) },
        }));
        return;
      } finally {
        inFlightRef.current.delete(speciesId);
      }

      if (!result.ok) {
        setPurchaseStates((prev) => ({
          ...prev,
          [speciesId]: { status: 'error', message: purchaseErrorMessage(result.error) },
        }));
        return;
      }

      // The provider only ever reports what happened — applying a successful purchase to
      // `entitlements` is this call site's job, exactly as it will be again for the real provider
      // at M6b (see `MockEntitlementProvider`'s doc comment). Deliberately the first statement
      // after a successful result and *not* guarded by an is-mounted check: a store write must
      // survive this screen unmounting mid-await (a tab switch during the ~1s round trip), or a
      // purchase the provider considers made would leave no trace locally. The `setState` calls
      // below are the ones that no-op after unmount, which is harmless.
      unlockSpecies(speciesId);
      setPurchaseStates((prev) => ({ ...prev, [speciesId]: { status: 'idle' } }));

      if (!reduced) {
        const layout = rowLayoutsRef.current[speciesId];
        setCelebration({
          x: (layout?.x ?? 0) + (layout?.width ?? 0) / 2,
          y: (layout?.y ?? 0) + (layout?.height ?? 0) / 2,
          trigger: Date.now(),
        });
      }
    },
    [unlockSpecies, reduced],
  );

  /**
   * **Against the mock this is very close to a no-op, and that is worth being clear about.**
   * `MockEntitlementProvider.restorePurchases` resolves with `useAppStore`'s own
   * `unlockedSpeciesIds` — it reads the same store this then writes back — so the union in
   * `syncUnlockedSpeciesIds` can never add anything, and the only observable effects are the
   * loading state and the alert. The button is here because the *flow* is what M6a demos and the
   * call site has to already exist for M6b; the reconciliation it performs only becomes real once
   * a provider with its own ledger (RevenueCat) is behind the interface. Do not read a passing
   * on-device restore as evidence that restore works.
   */
  const handleRestore = useCallback(async () => {
    setRestoring(true);
    try {
      const owned = await mockEntitlementProvider.restorePurchases();
      syncUnlockedSpeciesIds(owned);
      Alert.alert('Restore purchases', 'Your unlocked species are up to date.');
    } catch {
      Alert.alert('Restore purchases', "Couldn't reach the store. Try again in a moment.");
    } finally {
      // In a `finally` so a rejection can never strand the button disabled and reading
      // "Restoring…" forever — same reasoning as the purchase path above.
      setRestoring(false);
    }
  }, [syncUnlockedSpeciesIds]);

  return (
    <Screen>
      {/*
        Scrollable for the same reason Settings and onboarding are: `Screen` is a fixed `flex: 1`
        View, so anything past the viewport is clipped with nothing to scroll. The species pass
        that added Reef Shark and Clownfish took this list from three rows to five (~77pt each),
        which is the growth CLAUDE.md's Settings finding named ShopScreen as the next candidate
        for. Measured rather than guessed: header + 5 rows + Restore ≈ 621pt against ≈ 761pt of
        usable height on a 6.1" device — it still fits there — but ≈ 627pt against ≈ 618pt on an
        SE, where "Restore purchases" is the button that goes off-screen. A sixth species overflows
        everywhere. Inert while the content fits, so this costs nothing today.
      */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="title">Shop</Text>
        <Text color="textMuted" style={styles.subtitle}>
          Unlock species permanently. Tap an unlocked species to make it the one new fry hatch as.
        </Text>

        {/* The burst overlay below is `absoluteFill` *inside* this View and `rowLayoutsRef` records
            each row's offset relative to it, so both stay in the same coordinate space the
            ScrollView scrolls as a unit — the celebration tracks its row rather than the screen. */}
        <View style={styles.list}>
          {SPECIES_ORDER.map((speciesId) => (
            <ShopRow
              key={speciesId}
              speciesId={speciesId}
              owned={entitlements.unlockedSpeciesIds.includes(speciesId)}
              isActive={activeSpeciesId === speciesId}
              purchaseState={purchaseStates[speciesId] ?? { status: 'idle' }}
              reduced={reduced}
              onLayout={(event) => handleRowLayout(speciesId, event)}
              onBuy={() => handleBuy(speciesId)}
              onSetActive={() => setActiveSpecies(speciesId)}
            />
          ))}

          {celebration && (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Canvas style={StyleSheet.absoluteFill}>
                <ParticleBurst
                  cx={celebration.x}
                  cy={celebration.y}
                  trigger={celebration.trigger}
                  color={colors.sun}
                  count={16}
                  radius={64}
                />
              </Canvas>
            </View>
          )}
        </View>

        <Button
          label={restoring ? 'Restoring…' : 'Restore purchases'}
          variant="ghost"
          disabled={restoring}
          onPress={handleRestore}
          style={styles.restoreButton}
        />
      </ScrollView>
    </Screen>
  );
}

function ShopRow({
  speciesId,
  owned,
  isActive,
  purchaseState,
  reduced,
  onLayout,
  onBuy,
  onSetActive,
}: {
  speciesId: SpeciesId;
  owned: boolean;
  isActive: boolean;
  purchaseState: PurchaseState;
  reduced: boolean;
  onLayout: (event: LayoutChangeEvent) => void;
  onBuy: () => void;
  onSetActive: () => void;
}) {
  const species = getSpecies(speciesId);
  const isStarter = speciesId === STARTER_SPECIES_ID;
  const pending = purchaseState.status === 'pending';
  const price = priceLabel(speciesId);

  // The unlock "pop" (docs/PLAN.md M6a) — reuses `springs.celebrate`, the same spring the M3
  // merge reveal pops the new fish in with, rather than inventing a second celebratory feel.
  const popScale = useSharedValue(1);
  const wasOwnedRef = useRef(owned);
  useEffect(() => {
    if (!wasOwnedRef.current && owned && !reduced) {
      popScale.value = withSequence(withSpring(1.06, springs.celebrate), withSpring(1, springs.celebrate));
    }
    wasOwnedRef.current = owned;
  }, [owned, reduced, popScale]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: popScale.value }] }));

  return (
    <View onLayout={onLayout}>
      <Animated.View style={popStyle}>
        <Card style={styles.row}>
          <SpeciesSwatch speciesId={speciesId} locked={!owned} />

          <View style={styles.rowInfo}>
            <Text variant="label">{species.name}</Text>
            <Text variant="caption" color="textMuted">
              {isStarter
                ? 'Starter species · always owned'
                : owned
                  ? 'Unlocked'
                  : (price ?? 'Not available yet')}
            </Text>
            {/* Suppressed once the species is owned: a row reading "Unlocked" must never also be
                showing "The purchase failed." Reachable whenever a later attempt succeeds while
                an earlier one's error is still on screen — two taps racing, or a restore landing
                between them. */}
            {!owned && purchaseState.status === 'error' && (
              <Text variant="caption" color="danger">
                {purchaseState.message}
              </Text>
            )}
          </View>

          {owned ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              onPress={onSetActive}
              style={styles.activeToggle}
            >
              <Text variant="caption" color={isActive ? 'sun' : 'textMuted'}>
                {isActive ? 'Hatching next' : 'Set active'}
              </Text>
            </Pressable>
          ) : (
            <Button
              label={pending ? 'Buying…' : price ? `Buy ${price}` : 'Unavailable'}
              disabled={pending || price === null}
              onPress={onBuy}
            />
          )}
        </Card>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  /** Bottom padding so "Restore purchases" clears the tab bar rather than sitting under it —
   *  same treatment as `SettingsScreen`'s scroll container. */
  bodyContent: { paddingBottom: spacing.xxl },
  subtitle: { marginTop: spacing.xs },
  list: { marginTop: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowInfo: { flex: 1, gap: 2 },
  activeToggle: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  restoreButton: { marginTop: spacing.lg },
});
