import { Platform } from 'react-native';

const family = Platform.select({ ios: 'System', default: 'sans-serif' });

export const typography = {
  display: { fontFamily: family, fontSize: 64, fontWeight: '200' as const, letterSpacing: -1 },
  title: { fontFamily: family, fontSize: 24, fontWeight: '600' as const },
  heading: { fontFamily: family, fontSize: 18, fontWeight: '600' as const },
  body: { fontFamily: family, fontSize: 15, fontWeight: '400' as const },
  label: { fontFamily: family, fontSize: 13, fontWeight: '500' as const, letterSpacing: 0.3 },
  caption: { fontFamily: family, fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.6 },
} as const;

export type TypographyToken = keyof typeof typography;
