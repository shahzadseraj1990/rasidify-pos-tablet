import React from 'react';
import { Text, TextStyle, StyleProp, StyleSheet } from 'react-native';
import RiyalIcon from './RiyalIcon';
import { fmt } from '../utils/format';

interface Props {
  amount: number | undefined | null;
  currency?: string;
  style?: StyleProp<TextStyle>;
  prefix?: string; // e.g. '- ' or '+ '
  color?: string;
}

// Renders "<riyal glyph> 12.00" for SAR, or "USD 12.00" for any other currency.
// Use everywhere an amount is shown instead of manually prefixing `${currency} `.
export default function Money({ amount, currency = 'SAR', style, prefix = '', color }: Props) {
  const flat = StyleSheet.flatten(style);
  const fontSize = (flat?.fontSize as number) ?? 13;
  const textColor = color ?? (flat?.color as string) ?? '#111';

  if (currency === 'SAR') {
    return (
      <Text style={style}>
        {prefix}
        <RiyalIcon size={fontSize * 0.85} color={textColor} /> {fmt(amount ?? 0)}
      </Text>
    );
  }
  return (
    <Text style={style}>
      {prefix}{currency} {fmt(amount ?? 0)}
    </Text>
  );
}
