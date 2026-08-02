import { hslToHex } from '../color';

describe('hslToHex', () => {
  it('converts known primary colors', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000');
    expect(hslToHex(120, 100, 50)).toBe('#00ff00');
    expect(hslToHex(240, 100, 50)).toBe('#0000ff');
  });

  it('converts black, white and grey', () => {
    expect(hslToHex(0, 0, 0)).toBe('#000000');
    expect(hslToHex(0, 0, 100)).toBe('#ffffff');
    expect(hslToHex(0, 0, 50)).toBe('#808080');
  });

  it('wraps hue values outside [0, 360)', () => {
    expect(hslToHex(360, 100, 50)).toBe(hslToHex(0, 100, 50));
    expect(hslToHex(-120, 100, 50)).toBe(hslToHex(240, 100, 50));
  });

  it('always returns a 7-character lowercase hex string', () => {
    const hex = hslToHex(12, 62, 56);
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });
});
