import type { TankSpec } from './tanks';

/**
 * The glass container. Rendered as a single transparent shell plus a floor — no refraction, no
 * transmission material. `meshPhysicalMaterial` with `transmission` looks far better and costs
 * an extra full-scene render pass per frame, which is exactly the kind of thing that turns a
 * 60fps scene into a 25fps one on an iPhone 11. Noted as the obvious upgrade if 3D is pursued.
 */

const GLASS = '#9FD8F0';

export function Tank({ tank }: { tank: TankSpec }) {
  const { half } = tank;

  return (
    <group>
      {tank.shape === 'box' && (
        <mesh>
          <boxGeometry args={[half.x * 2, half.y * 2, half.z * 2]} />
          <meshStandardMaterial
            color={GLASS}
            transparent
            opacity={0.12}
            roughness={0.05}
            metalness={0.1}
          />
        </mesh>
      )}

      {tank.shape === 'bowl' && (
        <mesh>
          {/* phiLength/thetaLength leave the top open, like a real bowl. */}
          <sphereGeometry args={[half.x, 32, 24, 0, Math.PI * 2, 0.5, Math.PI - 0.5]} />
          <meshStandardMaterial
            color={GLASS}
            transparent
            opacity={0.14}
            roughness={0.05}
            side={2 /* THREE.DoubleSide */}
          />
        </mesh>
      )}

      {tank.shape === 'cylinder' && (
        <mesh>
          <cylinderGeometry args={[half.x, half.x, half.y * 2, 28, 1, true]} />
          <meshStandardMaterial
            color={GLASS}
            transparent
            opacity={0.13}
            roughness={0.05}
            side={2}
          />
        </mesh>
      )}

      {/* Substrate — a dark disc/plane so fish have something to read depth against. */}
      <mesh position={[0, -half.y + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        {tank.shape === 'box' ? (
          <planeGeometry args={[half.x * 2, half.z * 2]} />
        ) : (
          <circleGeometry args={[half.x * 0.95, 28]} />
        )}
        <meshStandardMaterial color="#123246" roughness={1} />
      </mesh>

      {/* A few rocks + a branching coral stand-in, so the tank is not empty. */}
      <Decor tank={tank} />
    </group>
  );
}

function Decor({ tank }: { tank: TankSpec }) {
  const floor = -tank.half.y + 0.02;
  const spread = tank.half.x * 0.6;

  return (
    <group>
      {[-1, 0, 1].map((i) => (
        <mesh key={i} position={[i * spread * 0.7, floor + 0.07, -tank.half.z * 0.3]}>
          <dodecahedronGeometry args={[0.11 + Math.abs(i) * 0.04, 0]} />
          <meshStandardMaterial color="#2A4A5E" flatShading roughness={0.9} />
        </mesh>
      ))}

      {/* Branching coral: three stacked cones, the low-poly stand-in for a real asset. */}
      <group position={[-spread, floor, tank.half.z * 0.25]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[i * 0.07 - 0.07, 0.12 + i * 0.06, 0]} rotation={[0, 0, (i - 1) * 0.25]}>
            <coneGeometry args={[0.045, 0.24 + i * 0.08, 5]} />
            <meshStandardMaterial color="#E0715C" flatShading roughness={0.8} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
