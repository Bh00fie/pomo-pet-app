import { buildFishGeometry } from '../geometry';

const REFERENCE = { bodyLength: 56, bodyHeight: 32, tailSpan: 1, finScale: 1 };

describe('buildFishGeometry', () => {
  it('matches the reference proportions at scale 1', () => {
    const g = buildFishGeometry(REFERENCE);
    expect(g.bodyRadiusX).toBe(28);
    expect(g.bodyRadiusY).toBe(16);
    expect(g.tailHinge).toEqual({ x: -28, y: 0 });
    expect(g.eyeCenter).toEqual({ x: 19, y: -3 });
  });

  it('scales body radii linearly with bodyLength/bodyHeight', () => {
    const doubled = buildFishGeometry({ ...REFERENCE, bodyLength: 112, bodyHeight: 64 });
    expect(doubled.bodyRadiusX).toBe(56);
    expect(doubled.bodyRadiusY).toBe(32);
  });

  it('a bigger stage (Elder-like params) produces a bigger body than a smaller stage (Fry-like params)', () => {
    const fry = buildFishGeometry({ bodyLength: 30, bodyHeight: 18, tailSpan: 0.72, finScale: 0.7 });
    const elder = buildFishGeometry({ bodyLength: 64, bodyHeight: 36, tailSpan: 1.15, finScale: 1.1 });
    expect(elder.bodyRadiusX).toBeGreaterThan(fry.bodyRadiusX);
    expect(elder.bodyRadiusY).toBeGreaterThan(fry.bodyRadiusY);
  });

  it('tailSpan scales the tail fin points but not the body or the hinge position', () => {
    const short = buildFishGeometry({ ...REFERENCE, tailSpan: 0.5 });
    const long = buildFishGeometry({ ...REFERENCE, tailSpan: 2 });

    expect(short.bodyRadiusX).toBe(long.bodyRadiusX);
    expect(short.tailHinge).toEqual(long.tailHinge);

    const shortReach = Math.hypot(short.tail.segments[0].end.x, short.tail.segments[0].end.y);
    const longReach = Math.hypot(long.tail.segments[0].end.x, long.tail.segments[0].end.y);
    expect(longReach).toBeGreaterThan(shortReach);
  });

  it('finScale scales the dorsal/pectoral fins but not the tail', () => {
    const smallFins = buildFishGeometry({ ...REFERENCE, finScale: 0.5 });
    const bigFins = buildFishGeometry({ ...REFERENCE, finScale: 2 });

    const smallDorsalReach = Math.hypot(smallFins.dorsal.segments[0].end.x, smallFins.dorsal.segments[0].end.y);
    const bigDorsalReach = Math.hypot(bigFins.dorsal.segments[0].end.x, bigFins.dorsal.segments[0].end.y);
    expect(bigDorsalReach).toBeGreaterThan(smallDorsalReach);

    // Tail is unaffected by finScale.
    expect(smallFins.tail).toEqual(bigFins.tail);
  });

  it('every fin shape closes back to its own local origin', () => {
    const g = buildFishGeometry(REFERENCE);
    for (const fin of [g.tail, g.dorsal, g.pectoral]) {
      const last = fin.segments[fin.segments.length - 1];
      expect(last.end).toEqual({ x: 0, y: 0 });
    }
  });
});
