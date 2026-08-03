import { Platform } from 'react-native';

/**
 * `'ui-rounded'` is not a bundled font, and not Apple's actual SF Pro Rounded TTF either — it is
 * one of the CSS Fonts Level 4 generic family keywords (`ui-serif`/`ui-monospace`/`ui-rounded`),
 * and RN's own iOS text layout manager special-cases it:
 * `RCTFontUtils.mm`'s `RCTGetFontDescriptorSystemDesign` maps the string straight to
 * `UIFontDescriptorSystemDesignRounded`, then asks the system font's own descriptor for that
 * design (`-[UIFontDescriptor fontDescriptorWithDesign:]`) — Apple's own sanctioned, documented
 * API for reaching the rounded system face. Confirmed by reading that file in this project's own
 * `node_modules/react-native` (0.81), not assumed from a blog post.
 *
 * This matters because Apple's font license restricts the actual SF Pro Rounded font files to UI
 * mockups/previews — they may not be embedded in a shipped app. `'ui-rounded'` needs no font file
 * at all: iOS resolves the design from whatever system font is already on the device, so there is
 * nothing to bundle and nothing to license. The previous claim in CLAUDE.md ("React Native has no
 * reliable way to reach the rounded system face without bundling a font file") was wrong — this
 * is that way.
 */
const displayFamily = Platform.select({ ios: 'ui-rounded', default: 'sans-serif-medium' });
const family = Platform.select({ ios: 'System', default: 'sans-serif' });

export const typography = {
  // Rounded: the concept gallery's warmer feel came largely from a rounded display face
  // (docs/PLAN.md's "Concept gallery vs. the built app"). Reserved for the prominent/short text —
  // the clock, headings, titles — where a rounded design reads as warm rather than as a
  // legibility cost; body/label/caption keep the plain system face for longer, smaller text.
  display: { fontFamily: displayFamily, fontSize: 64, fontWeight: '200' as const, letterSpacing: -1 },
  title: { fontFamily: displayFamily, fontSize: 24, fontWeight: '600' as const },
  heading: { fontFamily: displayFamily, fontSize: 18, fontWeight: '600' as const },
  body: { fontFamily: family, fontSize: 15, fontWeight: '400' as const },
  label: { fontFamily: family, fontSize: 13, fontWeight: '500' as const, letterSpacing: 0.3 },
  caption: { fontFamily: family, fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.6 },
} as const;

export type TypographyToken = keyof typeof typography;
