import type { TankSpec } from './tanks';

/**
 * Deterministic swim paths, evaluated as a pure function of (fish index, time).
 *
 * Why closed-form rather than a per-frame simulation: there is no integration state to keep in
 * sync, nothing drifts out of the tank after a few minutes backgrounded, and the cost per fish
 * per frame is a handful of sin/cos. That matters at 60fps on an older phone. Boids-style
 * steering looks better but costs O(n^2) neighbour checks and needs collision handling against
 * the glass — out of scope for a spike.
 */

export interface SwimSample {
  x: number;
  y: number;
  z: number;
  /** Heading in radians around the Y axis, derived from the velocity direction. */
  yaw: number;
  /** Tail-beat phase, 0..2π. Faster fish beat faster. */
  beat: number;
}

/** Per-fish constants derived once from its index — cheap, stable across remounts. */
export interface SwimParams {
  speed: number;
  phase: number;
  /** Frequency multipliers on each axis; irrational-ish ratios stop paths from looking looped. */
  fx: number;
  fy: number;
  fz: number;
  /** 0..1, how far from the tank centre this fish ranges. */
  radius: number;
}

const GOLDEN = 0.618_033_988_75;

export function swimParams(index: number): SwimParams {
  // Golden-ratio stride spreads N fish evenly through parameter space without a random seed,
  // so the same fish always swims the same way across app launches.
  const t = (index * GOLDEN) % 1;
  return {
    speed: 0.22 + t * 0.28,
    phase: t * Math.PI * 2,
    fx: 0.7 + t * 0.5,
    fy: 0.35 + ((index * 2 * GOLDEN) % 1) * 0.4,
    fz: 0.55 + ((index * 3 * GOLDEN) % 1) * 0.6,
    radius: 0.55 + ((index * 5 * GOLDEN) % 1) * 0.4,
  };
}

/** Unit-cube path in [-1, 1]^3, before the tank shape is applied. */
function unitPath(p: SwimParams, time: number): [number, number, number] {
  const t = time * p.speed + p.phase;
  return [
    Math.sin(t * p.fx) * p.radius,
    Math.sin(t * p.fy + 1.3) * p.radius * 0.7,
    Math.cos(t * p.fz) * p.radius,
  ];
}

/**
 * Maps the unit path into the tank's interior. This is the whole trick behind selling tank
 * shapes: the fish behaviour is written once against a unit volume, and each SKU only supplies
 * a containment function.
 */
function contain(tank: TankSpec, u: [number, number, number]): [number, number, number] {
  const [ux, uy, uz] = u;
  const { half } = tank;

  switch (tank.shape) {
    case 'box':
      return [ux * half.x, uy * half.y, uz * half.z];

    case 'cylinder': {
      // Clamp the horizontal component into the circle, leave height alone.
      const r = Math.hypot(ux, uz) || 1;
      const k = Math.min(1, 1 / r);
      return [ux * k * half.x, uy * half.y, uz * k * half.z];
    }

    case 'bowl':
    default: {
      // Squash onto the unit sphere, then scale. Fish never clip the curved glass because the
      // containment is the sphere equation itself, not a per-frame collision test.
      const len = Math.hypot(ux, uy, uz) || 1;
      const k = Math.min(1, 1 / len);
      return [ux * k * half.x, uy * k * half.y * 0.85, uz * k * half.z];
    }
  }
}

const DT = 0.05;

export function sampleSwim(tank: TankSpec, p: SwimParams, time: number): SwimSample {
  const [x, y, z] = contain(tank, unitPath(p, time));
  const [nx, , nz] = contain(tank, unitPath(p, time + DT));

  return {
    x,
    y,
    z,
    // Fish model points along +X, so yaw is measured from that axis.
    yaw: Math.atan2(-(nz - z), nx - x),
    beat: (time * p.speed * 9 + p.phase) % (Math.PI * 2),
  };
}
