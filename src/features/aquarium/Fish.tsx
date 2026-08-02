import { Circle, Group, Oval, Path, Skia, type SkPath } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { AQUARIUM, HEALTH } from '@/config';
import { buildFishGeometry, getSpecies, hslToHex, type FinShape, type Fish } from '@/features/pet';
import { colors } from '@/theme';
import type { FishKinematics } from './steering';

/** Golden-angle-ish constant used only to spread deterministic per-fish phase/speed — not a
 *  physical unit, just a decorrelator so fish sharing a seed sequence don't sync up visually. */
const PHASE_SPREAD = 2.399963;

function buildFinPath(shape: FinShape): SkPath {
  const path = Skia.Path.Make();
  path.moveTo(0, 0);
  for (const segment of shape.segments) {
    path.quadTo(segment.cp.x, segment.cp.y, segment.end.x, segment.end.y);
  }
  path.close();
  return path;
}

export interface FishSpriteProps {
  fish: Fish;
  kinematics: FishKinematics;
  /** Shared clock from `useAquariumClock` — every fish reads the same one. */
  elapsed: SharedValue<number>;
  /** Stable index within the tank's fish list, used to decorrelate phase/speed. */
  seed: number;
}

/**
 * A procedurally drawn fish (docs/PLAN.md M2): body/belly ellipses, an eye, and three fins built
 * from parametric Skia paths (`buildFishGeometry`) — no image assets, no hand-authored SVG.
 * Growth stages are just different parameter sets fed to the same builder.
 *
 * All animated values are `SharedValue`s read through `useDerivedValue`; nothing here uses React
 * state in the render path, so adding more fish never costs a dropped-frame risk from re-renders.
 */
export function FishSprite({ fish, kinematics, elapsed, seed }: FishSpriteProps) {
  const species = getSpecies(fish.speciesId);
  const stageParams = species.stageParams[fish.stage];

  const geometry = useMemo(() => buildFishGeometry(stageParams), [stageParams]);
  const tailPath = useMemo(() => buildFinPath(geometry.tail), [geometry]);
  const dorsalPath = useMemo(() => buildFinPath(geometry.dorsal), [geometry]);
  const pectoralPath = useMemo(() => buildFinPath(geometry.pectoral), [geometry]);

  // Deterministic per-fish phase/speed so the school doesn't beat in unison — stable across
  // re-renders since it only depends on `seed` (the fish's index in the tank).
  const phase = useMemo(() => (seed * PHASE_SPREAD * Math.PI * 2) % (Math.PI * 2), [seed]);
  const speedFactor = useMemo(() => 0.55 + ((seed * 7) % 5) / 5, [seed]);

  // Sick (docs/PLAN.md M4 leave-early penalty): desaturate rather than recolor, so the species'
  // own hue is still recognizable — a fish "looks ill", not like a different fish. Every color
  // below derives from `effectiveSaturation` instead of `species.saturation` directly, so the
  // desaturation is consistent across body/shade/belly.
  const isSick = fish.health === 'sick';
  const effectiveSaturation = isSick
    ? species.saturation * HEALTH.sickSaturationMultiplier
    : species.saturation;

  const bodyColor = hslToHex(species.hue, effectiveSaturation, species.lightness);
  const bodyShade = hslToHex(species.hue, effectiveSaturation, Math.max(species.lightness - 20, 8));
  const belly = hslToHex(
    species.hue,
    Math.max(effectiveSaturation - 32, 8),
    Math.min(species.lightness + 30, 92),
  );

  // Sluggish swim (docs/PLAN.md M4): a lower tail-wag frequency, not a color change alone, is
  // what makes the animation itself read as unwell.
  const wagFrequency = AQUARIUM.tailWagFrequency * (isSick ? HEALTH.sickTailWagMultiplier : 1);

  const { x, y, vx } = kinematics;

  const dir = useDerivedValue(() => (vx.value < 0 ? -1 : 1));
  const wag = useDerivedValue(
    () => Math.sin(elapsed.value * speedFactor * wagFrequency + phase),
  );
  const bodyWag = useDerivedValue(
    () => Math.sin(elapsed.value * speedFactor * wagFrequency + phase - 0.6) * 0.1,
  );
  const bob = useDerivedValue(
    () => Math.sin(elapsed.value * AQUARIUM.bob.speedHz * Math.PI * 2 + phase) * AQUARIUM.bob.amplitudePx,
  );

  const groupTransform = useDerivedValue(() => [
    { translateX: x.value },
    { translateY: y.value + bob.value },
    { rotate: bodyWag.value },
    { scaleX: dir.value },
  ]);

  const tailTransform = useDerivedValue(() => [
    { translateX: geometry.tailHinge.x },
    { translateY: geometry.tailHinge.y },
    { rotate: wag.value * 0.55 },
  ]);
  const dorsalTransform = useDerivedValue(() => [
    { translateX: geometry.dorsalHinge.x },
    { translateY: geometry.dorsalHinge.y },
    { rotate: wag.value * 0.18 },
  ]);
  const pectoralTransform = useDerivedValue(() => [
    { translateX: geometry.pectoralHinge.x },
    { translateY: geometry.pectoralHinge.y },
    { rotate: -wag.value * 0.3 + 0.3 },
  ]);

  return (
    <Group transform={groupTransform}>
      <Group transform={tailTransform}>
        <Path path={tailPath} color={bodyShade} />
      </Group>
      <Group transform={dorsalTransform}>
        <Path path={dorsalPath} color={bodyShade} />
      </Group>
      <Group transform={pectoralTransform} opacity={0.9}>
        <Path path={pectoralPath} color={belly} />
      </Group>

      <Oval
        x={-geometry.bodyRadiusX}
        y={-geometry.bodyRadiusY}
        width={geometry.bodyRadiusX * 2}
        height={geometry.bodyRadiusY * 2}
        color={bodyColor}
      />
      <Oval
        x={geometry.bellyCenter.x - geometry.bellyRadiusX}
        y={geometry.bellyCenter.y - geometry.bellyRadiusY}
        width={geometry.bellyRadiusX * 2}
        height={geometry.bellyRadiusY * 2}
        color={belly}
        opacity={0.55}
      />

      <Circle cx={geometry.eyeCenter.x} cy={geometry.eyeCenter.y} r={geometry.eyeRadius} color={colors.abyss} />
      <Circle
        cx={geometry.eyeHighlight.x}
        cy={geometry.eyeHighlight.y}
        r={geometry.eyeHighlightRadius}
        color="#ffffff"
      />
    </Group>
  );
}
