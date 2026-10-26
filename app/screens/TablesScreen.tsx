import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { C, F, palette } from '../theme/tokens';
import { Txt, Card, Pill, Segmented, EmptyState } from '../components/ui';
import { TableShape, TableLegend, statusMeta } from '../components/tables/TableShape';
import Money from '../components/Money';
import KitchenBadge from '../components/KitchenBadge';
import { useKitchenStore } from '../store/kitchenStore';
import { useAuthStore } from '../store/authStore';
import { useShiftStore } from '../store/shiftStore';
import { useCartStore } from '../store/cartStore';
import { useTableStore } from '../store/tableStore';
import { posApi } from '../services/api';
import { cartItemsFromInvoiceLines, customerFromInvoice } from '../utils/invoiceLines';
import { loadKitchenStateIntoCart } from '../services/kitchenTicketService';
import { PosTable, POS_TABLE_STATUS } from '../types';
import { appAlert } from '../utils/appAlert';

type Props = { onStartOrder: () => void };

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

  // Keep tables current: another device may hold or pay an order. Reload when
  // the kitchen hub says tables changed, and every 15 s as a backup.
  const tablesVersion = useKitchenStore(s => s.tablesVersion);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (branchID != null && tablesVersion > 0) loadLayout(branchID, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tablesVersion]);
  useEffect(() => {
    if (branchID == null) return;
    const timer = setInterval(() => loadLayout(branchID, true), 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchID]);
  const pullRefresh = async () => {
    if (branchID == null) return;
    setRefreshing(true);
    await loadLayout(branchID, true);
    setRefreshing(false);
  };

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
      loadKitchenStateIntoCart(t.currentInvoiceID);
      cart.setTable(t.tableID, t.name);
      onStartOrder();
    } catch {
      appAlert('Could Not Open Order', 'Failed to load this table’s order. Please try again.');
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
      appAlert('Failed', 'Could not release this table. Please try again.');
    } finally {
      setBusyTableID(null);
    }
  }

  const floorOptions = layout.floors.map(f => {
    const ids = new Set(layout.sections.filter(sec => sec.floorID === f.floorID).map(sec => sec.sectionID));
    return { key: f.floorID, label: f.name, count: layout.tables.filter(t => ids.has(t.sectionID)).length };
  });
  const seatsFree = floorTables.filter(t => t.statusID === POS_TABLE_STATUS.Available).reduce((n, t) => n + (t.capacity ?? 0), 0);
  const activeFloor = layout.floors.find(f => f.floorID === activeFloorID);

  if (branchID == null) {
    return <EmptyState title="No branch assigned to this device." icon="tables" />;
  }

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        {floorOptions.length > 0 ? (
          <Segmented options={floorOptions} value={activeFloorID ?? floorOptions[0].key} onChange={setActiveFloorID} />
        ) : <View />}
        <Segmented
          options={STATUS_FILTERS.map(f => ({
            key: f.id ?? -1,
            label: f.label,
            count: f.id == null ? floorTables.length : floorTables.filter(t => t.statusID === f.id).length,
          }))}
          value={statusFilter ?? -1}
          onChange={k => setStatusFilter(k === -1 ? null : k)}
        />
      </View>

      <Card padded={false} style={styles.plan}>
        <View style={styles.planHead}>
          <Txt variant="title" weight="bold">{activeFloor?.name ?? 'Tables'}</Txt>
          <Pill label={`${floorTables.length} tables · ${seatsFree} seats free`} tone="neutral" />
          <View style={styles.flex} />
          <TableLegend tables={floorTables} />
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={C.brand} />
        ) : floorTables.length === 0 ? (
          <EmptyState title="No tables configured for this branch yet." icon="tables" />
        ) : visibleTables.length === 0 ? (
          <EmptyState title={`No ${statusMeta(statusFilter!).label.toLowerCase()} tables on this floor.`} icon="tables" />
        ) : (
          // Nested scroll views so the floor plan pans in both directions while
          // staying pinned to the exact posX/posY layout stored on the dashboard —
          // this mirrors the dashboard's drag-and-drop editor 1:1 instead of
          // re-flowing tables into a grid.
          <ScrollView
            contentContainerStyle={{ minWidth: '100%' }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullRefresh} tintColor={C.brand} />}
          >
            <ScrollView horizontal contentContainerStyle={{ minWidth: '100%' }}>
              <View style={[styles.canvas, { width: canvasSize.width, height: canvasSize.height }]}>
                {visibleTables.map(t => {
                  const showRelease = [POS_TABLE_STATUS.Occupied, POS_TABLE_STATUS.Reserved, POS_TABLE_STATUS.BillRequested].includes(t.statusID as any);
                  const busy = busyTableID === t.tableID;
                  return (
                    <TableShape
                      key={t.tableID}
                      table={t}
                      onPress={onTablePress}
                      disabled={busy || t.statusID === POS_TABLE_STATUS.Cleaning || t.statusID === POS_TABLE_STATUS.Disabled}
                    >
                      {busy ? <ActivityIndicator color={C.brand} /> : (
                        <>
                          {t.currentOrderNumber != null ? (
                            <View style={styles.orderPill}>
                              <Txt variant="micro" color={palette.white}>
                                #{String(t.currentOrderNumber).padStart(4, '0')}
                              </Txt>
                            </View>
                          ) : null}
                          {t.currentInvoiceTotal != null && t.currentInvoiceTotal > 0 ? (
                            <Money amount={t.currentInvoiceTotal} currency={currency} style={styles.total} />
                          ) : null}
                          {t.currentInvoiceID ? <KitchenBadge invoiceId={t.currentInvoiceID} size="sm" /> : null}
                          {showRelease ? (
                            <TouchableOpacity style={styles.release} onPress={(e) => { e.stopPropagation(); onRelease(t); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                              <Txt variant="micro" color={C.textMuted}>Release</Txt>
                            </TouchableOpacity>
                          ) : null}
                        </>
                      )}
                    </TableShape>
                  );
                })}
              </View>
            </ScrollView>
          </ScrollView>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 24, paddingBottom: 20, gap: 16 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  flex: { flex: 1 },
  plan: { flex: 1, overflow: 'hidden' },
  planHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20, paddingVertical: 12 },
  canvas: { position: 'relative', margin: 20 },
  orderPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: C.brand },
  total: { fontSize: 11, fontFamily: F.semibold, color: C.text },
  release: { marginTop: 2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(11,11,11,0.06)' },
});
