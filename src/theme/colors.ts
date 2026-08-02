/**
 * Palette. Deliberately aquarium-flavoured: deep water background, warm coral accents.
 * Kept as flat tokens so the Skia renderer and the RN UI layer can share exact values.
 */
export const colors = {
  // Water / surfaces
  abyss: '#04101A',
  deep: '#07131F',
  surface: '#0E2033',
  surfaceRaised: '#16304A',
  glass: 'rgba(255,255,255,0.06)',

  // Text
  text: '#EAF4FF',
  textMuted: '#8FA9C2',
  textFaint: '#5B7488',

  // Accents
  coral: '#FF8A65',
  coralDeep: '#E5613C',
  kelp: '#4FD1A5',
  sun: '#FFD166',
  danger: '#FF5C7A',

  // States
  sick: '#6B7A85',
  outline: 'rgba(143,169,194,0.22)',
} as const;

export type ColorToken = keyof typeof colors;
