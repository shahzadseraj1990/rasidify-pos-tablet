import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { C, F } from '../theme/tokens';
import { Txt, Button, Card, PageHeader, StatCard, KeyValue, BarRow, EmptyState } from '../components/ui';
import Money from '../components/Money';
import { useShiftStore } from '../store/shiftStore';
import { useAuthStore } from '../store/authStore';
import { posApi } from '../services/api';
import { appAlert } from '../utils/appAlert';

interface ShiftSummary {
  totalSales: number;
  totalDiscount: number;
  totalTax: number;
  totalRefunds: number;
  totalPaidIn: number;
  totalPaidOut: number;
  orderCount: number;
  openingCash: number;
  expectedCash: number;
  branchName: string;
  cashierName: string;
  startedAt: string;
}
interface PaymentBreak { paymentMethod: string; total: number; txCount: number; }
interface OrderTypeBreak { orderType: string; count?: number; orderCount?: number; txCount?: number; total: number; }
// The summary API's count field name isn't fixed (count / orderCount / …):
// take the first numeric field whose name mentions count.
const typeCount = (o: OrderTypeBreak) => {
  const k = Object.keys(o).find(key => /count/i.test(key) && typeof (o as any)[key] === 'number');
  return k ? Number((o as any)[k]) : 0;
};

function openFor(startedAt?: string): string {
  const ms = startedAt ? Date.now() - new Date(startedAt).getTime() : NaN;
  if (isNaN(ms) || ms < 0) return '';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `Open for ${h} h ${String(m).padStart(2, '0')} min`;
}

export default function ReportsScreen({ onEndShift }: { onEndShift?: () => void }) {
  const shift = useShiftStore(s => s.activeShift);
  const user = useAuthStore(s => s.user);
  const currency = user?.currency ?? 'SAR';

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [payments, setPayments] = useState<PaymentBreak[]>([]);
  const [orderTypes, setOrderTypes] = useState<OrderTypeBreak[]>([]);

  const shiftID = shift?.shiftID;

  useEffect(() => {
    if (shiftID) loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftID]);

  async function loadSummary() {
    if (!shiftID) return;
    setLoading(true);
    try {
      const res = await posApi.get(`/pos/shift/${shiftID}/summary`);
      const d = res.data?.data ?? res.data;
      setSummary(d?.summary ?? null);
      setPayments(d?.payments ?? []);
      setOrderTypes(d?.orderTypes ?? []);
    } catch {
      if (!__DEV__) appAlert('Error', 'Could not load shift summary.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    loadSummary();
  }

  const avgOrder = summary && summary.orderCount > 0 ? summary.totalSales / summary.orderCount : 0;
  const cashRevenue = payments.find(p => p.paymentMethod?.toLowerCase().includes('cash'))?.total ?? 0;
  const payTotal = payments.reduce((s, p) => s + Number(p.total ?? 0), 0);
  const typeMax = Math.max(0, ...orderTypes.map(o => Number(o.total ?? 0)));
  const started = summary?.startedAt ? new Date(summary.startedAt) : null;

  return (
    <View style={styles.root}>
      <PageHeader
        title="Shift report"
        subtitle={shiftID ? [
          `Shift #${shiftID}`,
          summary?.cashierName,
          started ? `Started ${started.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${started.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : null,
          openFor(summary?.startedAt),
        ].filter(Boolean).join(' · ') : undefined}
        right={<>
          <Button variant="outline" icon="refresh" label="Refresh" onPress={onRefresh} disabled={loading || !shiftID} />
          {shiftID && onEndShift ? <Button variant="dark" label="End shift" onPress={onEndShift} /> : null}
        </>}
      />

      {!shiftID ? (
        <EmptyState title="No active shift" subtitle="Start a shift to see its report." icon="reports" />
      ) : loading && !refreshing ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.kpis}>
            <StatCard label="Total sales" amount={summary?.totalSales ?? 0} currency={currency} caption={`Incl. VAT ${(summary?.totalTax ?? 0).toFixed(2)}`} />
            <StatCard label="Orders" value={String(summary?.orderCount ?? 0)} caption={summary?.branchName || undefined} />
            <StatCard label="Average order" amount={avgOrder} currency={currency} caption="Per paid order" />
            <StatCard
              label="Discounts and refunds"
              amount={(summary?.totalDiscount ?? 0) + (summary?.totalRefunds ?? 0)}
              currency={currency}
              caption={`Discounts ${(summary?.totalDiscount ?? 0).toFixed(2)} · Refunds ${(summary?.totalRefunds ?? 0).toFixed(2)}`}
            />
          </View>

          <View style={styles.columns}>
            <Card style={styles.wide}>
              <Txt variant="title" weight="bold">Sales by order type</Txt>
              {orderTypes.length === 0 ? (
                <Txt variant="caption" color={C.textMuted}>No orders yet.</Txt>
              ) : orderTypes.map((ot, i) => (
                <BarRow
                  key={i}
                  label={ot.orderType || 'Walk-in'}
                  ratio={typeMax > 0 ? Number(ot.total ?? 0) / typeMax : 0}
                  count={`${typeCount(ot)} order${typeCount(ot) !== 1 ? 's' : ''}`}
                  amount={ot.total}
                  currency={currency}
                />
              ))}
            </Card>

            <View style={styles.narrow}>
              <Card>
                <Txt variant="title" weight="bold" style={styles.cardTitle}>Cash drawer</Txt>
                <KeyValue label="Opening cash" value={<Money amount={summary?.openingCash} currency={currency} style={styles.kv} />} />
                <KeyValue label="Cash sales" value={<Money amount={cashRevenue} currency={currency} style={styles.kv} />} />
                <KeyValue label="Paid in" value={<Money amount={summary?.totalPaidIn} currency={currency} style={styles.kv} />} />
                <KeyValue label="Paid out" value={<Money amount={summary?.totalPaidOut} currency={currency} prefix="− " style={[styles.kv, { color: C.dangerText }]} />} />
                <KeyValue strong label="Expected in drawer" value={<Money amount={summary?.expectedCash} currency={currency} style={styles.kvStrong} />} divider={false} />
              </Card>

              <Card style={styles.payCard}>
                <Txt variant="title" weight="bold">Payment methods</Txt>
                {payments.length === 0 ? (
                  <Txt variant="caption" color={C.textMuted}>No payments yet.</Txt>
                ) : payments.map((p, i) => (
                  <BarRow
                    key={i}
                    stacked
                    label={p.paymentMethod}
                    sub={payTotal > 0 ? `${Math.round((Number(p.total ?? 0) / payTotal) * 100)}% · ${p.txCount} txn${p.txCount !== 1 ? 's' : ''}` : undefined}
                    ratio={payTotal > 0 ? Number(p.total ?? 0) / payTotal : 0}
                    amount={p.total}
                    currency={currency}
                  />
                ))}
              </Card>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 24, paddingBottom: 0, gap: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { gap: 16, paddingBottom: 24 },
  kpis: { flexDirection: 'row', gap: 14 },
  columns: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  wide: { flex: 1.45, gap: 12 },
  narrow: { flex: 1, gap: 14 },
  cardTitle: { marginBottom: 4 },
  payCard: { gap: 12 },
  kv: { fontSize: 14, fontFamily: F.bold, color: C.text },
  kvStrong: { fontSize: 20, fontFamily: F.bold, color: C.text },
});
