import { StyleSheet, View } from 'react-native';

import { selectStats, useAppStore } from '@/store';
import { Card, Screen, Text } from '@/ui';
import { colors, radius, spacing } from '@/theme';
import { getTodayFocusMs, getWeeklyFocus } from './stats';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const BAR_MAX_HEIGHT = 64;
const BAR_MIN_HEIGHT = 3;

function formatHours(ms: number): string {
  const hours = ms / 3_600_000;
  return `${hours.toFixed(1)}h`;
}

function formatMinutes(ms: number): string {
  return `${Math.round(ms / 60_000)}m`;
}

/**
 * M5 — real numbers, no placeholders. This component holds no date-bucketing logic of its own:
 * `getWeeklyFocus`/`getTodayFocusMs` (`./stats.ts`) are the pure, unit-tested functions that turn
 * `stats.focusMsByDate` into "today" and "the last 7 days" — same discipline as the timer machine
 * and `src/features/streak/streak.ts`. Rendering only.
 */
export function StatsScreen() {
  const stats = useAppStore(selectStats);
  const now = new Date();
  const todayFocusMs = getTodayFocusMs(stats.focusMsByDate, now);
  const week = getWeeklyFocus(stats.focusMsByDate, now);
  const weekMaxMs = Math.max(1, ...week.map((d) => d.focusMs));

  return (
    <Screen>
      <Text variant="title">Stats</Text>

      <View style={styles.grid}>
        <Card style={styles.tile}>
          <Text variant="caption" color="textMuted">
            TODAY
          </Text>
          <Text variant="title">{formatMinutes(todayFocusMs)}</Text>
        </Card>
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
      </View>

      <Card style={styles.weekCard}>
        <Text variant="label" color="textMuted">
          LAST 7 DAYS
        </Text>
        <View style={styles.bars} accessibilityRole="none">
          {week.map((day) => {
            const heightRatio = day.focusMs / weekMaxMs;
            const barHeight = day.focusMs === 0 ? BAR_MIN_HEIGHT : Math.max(BAR_MIN_HEIGHT, heightRatio * BAR_MAX_HEIGHT);
            const weekday = WEEKDAY_LABELS[day.weekday];
            return (
              <View key={day.dateKey} style={styles.barColumn}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.bar,
                      { height: barHeight },
                      day.isToday ? styles.barToday : styles.barPast,
                    ]}
                  />
                </View>
                <Text variant="caption" color={day.isToday ? 'coral' : 'textFaint'}>
                  {weekday}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>

      <Card style={styles.abandonedCard}>
        <Text variant="caption" color="textMuted">
          LEFT EARLY
        </Text>
        <Text variant="heading">{stats.abandonedSessions}</Text>
      </Card>
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
  weekCard: { marginTop: spacing.lg },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: BAR_MAX_HEIGHT + spacing.xl,
    marginTop: spacing.sm,
  },
  barColumn: { alignItems: 'center', gap: spacing.xs, flex: 1 },
  barTrack: {
    height: BAR_MAX_HEIGHT,
    width: 18,
    justifyContent: 'flex-end',
  },
  bar: { width: '100%', borderRadius: radius.sm },
  barPast: { backgroundColor: colors.surfaceRaised },
  barToday: { backgroundColor: colors.coral },
  abandonedCard: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
