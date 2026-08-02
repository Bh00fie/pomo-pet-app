import { useAppStore } from '@/store';
import { spacing } from '@/theme';
import { Card, Screen, Text } from '@/ui';

/**
 * M0 placeholder. The full paywall runs against `MockEntitlementProvider` in M6a — no real
 * money, no Apple Developer account, until the decision gate (docs/PLAN.md).
 */
export function ShopScreen() {
  const entitlements = useAppStore((s) => s.entitlements);

  return (
    <Screen>
      <Text variant="title">Shop</Text>
      <Card style={{ marginTop: spacing.lg }}>
        <Text variant="label" color="textMuted">
          M6a — mock entitlements
        </Text>
        <Text color="textMuted">
          Species unlocked: {entitlements.unlockedSpeciesIds.join(', ')}
        </Text>
        <Text color="textMuted">Tanks unlocked: {entitlements.unlockedTankIds.join(', ')}</Text>
      </Card>
    </Screen>
  );
}
