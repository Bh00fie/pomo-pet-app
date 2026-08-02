import {
  GOLDEN_KOI_SPECIES_ID,
  INDIGO_BETTA_SPECIES_ID,
  SPECIES,
  STARTER_SPECIES_ID,
} from '../model';
import { buildFishGeometry } from '../geometry';
import { STAGES } from '@/config';

const REFERENCE = { bodyLength: 56, bodyHeight: 32, tailSpan: 1, dorsalFinScale: 1, pectoralFinScale: 1 };

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
    const fry = buildFishGeometry({ bodyLength: 30, bodyHeight: 18, tailSpan: 0.72, dorsalFinScale: 0.7, pectoralFinScale: 0.7 });
    const elder = buildFishGeometry({ bodyLength: 64, bodyHeight: 36, tailSpan: 1.15, dorsalFinScale: 1.1, pectoralFinScale: 1.1 });
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

  it('dorsalFinScale and pectoralFinScale each scale their own fin but not the tail', () => {
    const smallFins = buildFishGeometry({ ...REFERENCE, dorsalFinScale: 0.5, pectoralFinScale: 0.5 });
    const bigFins = buildFishGeometry({ ...REFERENCE, dorsalFinScale: 2, pectoralFinScale: 2 });

    const smallDorsalReach = Math.hypot(smallFins.dorsal.segments[0].end.x, smallFins.dorsal.segments[0].end.y);
    const bigDorsalReach = Math.hypot(bigFins.dorsal.segments[0].end.x, bigFins.dorsal.segments[0].end.y);
    expect(bigDorsalReach).toBeGreaterThan(smallDorsalReach);

    // Tail is unaffected by fin scale.
    expect(smallFins.tail).toEqual(bigFins.tail);
  });

  it('dorsalFinScale and pectoralFinScale are independent — a big dorsal with a modest pectoral '
    + 'is a shape the old shared finScale could never express', () => {
    const sharkLike = buildFishGeometry({ ...REFERENCE, dorsalFinScale: 2.2, pectoralFinScale: 0.6 });
    const evenFins = buildFishGeometry({ ...REFERENCE, dorsalFinScale: 1, pectoralFinScale: 1 });

    const sharkDorsalReach = Math.hypot(sharkLike.dorsal.segments[0].end.x, sharkLike.dorsal.segments[0].end.y);
    const evenDorsalReach = Math.hypot(evenFins.dorsal.segments[0].end.x, evenFins.dorsal.segments[0].end.y);
    expect(sharkDorsalReach).toBeGreaterThan(evenDorsalReach);

    const sharkPectoralReach = Math.hypot(sharkLike.pectoral.segments[0].end.x, sharkLike.pectoral.segments[0].end.y);
    const evenPectoralReach = Math.hypot(evenFins.pectoral.segments[0].end.x, evenFins.pectoral.segments[0].end.y);
    expect(sharkPectoralReach).toBeLessThan(evenPectoralReach);
  });

  it('every fin shape closes back to its own local origin', () => {
    const g = buildFishGeometry(REFERENCE);
    for (const fin of [g.tail, g.dorsal, g.pectoral]) {
      const last = fin.segments[fin.segments.length - 1];
      expect(last.end).toEqual({ x: 0, y: 0 });
    }
  });

  describe('the three original species are pixel-parameter-identical after the finScale split', () => {
    // Before the split every species had one `finScale` feeding both the dorsal and pectoral fin.
    // These three species now carry `dorsalFinScale`/`pectoralFinScale` set to that same old value
    // at every stage (see `model.ts`) — so re-deriving "what the old single-finScale geometry would
    // have produced" and comparing against the real per-species output proves the split changed no
    // existing species' rendered shape.
    it.each([STARTER_SPECIES_ID, GOLDEN_KOI_SPECIES_ID, INDIGO_BETTA_SPECIES_ID])('%s', (speciesId) => {
      const species = SPECIES[speciesId];
      for (const stage of STAGES) {
        const params = species.stageParams[stage];
        expect(params.dorsalFinScale).toBe(params.pectoralFinScale);

        const oldStyleFinScale = params.dorsalFinScale;
        const expected = buildFishGeometry({
          bodyLength: params.bodyLength,
          bodyHeight: params.bodyHeight,
          tailSpan: params.tailSpan,
          dorsalFinScale: oldStyleFinScale,
          pectoralFinScale: oldStyleFinScale,
        });
        const actual = buildFishGeometry(params);
        expect(actual).toEqual(expected);
        // And the tail is the pre-split rounded paddle, not the new crescent shape.
        expect(actual.tail).toEqual(
          buildFishGeometry({ ...params, tailShape: 'rounded' }).tail,
        );
      }
    });
  });

  describe('tailShape', () => {
    it('defaults to the original rounded tail when omitted', () => {
      const withoutShape = buildFishGeometry(REFERENCE);
      const explicitlyRounded = buildFishGeometry({ ...REFERENCE, tailShape: 'rounded' });
      expect(withoutShape.tail).toEqual(explicitlyRounded.tail);
    });

    it('crescent produces a different tail shape than rounded, at the same scale', () => {
      const rounded = buildFishGeometry({ ...REFERENCE, tailShape: 'rounded' });
      const crescent = buildFishGeometry({ ...REFERENCE, tailShape: 'crescent' });
      expect(crescent.tail).not.toEqual(rounded.tail);
    });

    it('does not affect the body, fins, or hinge positions — only the tail shape changes', () => {
      const rounded = buildFishGeometry({ ...REFERENCE, tailShape: 'rounded' });
      const crescent = buildFishGeometry({ ...REFERENCE, tailShape: 'crescent' });
      expect(crescent.bodyRadiusX).toBe(rounded.bodyRadiusX);
      expect(crescent.bodyRadiusY).toBe(rounded.bodyRadiusY);
      expect(crescent.dorsal).toEqual(rounded.dorsal);
      expect(crescent.pectoral).toEqual(rounded.pectoral);
      expect(crescent.tailHinge).toEqual(rounded.tailHinge);
    });
  });

  describe('pattern (stripe overlay)', () => {
    it('produces no stripes when omitted — every species before the clownfish stays this way', () => {
      const g = buildFishGeometry(REFERENCE);
      expect(g.stripes).toEqual([]);
    });

    it("'stripes' produces 2-3 bands with positive width, spread across the body", () => {
      const g = buildFishGeometry({ ...REFERENCE, pattern: 'stripes' });
      expect(g.stripes.length).toBeGreaterThanOrEqual(2);
      expect(g.stripes.length).toBeLessThanOrEqual(3);
      for (const band of g.stripes) {
        expect(band.width).toBeGreaterThan(0);
        expect(band.edgeWidth).toBeGreaterThan(0);
      }
      // Distinct x positions — otherwise they'd all draw on top of each other.
      const xs = g.stripes.map((b) => b.x);
      expect(new Set(xs).size).toBe(xs.length);
    });

    it('scales stripe bands with body size, same as every other geometry field', () => {
      const small = buildFishGeometry({ ...REFERENCE, bodyLength: 28, pattern: 'stripes' });
      const big = buildFishGeometry({ ...REFERENCE, bodyLength: 112, pattern: 'stripes' });
      expect(big.stripes[0].width).toBeGreaterThan(small.stripes[0].width);
    });

    it('does not affect body, fin, or tail geometry — the pattern is a pure overlay', () => {
      const plain = buildFishGeometry(REFERENCE);
      const striped = buildFishGeometry({ ...REFERENCE, pattern: 'stripes' });
      expect(striped.bodyRadiusX).toBe(plain.bodyRadiusX);
      expect(striped.tail).toEqual(plain.tail);
      expect(striped.dorsal).toEqual(plain.dorsal);
      expect(striped.pectoral).toEqual(plain.pectoral);
    });
  });
});
