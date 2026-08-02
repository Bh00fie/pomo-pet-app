import { Tabs } from 'expo-router';

import { colors } from '@/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.coral,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.abyss, borderTopColor: colors.outline },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Focus' }} />
      <Tabs.Screen name="aquarium" options={{ title: 'Aquarium' }} />
      <Tabs.Screen name="stats" options={{ title: 'Stats' }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop' }} />
    </Tabs>
  );
}
