import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, TouchableOpacity } from 'react-native';
import { C, F, R, S } from '../../theme/tokens';
import Txt from './Txt';
import Glyph, { GlyphName } from './Glyph';
import Money from '../Money';

/** White rounded panel with the design's hairline border. */
export function Card({ children, style, padded = true }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  return <View style={[styles.card, padded && styles.cardPad, style]}>{children}</View>;
}

/** Screen title row: title + subtitle on the left, actions on the right. */
export function PageHeader({ title, subtitle, right, style }: {
  title: string; subtitle?: string; right?: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.header, style]}>
      <View style={styles.headerText}>
        <Txt variant="h1">{title}</Txt>
        {subtitle ? <Txt variant="caption" color={C.textMuted} numberOfLines={1}>{subtitle}</Txt> : null}
      </View>
      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

/** KPI tile: label, big amount (or text), small caption. */
export function StatCard({ label, amount, value, currency, caption, style }: {
  label: string; amount?: number; value?: string; currency?: string; caption?: string; style?: StyleProp<ViewStyle>;
}) {
  return (
    <Card style={[styles.stat, style]}>
      <Txt variant="caption" color={C.textMuted}>{label}</Txt>
      {amount != null
        ? <Money amount={amount} currency={currency ?? 'SAR'} style={styles.statValue} />
        : <Txt variant="display">{value}</Txt>}
      {caption ? <Txt variant="small" weight="regular" color={C.textMuted} numberOfLines={1}>{caption}</Txt> : null}
    </Card>
  );
}

/** Label/value line used in summaries (Opening cash ……… SAR 200.00). */
export function KeyValue({ label, value, strong, valueColor, divider = true }: {
  label: string; value: React.ReactNode; strong?: boolean; valueColor?: string; divider?: boolean;
}) {
  return (
    <View style={[styles.kv, divider && styles.kvDivider]}>
      <Txt variant={strong ? 'title' : 'label'} weight={strong ? 'bold' : 'regular'} color={strong ? C.text : C.textMuted}>{label}</Txt>
      {typeof value === 'string'
        ? <Txt variant={strong ? 'h3' : 'label'} weight="bold" color={valueColor}>{value}</Txt>
        : value}
    </View>
  );
}

/** Centered empty / placeholder state. */
export function EmptyState({ title, subtitle, icon = 'orders' }: { title: string; subtitle?: string; icon?: GlyphName }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Glyph name={icon} size={28} color={C.textSubtle} /></View>
      <Txt variant="title">{title}</Txt>
      {subtitle ? <Txt variant="label" weight="regular" color={C.textMuted} align="center">{subtitle}</Txt> : null}
    </View>
  );
}

/** Settings-style row: icon tile, title + subtitle, chevron (Menu list). */
export function NavRow({ icon, title, subtitle, active, onPress, right }: {
  icon: GlyphName; title: string; subtitle?: string; active?: boolean; onPress?: () => void; right?: React.ReactNode;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.nav, active && styles.navOn]}>
      <View style={[styles.navIcon, active && styles.navIconOn]}>
        <Glyph name={icon} size={20} color={active ? C.textOnBrand : C.text} />
      </View>
      <View style={styles.navText}>
        <Txt variant="title" color={active ? C.brand : C.text}>{title}</Txt>
        {subtitle ? <Txt variant="small" weight="regular" color={C.textMuted} numberOfLines={1}>{subtitle}</Txt> : null}
      </View>
      {right ?? <Glyph name="chevronRight" size={18} color={active ? C.brand : C.textSubtle} />}
    </TouchableOpacity>
  );
}

/** Data-table column spec, shared by the header and every row. */
export interface ColSpec { label: string; flex: number; align?: 'left' | 'right' | 'center' }

/** Uppercase column header row (ORDER · CUSTOMER · … · TOTAL). */
export function TableHead({ cols }: { cols: ColSpec[] }) {
  return (
    <View style={styles.thead}>
      {cols.map(c => (
        <Txt key={c.label} variant="micro" color={C.textMuted} align={c.align} style={[styles.th, { flex: c.flex }]}>{c.label.toUpperCase()}</Txt>
      ))}
    </View>
  );
}

/** One table cell sized by its ColSpec. */
export function Cell({ col, children, style }: { col: ColSpec; children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const justify = col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start';
  return <View style={[styles.cell, { flex: col.flex, justifyContent: justify }, style]}>{children}</View>;
}

/** Table row container: hairline divider, optional selected tint. */
export function TableRow({ children, onPress, selected }: { children: React.ReactNode; onPress?: () => void; selected?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.75 : 1} style={[styles.tr, selected && styles.trOn]}>
      {children}
    </TouchableOpacity>
  );
}

/** Label + proportional bar + figures (sales by order type, payment methods). */
export function BarRow({ label, sub, ratio, count, amount, currency, stacked }: {
  label: string; sub?: string; ratio: number; count?: string; amount: number; currency: string; stacked?: boolean;
}) {
  const bar = (
    <View style={[styles.track, !stacked && styles.flex]}>
      <View style={[styles.fill, { width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }]} />
    </View>
  );
  const money = <Money amount={amount} currency={currency} style={styles.barAmount} />;
  if (stacked) {
    return (
      <View style={styles.barStack}>
        <View style={styles.barHead}>
          <Txt variant="label" weight="regular" style={styles.flex}>{label}{sub ? <Txt variant="caption" color={C.textSubtle}>  ·  {sub}</Txt> : null}</Txt>
          {money}
        </View>
        {bar}
      </View>
    );
  }
  return (
    <View style={styles.barLine}>
      <Txt variant="label" weight="regular" style={styles.barLabel} numberOfLines={1}>{label}</Txt>
      {bar}
      {count ? <Txt variant="caption" color={C.textMuted} style={styles.barCount}>{count}</Txt> : null}
      <View style={styles.barMoney}>{money}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  track: { height: 8, borderRadius: 4, backgroundColor: C.bg, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: C.brand },
  barAmount: { fontSize: 14, fontFamily: F.bold, color: C.text },
  barStack: { gap: 6 },
  barHead: { flexDirection: 'row', alignItems: 'center' },
  barLine: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 30 },
  barLabel: { width: 110 },
  barCount: { width: 72, textAlign: 'right' },
  barMoney: { width: 110, alignItems: 'flex-end' },
  thead: { flexDirection: 'row', alignItems: 'center', gap: S.md, height: 42, paddingHorizontal: S.xl, backgroundColor: C.brandSoft, borderBottomWidth: 1, borderBottomColor: C.border },
  th: { letterSpacing: 0.8 },
  cell: { flexDirection: 'row', alignItems: 'center', gap: S.md, minWidth: 0 },
  tr: { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 64, paddingHorizontal: S.xl, borderBottomWidth: 1, borderBottomColor: C.divider, backgroundColor: C.surface },
  trOn: { backgroundColor: C.brandSoft },
  card: { backgroundColor: C.surface, borderRadius: R.xxl, borderWidth: 1, borderColor: C.border },
  cardPad: { padding: S.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: S.lg },
  headerText: { flex: 1, minWidth: 0 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  stat: { flex: 1, gap: 2, paddingVertical: S.lg },
  statValue: { fontSize: 28, fontFamily: F.bold, color: C.text },
  kv: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 },
  kvDivider: { borderBottomWidth: 1, borderBottomColor: C.divider },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: S.sm, padding: S.xxl },
  emptyIcon: { width: 56, height: 56, borderRadius: R.xxl, backgroundColor: C.brandTint, alignItems: 'center', justifyContent: 'center', marginBottom: S.xs },
  nav: { flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md, borderRadius: R.lg },
  navOn: { backgroundColor: C.brandTint },
  navIcon: { width: 40, height: 40, borderRadius: R.md, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  navIconOn: { backgroundColor: C.brand },
  navText: { flex: 1, minWidth: 0 },
});
