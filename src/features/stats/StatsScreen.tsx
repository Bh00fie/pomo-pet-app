import { StyleSheet, View } from 'react-native';

import { selectStats, useAppStore } from '@/store';
import { Card, Screen, Text } from '@/ui';
import { colors, radius, spacing } from '@/theme';
import { getTodayFocusMs, getWeeklyFocus } from './stats';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
/** Floor for the chart's own height. The track grows past this to fill whatever vertical space
 *  the screen has left over (see `weekCard`), so bar heights are a *fraction of the track*, not
 *  an absolute pixel count — otherwise the bars would stay 64pt tall in a 300pt-tall card. */
const BAR_MIN_TRACK_HEIGHT = 64;
/** A zero-focus day still draws a visible stub so the day reads as "nothing", not "missing". */
const BAR_ZERO_HEIGHT = 3;
/** Smallest non-zero bar, as a percentage of the track, so a 2-minute day is still visible. */
const BAR_MIN_PERCENT = 4;

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
          <Text variant="title" style={styles.tileValue}>{formatMinutes(todayFocusMs)}</Text>
        </Card>
        <Card style={styles.tile}>
          <Text variant="caption" color="textMuted">
            CURRENT STREAK
          </Text>
          <Text variant="title" style={styles.tileValue}>{stats.currentStreak}d</Text>
        </Card>
        <Card style={styles.tile}>
          <Text variant="caption" color="textMuted">
            ALL-TIME FOCUS
          </Text>
          <Text variant="title" style={styles.tileValue}>{formatHours(stats.totalFocusMs)}</Text>
        </Card>
        <Card style={styles.tile}>
          <Text variant="caption" color="textMuted">
            SESSIONS
          </Text>
          <Text variant="title" style={styles.tileValue}>{stats.completedSessions}</Text>
        </Card>
      </View>

      <Card style={styles.weekCard}>
        <Text variant="label" color="textMuted">
          LAST 7 DAYS
        </Text>
        <View style={styles.bars} accessibilityRole="none">
          {week.map((day) => {
            const heightRatio = day.focusMs / weekMaxMs;
            const barHeight =
              day.focusMs === 0
                ? BAR_ZERO_HEIGHT
                : (`${Math.max(BAR_MIN_PERCENT, heightRatio * 100)}%` as const);
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
        <Text variant="heading" style={styles.tileValue}>{stats.abandonedSessions}</Text>
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
  /** Tabular figures so the four tiles' numbers line up as a grid and none of them shifts width
   *  as the value changes — same reason the Focus screen's clock uses them. */
  tileValue: { fontVariant: ['tabular-nums'] },
  /**
   * `flex: 1` is what makes this screen fill the device rather than stopping two-thirds of the way
   * down. Everything here is fixed-height — four stat tiles, a chart, a counter — so on a 6.1"
   * phone the content ran ~470pt against ~698pt of usable height and left ~230pt of dead space
   * below the LEFT EARLY card. The 7-day chart is the one element that genuinely reads better
   * taller, so it absorbs the slack and the counter card gets pushed to the bottom where it
   * belongs. `Screen` does not scroll (CLAUDE.md's recurring rule), and this screen still does not
   * need to: the chart shrinks to `BAR_MIN_TRACK_HEIGHT` before anything can be clipped.
   */
  weekCard: { marginTop: spacing.lg, flex: 1 },
  bars: {
    flex: 1,
    flexDirection: 'row',
    // `stretch`, not `flex-end`: each column has to be full height for its track to flex.
    alignItems: 'stretch',
    justifyContent: 'space-between',
    minHeight: BAR_MIN_TRACK_HEIGHT + spacing.xl,
    marginTop: spacing.sm,
  },
  barColumn: { alignItems: 'center', gap: spacing.xs, flex: 1 },
  barTrack: {
    flex: 1,
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
