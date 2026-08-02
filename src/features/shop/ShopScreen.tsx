import { Canvas } from '@shopify/react-native-skia';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { ParticleBurst, springs, useReduceMotion } from '@/anim';
import { SHOP } from '@/config';
import { getSpecies, SPECIES_ORDER, STARTER_SPECIES_ID, type SpeciesId } from '@/features/pet';
import { useAppStore } from '@/store';
import { colors, radius, spacing } from '@/theme';
import { Button, Card, Screen, Text } from '@/ui';
import { mockEntitlementProvider } from './MockEntitlementProvider';
import { SpeciesSwatch } from './SpeciesSwatch';

type PurchaseState = { status: 'idle' } | { status: 'pending' } | { status: 'error'; message: string };

interface Celebration {
  x: number;
  y: number;
  trigger: number;
}

type RowLayout = { x: number; y: number; width: number; height: number };

function priceLabel(speciesId: SpeciesId): string {
  const usd = SHOP.speciesPriceUsd[speciesId];
  return `$${usd.toFixed(2)}`;
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

  const rowLayoutsRef = useRef<Partial<Record<SpeciesId, RowLayout>>>({});
  const handleRowLayout = useCallback((speciesId: SpeciesId, event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    rowLayoutsRef.current[speciesId] = { x, y, width, height };
  }, []);

  const handleBuy = useCallback(
    async (speciesId: SpeciesId) => {
      setPurchaseStates((prev) => ({ ...prev, [speciesId]: { status: 'pending' } }));

      const result = await mockEntitlementProvider.purchaseSpecies(speciesId);

      if (result.ok) {
        // The provider only ever reports what happened — applying a successful purchase to
        // `entitlements` is this call site's job, exactly as it will be again for the real
        // provider at M6b (see `MockEntitlementProvider`'s doc comment).
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
      } else {
        setPurchaseStates((prev) => ({
          ...prev,
          [speciesId]: { status: 'error', message: purchaseErrorMessage(result.error) },
        }));
      }
    },
    [unlockSpecies, reduced],
  );

  const handleRestore = useCallback(async () => {
    setRestoring(true);
    const owned = await mockEntitlementProvider.restorePurchases();
    syncUnlockedSpeciesIds(owned);
    setRestoring(false);
    Alert.alert('Restore purchases', 'Your unlocked species are up to date.');
  }, [syncUnlockedSpeciesIds]);

  return (
    <Screen>
      <Text variant="title">Shop</Text>
      <Text color="textMuted" style={styles.subtitle}>
        Unlock species permanently. Tap an unlocked species to make it the one new fry hatch as.
      </Text>

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
              {isStarter ? 'Starter species · always owned' : owned ? 'Unlocked' : priceLabel(speciesId)}
            </Text>
            {purchaseState.status === 'error' && (
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
            <Button label={pending ? 'Buying…' : `Buy ${priceLabel(speciesId)}`} disabled={pending} onPress={onBuy} />
          )}
        </Card>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
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
