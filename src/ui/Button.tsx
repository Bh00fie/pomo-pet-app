import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text variant="label" color={variant === 'primary' || variant === 'danger' ? 'abyss' : 'text'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.coral },
  secondary: { backgroundColor: colors.surfaceRaised },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.outline },
  /** Destructive actions only (docs/PLAN.md M5 — the Settings reset-data action). */
  danger: { backgroundColor: colors.danger },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
});
