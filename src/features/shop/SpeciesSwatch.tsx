import { Canvas, Circle, Group, Oval, Path, Rect, Skia, type SkPath } from '@shopify/react-native-skia';
import { useMemo } from 'react';

import { HEALTH } from '@/config';
import { buildFishGeometry, getSpecies, hslToHex, type FinShape, type SpeciesId } from '@/features/pet';
import { colors } from '@/theme';

export interface SpeciesSwatchProps {
  speciesId: SpeciesId;
  size?: number;
  /**
   * Renders desaturated and dimmed — the "enticing but not giving away the full look" treatment
   * for a locked species (docs/PLAN.md M6a). Deliberately reuses `HEALTH.sickSaturationMultiplier`,
   * the exact constant the M4 sick-fish visual already established, rather than inventing a
   * second desaturation rule for the shop — see the concept-gallery shop mockup's `.locked`
   * treatment (grayscale thumbnail) for the same idea applied to real data instead of a filter.
   */
  locked?: boolean;
}

function buildFinPath(shape: FinShape): SkPath {
  const path = Skia.Path.Make();
  path.moveTo(0, 0);
  for (const segment of shape.segments) {
    path.quadTo(segment.cp.x, segment.cp.y, segment.end.x, segment.end.y);
  }
  path.close();
  return path;
}

/**
 * A small, static preview of a species' Elder-stage look — used by the Shop list. Deliberately
 * not the animated `FishSprite`: nothing here swims, so it needs none of that component's
 * Reanimated kinematics or the tank's shared clock, just one Skia `Canvas` worth of static paths
 * built from the same parametric system (`buildFishGeometry`/`hslToHex`) every other fish uses.
 */
export function SpeciesSwatch({ speciesId, size = 44, locked = false }: SpeciesSwatchProps) {
  const species = getSpecies(speciesId);
  const stageParams = species.stageParams.elder;

  const geometry = useMemo(() => buildFishGeometry(stageParams), [stageParams]);
  const tailPath = useMemo(() => buildFinPath(geometry.tail), [geometry]);
  const dorsalPath = useMemo(() => buildFinPath(geometry.dorsal), [geometry]);
  // `null` for every species with no `pattern` (still all but the clownfish), so nothing extra is
  // allocated for them — see `Fish.tsx`'s identical treatment.
  const bodyClipPath = useMemo(() => {
    if (geometry.stripes.length === 0) return null;
    const path = Skia.Path.Make();
    path.addOval({
      x: -geometry.bodyRadiusX,
      y: -geometry.bodyRadiusY,
      width: geometry.bodyRadiusX * 2,
      height: geometry.bodyRadiusY * 2,
    });
    return path;
  }, [geometry]);

  const saturation = locked ? species.saturation * HEALTH.sickSaturationMultiplier : species.saturation;
  const bodyColor = hslToHex(species.hue, saturation, species.lightness);
  const bodyShade = hslToHex(species.hue, saturation, Math.max(species.lightness - 20, 8));

  // Fit the Elder-stage body inside the swatch regardless of the species' own proportions —
  // Indigo Betta's longer fins and Golden Koi's bigger body would otherwise clip at different
  // rates per species.
  const scale = (size * 0.42) / geometry.bodyRadiusX;
  const center = size / 2;

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group
        transform={[{ translateX: center }, { translateY: center }, { scale }]}
        opacity={locked ? 0.75 : 1}
      >
        <Group transform={[{ translateX: geometry.tailHinge.x }, { translateY: geometry.tailHinge.y }]}>
          <Path path={tailPath} color={bodyShade} />
        </Group>
        <Group transform={[{ translateX: geometry.dorsalHinge.x }, { translateY: geometry.dorsalHinge.y }]}>
          <Path path={dorsalPath} color={bodyShade} />
        </Group>
        <Oval
          x={-geometry.bodyRadiusX}
          y={-geometry.bodyRadiusY}
          width={geometry.bodyRadiusX * 2}
          height={geometry.bodyRadiusY * 2}
          color={bodyColor}
        />
        {bodyClipPath && (
          <Group clip={bodyClipPath}>
            {geometry.stripes.map((band, i) => (
              <Group key={i}>
                <Rect
                  x={band.x - band.width / 2 - band.edgeWidth}
                  y={-geometry.bodyRadiusY * 1.1}
                  width={band.width + band.edgeWidth * 2}
                  height={geometry.bodyRadiusY * 2.2}
                  color={colors.abyss}
                />
                <Rect
                  x={band.x - band.width / 2}
                  y={-geometry.bodyRadiusY * 1.1}
                  width={band.width}
                  height={geometry.bodyRadiusY * 2.2}
                  color="#ffffff"
                />
              </Group>
            ))}
          </Group>
        )}
        <Circle cx={geometry.eyeCenter.x} cy={geometry.eyeCenter.y} r={geometry.eyeRadius} color={colors.abyss} />
      </Group>
    </Canvas>
  );
}
