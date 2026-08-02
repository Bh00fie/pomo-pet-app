import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { colors, typography, type ColorToken, type TypographyToken } from '@/theme';

interface TextProps extends RNTextProps {
  variant?: TypographyToken;
  color?: ColorToken;
}

export function Text({ variant = 'body', color = 'text', style, ...rest }: TextProps) {
  const base = typography[variant] as TextStyle;
  return <RNText {...rest} style={[base, { color: colors[color] }, style]} />;
}
