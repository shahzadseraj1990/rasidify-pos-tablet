import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, ScrollView, RefreshControl,
} from 'react-native';
import { Colors } from '../utils/colors';
import Icon from '../components/Icon';
import Money from '../components/Money';
import { useShiftStore } from '../store/shiftStore';
import { useCartStore } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { posApi } from '../services/api';
import { cartItemsFromInvoiceLines, customerFromInvoice } from '../utils/invoiceLines';
import { useSessionStore } from '../store/sessionStore';
import { PosOrder } from '../types';

const PAGE_SIZE = 30;

const STATUS_LABELS: Record<number, string> = {
  100: 'Draft', 105: 'Paid', 106: 'Unpaid', 107: 'Partial',
  108: 'Overdue', 109: 'Cancelled', 110: 'Refunded', 20: 'Held',
};
const STATUS_COLORS: Record<number, { bg: string; text: string }> = {
  105: { bg: '#D1FAE5', text: '#059669' },
  106: { bg: '#FEE2E2', text: '#DC2626' },
  107: { bg: '#FEF3C7', text: '#D97706' },
  109: { bg: '#F3F4F6', text: '#6B7280' },
  110: { bg: '#EDE9FE', text: '#7C3AED' },
  20: { bg: '#FEF3C7', text: '#B45309' },
};

function statusColor(id: number) {
  return STATUS_COLORS[id] ?? { bg: '#F3F4F6', text: '#6B7280' };
}

function parseOrderDate(value: unknown): Date {
  if (value instanceof Date) return value;
  const s = String(value ?? '');
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, month, day, year, hour, minute, second] = m;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second ?? 0));
  }
  return new Date(s);
}

function fmtDateTime(d: Date): string {
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${day}/${month}/${year}, ${time}`;
}

function custName(order: any): string {
  if (order?.customerName) return order.customerName;
  const c = order?.customer;
  if (!c) return 'Walk-in Customer';
  return (c.businessName || `${c.name ?? ''} ${c.secondName ?? ''}`).trim() || 'Walk-in Customer';
}

function orderNum(order: any): string {
  if (order?.shiftOrderNo) return '#' + String(order.shiftOrderNo).padStart(4, '0');
  return order?.transactionNumber || ('#' + order?.invoiceID);
}

interface OrderDetail extends PosOrder {
  line_items?: any[];
  line_payments?: any[];
  customer?: any;
  customerNote?: string;
  subtotal?: number;
  vatAmount?: number;
}

type Props = { onResumeOrder: () => void };

export default function OrdersScreen({ onResumeOrder }: Props) {
  const shift = useShiftStore(s => s.activeShift);
  const user = useAuthStore(s => s.user);
  const cart = useCartStore();
  const currency = user?.currency ?? 'SAR';

  const [orders, setOrders] = useState<PosOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [orderTypes, setOrderTypes] = useState<any[]>([]);
  const [filterType, setFilterType] = useState(0);
  const [showAllShifts, setShowAllShifts] = useState(false);

  const [selected, setSelected] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const shiftID = shift?.shiftID ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => {
    loadOrderTypes();
    loadOrders(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadOrderTypes() {
    try {
      // From the session bootstrap (cached) — no separate order-types call.
      const b = await useSessionStore.getState().load(useAuthStore.getState().user?.branchID ?? null);
      setOrderTypes(b.orderTypes as any);
    } catch {}
  }

  async function loadOrders(p: number, append: boolean, overrideSearch?: string, overrideType?: number, overrideAllShifts?: boolean) {
    if (!append) setLoading(true);
    const s = overrideSearch ?? search;
    const ot = overrideType ?? filterType;
    const all = overrideAllShifts ?? showAllShifts;
    const sid = all ? 0 : shiftID;
    try {
      const res = await posApi.get(`/pos/orders?status=0&page=${p}&pageSize=${PAGE_SIZE}&search=${encodeURIComponent(s)}&orderTypeID=${ot}&shiftID=${sid}`);
      const data = res.data?.data ?? res.data;
      const list: PosOrder[] = data?.invoices ?? (Array.isArray(data) ? data : []);
      const total = data?.pageCount?.totalCount ?? list.length;
      setOrders(prev => append ? [...prev, ...list] : list);
      setTotalCount(total);
      setPage(p);
    } catch {
      // Non-fatal: leave list empty (no backend reachable, e.g. dev mode)
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    loadOrders(1, false);
  }
  function onSearch(text: string) {
    setSearch(text);
    loadOrders(1, false, text);
  }
  function onFilterType(id: number) {
    setFilterType(id);
    loadOrders(1, false, undefined, id);
  }
  function toggleAllShifts() {
    const next = !showAllShifts;
    setShowAllShifts(next);
    loadOrders(1, false, undefined, undefined, next);
  }

  function openDetail(order: PosOrder) {
    setSelected(order as OrderDetail);
    fetchDetail(order);
  }

  async function fetchDetail(order: PosOrder) {
    setDetailLoading(true);
    try {
      const res = await posApi.get(`/pos/order/${order.invoiceID}`);
      const full = res.data?.invoice ?? res.data?.data ?? res.data;
      const norm: any = {
        ...full,
        transactionDate: full?.transactionDate || order.transactionDate,
        line_items: full?.line_items ?? [],
        line_payments: full?.line_payments ?? [],
      };
      setSelected(prev => prev ? { ...prev, ...norm } : norm);
    } catch {}
    finally { setDetailLoading(false); }
  }

  function resumeHeldOrder(order: OrderDetail) {
    const items = order.line_items ?? [];
    cart.clearCart();
    // Shared mapper: keeps product names, prices and modifier/combo selections
    // intact, since the order is saved back in place (PUT) when paid or re-held.
    cartItemsFromInvoiceLines(items).forEach(item => cart.addItem(item));
    if (order.discount) cart.setDiscount(order.discount);
    if (order.orderTypeID) cart.setOrderType(order.orderTypeID);
    if (order.customerNote) cart.setOrderNote(order.customerNote);
    cart.setCustomer(customerFromInvoice(order));
    if (order.tableNo) cart.setTable(order.tableID ?? null, order.tableNo);
    cart.setCheckoutInvoice(order.invoiceID, order.shiftOrderNo ?? 0);
    setSelected(null);
    onResumeOrder();
  }

  return (
    <View style={styles.root}>
      <View style={styles.left}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Orders</Text>
          <View style={styles.headerRight}>
            <Text style={styles.foundText}>{totalCount} orders found</Text>
            <TouchableOpacity style={styles.allShiftsBtn} onPress={toggleAllShifts}>
              <Text style={[styles.allShiftsText, showAllShifts && styles.allShiftsActive]}>
                {showAllShifts ? 'All Shifts' : 'This Shift'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchWrap}>
            <Icon name="search" size={13} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by order #, customer..."
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={onSearch}
            />
          </View>
          <TouchableOpacity style={[styles.filterPill, filterType === 0 && styles.filterPillActive]} onPress={() => onFilterType(0)}>
            <Text style={[styles.filterPillText, filterType === 0 && styles.filterPillTextActive]}>All</Text>
          </TouchableOpacity>
          {orderTypes.map((ot: any) => (
            <TouchableOpacity key={ot.orderTypeID} style={[styles.filterPill, filterType === ot.orderTypeID && styles.filterPillActive]} onPress={() => onFilterType(ot.orderTypeID)}>
              <Text style={[styles.filterPillText, filterType === ot.orderTypeID && styles.filterPillTextActive]}>{ot.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
        ) : (
          <FlatList
            data={orders}
            keyExtractor={item => String(item.invoiceID)}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
            contentContainerStyle={{ paddingBottom: 24 }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Icon name="clipboard-list" size={28} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No orders found</Text>
              </View>
            }
            renderItem={({ item }) => {
              const sc = statusColor(item.statusID);
              const active = selected?.invoiceID === item.invoiceID;
              return (
                <TouchableOpacity style={[styles.orderRow, active && styles.orderRowActive]} onPress={() => openDetail(item)} activeOpacity={0.7}>
                  <Text style={styles.orderNum}>{orderNum(item)}</Text>
                  <Text style={styles.custName} numberOfLines={1}>{custName(item)}</Text>
                  {item.orderType ? (
                    <View style={styles.typeChip}><Text style={styles.typeChipText}>{item.orderType}</Text></View>
                  ) : null}
                  {item.tableNo ? (
                    <View style={styles.tableChip}><Text style={styles.tableChipText}>Table {item.tableNo}</Text></View>
                  ) : null}
                  <View style={{ flex: 1 }} />
                  {item.paymentMethodTitle ? (
                    <View style={styles.methodChip}><Text style={styles.methodChipText}>{item.paymentMethodTitle}</Text></View>
                  ) : null}
                  <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: sc.text }]}>{STATUS_LABELS[item.statusID] ?? 'Unknown'}</Text>
                  </View>
                  <Money amount={item.totalAmount} currency={currency} style={styles.amount} />
                </TouchableOpacity>
              );
            }}
            ListFooterComponent={
              page < totalPages ? (
                <TouchableOpacity style={styles.loadMoreBtn} onPress={() => loadOrders(page + 1, true)}>
                  <Text style={styles.loadMoreText}>Load More</Text>
                </TouchableOpacity>
              ) : null
            }
          />
        )}
      </View>

      <View style={styles.right}>
        {!selected ? (
          <View style={styles.emptyDetail}>
            <Icon name="receipt" size={28} color={Colors.textMuted} />
            <Text style={styles.emptyDetailText}>Select an order to view details</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
            <View style={styles.detailHeader}>
              <View>
                <Text style={styles.detailTitle}>Order {orderNum(selected)}</Text>
                <Text style={styles.detailSubtitle}>{fmtDateTime(parseOrderDate(selected.transactionDate))}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Icon name="times" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.statusStrip}>
              <View style={[styles.statusBadge, { backgroundColor: statusColor(selected.statusID).bg }]}>
                <Text style={[styles.statusBadgeText, { color: statusColor(selected.statusID).text }]}>{STATUS_LABELS[selected.statusID] ?? 'Unknown'}</Text>
              </View>
              <Money amount={selected.totalAmount} currency={currency} style={styles.stripTotal} />
            </View>

            <View style={styles.infoGrid}>
              <MetaRow label="Customer" value={custName(selected)} />
              {selected.orderType ? <MetaRow label="Order Type" value={selected.orderType} /> : null}
              {selected.tableNo ? <MetaRow label="Table" value={selected.tableNo} /> : null}
            </View>

            <Text style={styles.sectionTitle}>Items</Text>
            {detailLoading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginVertical: 12 }} />
            ) : (selected.line_items?.length ?? 0) > 0 ? (
              selected.line_items!.map((li: any, idx: number) => (
                <View key={idx} style={styles.lineItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.liName}>{li.productName ?? li.description ?? li.name ?? ''}</Text>
                    <Text style={styles.liMeta}>
                      {li.qty ?? li.quantity ?? 1} × <Money amount={li.price ?? li.unitPrice ?? 0} currency={currency} style={styles.liMeta} />
                    </Text>
                  </View>
                  <Money amount={li.amount ?? li.grandTotal ?? (li.qty ?? 1) * (li.price ?? 0)} currency={currency} style={styles.liTotal} />
                </View>
              ))
            ) : (
              <Text style={styles.noItems}>No items</Text>
            )}

            <View style={styles.totalsBlock}>
              <TotalRow label="Subtotal" value={<Money amount={selected.subtotal ?? selected.totalAmount} currency={currency} style={styles.totalValue} />} />
              {selected.discount > 0 && <TotalRow label="Discount" value={<Money amount={selected.discount} currency={currency} style={[styles.totalValue, { color: Colors.danger }]} prefix="− " />} valueColor={Colors.danger} />}
              {(selected.vatAmount ?? 0) > 0 && <TotalRow label="VAT" value={<Money amount={selected.vatAmount ?? 0} currency={currency} style={styles.totalValue} />} />}
              <View style={styles.grandTotalRow}>
                <Text style={styles.grandTotalLabel}>Total</Text>
                <Money amount={selected.totalAmount} currency={currency} style={styles.grandTotalValue} />
              </View>
            </View>

            {!detailLoading && (selected.line_payments?.length ?? 0) > 0 && (
              <View style={styles.totalsBlock}>
                <Text style={styles.sectionTitle}>Payments</Text>
                {selected.line_payments!.map((p: any, i: number) => (
                  <TotalRow key={i} label={p.paymentMethod} value={<Money amount={p.paymentAmount} currency={currency} style={styles.totalValue} />} />
                ))}
              </View>
            )}

            {(selected.statusID === 20 || selected.statusID === 106) && (
              <TouchableOpacity style={styles.resumeBtn} onPress={() => resumeHeldOrder(selected)}>
                <Icon name="play" size={13} color="#fff" />
                <Text style={styles.resumeBtnText}>Resume Order</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}
function TotalRow({ label, value, valueColor }: { label: string; value: React.ReactNode; valueColor?: string }) {
  return (
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={[styles.totalValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: Colors.background },

  left: { flex: 1.6, padding: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  foundText: { fontSize: 12, color: Colors.textMuted },
  allShiftsBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  allShiftsText: { fontSize: 12, fontWeight: '600', color: Colors.textLight },
  allShiftsActive: { color: Colors.primary },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  searchWrap: { flex: 1, minWidth: 220, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, height: 42 },
  searchInput: { flex: 1, fontSize: 13, color: Colors.text },
  filterPill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  filterPillActive: { backgroundColor: Colors.primaryDark, borderColor: Colors.primaryDark },
  filterPillText: { fontSize: 12, fontWeight: '600', color: Colors.textLight },
  filterPillTextActive: { color: '#fff' },

  empty: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyText: { fontSize: 13, color: Colors.textMuted },

  orderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 8,
  },
  orderRowActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  orderNum: { fontSize: 13, fontWeight: '800', color: Colors.text },
  custName: { fontSize: 13, color: Colors.textLight, maxWidth: 160 },
  typeChip: { backgroundColor: Colors.primaryLight, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  typeChipText: { fontSize: 10, fontWeight: '700', color: Colors.primary },
  tableChip: { backgroundColor: '#FFF7ED', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  tableChipText: { fontSize: 10, fontWeight: '700', color: '#C2410C' },
  methodChip: { backgroundColor: Colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  methodChipText: { fontSize: 11, fontWeight: '600', color: Colors.textLight },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  amount: { fontSize: 14, fontWeight: '800', color: Colors.text, minWidth: 70, textAlign: 'right' },

  loadMoreBtn: { padding: 12, alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
  loadMoreText: { fontSize: 13, fontWeight: '700', color: Colors.primaryDark },

  right: { flex: 1, backgroundColor: Colors.surface, borderLeftWidth: 1, borderLeftColor: Colors.border },
  emptyDetail: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyDetailText: { fontSize: 13, color: Colors.textMuted },

  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  detailTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  detailSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  statusStrip: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.background, borderRadius: 10, padding: 12, marginBottom: 14 },
  stripTotal: { fontSize: 16, fontWeight: '800', color: Colors.text },

  infoGrid: { gap: 4, marginBottom: 10 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metaLabel: { fontSize: 12, color: Colors.textLight },
  metaValue: { fontSize: 12, fontWeight: '700', color: Colors.text },

  sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 14, marginBottom: 8 },

  lineItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  liName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  liMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  liTotal: { fontSize: 13, fontWeight: '700', color: Colors.text },
  noItems: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', paddingVertical: 12 },

  totalsBlock: { marginTop: 14, backgroundColor: Colors.background, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { fontSize: 12, color: Colors.textLight },
  totalValue: { fontSize: 12, fontWeight: '700', color: Colors.text },
  grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  grandTotalLabel: { fontSize: 14, fontWeight: '800', color: Colors.text },
  grandTotalValue: { fontSize: 14, fontWeight: '800', color: Colors.primary },

  resumeBtn: { flexDirection: 'row', gap: 8, marginTop: 20, backgroundColor: Colors.primary, borderRadius: 12, height: 48, alignItems: 'center', justifyContent: 'center' },
  resumeBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
