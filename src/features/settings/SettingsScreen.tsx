import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { getSpecies } from '@/features/pet/model';
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
  const debugGrantXp = useAppStore((s) => s.debugGrantXp);
  const debugCapAllFish = useAppStore((s) => s.debugCapAllFish);
  const debugSpawnFish = useAppStore((s) => s.debugSpawnFish);
  const activeSpeciesName = getSpecies(settings.activeSpeciesId).name;

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

      {/*
        TODO: remove or gate before EAS build submission. Debug-only affordance added post-M6a
        review — real pacing (`GROWTH.xpPerStage`/`xpPerFocusMinute`) makes merge and a newly
        bought species invisible in a normal testing session, so this fast-forwards through the
        exact same store actions/pure logic the real reward flow uses (see `useAppStore.ts`'s
        `debugGrantXp`/`debugCapAllFish`/`debugSpawnFish`) rather than faking any state. Styled
        distinctly (dashed amber border) on purpose — this is not a normal user-facing feature.
      */}
      <Card style={[styles.section, styles.debugSection]}>
        <Text variant="label" color="sun">
          ⚠ DEBUG — TESTING ONLY, NOT FOR SHIP
        </Text>
        <Text color="textMuted" style={styles.hint}>
          Fast-forwards the real reward/merge/spawn logic so you can reach merge and see a bought
          species without hours of real focus time. Same store actions the app itself uses — not
          a simulation.
        </Text>

        <Text variant="label" color="textMuted" style={styles.hint}>
          GRANT XP (current growth-target fish)
        </Text>
        <View style={styles.debugRow}>
          <Button
            label="+120 XP"
            variant="secondary"
            style={styles.debugButton}
            onPress={() => debugGrantXp(120, Date.now())}
          />
          <Button
            label="+360 XP"
            variant="secondary"
            style={styles.debugButton}
            onPress={() => debugGrantXp(360, Date.now())}
          />
          <Button
            label="+1000 XP"
            variant="secondary"
            style={styles.debugButton}
            onPress={() => debugGrantXp(1000, Date.now())}
          />
        </View>

        <Button
          label="Cap all fish (max XP)"
          variant="secondary"
          onPress={() => debugCapAllFish()}
        />
        <Button
          label={`Spawn a ${activeSpeciesName} fry`}
          variant="secondary"
          onPress={() => debugSpawnFish(Date.now())}
        />
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
  debugSection: {
    borderColor: colors.sun,
    borderWidth: StyleSheet.hairlineWidth * 3,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255,209,102,0.06)',
  },
  debugRow: { flexDirection: 'row', gap: spacing.xs },
  debugButton: { flex: 1, paddingHorizontal: spacing.sm },
});
