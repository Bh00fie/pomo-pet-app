import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { getSpecies } from '@/features/pet/model';
import type { ReduceMotionPreference } from '@/store';
import { selectSettings, selectSpawnSpeciesId, useAppStore } from '@/store';
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
  const debugHatchFry = useAppStore((s) => s.debugHatchFry);
  const debugHatchJuvenile = useAppStore((s) => s.debugHatchJuvenile);
  // `selectSpawnSpeciesId`, not `settings.activeSpeciesId` — the store re-validates the active
  // species against `entitlements.unlockedSpeciesIds` before spawning, so reading the raw setting
  // here would let the button promise a Golden Koi and hand over a starter Tetra.
  const spawnSpeciesName = getSpecies(useAppStore(selectSpawnSpeciesId)).name;

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
      {/*
        Scrollable, for the same reason M5 made onboarding scrollable: `Screen` is a fixed
        `flex: 1` View, so anything past the viewport is clipped with no way to reach it. Three
        cards fitted; the debug card below adds ~340pt and pushes its own bottom two buttons off
        an iPhone-sized screen entirely — i.e. the affordance that exists to make merge testable
        would itself be untappable. Measured, not guessed: title + 4 cards ≈ 790pt against ≈ 694pt
        of usable height on a 6.1" device, and worse on an SE.
      */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
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
          review, updated for the reward rearchitecture that replaced XP accumulation with a
          hatch-on-completion model (see CLAUDE.md): merge and a newly bought species are
          otherwise invisible in a normal testing session, so these buttons call straight into the
          same hatch primitive (`hatchFish` in `reward.ts`) a real completed session uses — never a
          simulation of it. Styled distinctly (dashed amber border) on purpose — this is not a
          normal user-facing feature.
        */}
        <Card style={[styles.section, styles.debugSection]}>
          <Text variant="label" color="sun">
            ⚠ DEBUG — TESTING ONLY, NOT FOR SHIP
          </Text>
          <Text color="textMuted" style={styles.hint}>
            Hatches fish through the exact same store action a completed focus session uses, so
            you can reach merge and see species variety without hours of real focus time.
          </Text>

          <Button
            label={`Hatch a ${spawnSpeciesName} Fry`}
            variant="secondary"
            onPress={() => debugHatchFry(Date.now())}
          />
          <Text color="textMuted" style={styles.hint}>
            Same as a short real session. Press three times for a mergeable trio.
          </Text>

          <Button
            label="Hatch a Juvenile (random species)"
            variant="secondary"
            onPress={() => debugHatchJuvenile(Date.now())}
          />
          <Text color="textMuted" style={styles.hint}>
            Same as a long real session: one Juvenile of a species drawn at random from everything
            you own.
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  /** Bottom padding so the last debug button clears the tab bar rather than sitting under it. */
  bodyContent: { paddingBottom: spacing.xxl },
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
});
