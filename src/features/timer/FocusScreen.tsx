import { StyleSheet, View } from 'react-native';

import { selectHydrated, selectSettings, useAppStore } from '@/store';
import { Button, Card, Screen, Text } from '@/ui';
import { spacing } from '@/theme';

/**
 * M0 placeholder. The real absolute-timestamp state machine (`endsAt`, not a decrementing
 * counter) lands in M1 — see docs/PLAN.md.
 */
export function FocusScreen() {
  const hydrated = useAppStore(selectHydrated);
  const settings = useAppStore(selectSettings);

  const mmss = `${String(settings.workMinutes).padStart(2, '0')}:00`;

  return (
    <Screen>
      <View style={styles.body}>
        <Text variant="caption" color="textMuted">
          FOCUS
        </Text>
        <Text variant="display">{mmss}</Text>
        <Button label="Start session" disabled={!hydrated} />
      </View>

      <Card>
        <Text variant="label" color="textMuted">
          M0 — scaffold
        </Text>
        <Text color="textMuted">
          Store {hydrated ? 'hydrated from AsyncStorage' : 'hydrating…'}. Timer engine arrives in
          M1.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
});
