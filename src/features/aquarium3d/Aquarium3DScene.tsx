import { Canvas } from '@react-three/fiber/native';

import { Fish3D } from './Fish3D';
import { Tank } from './Tank';
import type { TankSpec } from './tanks';

const PALETTE: Array<[string, string]> = [
  ['#FF8A65', '#FFD166'], // clownfish-ish
  ['#4FD1A5', '#2E8B74'], // green chromis
  ['#5B9BD5', '#F2A65A'], // mandarin-ish
  ['#FFD166', '#E5A50A'], // yellow tang
  ['#C08BE0', '#7E5AA2'],
];

interface Aquarium3DSceneProps {
  tank: TankSpec;
  fishCount: number;
}

export function Aquarium3DScene({ tank, fishCount }: Aquarium3DSceneProps) {
  return (
    <Canvas
      // `frameloop="always"` is the default; the real app should drop to "demand" outside an
      // active session, which is the single biggest battery lever this approach has.
      camera={{ position: [0, 0.6, 5.2], fov: 42 }}
      gl={{ antialias: false }}
      onCreated={({ gl }) => {
        gl.setClearColor('#07131F');
        // The native Canvas deliberately omits the `dpr` prop (it derives DPR from
        // PixelRatio), so capping the backbuffer has to happen here. A 3x Retina buffer is 4x
        // the fill rate of 1.5x for no visible gain at this fidelity, and on an older phone
        // that is the difference between comfortable and hot.
        gl.setPixelRatio(Math.min(1.5, gl.getPixelRatio()));
      }}
    >
      <ambientLight intensity={0.65} />
      <directionalLight position={[2, 4, 3]} intensity={1.1} />
      {/* Cool fill from below fakes light bouncing off the substrate. */}
      <directionalLight position={[-2, -3, -1]} intensity={0.3} color="#5B9BD5" />

      <Tank tank={tank} />

      {Array.from({ length: fishCount }, (_, i) => {
        const [color, accent] = PALETTE[i % PALETTE.length];
        return (
          <Fish3D
            key={i}
            index={i}
            tank={tank}
            color={color}
            accent={accent}
            scale={0.8 + ((i * 7) % 5) * 0.12}
          />
        );
      })}
    </Canvas>
  );
}
