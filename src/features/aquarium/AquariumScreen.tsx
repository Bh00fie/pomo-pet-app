import { StyleSheet, View } from 'react-native';

import { selectFish, useAppStore } from '@/store';
import { Screen, Text } from '@/ui';
import { spacing } from '@/theme';
import { Tank } from './Tank';

/** M2 — the tank (docs/PLAN.md). Procedural Skia fish, driven by one shared clock, rendering the
 *  user's real fish collection. Merge/growth UI lands in M3. */
export function AquariumScreen() {
  const fish = useAppStore(selectFish);

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text variant="title">Aquarium</Text>
        <View style={styles.countPill}>
          <Text variant="label" color="textMuted">
            {fish.length} fish
          </Text>
        </View>
      </View>

      {fish.length === 0 ? (
        <View style={styles.empty}>
          <Text color="textMuted">No fish yet — finish a focus session to hatch one.</Text>
        </View>
      ) : (
        <Tank fish={fish} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  countPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: 'rgba(234,244,255,0.08)',
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
});
