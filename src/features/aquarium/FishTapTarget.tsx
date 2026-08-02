import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { colors } from '@/theme';
import type { FishKinematics } from './steering';

export interface FishTapTargetProps {
  kinematics: FishKinematics;
  /** Diameter of the touch target, px — bigger for bigger growth stages so Elder fish aren't
   *  harder to hit than Fry. */
  size: number;
  selected: boolean;
  onPress: () => void;
}

/**
 * A touch target that tracks a swimming fish (docs/PLAN.md M3 selection UI). Fish position lives
 * in a Reanimated mutable driven by the tank's shared clock (`Tank.tsx`), not React state — this
 * reads it via `useAnimatedStyle` so the overlay follows the fish every frame without triggering
 * a single React re-render. Only the `selected` ring (a rare, discrete change) is plain RN style.
 */
export function FishTapTarget({ kinematics, size, selected, onPress }: FishTapTargetProps) {
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: kinematics.x.value - size / 2 },
      { translateY: kinematics.y.value - size / 2 },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { width: size, height: size }, style]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onPress}
        style={[styles.hit, selected && styles.selected]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute' },
  hit: { flex: 1, borderRadius: 999 },
  selected: {
    borderWidth: 2,
    borderColor: colors.sun,
    backgroundColor: 'rgba(255,209,102,0.14)',
  },
});
