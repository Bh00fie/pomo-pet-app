import { ScrollView, StyleSheet, View } from 'react-native';

import { APP } from '@/config';
import { useAppStore } from '@/store';
import { radius, spacing } from '@/theme';
import { Button, Card, Screen, Text } from '@/ui';

interface Step {
  emoji: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  { emoji: '⏳', title: 'Focus', body: 'Run a Pomodoro session on the Focus tab.' },
  { emoji: '🐟', title: 'Grow a fish', body: 'Every completed session grows a fish in your Aquarium.' },
  { emoji: '✨', title: 'Merge', body: 'Collect three same-stage fish and merge them into the next stage.' },
  {
    emoji: '⚠️',
    title: "Don't leave early",
    body: 'Backgrounding the app during a session makes a fish sick — finish what you start.',
  },
];

/**
 * First-launch-only explainer for the core loop (docs/PLAN.md M5). Shown as a full-screen
 * overlay from `app/_layout.tsx` while `onboardingCompletedAt` is `null`; dismissing it calls
 * `completeOnboarding()` (already in the store since M0) and it never shows again — there is
 * deliberately no way to re-trigger it from Settings, per the M5 spec.
 */
export function OnboardingScreen() {
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  return (
    <Screen>
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="caption" color="textMuted">
          WELCOME TO
        </Text>
        <Text variant="title">{APP.name}</Text>
        <Text color="textMuted" style={styles.intro}>
          A Pomodoro timer that grows a personal aquarium as you focus.
        </Text>

        <View style={styles.steps}>
          {STEPS.map((step) => (
            <Card key={step.title} style={styles.step}>
              <Text variant="heading">
                {step.emoji} {step.title}
              </Text>
              <Text color="textMuted">{step.body}</Text>
            </Card>
          ))}
        </View>
      </ScrollView>

      <Button label="Get started" onPress={completeOnboarding} style={styles.cta} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Scrollable rather than a fixed centered block — four cards plus intro copy should fit most
  // screens without scrolling, but nothing here should be able to clip content off-screen on a
  // smaller device (verifying that is phone-only, same as every other layout in this app).
  body: { flex: 1 },
  bodyContent: { justifyContent: 'center', flexGrow: 1, gap: spacing.sm },
  intro: { marginBottom: spacing.lg },
  steps: { gap: spacing.md },
  step: { borderRadius: radius.lg, gap: spacing.xs },
  cta: { marginBottom: spacing.xl },
});
