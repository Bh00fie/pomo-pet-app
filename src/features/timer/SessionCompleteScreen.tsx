import { StyleSheet, View } from 'react-native';

import type { Fish } from '@/features/pet/model';
import { colors, radius, spacing } from '@/theme';
import { Button, Card, Screen, Text } from '@/ui';
import { hatchHeadline } from './sessionComplete';

export interface SessionCompleteScreenProps {
  /** The fish this session hatched, or `null` on the (practically unreachable) edge case of a
   *  completed session with no fish at all — see `FocusScreen.test.tsx`. */
  fish: Fish | null;
  durationMinutes: number;
  onStartAnother: () => void;
  onSeeTank: () => void;
}

/**
 * The concept gallery's Session Complete moment (see CLAUDE.md's "Concept gallery vs. the built
 * app") — a badge, "Session complete", a card naming what was earned, and a "See your tank"
 * button, replacing the Focus screen's normal idle/running/paused body entirely rather than
 * sharing space with it. `FocusScreen` renders this in place of its own tree exactly when
 * `timer.isCompleted && timer.mode === 'focus'`; a completed *break* never reaches this screen.
 *
 * The badge is two flat circles (`colors.sun` behind `colors.coral`) rather than a real radial
 * gradient — there is no gradient dependency in this project yet, and one felt like too much for
 * a single badge.
 */
export function SessionCompleteScreen({
  fish,
  durationMinutes,
  onStartAnother,
  onSeeTank,
}: SessionCompleteScreenProps) {
  return (
    <Screen>
      <View style={styles.body}>
        <View style={styles.badgeOuter}>
          <View style={styles.badgeInner} />
        </View>

        <Text variant="title">Session complete</Text>
        <Text color="textMuted">{durationMinutes} minutes of focus, banked.</Text>

        <Card style={styles.earnedCard}>
          <Text variant="label" color="textMuted">
            EARNED
          </Text>
          <Text variant="heading" color="kelp">
            {fish ? hatchHeadline(fish) : 'A new fish hatched.'}
          </Text>
        </Card>

        <View style={styles.actions}>
          <Button label="See your tank" onPress={onSeeTank} />
          <Button label="Start another session" variant="ghost" onPress={onStartAnother} />
        </View>
      </View>
    </Screen>
  );
}

const BADGE_SIZE = 96;

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  badgeOuter: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: colors.sun,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  badgeInner: {
    width: BADGE_SIZE * 0.7,
    height: BADGE_SIZE * 0.7,
    borderRadius: (BADGE_SIZE * 0.7) / 2,
    backgroundColor: colors.coral,
  },
  earnedCard: { alignItems: 'center', marginTop: spacing.lg, minWidth: 240 },
  actions: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
});
