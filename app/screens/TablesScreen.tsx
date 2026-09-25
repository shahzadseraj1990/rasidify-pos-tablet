import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Colors } from '../utils/colors';
import Icon from '../components/Icon';
import Money from '../components/Money';
import { useAuthStore } from '../store/authStore';
import { useShiftStore } from '../store/shiftStore';
import { useCartStore } from '../store/cartStore';
import { useTableStore } from '../store/tableStore';
import { posApi } from '../services/api';
import { cartItemsFromInvoiceLines, customerFromInvoice } from '../utils/invoiceLines';
import { PosTable, POS_TABLE_STATUS } from '../types';

type Props = { onStartOrder: () => void };

const STATUS_META: Record<number, { label: string; bg: string; border: string; text: string }> = {
  [POS_TABLE_STATUS.Available]:     { label: 'Available',      bg: '#ECFDF5', border: '#10B981', text: '#047857' },
  [POS_TABLE_STATUS.Occupied]:      { label: 'Occupied',       bg: '#FEF2F2', border: '#EF4444', text: '#B91C1C' },
  [POS_TABLE_STATUS.Reserved]:      { label: 'Reserved',       bg: '#FFFBEB', border: '#F59E0B', text: '#B45309' },
  [POS_TABLE_STATUS.BillRequested]: { label: 'Bill Requested', bg: '#EFF6FF', border: '#3B82F6', text: '#1D4ED8' },
  [POS_TABLE_STATUS.Cleaning]:      { label: 'Cleaning',       bg: '#F5F3FF', border: '#8B5CF6', text: '#6D28D9' },
  [POS_TABLE_STATUS.Disabled]:      { label: 'Disabled',       bg: '#F3F4F6', border: '#9CA3AF', text: '#6B7280' },
};

// Padding around the floor-plan canvas edges beyond the furthest table, so
// tables placed flush against the dashboard editor's edge aren't clipped.
const CANVAS_PADDING = 60;

// null = show every table regardless of status.
const STATUS_FILTERS: { id: number | null; label: string }[] = [
  { id: null, label: 'All' },
  { id: POS_TABLE_STATUS.Available, label: 'Available' },
  { id: POS_TABLE_STATUS.Occupied, label: 'Occupied' },
];

export default function TablesScreen({ onStartOrder }: Props) {
  const user = useAuthStore(s => s.user);
  const currency = user?.currency ?? 'SAR';
  const activeShift = useShiftStore(s => s.activeShift);
  const branchID = activeShift?.branchID ?? user?.branchID ?? null;
  const cart = useCartStore();

  const layout = useTableStore(s => s.layout);
  const loading = useTableStore(s => s.loading);
  const loadLayout = useTableStore(s => s.loadLayout);
  const releaseTable = useTableStore(s => s.releaseTable);

  const [activeFloorID, setActiveFloorID] = useState<number | null>(null);
  const [busyTableID, setBusyTableID] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<number | null>(null);

  useEffect(() => {
    if (branchID != null) loadLayout(branchID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchID]);

  useEffect(() => {
    if (activeFloorID == null && layout.floors.length > 0) {
      setActiveFloorID(layout.floors[0].floorID);
    }
  }, [layout.floors, activeFloorID]);

  // Every table on the active floor, across all its sections — the dashboard
  // editor lays tables out on one canvas per floor, sections are just a
  // logical grouping, not a separate visual area.
  const floorSectionIDs = useMemo(() => {
    if (activeFloorID == null) return new Set<number>();
    return new Set(layout.sections.filter(s => s.floorID === activeFloorID).map(s => s.sectionID));
  }, [layout.sections, activeFloorID]);

  const floorTables = useMemo(
    () => layout.tables.filter(t => floorSectionIDs.has(t.sectionID)),
    [layout.tables, floorSectionIDs]
  );

  const visibleTables = useMemo(
    () => (statusFilter == null ? floorTables : floorTables.filter(t => t.statusID === statusFilter)),
    [floorTables, statusFilter]
  );

  // Canvas is sized from every table on the floor (not just the filtered
  // ones) so filtered tables keep their exact floor-plan positions.
  const canvasSize = useMemo(() => {
    const maxX = floorTables.reduce((m, t) => Math.max(m, (t.posX ?? 0) + (t.width ?? 80)), 0);
    const maxY = floorTables.reduce((m, t) => Math.max(m, (t.posY ?? 0) + (t.height ?? 80)), 0);
    return { width: maxX + CANVAS_PADDING, height: maxY + CANVAS_PADDING };
  }, [floorTables]);

  async function continueOrder(t: PosTable) {
    if (!t.currentInvoiceID) return;
    setBusyTableID(t.tableID);
    try {
      const res = await posApi.get(`/pos/order/${t.currentInvoiceID}`);
      const full = res.data?.invoice ?? res.data?.data ?? res.data;
      cart.clearCart();
      const items = full?.line_items ?? [];
      // Shared mapper: keeps product names, prices and modifier/combo selections
      // intact, since the order is saved back in place (PUT) when paid or re-held.
      cartItemsFromInvoiceLines(items).forEach(item => cart.addItem(item));
      if (full?.discount) cart.setDiscount(full.discount);
      if (full?.orderTypeID) cart.setOrderType(full.orderTypeID);
      if (full?.customerNote) cart.setOrderNote(full.customerNote);
      cart.setCustomer(customerFromInvoice(full));
      cart.setCheckoutInvoice(t.currentInvoiceID, full?.shiftOrderNo ?? 0);
      cart.setTable(t.tableID, t.name);
      onStartOrder();
    } catch {
      Alert.alert('Could Not Open Order', 'Failed to load this table’s order. Please try again.');
    } finally {
      setBusyTableID(null);
    }
  }

  function startNewOrder(t: PosTable) {
    cart.setTable(t.tableID, t.name);
    onStartOrder();
  }

  function onTablePress(t: PosTable) {
    if (t.statusID === POS_TABLE_STATUS.Cleaning || t.statusID === POS_TABLE_STATUS.Disabled) return;
    if (t.statusID === POS_TABLE_STATUS.Occupied && t.currentInvoiceID) {
      continueOrder(t);
      return;
    }
    startNewOrder(t);
  }

  async function onRelease(t: PosTable) {
    setBusyTableID(t.tableID);
    try {
      await releaseTable(t.tableID);
    } catch {
      Alert.alert('Failed', 'Could not release this table. Please try again.');
    } finally {
      setBusyTableID(null);
    }
  }

  if (branchID == null) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No branch assigned to this device.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Tables</Text>
        <View style={styles.legend}>
          {Object.values(POS_TABLE_STATUS).map(id => (
            <View key={id} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: STATUS_META[id].border }]} />
              <Text style={styles.legendText}>{STATUS_META[id].label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.tabsRow}>
        <View style={styles.floorTabs}>
          {layout.floors.length > 1 && layout.floors.map(f => (
            <TouchableOpacity
              key={f.floorID}
              style={[styles.floorTab, activeFloorID === f.floorID && styles.floorTabActive]}
              onPress={() => setActiveFloorID(f.floorID)}
            >
              <Text style={[styles.floorTabText, activeFloorID === f.floorID && styles.floorTabTextActive]}>{f.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.floorTabs}>
          {STATUS_FILTERS.map(f => {
            const active = statusFilter === f.id;
            const count = f.id == null ? floorTables.length : floorTables.filter(t => t.statusID === f.id).length;
            return (
              <TouchableOpacity
                key={f.label}
                style={[styles.floorTab, active && styles.floorTabActive]}
                onPress={() => setStatusFilter(f.id)}
              >
                <Text style={[styles.floorTabText, active && styles.floorTabTextActive]}>{f.label} ({count})</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : floorTables.length === 0 ? (
        <View style={styles.center}>
          <Icon name="border-all" size={28} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No tables configured for this branch yet.</Text>
        </View>
      ) : visibleTables.length === 0 ? (
        <View style={styles.center}>
          <Icon name="border-all" size={28} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No {STATUS_META[statusFilter!]?.label.toLowerCase()} tables on this floor.</Text>
        </View>
      ) : (
        // Nested scroll views so the floor plan pans in both directions while
        // staying pinned to the exact posX/posY layout stored on the dashboard —
        // this mirrors the dashboard's drag-and-drop editor 1:1 instead of
        // re-flowing tables into a grid.
        <ScrollView contentContainerStyle={{ minWidth: '100%' }}>
          <ScrollView horizontal contentContainerStyle={{ minWidth: '100%' }}>
            <View style={[styles.canvas, { width: canvasSize.width, height: canvasSize.height }]}>
              {visibleTables.map(t => {
                const meta = STATUS_META[t.statusID] ?? STATUS_META[POS_TABLE_STATUS.Available];
                const showRelease = [POS_TABLE_STATUS.Occupied, POS_TABLE_STATUS.Reserved, POS_TABLE_STATUS.BillRequested].includes(t.statusID as any);
                const busy = busyTableID === t.tableID;
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
                    ]}
                    onPress={() => onTablePress(t)}
                    disabled={busy || t.statusID === POS_TABLE_STATUS.Cleaning || t.statusID === POS_TABLE_STATUS.Disabled}
                    activeOpacity={0.7}
                  >
                    {busy ? (
                      <ActivityIndicator color={meta.text} />
                    ) : (
                      <>
                        <Icon name="chair" size={16} color={meta.text} />
                        <Text style={[styles.tableName, { color: meta.text }]} numberOfLines={1}>{t.name}</Text>
                        <Text style={[styles.tableStatus, { color: meta.text }]} numberOfLines={1}>{meta.label}</Text>
                        {h > 70 && <Text style={styles.tableCapacity}>{t.capacity} seats</Text>}
                        {t.currentOrderNumber != null && (
                          <Text style={styles.tableOrderNo}>#{String(t.currentOrderNumber).padStart(4, '0')}</Text>
                        )}
                        {t.currentInvoiceTotal != null && t.currentInvoiceTotal > 0 && (
                          <Money amount={t.currentInvoiceTotal} currency={currency} style={styles.tableOrderTotal} />
                        )}
                        {showRelease && (
                          <TouchableOpacity
                            style={styles.releaseBtn}
                            onPress={(e) => { e.stopPropagation(); onRelease(t); }}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Text style={styles.releaseBtnText}>Release</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { fontSize: 13, color: Colors.textMuted },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16 },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text },
  legend: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },

  tabsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, gap: 12 },
  floorTabs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  floorTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  floorTabActive: { backgroundColor: Colors.primaryDark, borderColor: Colors.primaryDark },
  floorTabText: { fontSize: 12, fontWeight: '700', color: Colors.textLight },
  floorTabTextActive: { color: '#fff' },

  canvas: { position: 'relative', margin: 20 },
  tableCard: {
    position: 'absolute', borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', gap: 1, padding: 6,
  },
  tableName: { fontSize: 14, fontWeight: '800' },
  tableStatus: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  tableCapacity: { fontSize: 9, color: Colors.textMuted, marginTop: 1 },
  tableOrderNo: { fontSize: 9, fontWeight: '700', color: Colors.text, marginTop: 1 },
  tableOrderTotal: { fontSize: 10, fontWeight: '800', color: Colors.text },
  releaseBtn: { marginTop: 4, backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  releaseBtnText: { fontSize: 9, fontWeight: '700', color: Colors.text },
});
