import React, { useRef, useState } from 'react';
import { View, TouchableOpacity, TextInput, TextInputProps, StyleSheet, StyleProp, ViewStyle, Animated, Modal, ScrollView } from 'react-native';
import { C, F, H, R, S, T, palette } from '../../theme/tokens';
import Txt from './Txt';
import Glyph, { GlyphName } from './Glyph';
import { CountBadge } from './Badge';

/**
 * Pill-shaped segmented switch (This shift / Today, Floor plan / Grid, order
 * types). `stacked` puts the icon above the label (Sell order-type picker).
 */
export function Segmented<K extends string | number>({ options, value, onChange, stacked, style, itemStyle }: {
  options: { key: K; label: string; icon?: GlyphName; count?: number }[];
  value: K;
  onChange: (k: K) => void;
  stacked?: boolean;
  style?: StyleProp<ViewStyle>;
  itemStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.seg, style]}>
      {options.map(o => {
        const on = o.key === value;
        const fg = on ? C.brand : C.textMuted;
        return (
          <TouchableOpacity
            key={String(o.key)}
            onPress={() => onChange(o.key)}
            activeOpacity={0.8}
            style={[styles.segItem, stacked && styles.segStacked, on && styles.segOn, itemStyle]}
          >
            {o.icon ? <Glyph name={o.icon} size={22} color={fg} /> : null}
            <Txt variant={stacked ? 'small' : 'label'} weight="semibold" color={fg} numberOfLines={1}>{o.label}</Txt>
            {o.count != null ? <Txt variant="small" weight="semibold" color={on ? C.brand : C.textSubtle}>{o.count}</Txt> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Underlined tabs with counts (Orders: All / Unpaid / Paid…). */
export function UnderlineTabs<K extends string>({ tabs, value, onChange }: {
  tabs: { key: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void;
}) {
  return (
    <View style={styles.tabs}>
      {tabs.map(t => {
        const on = t.key === value;
        return (
          <TouchableOpacity key={t.key} onPress={() => onChange(t.key)} activeOpacity={0.8} style={styles.tab}>
            <Txt variant="label" weight="semibold" color={on ? C.brand : C.textMuted}>{t.label}</Txt>
            {t.count != null ? <CountBadge value={t.count} tone={on ? 'brand' : 'neutral'} size={22} /> : null}
            {on ? <View style={styles.tabLine} /> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** On/off switch matching the design (indigo when on). */
export function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      onPress={(disabled) ? undefined : () => onChange(!value)}
      activeOpacity={0.85}
      style={[styles.toggle, { backgroundColor: value ? C.brand : palette.disabledBg }, disabled && { opacity: 0.45 }]}
    >
      <Animated.View style={[styles.knob, value ? styles.knobOn : null]} />
    </TouchableOpacity>
  );
}

/** Search / text field with optional leading icon and trailing slot. */
export const Field = React.forwardRef<TextInput, TextInputProps & {
  icon?: GlyphName; height?: number; right?: React.ReactNode; containerStyle?: StyleProp<ViewStyle>;
}>(function Field({ icon, height = H.lg, right, containerStyle, style, ...input }, ref) {
  return (
    <View style={[styles.field, { height }, containerStyle]}>
      {icon ? <Glyph name={icon} size={22} color={C.textMuted} strokeWidth={2} /> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={C.textSubtle}
        {...input}
        style={[styles.fieldInput, style]}
      />
      {right}
    </View>
  );
});

/** Dropdown-looking chip button (All types ▾, Today ▾). */
export function SelectChip({ icon, label, onPress, style }: { icon?: GlyphName; label: string; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.select, style]}>
      {icon ? <Glyph name={icon} size={18} color={C.text} /> : null}
      <Txt variant="label" weight="semibold" numberOfLines={1}>{label}</Txt>
      <Glyph name="chevronDown" size={16} color={C.textMuted} />
    </TouchableOpacity>
  );
}

/** SelectChip that opens a small option list under itself (All types ▾). */
export function Dropdown<K extends string | number>({ icon, options, value, onChange, style }: {
  icon?: GlyphName;
  options: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number } | null>(null);
  const open = () => ref.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y: y + h + 6, w }));
  const current = options.find(o => o.key === value)?.label ?? '';
  return (
    <View ref={ref} collapsable={false} style={style}>
      <SelectChip icon={icon} label={current} onPress={open} />
      <Modal visible={anchor != null} transparent animationType="fade" onRequestClose={() => setAnchor(null)}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setAnchor(null)} />
        {anchor ? (
          <View style={[styles.menu, { left: anchor.x, top: anchor.y, minWidth: Math.max(anchor.w, 200) }]}>
            <ScrollView style={{ maxHeight: 360 }}>
              {options.map(o => {
                const on = o.key === value;
                return (
                  <TouchableOpacity key={String(o.key)} style={[styles.menuItem, on && styles.menuItemOn]} activeOpacity={0.8}
                    onPress={() => { setAnchor(null); if (!on) onChange(o.key); }}>
                    <Txt variant="label" weight={on ? 'semibold' : 'regular'} color={on ? C.brand : C.text} style={{ flex: 1 }}>{o.label}</Txt>
                    {on ? <Glyph name="check" size={18} color={C.brand} strokeWidth={2.4} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  menu: { position: 'absolute', padding: S.xs, borderRadius: R.lg, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, elevation: 8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: S.sm, height: H.sm, paddingHorizontal: S.md, borderRadius: R.sm },
  menuItemOn: { backgroundColor: C.brandTint },
  seg: { flexDirection: 'row', gap: S.xs, padding: S.xs, borderRadius: R.xl, backgroundColor: C.bg, borderWidth: 1, borderColor: C.borderSoft },
  segItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, paddingHorizontal: S.lg, borderRadius: R.md },
  segStacked: { flex: 1, flexDirection: 'column', height: 60, paddingHorizontal: S.xs, gap: S.xs },
  segOn: { backgroundColor: C.surface, elevation: 1 },
  tabs: { flexDirection: 'row', gap: S.xxl, paddingHorizontal: S.xl, borderBottomWidth: 1, borderBottomColor: C.border },
  tab: { flexDirection: 'row', alignItems: 'center', gap: S.sm, height: 52 },
  tabLine: { position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, backgroundColor: C.brand, borderRadius: 1 },
  toggle: { width: 52, height: 32, borderRadius: 16, padding: 3, justifyContent: 'center' },
  knob: { width: 26, height: 26, borderRadius: 13, backgroundColor: palette.white, elevation: 1 },
  knobOn: { alignSelf: 'flex-end' },
  field: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingHorizontal: 18, borderRadius: R.xl, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  fieldInput: { flex: 1, height: '100%', fontFamily: F.regular, fontSize: T.title, color: C.text, paddingVertical: 0 },
  select: { flexDirection: 'row', alignItems: 'center', gap: S.sm, height: H.md, paddingHorizontal: S.lg, borderRadius: R.lg, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
});
