import { useCallback, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { GROWTH } from '@/config';
import type { MergeRejectionReason } from '@/features/pet';
import { selectFish, useAppStore } from '@/store';
import { colors, radius, spacing } from '@/theme';
import { Button, Screen, Text } from '@/ui';
import { Tank, type TankHandle } from './Tank';

/** Human copy for a rejected merge (docs/PLAN.md M3) — the Merge button is only ever enabled for
 *  a selection `Tank` itself already built as valid, so in normal use these never show; they
 *  exist so an edge-case rejection (e.g. a race with the selection changing) explains itself
 *  instead of silently doing nothing. */
const MERGE_REJECTION_MESSAGES: Record<MergeRejectionReason, string> = {
  'wrong-count': `Select exactly ${GROWTH.fishPerMerge} fish of the same stage to merge.`,
  'fish-not-found': 'One of the selected fish could not be found — try selecting again.',
  'mixed-stages': 'You can only merge fish that are the same growth stage.',
  'mixed-species': 'You can only merge fish of the same species.',
  'top-stage': 'Elder fish are already fully grown — there is nothing to merge them into.',
};

/** M2/M3 — the tank (docs/PLAN.md). Procedural Skia fish, driven by one shared clock, rendering
 *  the user's real fish collection. Tapping fish selects them (up to `GROWTH.fishPerMerge`,
 *  same-stage only); the Merge button below the tank fires the merge + reveal sequence. */
export function AquariumScreen() {
  const fish = useAppStore(selectFish);
  const tankRef = useRef<TankHandle>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectedStage =
    selectedIds.length > 0 ? fish.find((f) => f.id === selectedIds[0])?.stage ?? null : null;
  const canMerge = selectedIds.length === GROWTH.fishPerMerge;

  const handleMergePress = useCallback(() => {
    const result = tankRef.current?.mergeSelected();
    if (result && !result.ok) {
      Alert.alert("Can't merge those fish", MERGE_REJECTION_MESSAGES[result.reason]);
    }
  }, []);

  const handleClearPress = useCallback(() => {
    tankRef.current?.clearSelection();
  }, []);

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
        <Tank ref={tankRef} fish={fish} onSelectionChange={setSelectedIds} />
      )}

      {selectedIds.length > 0 && (
        <View style={styles.mergeBar}>
          <Text variant="label" color="textMuted">
            {selectedIds.length}/{GROWTH.fishPerMerge} selected
            {selectedStage ? ` · ${selectedStage}` : ''}
          </Text>
          <View style={styles.mergeBarActions}>
            <Button label="Clear" variant="ghost" onPress={handleClearPress} style={styles.clearButton} />
            <Button label="Merge" disabled={!canMerge} onPress={handleMergePress} />
          </View>
        </View>
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
  mergeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.outline,
    borderRadius: radius.md,
  },
  mergeBarActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  clearButton: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
});
