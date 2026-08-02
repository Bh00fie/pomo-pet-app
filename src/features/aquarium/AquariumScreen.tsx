import { StyleSheet, View } from 'react-native';

import { selectFish, useAppStore } from '@/store';
import { Card, Screen, Text } from '@/ui';
import { spacing } from '@/theme';

/** M0 placeholder — the Skia procedural fish renderer lands in M2 (docs/PLAN.md). */
export function AquariumScreen() {
  const fish = useAppStore(selectFish);

  return (
    <Screen>
      <View style={styles.body}>
        <Text variant="title">Aquarium</Text>
        <Text color="textMuted">
          {fish.length === 0 ? 'No fish yet — finish a focus session.' : `${fish.length} fish`}
        </Text>
      </View>

      <Card>
        <Text variant="label" color="textMuted">
          M2 — tank rendering
        </Text>
        <Text color="textMuted">
          Procedural 2D fish via Skia. A 3D alternative was spiked separately — see
          docs/3D_AQUARIUM_REPORT.md.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
});
