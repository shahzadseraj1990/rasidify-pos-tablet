import React, { memo } from 'react';
import { View, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { C, R, S, palette } from '../../theme/tokens';
import { Txt, Glyph } from '../ui';
import { PosTable, POS_TABLE_STATUS } from '../../types';

// Floor-plan look shared by the Tables tab and the Sell table picker
// (redesign): white table with a coloured outline per status.
export const TABLE_STATUS: Record<number, { label: string; bg: string; border: string; dot: string; ink: string }> = {
  [POS_TABLE_STATUS.Available]: { label: 'Available', bg: C.surface, border: '#A6E4C3', dot: palette.green, ink: C.text },
  [POS_TABLE_STATUS.Occupied]: { label: 'Occupied', bg: C.brandSoft, border: C.brand, dot: C.brand, ink: C.text },
  [POS_TABLE_STATUS.Reserved]: { label: 'Reserved', bg: C.surface, border: palette.amber, dot: palette.amber, ink: C.text },
  [POS_TABLE_STATUS.BillRequested]: { label: 'Bill requested', bg: palette.violetBg, border: palette.violet, dot: palette.violet, ink: C.text },
  [POS_TABLE_STATUS.Cleaning]: { label: 'Cleaning', bg: palette.greyBg, border: palette.grey, dot: palette.grey, ink: C.textMuted },
  [POS_TABLE_STATUS.Disabled]: { label: 'Disabled', bg: palette.greyBg, border: palette.line, dot: palette.line, ink: C.textSubtle },
};

export const statusMeta = (id: number) => TABLE_STATUS[id] ?? TABLE_STATUS[POS_TABLE_STATUS.Available];

/** Status legend chip row: ● Available 4  ● Occupied 3 … */
export function TableLegend({ tables, style }: { tables: PosTable[]; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.legend, style]}>
      {Object.values(POS_TABLE_STATUS).filter(id => id !== POS_TABLE_STATUS.Disabled).map(id => (
        <View key={id} style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: TABLE_STATUS[id].dot }]} />
          <Txt variant="caption" weight="medium">{TABLE_STATUS[id].label}</Txt>
          <Txt variant="caption" weight="bold">{tables.filter(t => t.statusID === id).length}</Txt>
        </View>
      ))}
    </View>
  );
}

/** One table, absolutely placed at its floor-plan position. */
export const TableShape = memo(function TableShape({ table, selected, disabled, onPress, children }: {
  table: PosTable;
  selected?: boolean;
  disabled?: boolean;
  onPress: (t: PosTable) => void;
  children?: React.ReactNode;
}) {
  const meta = statusMeta(table.statusID);
  const w = table.width ?? 80;
  const h = table.height ?? 80;
  const radius = table.shape === 'circle' ? Math.min(w, h) / 2 : R.xxl;
  return (
    <TouchableOpacity
      onPress={(disabled) ? undefined : () => onPress(table)}
      activeOpacity={0.75}
      style={[
        styles.table,
        { left: table.posX ?? 0, top: table.posY ?? 0, width: w, height: h, borderRadius: radius, backgroundColor: meta.bg, borderColor: meta.border },
        selected && styles.selected,
        disabled && styles.disabled,
      ]}
    >
      <Txt variant="h3" color={meta.ink} numberOfLines={1}>{table.name}</Txt>
      {h > 64 ? (
        <View style={styles.seats}>
          <Glyph name="user" size={13} color={C.textMuted} strokeWidth={2} />
          <Txt variant="small" weight="regular" color={C.textMuted}>{table.capacity} seats</Txt>
        </View>
      ) : null}
      {children}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: S.lg, paddingHorizontal: 14, paddingVertical: S.sm, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  table: { position: 'absolute', borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 2, padding: 6 },
  selected: { borderWidth: 3, borderColor: C.brand, backgroundColor: C.brandTint },
  disabled: { opacity: 0.45 },
  seats: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
