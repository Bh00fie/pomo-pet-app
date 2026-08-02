import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

interface ScreenProps {
  children: ReactNode;
  /** Set false for full-bleed scenes (the tank) that draw under the status bar. */
  padded?: boolean;
}

export function Screen({ children, padded = true }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.root,
        padded && styles.padded,
        { paddingTop: insets.top + (padded ? spacing.lg : 0) },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.deep },
  padded: { paddingHorizontal: spacing.xl },
});
