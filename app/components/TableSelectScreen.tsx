import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '../utils/colors';
import Icon from '../components/Icon';
import { useTableStore } from '../store/tableStore';
import { PosTable, POS_TABLE_STATUS } from '../types';

const STATUS_META: Record<number, { label: string; bg: string; border: string; text: string }> = {
  [POS_TABLE_STATUS.Available]:     { label: 'Available',      bg: '#ECFDF5', border: '#10B981', text: '#047857' },
  [POS_TABLE_STATUS.Occupied]:      { label: 'Occupied',       bg: '#FEF2F2', border: '#EF4444', text: '#B91C1C' },
  [POS_TABLE_STATUS.Reserved]:      { label: 'Reserved',       bg: '#FFFBEB', border: '#F59E0B', text: '#B45309' },
  [POS_TABLE_STATUS.BillRequested]: { label: 'Bill Requested', bg: '#EFF6FF', border: '#3B82F6', text: '#1D4ED8' },
  [POS_TABLE_STATUS.Cleaning]:      { label: 'Cleaning',       bg: '#F5F3FF', border: '#8B5CF6', text: '#6D28D9' },
  [POS_TABLE_STATUS.Disabled]:      { label: 'Disabled',       bg: '#F3F4F6', border: '#9CA3AF', text: '#6B7280' },
};

// Matches TablesScreen's canvas padding so the floor plan reads identically here.
const CANVAS_PADDING = 60;

type Props = {
  visible: boolean;
  branchID: number | null;
  currentTableID: number | null;
  onClose: () => void;
  onSelect: (tableID: number, tableName: string) => void;
  onClear?: () => void;
};

export default function TableSelectScreen({ visible, branchID, currentTableID, onClose, onSelect, onClear }: Props) {
  const insets = useSafeAreaInsets();
  const layout = useTableStore(s => s.layout);
  const loading = useTableStore(s => s.loading);
  const loadLayout = useTableStore(s => s.loadLayout);

  const [activeFloorID, setActiveFloorID] = useState<number | null>(null);

  useEffect(() => {
    if (visible && branchID != null) loadLayout(branchID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, branchID]);

  useEffect(() => {
    if (activeFloorID == null && layout.floors.length > 0) {
      setActiveFloorID(layout.floors[0].floorID);
    }
  }, [layout.floors, activeFloorID]);

  const floorSectionIDs = useMemo(() => {
    if (activeFloorID == null) return new Set<number>();
    return new Set(layout.sections.filter(s => s.floorID === activeFloorID).map(s => s.sectionID));
  }, [layout.sections, activeFloorID]);

  const floorTables = useMemo(
    () => layout.tables.filter(t => floorSectionIDs.has(t.sectionID)),
    [layout.tables, floorSectionIDs]
  );

  const canvasSize = useMemo(() => {
    const maxX = floorTables.reduce((m, t) => Math.max(m, (t.posX ?? 0) + (t.width ?? 80)), 0);
    const maxY = floorTables.reduce((m, t) => Math.max(m, (t.posY ?? 0) + (t.height ?? 80)), 0);
    return { width: maxX + CANVAS_PADDING, height: maxY + CANVAS_PADDING };
  }, [floorTables]);

  function onTablePress(t: PosTable) {
    const isCurrent = t.tableID === currentTableID;
    const available = t.statusID === POS_TABLE_STATUS.Available || isCurrent;
    if (!available) return;
    onSelect(t.tableID, t.name);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {visible && <StatusBar style="dark" />}
      <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Select Table</Text>
          <View style={styles.legend}>
            {Object.values(POS_TABLE_STATUS).map(id => (
              <View key={id} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: STATUS_META[id].border }]} />
                <Text style={styles.legendText}>{STATUS_META[id].label}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="times" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {currentTableID != null && onClear && (
          <TouchableOpacity style={styles.clearRow} onPress={onClear}>
            <Icon name="times-circle" size={13} color={Colors.danger} />
            <Text style={styles.clearRowText}>Clear Table</Text>
          </TouchableOpacity>
        )}

        {layout.floors.length > 1 && (
          <View style={styles.floorTabs}>
            {layout.floors.map(f => (
              <TouchableOpacity
                key={f.floorID}
                style={[styles.floorTab, activeFloorID === f.floorID && styles.floorTabActive]}
                onPress={() => setActiveFloorID(f.floorID)}
              >
                <Text style={[styles.floorTabText, activeFloorID === f.floorID && styles.floorTabTextActive]}>{f.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
        ) : floorTables.length === 0 ? (
          <View style={styles.center}>
            <Icon name="border-all" size={28} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No tables configured for this branch yet.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ minWidth: '100%' }}>
            <ScrollView horizontal contentContainerStyle={{ minWidth: '100%' }}>
              <View style={[styles.canvas, { width: canvasSize.width, height: canvasSize.height }]}>
                {floorTables.map(t => {
                  const meta = STATUS_META[t.statusID] ?? STATUS_META[POS_TABLE_STATUS.Available];
                  const isCurrent = t.tableID === currentTableID;
                  const available = t.statusID === POS_TABLE_STATUS.Available || isCurrent;
                  const w = t.width ?? 80;
                  const h = t.height ?? 80;
                  const radius = t.shape === 'circle' ? Math.min(w, h) / 2 : t.shape === 'rectangle' ? 12 : 14;
                  return (
                    <TouchableOpacity
                      key={t.tableID}
                      style={[
                        styles.tableCard,
                        {
                          left: t.posX ?? 0, top: t.posY ?? 0, width: w, height: h, borderRadius: radius,
                          backgroundColor: meta.bg, borderColor: meta.border,
                        },
                        !available && styles.tableCardDisabled,
                        isCurrent && styles.tableCardSelected,
                      ]}
                      onPress={() => onTablePress(t)}
                      disabled={!available}
                      activeOpacity={0.7}
                    >
                      <Icon name="chair" size={16} color={meta.text} />
                      <Text style={[styles.tableName, { color: meta.text }]} numberOfLines={1}>{t.name}</Text>
                      <Text style={[styles.tableStatus, { color: meta.text }]} numberOfLines={1}>
                        {isCurrent ? 'Selected' : meta.label}
                      </Text>
                      {h > 70 && <Text style={styles.tableCapacity}>{t.capacity} seats</Text>}
                      {isCurrent && <Icon name="check-circle" size={14} color={meta.text} style={{ marginTop: 2 }} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { fontSize: 13, color: Colors.textMuted },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, gap: 14 },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text },
  legend: { flex: 1, flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'flex-end' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  closeBtn: {
    width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.surfaceAlt,
  },

  clearRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    marginHorizontal: 20, marginTop: 14, paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.danger, backgroundColor: Colors.dangerBg,
  },
  clearRowText: { fontSize: 12, fontWeight: '700', color: Colors.danger },

  floorTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 14 },
  floorTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  floorTabActive: { backgroundColor: Colors.primaryDark, borderColor: Colors.primaryDark },
  floorTabText: { fontSize: 12, fontWeight: '700', color: Colors.textLight },
  floorTabTextActive: { color: '#fff' },

  canvas: { position: 'relative', margin: 20 },
  tableCard: {
    position: 'absolute', borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', gap: 1, padding: 6,
  },
  tableCardDisabled: { opacity: 0.4 },
  tableCardSelected: { borderWidth: 3 },
  tableName: { fontSize: 14, fontWeight: '800' },
  tableStatus: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  tableCapacity: { fontSize: 9, color: Colors.textMuted, marginTop: 1 },
});
