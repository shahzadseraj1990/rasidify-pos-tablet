import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { C, F, palette, Tone } from '../theme/tokens';
import {
  Txt, Glyph, orderTypeGlyph, Button, IconButton, Pill, Avatar, Card, PageHeader, EmptyState,
  Field, Dropdown, Segmented, UnderlineTabs, TableHead, Cell, TableRow, ColSpec,
} from '../components/ui';
import Money from '../components/Money';
import KitchenBadge from '../components/KitchenBadge';
import KitchenTicketsPanel from '../components/KitchenTicketsPanel';
import { useShiftStore } from '../store/shiftStore';
import { useCartStore } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { posApi } from '../services/api';
import { cartItemsFromInvoiceLines, customerFromInvoice } from '../utils/invoiceLines';
import { loadKitchenStateIntoCart } from '../services/kitchenTicketService';
import { useSessionStore, getStoreInfo, storeFields } from '../store/sessionStore';
import { zatcaPhase1Qr } from '../utils/zatcaPhase1Qr';
import { PosOrder } from '../types';
import { ViewShotRef } from 'react-native-view-shot';
import { ReceiptPaper, ReceiptPrintCapture } from '../components/receipt/ReceiptPaper';
import { ReceiptData } from '../types/receipt';
import { buildSelectionTree } from '../utils/selectionTree';
import { orderService } from '../services/orderService';
import { printReceiptNow } from '../services/receiptPrintFlow';
import { usePrinterStore } from '../store/printerStore';
import { useReceiptSettingsStore } from '../store/receiptSettingsStore';
import { useToastStore } from '../store/toastStore';
import { appAlert } from '../utils/appAlert';

// Modifier / combo lines of a saved order line: the structured selections
// when the API returns them (nested picks indented), else the saved
// description text ("Size: Large +2, Coke").
function lineModifiers(li: any): { label: string; extra: number; child?: boolean }[] {
  const sels = (li.selections ?? li.Selections ?? []).map((x: any) => ({
    selectionType: x.selectionType ?? x.SelectionType,
    groupName: x.groupName ?? x.GroupName,
    itemName: x.itemName ?? x.ItemName ?? '',
    additionalPrice: Number(x.additionalPrice ?? x.AdditionalPrice ?? 0),
  }));
  if (sels.length > 0) {
    return buildSelectionTree(sels).flatMap(n => [
      { label: n.label, extra: n.extra },
      ...n.children.map(c => ({ label: c.label, extra: c.extra, child: true })),
    ]);
  }
  const desc: string = li.productDescription ?? li.ProductDescription ?? '';
  return desc && desc !== 'POS Order'
    ? desc.split(',').map(t => t.trim()).filter(Boolean).map(label => ({ label, extra: 0 }))
    : [];
}

const PAGE_SIZE = 30;

const STATUS_LABELS: Record<number, string> = {
  100: 'Draft', 105: 'Paid', 106: 'Unpaid', 107: 'Partial',
  108: 'Overdue', 109: 'Cancelled', 110: 'Refunded', 20: 'Held',
};
const STATUS_TONES: Record<number, Tone> = {
  105: 'info', 106: 'warning', 107: 'brand', 108: 'danger', 109: 'neutral', 110: 'neutral', 20: 'warning',
};
const statusTone = (id: number): Tone => STATUS_TONES[id] ?? 'neutral';

// Status tabs over the loaded orders (the list API is not filtered by status).
type StatusTab = 'all' | 'unpaid' | 'paid' | 'refunded';
const TAB_MATCH: Record<StatusTab, (id: number) => boolean> = {
  all: () => true,
  unpaid: id => id === 106 || id === 107 || id === 20 || id === 108,
  paid: id => id === 105,
  refunded: id => id === 110,
};

const COLS: Record<'order' | 'customer' | 'type' | 'payment' | 'total', ColSpec> = {
  order: { label: 'Order', flex: 1 },
  customer: { label: 'Customer', flex: 2.4 },
  type: { label: 'Type', flex: 1.6 },
  payment: { label: 'Payment', flex: 1.8 },
  total: { label: 'Total', flex: 1.1, align: 'right' },
};

const fmtTime = (d: Date) => isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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

  // Reprint: same print path as checkout (hidden ReceiptPaper for Image
  // Canvas mode), headed DUPLICATE BILL / UNPAID BILL.
  const printer = usePrinterStore();
  const receiptSettings = useReceiptSettingsStore();
  const toast = useToastStore(s => s.show);
  const printViewShotRef = useRef<ViewShotRef>(null);
  const [printCapture, setPrintCapture] = useState<ReceiptData | null>(null);
  const [reprinting, setReprinting] = useState(false);

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

  async function reprintOrder(order: OrderDetail) {
    if (reprinting) return;
    if (!printer.isConfigured) {
      appAlert('Printer Not Configured', 'Set up a printer first in Menu → Printer Settings.');
      return;
    }
    setReprinting(true);
    try {
      const paid = order.statusID === 105;
      // A paid order carries the same ZATCA QR as the original receipt;
      // signing again is idempotent (it reuses the stored signature).
      // Unpaid orders are never signed from here.
      const signed = paid ? await orderService.signForReceipt(order.invoiceID) : null;
      const store = getStoreInfo(user);
      // Same Phase 1 fallback as checkout when signing returns no QR.
      const qr = signed ?? (paid && store.isTaxRegistered && store.vatNumber
        ? zatcaPhase1Qr(store.companyName, store.vatNumber, parseOrderDate(order.transactionDate),
            Number(order.totalAmount ?? 0), Number(order.vatAmount ?? 0))
        : null);
      const items = (order.line_items ?? []).map((li: any) => ({
        name: li.productName ?? li.ProductName ?? li.name ?? '',
        alternateName: li.alternateName ?? li.AlternateName,
        qty: Number(li.qty ?? li.Qty ?? li.quantity ?? 1),
        price: Number(li.price ?? li.Price ?? li.unitPrice ?? 0),
        selections: lineModifiers(li).map(m => m.label).join(', ') || undefined,
      }));
      const subtotal = order.subtotal ?? items.reduce((sum, i) => sum + i.qty * i.price, 0);
      const data: ReceiptData = {
        orderNumber: orderNum(order),
        invoiceCode: order.transactionNumber,
        heading: paid ? 'DUPLICATE BILL' : 'UNPAID BILL',
        items,
        subtotal,
        vat: order.vatAmount ?? 0,
        discount: order.discount ?? 0,
        total: order.totalAmount,
        payments: (order.line_payments ?? []).map((pm: any) => ({ method: pm.paymentMethod, amount: Number(pm.paymentAmount ?? 0) })),
        change: 0,
        customerName: custName(order) === 'Walk-in Customer' ? undefined : custName(order),
        orderType: order.orderType ?? undefined,
        tableNo: order.tableNo ?? undefined,
        orderNote: order.customerNote,
        time: parseOrderDate(order.transactionDate),
        cashierName: (order as any).staffName ?? user?.name,
        currency,
        ...storeFields(store),
        zatcaQrCode: qr,
      };
      setPrintCapture(data);
      if (receiptSettings.printMode === 'image') {
        await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      }
      const result = await printReceiptNow(data, receiptSettings, printer, printViewShotRef);
      if (result.success) toast('Receipt reprinted', 'success', `Order ${orderNum(order)}`);
      else appAlert('Print Failed', result.error);
    } finally {
      setReprinting(false);
    }
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
    loadKitchenStateIntoCart(order.invoiceID);
    setSelected(null);
    onResumeOrder();
  }

  const [tab, setTab] = useState<StatusTab>('all');
  const visible = useMemo(() => orders.filter(o => TAB_MATCH[tab](o.statusID)), [orders, tab]);
  const tabCount = (t: StatusTab) => orders.filter(o => TAB_MATCH[t](o.statusID)).length;
  const salesTotal = useMemo(() => orders.filter(o => o.statusID === 105).reduce((sum, o) => sum + Number(o.totalAmount ?? 0), 0), [orders]);
  const typeOptions = useMemo(() => [{ key: 0, label: 'All types' }, ...orderTypes.map((t: any) => ({ key: t.orderTypeID as number, label: t.name as string }))], [orderTypes]);

  return (
    <View style={styles.root}>
      <View style={styles.left}>
        <PageHeader
          title="Orders"
          subtitle={`${showAllShifts ? 'All shifts' : `Shift #${shiftID}`} · ${totalCount} order${totalCount === 1 ? '' : 's'} · ${currency} ${salesTotal.toFixed(2)} paid`}
          right={<>
            <Field icon="search" height={48} containerStyle={styles.search} placeholder="Order #, customer or table" value={search} onChangeText={onSearch} />
            <Dropdown icon="filter" options={typeOptions} value={filterType} onChange={onFilterType} />
            <Segmented
              options={[{ key: 'shift', label: 'This shift' }, { key: 'all', label: 'All shifts' }]}
              value={showAllShifts ? 'all' : 'shift'}
              onChange={k => { if ((k === 'all') !== showAllShifts) toggleAllShifts(); }}
            />
          </>}
        />

        <Card padded={false} style={styles.tableCard}>
          <UnderlineTabs
            tabs={[
              { key: 'all', label: 'All', count: tabCount('all') },
              { key: 'unpaid', label: 'Unpaid', count: tabCount('unpaid') },
              { key: 'paid', label: 'Paid', count: tabCount('paid') },
              { key: 'refunded', label: 'Refunded', count: tabCount('refunded') },
            ]}
            value={tab}
            onChange={setTab}
          />
          <TableHead cols={Object.values(COLS)} />
          {loading && !refreshing ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={C.brand} />
          ) : (
            <FlatList
              data={visible}
              keyExtractor={item => String(item.invoiceID)}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
              initialNumToRender={12}
              windowSize={7}
              ListEmptyComponent={<EmptyState title="No orders match these filters." icon="orders" />}
              renderItem={({ item }) => (
                <OrderRow item={item} currency={currency} selected={selected?.invoiceID === item.invoiceID} onPress={openDetail} />
              )}
            />
          )}
          <View style={styles.tableFoot}>
            <Txt variant="caption" color={C.textMuted}>Showing {orders.length} of {totalCount} orders</Txt>
            {page < totalPages ? <Button variant="outline" size="sm" label="Load more" iconRight="chevronDown" onPress={() => loadOrders(page + 1, true)} /> : null}
          </View>
        </Card>
      </View>

      {selected ? (
        <View style={styles.drawer}>
          <View style={styles.drawerHead}>
            <View style={styles.flex}>
              <View style={styles.titleRow}>
                <Txt variant="h1">Order {orderNum(selected)}</Txt>
                <Pill label={STATUS_LABELS[selected.statusID] ?? 'Unknown'} tone={statusTone(selected.statusID)} />
              </View>
              <Txt variant="caption" color={C.textMuted}>
                {[fmtDateTime(parseOrderDate(selected.transactionDate)), selected.orderType, selected.tableNo ? `Table ${selected.tableNo}` : null].filter(Boolean).join(' · ')}
              </Txt>
            </View>
            <IconButton icon="close" variant="tint" onPress={() => setSelected(null)} />
          </View>

          <ScrollView contentContainerStyle={styles.drawerBody} showsVerticalScrollIndicator={false}>
            <View style={styles.customerBox}>
              <Avatar name={custName(selected)} size={40} />
              <View style={styles.flex}>
                <Txt variant="title">{custName(selected)}</Txt>
                <KitchenBadge invoiceId={selected.invoiceID} />
              </View>
            </View>

            <KitchenTicketsPanel invoiceId={selected.invoiceID} />

            <Txt variant="micro" color={C.textMuted} style={styles.section}>ITEMS · {selected.line_items?.length ?? 0}</Txt>
            {detailLoading ? (
              <ActivityIndicator color={C.brand} style={{ marginVertical: 12 }} />
            ) : (selected.line_items?.length ?? 0) > 0 ? (
              selected.line_items!.map((li: any, idx: number) => (
                <View key={idx} style={styles.lineItem}>
                  <Txt variant="label" weight="bold" style={styles.qty}>{li.qty ?? li.quantity ?? 1}×</Txt>
                  <View style={styles.flex}>
                    <Txt variant="label" weight="semibold">{li.productName ?? li.description ?? li.name ?? ''}</Txt>
                    {lineModifiers(li).map((m, mi) => (
                      <Txt key={mi} variant="small" weight="regular" color={C.textMuted} style={m.child ? styles.modChild : undefined}>
                        {m.child ? '↳ ' : '+ '}{m.label}{m.extra > 0 ? `  (+${m.extra.toFixed(2)})` : ''}
                      </Txt>
                    ))}
                    {!!(li.kitchenNote ?? li.KitchenNote) && (
                      <Txt variant="small" weight="semibold" color={palette.amberInkStrong}>Note: {li.kitchenNote ?? li.KitchenNote}</Txt>
                    )}
                  </View>
                  <Money amount={li.amount ?? li.grandTotal ?? (li.qty ?? 1) * (li.price ?? 0)} currency={currency} style={styles.lineTotal} />
                </View>
              ))
            ) : (
              <Txt variant="caption" color={C.textMuted} align="center">No items</Txt>
            )}

            <View style={styles.sums}>
              <SumRow label="Subtotal" amount={selected.subtotal ?? selected.totalAmount} currency={currency} />
              {selected.discount > 0 ? <SumRow label="Discount" amount={selected.discount} currency={currency} prefix="− " color={C.danger} /> : null}
              {(selected.vatAmount ?? 0) > 0 ? <SumRow label="VAT" amount={selected.vatAmount ?? 0} currency={currency} /> : null}
              <View style={styles.grandRow}>
                <Txt variant="title" weight="bold">Total</Txt>
                <Money amount={selected.totalAmount} currency={currency} style={styles.grand} />
              </View>
            </View>

            {!detailLoading && (selected.line_payments?.length ?? 0) > 0 ? (
              <View style={styles.pays}>
                <Txt variant="micro" color={C.textMuted}>PAYMENTS</Txt>
                {selected.line_payments!.map((pm: any, i: number) => (
                  <View key={i} style={styles.payRow}>
                    <View style={styles.payCheck}><Glyph name="check" size={14} color={palette.ink} strokeWidth={2.6} /></View>
                    <Txt variant="label" style={styles.flex}>{pm.paymentMethod}</Txt>
                    <Money amount={pm.paymentAmount} currency={currency} style={styles.payAmount} />
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.drawerFoot}>
            <Button
              variant="outline"
              size="lg"
              icon="printer"
              label="Reprint"
              loading={reprinting}
              disabled={detailLoading}
              onPress={() => reprintOrder(selected)}
              style={styles.flex}
            />
            {(selected.statusID === 20 || selected.statusID === 106) ? (
              <Button size="lg" label="Resume order" iconRight="arrowRight" onPress={() => resumeHeldOrder(selected)} style={styles.flex2} />
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Off-screen receipt for Image Canvas print mode (see SellScreen). */}
      {printCapture && (
        <ReceiptPrintCapture
          ref={printViewShotRef}
          receipt={printCapture} settings={receiptSettings} paperWidth={printer.paperWidth}
        />
      )}
    </View>
  );
}

const OrderRow = React.memo(function OrderRow({ item, currency, selected, onPress }: {
  item: PosOrder; currency: string; selected: boolean; onPress: (o: PosOrder) => void;
}) {
  const name = custName(item);
  return (
    <TableRow selected={selected} onPress={() => onPress(item)}>
      <Cell col={COLS.order} style={styles.stack}>
        <Txt variant="body" weight="bold">{orderNum(item)}</Txt>
        <Txt variant="small" weight="regular" color={C.textMuted}>{fmtTime(parseOrderDate(item.transactionDate))}</Txt>
      </Cell>
      <Cell col={COLS.customer}>
        <Avatar name={name} label={name.startsWith('Walk-in') ? 'W' : undefined} tone={name.startsWith('Walk-in') ? 'neutral' : undefined} />
        <Txt variant="body" weight="semibold" numberOfLines={1} style={styles.flexShrink}>{name}</Txt>
        <KitchenBadge invoiceId={item.invoiceID} />
      </Cell>
      <Cell col={COLS.type}>
        <Glyph name={orderTypeGlyph(item.orderType)} size={18} color={C.textMuted} />
        <Txt variant="label" weight="regular" numberOfLines={1} style={styles.flexShrink}>
          {[item.orderType, item.tableNo].filter(Boolean).join(' · ') || '—'}
        </Txt>
      </Cell>
      <Cell col={COLS.payment}>
        <Pill label={STATUS_LABELS[item.statusID] ?? 'Unknown'} tone={statusTone(item.statusID)} />
        <Txt variant="caption" color={C.textMuted} numberOfLines={1} style={styles.flexShrink}>{item.paymentMethodTitle || '—'}</Txt>
      </Cell>
      <Cell col={COLS.total}>
        <Money amount={item.totalAmount} currency={currency} style={styles.rowTotal} />
      </Cell>
    </TableRow>
  );
});

function SumRow({ label, amount, currency, prefix, color }: { label: string; amount: number; currency: string; prefix?: string; color?: string }) {
  return (
    <View style={styles.sumRow}>
      <Txt variant="label" weight="regular" color={color ?? C.textMuted}>{label}</Txt>
      <Money amount={amount} currency={currency} prefix={prefix} style={[styles.sumValue, color ? { color } : null]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: C.bg },
  left: { flex: 1, minWidth: 0, padding: 24, paddingBottom: 16, gap: 16 },
  search: { width: 300 },
  tableCard: { flex: 1, overflow: 'hidden' },
  tableFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: C.border },
  stack: { flexDirection: 'column', alignItems: 'flex-start', gap: 0 },
  flex: { flex: 1, minWidth: 0 },
  flex2: { flex: 2 },
  flexShrink: { flexShrink: 1 },
  rowTotal: { fontSize: 15, fontFamily: F.bold, color: C.text },

  drawer: { width: 400, backgroundColor: C.surface, borderLeftWidth: 1, borderLeftColor: C.border },
  drawerHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.divider },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  drawerBody: { padding: 20, gap: 12 },
  customerBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: C.bg },
  section: { marginTop: 4, letterSpacing: 0.8 },
  lineItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  qty: { minWidth: 26 },
  modChild: { marginLeft: 14 },
  lineTotal: { fontSize: 14, fontFamily: F.semibold, color: C.text },
  sums: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.divider },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sumValue: { fontSize: 14, fontFamily: F.regular, color: C.textMuted },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, marginTop: 2, borderTopWidth: 1, borderTopColor: C.border },
  grand: { fontSize: 22, fontFamily: F.bold, color: C.text },
  pays: { gap: 6 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.bg },
  payCheck: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  payAmount: { fontSize: 14, fontFamily: F.semibold, color: C.text },
  drawerFoot: { flexDirection: 'row', gap: 8, padding: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border },
});
