import React from 'react';
import { StyleSheet, ActivityIndicator, View, StyleProp, ViewStyle } from 'react-native';
import { C, H, R, S, T, palette, tones, Tone } from '../../theme/tokens';
import Txt from './Txt';
import Glyph, { GlyphName } from './Glyph';
import Tap from './Tap';

// Every button in the redesign. Look comes from `variant` + `size`; add a new
// variant here rather than styling a Pressable in a screen.
//
// Built on <Tap>: see Tap.tsx for why `disabled` never reaches the native view.
export type ButtonVariant = 'primary' | 'dark' | 'outline' | 'soft' | 'ghost' | 'danger' | 'dangerSoft' | 'dashed';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const VARIANTS: Record<ButtonVariant, { bg: string; fg: string; border?: string; dashed?: boolean }> = {
  primary: { bg: C.brand, fg: C.textOnBrand },
  dark: { bg: palette.ink, fg: palette.white },
  outline: { bg: C.surface, fg: C.text, border: C.border },
  soft: { bg: C.brandTint, fg: C.brand },
  ghost: { bg: 'transparent', fg: C.textMuted },
  danger: { bg: C.danger, fg: palette.white },
  dangerSoft: { bg: C.dangerBg, fg: C.dangerText, border: palette.redLine },
  dashed: { bg: C.surface, fg: C.text, border: palette.lineDashed, dashed: true },
};

const SIZES: Record<ButtonSize, { h: number; px: number; font: number; icon: number; radius: number }> = {
  sm: { h: H.sm, px: S.md, font: T.label, icon: 18, radius: R.md },
  md: { h: H.md, px: S.lg, font: T.label, icon: 20, radius: R.lg },
  lg: { h: H.lg, px: S.xl, font: T.title, icon: 22, radius: R.xl },
  xl: { h: H.xl, px: S.xxl, font: 19, icon: 24, radius: R.xxl },
};

export interface ButtonProps {
  label?: string;
  icon?: GlyphName;
  iconRight?: GlyphName;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  block?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export default function Button({
  label, icon, iconRight, onPress, variant = 'primary', size = 'md',
  disabled, loading, block, style, children,
}: ButtonProps) {
  const v = VARIANTS[variant];
  const s = SIZES[size];
  const off = disabled || loading;
  const fg = off && variant === 'primary' ? C.disabledText : v.fg;
  return (
    <Tap
      onPress={onPress}
      disabled={off}
      style={[
        styles.base,
        { height: s.h, paddingHorizontal: s.px, borderRadius: s.radius, backgroundColor: v.bg },
        v.border != null && { borderWidth: 1, borderColor: v.border, borderStyle: v.dashed ? 'dashed' : 'solid' },
        off && variant === 'primary' && { backgroundColor: C.disabledBg },
        off && variant !== 'primary' && styles.dim,
        block && styles.block,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} size="small" /> : (
        <>
          {icon ? <Glyph name={icon} size={s.icon} color={fg} /> : null}
          {label ? <Txt weight="semibold" size={s.font} color={fg} numberOfLines={1}>{label}</Txt> : null}
          {children}
          {iconRight ? <Glyph name={iconRight} size={s.icon} color={fg} /> : null}
        </>
      )}
    </Tap>
  );
}

/** Square icon-only button (close, scan, pager arrows, qty steppers). */
export function IconButton({ icon, onPress, size = H.sm, variant = 'outline', iconSize = 20, disabled, style }: {
  icon: GlyphName; onPress?: () => void; size?: number; variant?: ButtonVariant | 'tint';
  iconSize?: number; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const v = variant === 'tint' ? { bg: C.bg, fg: C.text } : VARIANTS[variant];
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={[
        styles.icon,
        { width: size, height: size, borderRadius: size >= H.lg ? R.xl : R.md, backgroundColor: v.bg },
        'border' in v && v.border != null && { borderWidth: 1, borderColor: v.border },
        disabled && styles.dim,
        style,
      ]}
    >
      <Glyph name={icon} size={iconSize} color={v.fg} strokeWidth={2.2} />
    </Tap>
  );
}

/** Tall tile with icon over label (Discount / Note / Hold / Print bill). */
export function ActionTile({ icon, label, tone, onPress, disabled }: {
  icon: GlyphName; label: string; tone: Tone | 'plain'; onPress?: () => void; disabled?: boolean;
}) {
  const t = tone === 'plain' ? { bg: C.bg, fg: C.textMuted, line: C.border } : tones[tone];
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      style={[styles.tile, { backgroundColor: t.bg, borderColor: t.line }, disabled && styles.dim]}
    >
      <Glyph name={icon} size={22} color={t.fg} strokeWidth={2} />
      <Txt variant="small" weight="semibold" numberOfLines={1}>{label}</Txt>
    </Tap>
  );
}

export const ButtonRow = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) =>
  <View style={[styles.row, style]}>{children}</View>;

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.sm },
  block: { alignSelf: 'stretch' },
  dim: { opacity: 0.45 },
  icon: { alignItems: 'center', justifyContent: 'center' },
  tile: { flex: 1, height: 62, borderRadius: R.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: S.xs },
  row: { flexDirection: 'row', gap: S.sm },
});
