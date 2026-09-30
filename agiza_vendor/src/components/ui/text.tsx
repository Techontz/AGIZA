import { Text as RNText, type TextProps } from 'react-native';

import { colors, type as typeScale } from '@/theme/tokens';

type Variant = keyof typeof typeScale;

export function Text({
  variant = 'body',
  color = colors.text,
  style,
  ...props
}: TextProps & { variant?: Variant; color?: string }) {
  return <RNText {...props} style={[typeScale[variant], { color }, style]} />;
}
