/**
 * Numeric control points for the procedural fish shape. Pure — no Skia/RN imports — so the
 * parametric-shape math is unit-testable on its own; `src/features/aquarium/Fish.tsx` turns
 * these numbers into actual Skia paths.
 *
 * Proportions are a direct port of the reference canvas fish (the "Full 2D MVP concept" gallery
 * linked from CLAUDE.md), authored against a 56×32 reference body (rx=28, ry=16) and scaled here
 * by `bodyLength`/`bodyHeight` so growth stages are just different parameter sets for the same
 * builder — never different assets.
 */
import type { StageVisualParams } from './model';

export interface Point {
  x: number;
  y: number;
}

/** One quadratic Bézier segment: a control point and an end point, relative to a fin's own
 *  hinge origin (0,0). Mirrors `CanvasRenderingContext2D.quadraticCurveTo`. */
export interface FinSegment {
  cp: Point;
  end: Point;
}

/** A closed fin shape: starts and ends at its own local origin (the hinge). */
export interface FinShape {
  segments: FinSegment[];
}

export interface FishGeometry {
  bodyRadiusX: number;
  bodyRadiusY: number;
  bellyCenter: Point;
  bellyRadiusX: number;
  bellyRadiusY: number;
  eyeCenter: Point;
  eyeRadius: number;
  eyeHighlight: Point;
  eyeHighlightRadius: number;
  /** Where each fin is hinged, in body-local space — the `Group` each fin's shape is nested
   *  under translates to here before rotating with the wag. */
  tailHinge: Point;
  dorsalHinge: Point;
  pectoralHinge: Point;
  tail: FinShape;
  dorsal: FinShape;
  pectoral: FinShape;
}

// Reference body: rx=28, ry=16 (a 56×32 box). Every other reference coordinate below was
// authored against that body and is scaled by kx/ky (plus a fin's own span multiplier).
const REFERENCE_RX = 28;
const REFERENCE_RY = 16;

function point(x: number, y: number, kx: number, ky: number, span: number): Point {
  return { x: x * kx * span, y: y * ky * span };
}

export function buildFishGeometry(params: StageVisualParams): FishGeometry {
  const { bodyLength, bodyHeight, tailSpan, finScale } = params;
  const rx = bodyLength / 2;
  const ry = bodyHeight / 2;
  const kx = rx / REFERENCE_RX;
  const ky = ry / REFERENCE_RY;
  const finK = Math.min(kx, ky);

  const origin: Point = { x: 0, y: 0 };

  const tail: FinShape = {
    segments: [
      { cp: point(-15, -15, kx, ky, tailSpan), end: point(-25, -4, kx, ky, tailSpan) },
      { cp: point(-17, 0, kx, ky, tailSpan), end: point(-25, 4, kx, ky, tailSpan) },
      { cp: point(-15, 15, kx, ky, tailSpan), end: origin },
    ],
  };

  const dorsal: FinShape = {
    segments: [
      { cp: point(4, -13, kx, ky, finScale), end: point(13, -5, kx, ky, finScale) },
      { cp: point(5, -1, kx, ky, finScale), end: origin },
    ],
  };

  const pectoral: FinShape = {
    segments: [
      { cp: point(6, 9, kx, ky, finScale), end: point(13, 7, kx, ky, finScale) },
      { cp: point(6, 3, kx, ky, finScale), end: origin },
    ],
  };

  return {
    bodyRadiusX: rx,
    bodyRadiusY: ry,
    bellyCenter: { x: 2 * kx, y: 6.5 * ky },
    bellyRadiusX: 18 * kx,
    bellyRadiusY: 7 * ky,
    eyeCenter: { x: 19 * kx, y: -3 * ky },
    eyeRadius: 3.2 * finK,
    eyeHighlight: { x: 20 * kx, y: -4.1 * ky },
    eyeHighlightRadius: 1 * finK,
    tailHinge: { x: -rx, y: 0 },
    dorsalHinge: { x: -2 * kx, y: -13 * ky },
    pectoralHinge: { x: 5 * kx, y: 7 * ky },
    tail,
    dorsal,
    pectoral,
  };
}
