import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { C, F } from '../theme/tokens';
import {
  Txt, Button, IconButton, Pill, Avatar, Card, PageHeader, EmptyState, KeyValue,
  UnderlineTabs, TableHead, Cell, TableRow, ColSpec,
} from '../components/ui';
import Money from '../components/Money';
import { useAuthStore } from '../store/authStore';
import { useShiftStore } from '../store/shiftStore';
import { shiftService } from '../services/shiftService';
import { posApi } from '../services/api';

interface ShiftRow {
  shiftID: number;
  cashierName: string;
  branchName: string;
  startedAt: string;
  endedAt?: string | null;
  orderCount: number;
  totalSales: number;
  variance?: number | null;
  statusID: number; // 1 = open, 2 = closed (best-effort — adjust if backend differs)
}

type Filter = 'all' | 'open' | 'closed';

const COLS: Record<'shift' | 'cashier' | 'duration' | 'orders' | 'sales' | 'variance' | 'status', ColSpec> = {
  shift: { label: 'Shift', flex: 1.2 },
  cashier: { label: 'Cashier', flex: 2.4 },
  duration: { label: 'Duration', flex: 1.1 },
  orders: { label: 'Orders', flex: 0.8, align: 'right' },
  sales: { label: 'Sales', flex: 1.1, align: 'right' },
  variance: { label: 'Cash variance', flex: 1.3, align: 'right' },
  status: { label: 'Status', flex: 1, align: 'right' },
};

function fmtStarted(d: string): string {
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) +
    ', ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(start: string, end?: string | null): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  if (isNaN(ms) || ms < 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export default function ShiftsScreen({ onEndShift }: { onEndShift?: () => void }) {
  const user = useAuthStore(s => s.user);
  const activeShift = useShiftStore(s => s.activeShift);
  const currency = user?.currency ?? 'SAR';

  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<ShiftRow | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await posApi.get('/pos/shifts?page=1&pageSize=50');
      const data = res.data?.data ?? res.data;
      const list: any[] = data?.shifts ?? (Array.isArray(data) ? data : []);
      setShifts(list.map(s => ({
        shiftID: s.shiftID,
        cashierName: s.cashierName ?? '—',
        branchName: s.branchName ?? '—',
        startedAt: s.startedAt,
        endedAt: s.endedAt ?? null,
        orderCount: s.orderCount ?? 0,
        totalSales: s.totalSales ?? 0,
        variance: s.variance ?? null,
        statusID: s.statusID ?? (s.endedAt ? 2 : 1),
      })));
    } catch {
      // Non-fatal: no shift-history endpoint reachable (e.g. dev mode) — leave empty.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const counts = useMemo(() => ({
    all: shifts.length,
    open: shifts.filter(s => s.statusID === 1).length,
    closed: shifts.filter(s => s.statusID === 2).length,
  }), [shifts]);
  const filtered = useMemo(() => shifts.filter(s =>
    filter === 'open' ? s.statusID === 1 : filter === 'closed' ? s.statusID === 2 : true), [shifts, filter]);
  const totalSales = useMemo(() => filtered.reduce((sum, s) => sum + Number(s.totalSales ?? 0), 0), [filtered]);
  const withVariance = shifts.filter(s => s.variance != null && Math.abs(s.variance) >= 0.005).length;

  async function openDetail(row: ShiftRow) {
    setSelected(row);
    setSummaryLoading(true);
    try {
      const res = await shiftService.getSummary(row.shiftID);
      setSummary(res);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }

  const sm = summary?.summary;
  return (
    <View style={styles.root}>
      <View style={styles.left}>
        <PageHeader
          title="Shifts"
          subtitle={`${shifts.length} shifts · ${withVariance} with a cash difference`}
          right={activeShift && onEndShift ? <Button variant="dark" label={`End shift #${activeShift.shiftID}`} onPress={onEndShift} /> : null}
        />

        <Card padded={false} style={styles.tableCard}>
          <UnderlineTabs
            tabs={[
              { key: 'all', label: 'All', count: counts.all },
              { key: 'open', label: 'Open', count: counts.open },
              { key: 'closed', label: 'Closed', count: counts.closed },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <TableHead cols={Object.values(COLS)} />
          {loading && !refreshing ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={C.brand} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={s => String(s.shiftID)}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.brand} />}
              ListEmptyComponent={<EmptyState title="No shift history found" icon="clock" />}
              renderItem={({ item }) => <ShiftLine item={item} selected={selected?.shiftID === item.shiftID} onPress={openDetail} />}
            />
          )}
          <View style={styles.tableFoot}>
            <Txt variant="caption" color={C.textMuted}>Showing {filtered.length} of {shifts.length} shifts</Txt>
            <View style={styles.footTotal}>
              <Txt variant="caption" color={C.textMuted}>Total sales</Txt>
              <Money amount={totalSales} currency={currency} style={styles.footAmount} />
            </View>
          </View>
        </Card>
      </View>

      {selected ? (
        <View style={styles.drawer}>
          <View style={styles.drawerHead}>
            <View style={styles.flex}>
              <View style={styles.titleRow}>
                <Txt variant="h1">Shift #{selected.shiftID}</Txt>
                <Pill label={selected.statusID === 1 ? 'Open' : 'Closed'} tone={selected.statusID === 1 ? 'success' : 'neutral'} dot />
              </View>
              <Txt variant="caption" color={C.textMuted}>{selected.cashierName} · {selected.branchName} · {fmtStarted(selected.startedAt)}</Txt>
            </View>
            <IconButton icon="close" variant="tint" onPress={() => setSelected(null)} />
          </View>
          {summaryLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={C.brand} />
          ) : sm ? (
            <ScrollView contentContainerStyle={styles.drawerBody} showsVerticalScrollIndicator={false}>
              <Txt variant="micro" color={C.textMuted}>SALES</Txt>
              <View>
                <KeyValue label="Orders" value={String(sm.orderCount ?? 0)} />
                <KeyValue label="Gross sales" value={<Money amount={sm.totalSales} currency={currency} style={styles.kv} />} />
                <KeyValue label="Discounts" value={<Money amount={sm.totalDiscount} currency={currency} prefix="− " style={styles.kv} />} />
                <KeyValue label="VAT" value={<Money amount={sm.totalTax} currency={currency} style={styles.kv} />} divider={false} />
              </View>
              {summary.payments?.length > 0 ? (
                <>
                  <Txt variant="micro" color={C.textMuted} style={styles.section}>PAYMENTS</Txt>
                  <View>
                    {summary.payments.map((p: any, i: number) => (
                      <KeyValue key={i} label={`${p.paymentMethod} (${p.txCount}x)`} value={<Money amount={p.total} currency={currency} style={styles.kv} />}
                        divider={i < summary.payments.length - 1} />
                    ))}
                  </View>
                </>
              ) : null}
              <Txt variant="micro" color={C.textMuted} style={styles.section}>CASH DRAWER</Txt>
              <View>
                <KeyValue label="Opening cash" value={<Money amount={sm.openingCash} currency={currency} style={styles.kv} />} />
                <KeyValue label="Paid in" value={<Money amount={sm.totalPaidIn} currency={currency} prefix="+ " style={styles.kv} />} />
                <KeyValue label="Paid out" value={<Money amount={sm.totalPaidOut} currency={currency} prefix="− " style={[styles.kv, { color: C.dangerText }]} />} />
                <KeyValue strong label="Expected cash" value={<Money amount={sm.expectedCash} currency={currency} style={styles.kvStrong} />} divider={false} />
              </View>
            </ScrollView>
          ) : (
            <EmptyState title="Could not load shift summary." icon="reports" />
          )}
        </View>
      ) : null}
    </View>
  );
}

const ShiftLine = React.memo(function ShiftLine({ item, selected, onPress }: { item: ShiftRow; selected: boolean; onPress: (s: ShiftRow) => void }) {
  const open = item.statusID === 1;
  const v = item.variance;
  const balanced = v == null || Math.abs(v) < 0.005;
  return (
    <TableRow selected={selected} onPress={() => onPress(item)}>
      <Cell col={COLS.shift} style={styles.stack}>
        <Txt variant="body" weight="bold">#{item.shiftID}</Txt>
        <Txt variant="small" weight="regular" color={C.textMuted}>{fmtStarted(item.startedAt)}</Txt>
      </Cell>
      <Cell col={COLS.cashier}>
        <Avatar name={item.cashierName} />
        <View style={styles.flex}>
          <Txt variant="body" weight="semibold" numberOfLines={1}>{item.cashierName}</Txt>
          <Txt variant="small" weight="regular" color={C.textMuted} numberOfLines={1}>{item.branchName}</Txt>
        </View>
      </Cell>
      <Cell col={COLS.duration}><Txt variant="label" weight="regular">{fmtDuration(item.startedAt, item.endedAt)}</Txt></Cell>
      <Cell col={COLS.orders}><Txt variant="label" weight="regular">{item.orderCount}</Txt></Cell>
      <Cell col={COLS.sales}><Txt variant="body" weight="bold">{Number(item.totalSales ?? 0).toFixed(2)}</Txt></Cell>
      <Cell col={COLS.variance}>
        {open || v == null
          ? <Txt variant="label" color={C.textSubtle}>—</Txt>
          : balanced
            ? <Txt variant="label" weight="semibold" color={C.successText}>Balanced</Txt>
            : <Txt variant="label" weight="semibold" color={v < 0 ? C.dangerText : C.warningText}>{v > 0 ? '+' : ''}{v.toFixed(2)}</Txt>}
      </Cell>
      <Cell col={COLS.status}><Pill label={open ? 'Open' : 'Closed'} tone={open ? 'success' : 'neutral'} dot /></Cell>
    </TableRow>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: C.bg },
  left: { flex: 1, minWidth: 0, padding: 24, paddingBottom: 16, gap: 16 },
  tableCard: { flex: 1, overflow: 'hidden' },
  tableFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: C.border },
  footTotal: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footAmount: { fontSize: 13, fontFamily: F.bold, color: C.text },
  stack: { flexDirection: 'column', alignItems: 'flex-start', gap: 0 },
  flex: { flex: 1, minWidth: 0 },
  drawer: { width: 400, backgroundColor: C.surface, borderLeftWidth: 1, borderLeftColor: C.border },
  drawerHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.divider },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  drawerBody: { padding: 20, gap: 4 },
  section: { marginTop: 14 },
  kv: { fontSize: 14, fontFamily: F.bold, color: C.text },
  kvStrong: { fontSize: 18, fontFamily: F.bold, color: C.text },
});
