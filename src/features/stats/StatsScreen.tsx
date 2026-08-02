import { StyleSheet, View } from 'react-native';

import { selectStats, useAppStore } from '@/store';
import { Card, Screen, Text } from '@/ui';
import { spacing } from '@/theme';

function formatHours(ms: number): string {
  const hours = ms / 3_600_000;
  return `${hours.toFixed(1)}h`;
}

/** M0 placeholder — weekly bars and streak detail land in M5 (docs/PLAN.md). */
export function StatsScreen() {
  const stats = useAppStore(selectStats);

  return (
    <Screen>
      <Text variant="title">Stats</Text>
      <View style={styles.grid}>
        <Card style={styles.tile}>
          <Text variant="caption" color="textMuted">
            CURRENT STREAK
          </Text>
          <Text variant="title">{stats.currentStreak}d</Text>
        </Card>
        <Card style={styles.tile}>
          <Text variant="caption" color="textMuted">
            ALL-TIME FOCUS
          </Text>
          <Text variant="title">{formatHours(stats.totalFocusMs)}</Text>
        </Card>
        <Card style={styles.tile}>
          <Text variant="caption" color="textMuted">
            SESSIONS
          </Text>
          <Text variant="title">{stats.completedSessions}</Text>
        </Card>
        <Card style={styles.tile}>
          <Text variant="caption" color="textMuted">
            LEFT EARLY
          </Text>
          <Text variant="title">{stats.abandonedSessions}</Text>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  tile: { flexGrow: 1, flexBasis: '45%' },
});
