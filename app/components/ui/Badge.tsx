import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { R, S, T, tones, Tone, toneForName, initials } from '../../theme/tokens';
import Txt from './Txt';

/** Rounded status label: Paid, Unpaid, Open, Closed, NEW… */
export function Pill({ label, tone = 'neutral', dot, style }: {
  label: string; tone?: Tone; dot?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const t = tones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }, style]}>
      {dot ? <View style={[styles.dot, { backgroundColor: t.solid }]} /> : null}
      <Txt variant="small" weight="semibold" color={t.fg} numberOfLines={1}>{label}</Txt>
    </View>
  );
}

/** Small round number (tab counts, cart count, Online 2). */
export function CountBadge({ value, tone = 'brand', size = 24, style }: {
  value: number | string; tone?: Tone; size?: number; style?: StyleProp<ViewStyle>;
}) {
  const t = tones[tone];
  return (
    <View style={[styles.count, { minWidth: size, height: size, borderRadius: size / 2, backgroundColor: t.bg }, style]}>
      <Txt weight="bold" size={size >= 30 ? T.body : size >= 24 ? T.caption : T.small} color={t.fg}>{value}</Txt>
    </View>
  );
}

/** Initials circle with a stable colour per name. */
export function Avatar({ name, label, size = 34, tone }: { name?: string | null; label?: string; size?: number; tone?: Tone }) {
  const t = tones[tone ?? toneForName(name)];
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg }]}>
      <Txt weight="bold" size={Math.round(size * 0.36)} color={t.fg}>{label ?? initials(name)}</Txt>
    </View>
  );
}

/** Coloured dot + label (legends, Live indicator). */
export function StatusDot({ color, label, size = 8 }: { color: string; label?: string; size?: number }) {
  return (
    <View style={styles.dotRow}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
      {label ? <Txt variant="caption" weight="medium">{label}</Txt> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: R.pill },
  dot: { width: 7, height: 7, borderRadius: 4 },
  count: { paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
});

