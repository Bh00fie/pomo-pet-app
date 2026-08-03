/**
 * Pins the rounded-display-face fix (see CLAUDE.md's "Concept gallery vs. the built app" and
 * `typography.ts`'s doc comment). `jest.config.js`'s Haste config defaults the test platform to
 * `ios` (this is an iOS-only app), so `Platform.select` resolves the `ios` branch here exactly as
 * it would on device — no Platform mocking needed.
 */
import { typography } from '../typography';

describe('typography', () => {
  it('gives the prominent/short faces the rounded system design on iOS', () => {
    expect(typography.display.fontFamily).toBe('ui-rounded');
    expect(typography.title.fontFamily).toBe('ui-rounded');
    expect(typography.heading.fontFamily).toBe('ui-rounded');
  });

  it('keeps body/label/caption on the plain system face', () => {
    expect(typography.body.fontFamily).toBe('System');
    expect(typography.label.fontFamily).toBe('System');
    expect(typography.caption.fontFamily).toBe('System');
  });
});
