import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { C, F, T, FontWeight } from '../../theme/tokens';

// The one text component for the redesign: picks the Poppins family from
// `weight` (Android ignores fontWeight on custom fonts) and the size from the
// type scale, so screens never hard-code font names or sizes.
export type TxtVariant = keyof typeof T;

const DEFAULT_WEIGHT: Record<TxtVariant, FontWeight> = {
  display: 'bold', h1: 'bold', h2: 'bold', h3: 'bold', title: 'semibold',
  body: 'regular', label: 'semibold', caption: 'regular', small: 'medium', micro: 'semibold',
};

export interface TxtProps extends TextProps {
  variant?: TxtVariant;
  weight?: FontWeight;
  color?: string;
  align?: 'left' | 'center' | 'right';
  size?: number;
}

export default function Txt({ variant = 'body', weight, color, align, size, style, ...rest }: TxtProps) {
  return (
    <Text
      {...rest}
      style={[
        styles.base,
        { fontFamily: F[weight ?? DEFAULT_WEIGHT[variant]], fontSize: size ?? T[variant] },
        color != null && { color },
        align != null && { textAlign: align },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  // includeFontPadding off: Poppins' tall ascender otherwise pushes text
  // visibly low inside buttons and pills on Android.
  base: { color: C.text, includeFontPadding: false, fontVariant: ['tabular-nums'] },
});
