import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useLeaveEarlyPenalty, useSessionReward } from '@/features/pet';
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen';
import { selectHydrated, useAppStore } from '@/store';
import { colors } from '@/theme';

/** Renders nothing — mounts the M2 session→reward bridge and the M4 leave-early-penalty bridge
 *  at the app root, so a session that completes or gets auto-abandoned while the user is on
 *  another tab still lands. See useSessionReward.ts / useLeaveEarlyPenalty.ts. */
function SessionRewardBridge() {
  useSessionReward();
  useLeaveEarlyPenalty();
  return null;
}

/**
 * First-launch-only onboarding (docs/PLAN.md M5), gated on the store rather than a route so the
 * tabs underneath are already mounted and ready the instant it is dismissed — no navigation, just
 * an overlay that stops rendering once `onboardingCompletedAt` is set. Waits for `hydrated` so a
 * returning user's real `onboardingCompletedAt` is read before deciding, rather than flashing the
 * screen against the store's default (`null`) for one frame on every launch.
 */
function OnboardingGate() {
  const hydrated = useAppStore(selectHydrated);
  const onboardingCompletedAt = useAppStore((s) => s.onboardingCompletedAt);

  if (!hydrated || onboardingCompletedAt !== null) return null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <OnboardingScreen />
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.deep }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <SessionRewardBridge />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.deep } }} />
        <OnboardingGate />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
