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

/** One vertical pattern band, in body-local space (`Fish.tsx`/`SpeciesSwatch.tsx` clip these to
 *  the body oval and draw a dark edge then a white fill — see `StageVisualParams.pattern`). */
export interface StripeBand {
  /** Horizontal center of the band. */
  x: number;
  /** Width of the white fill. */
  width: number;
  /** Extra width added on each side for the dark edge, drawn underneath the fill. */
  edgeWidth: number;
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
  /** Empty for every species with no `pattern` — the three original species pass an empty array
   *  through unchanged, so consumers can always map over it without a conditional. */
  stripes: StripeBand[];
}

// Reference body: rx=28, ry=16 (a 56×32 box). Every other reference coordinate below was
// authored against that body and is scaled by kx/ky (plus a fin's own span multiplier).
const REFERENCE_RX = 28;
const REFERENCE_RY = 16;

function point(x: number, y: number, kx: number, ky: number, span: number): Point {
  return { x: x * kx * span, y: y * ky * span };
}

// A shark-style heterocercal tail: a longer, pointed upper lobe and a shorter lower lobe with a
// deep concave notch between them (the "crescent moon" silhouette), as opposed to the single
// rounded paddle every other species uses. Selected per-species via `tailShape: 'crescent'` —
// everything else about the fin (hinge, wag animation) is untouched.
function buildCrescentTail(kx: number, ky: number, tailSpan: number, origin: Point): FinShape {
  return {
    segments: [
      { cp: point(-20, -22, kx, ky, tailSpan), end: point(-34, -7, kx, ky, tailSpan) },
      { cp: point(-13, -1, kx, ky, tailSpan), end: point(-30, 9, kx, ky, tailSpan) },
      { cp: point(-19, 15, kx, ky, tailSpan), end: origin },
    ],
  };
}

function buildRoundedTail(kx: number, ky: number, tailSpan: number, origin: Point): FinShape {
  return {
    segments: [
      { cp: point(-15, -15, kx, ky, tailSpan), end: point(-25, -4, kx, ky, tailSpan) },
      { cp: point(-17, 0, kx, ky, tailSpan), end: point(-25, 4, kx, ky, tailSpan) },
      { cp: point(-15, 15, kx, ky, tailSpan), end: origin },
    ],
  };
}

// Clownfish's white bands only — this app supports exactly one pattern, so this is one function
// with fixed band count/spacing, not a configurable pattern system. A second pattern would mean
// a second function like this one, not a new knob here.
function buildStripeBands(rx: number): StripeBand[] {
  const fractions = [-0.5, 0.02, 0.56];
  return fractions.map((f) => ({ x: f * rx, width: rx * 0.26, edgeWidth: rx * 0.07 }));
}

export function buildFishGeometry(params: StageVisualParams): FishGeometry {
  const { bodyLength, bodyHeight, tailSpan, dorsalFinScale, pectoralFinScale, tailShape, pattern } = params;
  const rx = bodyLength / 2;
  const ry = bodyHeight / 2;
  const kx = rx / REFERENCE_RX;
  const ky = ry / REFERENCE_RY;
  const finK = Math.min(kx, ky);

  const origin: Point = { x: 0, y: 0 };

  const tail: FinShape =
    tailShape === 'crescent'
      ? buildCrescentTail(kx, ky, tailSpan, origin)
      : buildRoundedTail(kx, ky, tailSpan, origin);

  const dorsal: FinShape = {
    segments: [
      { cp: point(4, -13, kx, ky, dorsalFinScale), end: point(13, -5, kx, ky, dorsalFinScale) },
      { cp: point(5, -1, kx, ky, dorsalFinScale), end: origin },
    ],
  };

  const pectoral: FinShape = {
    segments: [
      { cp: point(6, 9, kx, ky, pectoralFinScale), end: point(13, 7, kx, ky, pectoralFinScale) },
      { cp: point(6, 3, kx, ky, pectoralFinScale), end: origin },
    ],
  };

  const stripes: StripeBand[] = pattern === 'stripes' ? buildStripeBands(rx) : [];

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
    stripes,
  };
}
