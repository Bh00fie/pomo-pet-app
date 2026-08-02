import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import type { Group, Mesh } from 'three';

import { sampleSwim, swimParams } from './swim';
import type { TankSpec } from './tanks';

/**
 * A deliberately low-poly fish: two cones and a couple of flattened spheres, ~140 triangles.
 * No glTF, no rig, no texture — this is a technical spike, and the point is to measure what the
 * pipeline costs, not to ship art. Real art would be a single glTF with a two-bone tail.
 */

interface Fish3DProps {
  index: number;
  tank: TankSpec;
  color: string;
  accent: string;
  scale?: number;
}

export function Fish3D({ index, tank, color, accent, scale = 1 }: Fish3DProps) {
  const group = useRef<Group>(null);
  const tail = useRef<Mesh>(null);
  const params = useMemo(() => swimParams(index), [index]);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;

    const s = sampleSwim(tank, params, clock.elapsedTime);
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = s.yaw;
    // Body roll on turns — cheap, and it is most of what sells "alive" at this fidelity.
    g.rotation.z = Math.sin(s.beat) * 0.08;

    if (tail.current) tail.current.rotation.y = Math.sin(s.beat) * 0.5;
  });

  return (
    <group ref={group} scale={scale}>
      {/* Body — a cone pointing +X reads as a fish silhouette from any angle. */}
      <mesh rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.09, 0.32, 7]} />
        <meshStandardMaterial color={color} flatShading roughness={0.45} />
      </mesh>

      {/* Tail — hinged at the back of the body so the yaw wag looks like a beat. */}
      <mesh ref={tail} position={[-0.16, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[-0.06, 0, 0]}>
          <coneGeometry args={[0.09, 0.14, 4]} />
          <meshStandardMaterial color={accent} flatShading roughness={0.5} />
        </mesh>
      </mesh>

      {/* Dorsal fin */}
      <mesh position={[-0.02, 0.08, 0]} rotation={[0, 0, 0.2]}>
        <coneGeometry args={[0.05, 0.09, 3]} />
        <meshStandardMaterial color={accent} flatShading />
      </mesh>

      {/* Eye */}
      <mesh position={[0.1, 0.03, 0.05]}>
        <sphereGeometry args={[0.022, 6, 6]} />
        <meshStandardMaterial color="#0B0B0B" />
      </mesh>
    </group>
  );
}
