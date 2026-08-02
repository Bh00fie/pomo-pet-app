import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { Button, Card, Screen, Text } from '@/ui';
import { Aquarium3DScene } from './Aquarium3DScene';
import { TANKS, getTank } from './tanks';

/**
 * Spike harness. Not a product screen — it exists so the tank shapes and fish counts that the
 * report makes claims about can actually be flipped through on a device.
 */
export function Aquarium3DScreen() {
  const [tankId, setTankId] = useState(TANKS[0].id);
  const [fishCount, setFishCount] = useState(12);
  const tank = getTank(tankId);

  return (
    <Screen padded={false}>
      <View style={styles.canvas}>
        <Aquarium3DScene tank={tank} fishCount={fishCount} />
      </View>

      <ScrollView contentContainerStyle={styles.controls}>
        <Text variant="caption" color="textMuted">
          TANK SHAPE — THE IAP QUESTION
        </Text>
        <View style={styles.row}>
          {TANKS.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setTankId(t.id)}
              style={[styles.chip, t.id === tankId && styles.chipActive]}
            >
              <Text variant="label" color={t.id === tankId ? 'abyss' : 'text'}>
                {t.name}
              </Text>
              <Text variant="caption" color={t.id === tankId ? 'abyss' : 'textMuted'}>
                {t.priceLabel}
              </Text>
            </Pressable>
          ))}
        </View>

        <Card>
          <Text variant="label">{tank.name}</Text>
          <Text color="textMuted">{tank.blurb}</Text>
        </Card>

        <Text variant="caption" color="textMuted">
          FISH COUNT — {fishCount}
        </Text>
        <View style={styles.row}>
          {[6, 12, 20, 40].map((n) => (
            <Button
              key={n}
              label={String(n)}
              variant={n === fishCount ? 'primary' : 'ghost'}
              onPress={() => setFishCount(n)}
            />
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, minHeight: 320 },
  controls: { padding: spacing.xl, gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  chipActive: { backgroundColor: colors.kelp, borderColor: colors.kelp },
});
