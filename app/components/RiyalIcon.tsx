import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

interface Props {
  size?: number;
  color?: string;
  style?: StyleProp<ImageStyle>;
}

// Saudi Riyal symbol (SAMA), rendered from a bitmap (riyal.png) using tintColor
// so it composes with any text color. Kept as an image rather than an icon font
// because the fontello-generated TTF's private-use glyph didn't render on Android.
// Rendered directly as <Image> (no wrapping View) so it can sit inline inside <Text>.
export default function RiyalIcon({ size = 14, color = '#000', style }: Props) {
  return (
    <Image
      source={require('../assets/icons/riyal.png')}
      style={[{ width: size, height: size, tintColor: color }, style]}
      resizeMode="contain"
    />
  );
}
