/**
 * HSL → hex conversion, pure. Species hues are authored as HSL (easy to reason about — "shift
 * the hue 40°"), but Skia's `Color` prop is safest fed a hex string rather than relying on an
 * `hsl(...)` CSS string being parsed correctly on-device, which cannot be verified without a
 * physical device. See `src/features/pet/geometry.ts` / `src/features/aquarium/Fish.tsx`.
 */
function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function toHex(channel: number): string {
  const v = Math.round(Math.min(255, Math.max(0, channel)));
  return v.toString(16).padStart(2, '0');
}

/** `hue` in [0,360), `saturation`/`lightness` in [0,100]. */
export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = Math.min(100, Math.max(0, saturation)) / 100;
  const l = Math.min(100, Math.max(0, lightness)) / 100;

  if (s === 0) {
    const grey = Math.round(l * 255);
    return `#${toHex(grey)}${toHex(grey)}${toHex(grey)}`;
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hueToRgb(p, q, h + 1 / 3) * 255;
  const g = hueToRgb(p, q, h) * 255;
  const b = hueToRgb(p, q, h - 1 / 3) * 255;
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
