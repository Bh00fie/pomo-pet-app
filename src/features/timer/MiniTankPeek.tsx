import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { mostRecentFish, type Fish } from '@/features/pet/model';
import { SpeciesSwatch } from '@/features/shop/SpeciesSwatch';
import { spacing } from '@/theme';
import { Text } from '@/ui';

const PEEK_COUNT = 3;
const SWATCH_SIZE = 40;

export interface MiniTankPeekProps {
  fish: Fish[];
}

/**
 * The concept gallery's "Your tank" preview (see CLAUDE.md's "Concept gallery vs. the built app")
 * — a few fish thumbnails on the Focus screen itself, so the reward is visible without leaving
 * the timer. Deliberately non-interactive (no tap target, no navigation) and capped at
 * `PEEK_COUNT`: this is a peek, not a second aquarium. Reuses `SpeciesSwatch`'s static Skia
 * renderer at each fish's own stage rather than a third copy of the fish-drawing code — the tank
 * (`Tank.tsx`/`Fish.tsx`) is the only place a fish actually swims.
 */
export function MiniTankPeek({ fish }: MiniTankPeekProps) {
  const peek = useMemo(() => mostRecentFish(fish, PEEK_COUNT), [fish]);

  return (
    <View style={styles.root}>
      <Text variant="label" color="textMuted">
        YOUR TANK
      </Text>
      {peek.length === 0 ? (
        <Text color="textFaint">Complete a session to hatch your first fish.</Text>
      ) : (
        <View style={styles.row}>
          {peek.map((f) => (
            <View key={f.id} testID={`mini-tank-peek-${f.id}`}>
              <SpeciesSwatch speciesId={f.speciesId} stage={f.stage} size={SWATCH_SIZE} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
});
