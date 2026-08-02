/**
 * Tank catalogue for the 3D spike.
 *
 * The point of this file is the IAP question: can "buy a different tank shape" be expressed as
 * data rather than as a new hand-built scene per SKU? Each entry is a purely numeric description
 * of a container; the renderer and the fish-motion code both read from it, so adding a SKU is
 * adding a record here — no new geometry code, no new swim logic.
 */

export type TankShape = 'box' | 'bowl' | 'cylinder';

export interface TankSpec {
  id: string;
  name: string;
  shape: TankShape;
  /** Interior half-extents in world units. For `bowl`/`cylinder`, x is the radius. */
  half: { x: number; y: number; z: number };
  /** Marketing copy for the shop card. */
  blurb: string;
  /** null = included free with the app; otherwise the mock IAP product id. */
  productId: string | null;
  priceLabel: string;
}

export const TANKS: TankSpec[] = [
  {
    id: 'rectangular',
    name: 'Reef Rectangle',
    shape: 'box',
    half: { x: 2.2, y: 1.3, z: 1.2 },
    blurb: 'The classic glass box. Widest swimming room, best for showing off a full shoal.',
    productId: null,
    priceLabel: 'Included',
  },
  {
    id: 'bowl',
    name: 'Moon Bowl',
    shape: 'bowl',
    half: { x: 1.5, y: 1.5, z: 1.5 },
    blurb: 'A round bowl with an open top. Fish arc around the curve instead of pacing a wall.',
    productId: 'tank.bowl',
    priceLabel: '$1.99',
  },
  {
    id: 'column',
    name: 'Kelp Column',
    shape: 'cylinder',
    half: { x: 1.0, y: 1.9, z: 1.0 },
    blurb: 'Tall and narrow. Fish spiral vertically — reads well on a phone in portrait.',
    productId: 'tank.column',
    priceLabel: '$1.99',
  },
];

export function getTank(id: string): TankSpec {
  return TANKS.find((t) => t.id === id) ?? TANKS[0];
}
