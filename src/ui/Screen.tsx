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
      // `paddingBottom` is a flat token, not `insets.bottom`, and that is deliberate: every tab
      // screen is a scene of the bottom tab navigator, which already sizes scenes above a tab bar
      // that owns the home-indicator inset — adding the inset here would re-reserve ~34pt that is
      // already reserved. What was genuinely missing is plain breathing room: this was 0, so
      // anything bottom-anchored (the Focus screen's session-lengths card, the Stats screen's LEFT
      // EARLY card) sat flush against the tab bar. The one `Screen` outside the tabs is the
      // onboarding overlay, whose CTA carries its own `marginBottom` on top of this.
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.deep },
  padded: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
});
