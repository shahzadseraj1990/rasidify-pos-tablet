import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { Colors } from '../utils/colors';
import Icon from '../components/Icon';
import Money from '../components/Money';
import { useAuthStore } from '../store/authStore';
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

const FILTERS = ['All', 'Open', 'Closed'] as const;

function fmtStarted(d: string): string {
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) +
    ', ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(start: string, end?: string | null): string {
  if (!end) return 'Open';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (isNaN(ms) || ms < 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export default function ShiftsScreen() {
  const user = useAuthStore(s => s.user);
  const currency = user?.currency ?? 'SAR';

  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<typeof FILTERS[number]>('All');
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

  const filtered = shifts.filter(s => {
    if (filter === 'Open') return s.statusID === 1;
    if (filter === 'Closed') return s.statusID === 2;
    return true;
  });

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

  return (
    <View style={styles.root}>
      <View style={styles.left}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Shift History</Text>
            <Text style={styles.subtitle}>{filtered.length} shifts found</Text>
          </View>
        </View>

        <View style={styles.filterRow}>
          {FILTERS.map(f => (
            <TouchableOpacity key={f} style={[styles.filterPill, filter === f && styles.filterPillActive]} onPress={() => setFilter(f)}>
              <Text style={[styles.filterPillText, filter === f && styles.filterPillTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={s => String(s.shiftID)}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Icon name="clock" size={28} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No shift history found</Text>
              </View>
            }
            renderItem={({ item }) => {
              const active = selected?.shiftID === item.shiftID;
              const open = item.statusID === 1;
              return (
                <TouchableOpacity style={[styles.row, active && styles.rowActive]} onPress={() => openDetail(item)}>
                  <Text style={styles.shiftNo}>#{item.shiftID}</Text>
                  <Text style={styles.rowText} numberOfLines={1}>{item.cashierName}</Text>
                  <Text style={[styles.rowText, styles.rowTextMuted]} numberOfLines={1}>{fmtStarted(item.startedAt)}</Text>
                  <Text style={[styles.rowText, styles.rowTextMuted]}>{fmtDuration(item.startedAt, item.endedAt)}</Text>
                  <Text style={styles.rowTextRight}>{item.orderCount} orders</Text>
                  <Money amount={item.totalSales} currency={currency} style={styles.rowAmount} />
                  <View style={[styles.statusBadge, open ? styles.statusOpen : styles.statusClosed]}>
                    <Text style={[styles.statusText, open ? styles.statusTextOpen : styles.statusTextClosed]}>{open ? 'Open' : 'Closed'}</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>

      <View style={styles.right}>
        {!selected ? (
          <View style={styles.emptyDetail}>
            <Icon name="file-invoice" size={28} color={Colors.textMuted} />
            <Text style={styles.emptyDetailText}>Select a shift to view details</Text>
          </View>
        ) : summaryLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
        ) : (
          <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Shift #{selected.shiftID}</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Icon name="times" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <MetaRow label="Cashier" value={selected.cashierName} />
            <MetaRow label="Branch" value={selected.branchName} />
            <MetaRow label="Started" value={fmtStarted(selected.startedAt)} />

            {summary?.summary && (
              <>
                <Text style={styles.sectionTitle}>Sales</Text>
                <View style={styles.card}>
                  <MetaRow label="Orders" value={String(summary.summary.orderCount ?? 0)} />
                  <MetaRow label="Gross Sales" value={<Money amount={summary.summary.totalSales} currency={currency} style={styles.metaValue} />} />
                  <MetaRow label="Discounts" value={<Money amount={summary.summary.totalDiscount} currency={currency} style={styles.metaValue} prefix="- " />} />
                  <MetaRow label="VAT" value={<Money amount={summary.summary.totalTax} currency={currency} style={styles.metaValue} />} />
                </View>

                {summary.payments?.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>Payments</Text>
                    <View style={styles.card}>
                      {summary.payments.map((p: any, i: number) => (
                        <MetaRow key={i} label={`${p.paymentMethod} (${p.txCount}x)`} value={<Money amount={p.total} currency={currency} style={styles.metaValue} />} />
                      ))}
                    </View>
                  </>
                )}

                <Text style={styles.sectionTitle}>Cash Drawer</Text>
                <View style={styles.card}>
                  <MetaRow label="Opening Cash" value={<Money amount={summary.summary.openingCash} currency={currency} style={styles.metaValue} />} />
                  <MetaRow label="Paid In" value={<Money amount={summary.summary.totalPaidIn} currency={currency} style={styles.metaValue} prefix="+ " />} />
                  <MetaRow label="Paid Out" value={<Money amount={summary.summary.totalPaidOut} currency={currency} style={styles.metaValue} prefix="- " />} />
                  <MetaRow label="Expected Cash" value={<Money amount={summary.summary.expectedCash} currency={currency} style={[styles.metaValue, styles.metaValueBold]} />} bold />
                </View>
              </>
            )}

            {!summary && (
              <Text style={styles.emptyDetailText}>Could not load shift summary.</Text>
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function MetaRow({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, bold && styles.metaValueBold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: Colors.background },

  left: { flex: 1.8, padding: 24 },
  headerRow: { marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  filterPillActive: { backgroundColor: Colors.primaryDark, borderColor: Colors.primaryDark },
  filterPillText: { fontSize: 12, fontWeight: '600', color: Colors.textLight },
  filterPillTextActive: { color: '#fff' },

  empty: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyText: { fontSize: 13, color: Colors.textMuted },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 8,
  },
  rowActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  shiftNo: { fontSize: 13, fontWeight: '800', color: Colors.primary, width: 40 },
  rowText: { fontSize: 13, color: Colors.text, flex: 1 },
  rowTextMuted: { color: Colors.textMuted, fontSize: 12 },
  rowTextRight: { fontSize: 12, color: Colors.textMuted, minWidth: 70, textAlign: 'right' },
  rowAmount: { fontSize: 13, fontWeight: '800', color: Colors.text, minWidth: 70, textAlign: 'right' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, minWidth: 56, alignItems: 'center' },
  statusOpen: { backgroundColor: Colors.successBg },
  statusClosed: { backgroundColor: Colors.surfaceAlt },
  statusText: { fontSize: 11, fontWeight: '700' },
  statusTextOpen: { color: Colors.success },
  statusTextClosed: { color: Colors.textMuted },

  right: { flex: 1, backgroundColor: Colors.surface, borderLeftWidth: 1, borderLeftColor: Colors.border },
  emptyDetail: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyDetailText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  detailTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  metaLabel: { fontSize: 12, color: Colors.textLight },
  metaValue: { fontSize: 12, fontWeight: '700', color: Colors.text },
  metaValueBold: { fontSize: 13, color: Colors.primary },

  sectionTitle: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 16, marginBottom: 6 },
  card: { backgroundColor: Colors.background, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.border },
});
