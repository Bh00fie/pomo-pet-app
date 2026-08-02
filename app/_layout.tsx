import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSessionReward } from '@/features/pet';
import { colors } from '@/theme';

/** Renders nothing — mounts the M2 session→reward bridge at the app root so a focus session that
 *  completes while the user is on another tab still grows/spawns a fish. See useSessionReward.ts. */
function SessionRewardBridge() {
  useSessionReward();
  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.deep }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <SessionRewardBridge />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.deep } }} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
