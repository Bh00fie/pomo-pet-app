import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import type { ReduceMotionPreference } from '@/store';
import { selectSettings, useAppStore } from '@/store';
import { colors, radius, spacing } from '@/theme';
import { Button, Card, Screen, Text } from '@/ui';

const REDUCE_MOTION_OPTIONS: { value: ReduceMotionPreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

/**
 * M5 — settings that actually do something, nothing else. Work/break length is deliberately
 * *not* duplicated here: it already lives on the Focus screen (M1's session-length steppers,
 * reading/writing the same `settings.workMinutes`/`shortBreakMinutes`), and repeating the same
 * control here would just be a second source of truth for the same field.
 */
export function SettingsScreen() {
  const settings = useAppStore(selectSettings);
  const setSettings = useAppStore((s) => s.setSettings);
  const resetAll = useAppStore((s) => s.resetAll);

  const handleResetPress = () => {
    Alert.alert(
      'Reset all data?',
      'This permanently deletes every fish, your streak, and all stats, and restores default settings. There is no undo. This is meant for testing during the free-testing phase, not everyday use.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset everything', style: 'destructive', onPress: resetAll },
      ],
    );
  };

  return (
    <Screen>
      <Text variant="title">Settings</Text>

      <Card style={styles.section}>
        <Text variant="label" color="textMuted">
          MOTION
        </Text>
        <Text color="textMuted" style={styles.hint}>
          Overrides your device's Reduce Motion accessibility setting for this app only.
        </Text>
        <View style={styles.segments}>
          {REDUCE_MOTION_OPTIONS.map((option) => {
            const selected = settings.reduceMotion === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityLabel={`Reduce motion: ${option.label}`}
                accessibilityState={{ selected }}
                onPress={() => setSettings({ reduceMotion: option.value })}
                style={[styles.segment, selected && styles.segmentSelected]}
              >
                <Text variant="label" color={selected ? 'text' : 'textMuted'}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card style={styles.section}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabel}>
            <Text variant="label" color="textMuted">
              NOTIFICATIONS
            </Text>
            <Text color="textMuted" style={styles.hint}>
              Alert when a focus session or break ends.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Session-end notifications"
            value={settings.notificationsEnabled}
            onValueChange={(notificationsEnabled) => setSettings({ notificationsEnabled })}
            trackColor={{ false: colors.surfaceRaised, true: colors.kelp }}
            thumbColor={colors.text}
          />
        </View>
      </Card>

      <Card style={[styles.section, styles.dangerSection]}>
        <Text variant="label" color="danger">
          RESET (TESTING ONLY)
        </Text>
        <Text color="textMuted" style={styles.hint}>
          Wipes every fish, your streak, all stats, and settings back to defaults. Cannot be
          undone.
        </Text>
        <Button label="Reset all data" variant="danger" onPress={handleResetPress} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.lg, gap: spacing.md },
  hint: { marginTop: -spacing.xs },
  segments: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.deep,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  segmentSelected: { backgroundColor: colors.surfaceRaised },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { flex: 1, gap: spacing.xs, paddingRight: spacing.md },
  dangerSection: { borderColor: colors.danger },
});
