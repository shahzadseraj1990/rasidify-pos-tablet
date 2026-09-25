import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { Colors } from '../utils/colors';
import Icon from '../components/Icon';
import Money from '../components/Money';
import { useShiftStore } from '../store/shiftStore';
import { useAuthStore } from '../store/authStore';
import { posApi } from '../services/api';

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
interface OrderTypeBreak { orderType: string; count: number; total: number; }

function KpiCard({ label, value, color, icon }: { label: string; value: React.ReactNode; color?: string; icon: string }) {
  return (
    <View style={styles.kpiCard}>
      <View style={[styles.kpiIconWrap, color ? { backgroundColor: color + '22' } : null]}>
        <Icon name={icon} size={14} color={color ?? Colors.textMuted} />
      </View>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

export default function ReportsScreen() {
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
      if (!__DEV__) Alert.alert('Error', 'Could not load shift summary.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    loadSummary();
  }

  function methodColor(m: string) {
    const n = (m ?? '').toLowerCase();
    if (n.includes('cash')) return { bg: '#D1FAE5', text: '#059669' };
    if (n.includes('card') || n.includes('bank')) return { bg: '#DBEAFE', text: '#2563EB' };
    return { bg: Colors.surfaceAlt, text: Colors.textLight };
  }

  const avgOrder = summary && summary.orderCount > 0 ? summary.totalSales / summary.orderCount : 0;
  const cashRevenue = payments.find(p => p.paymentMethod?.toLowerCase().includes('cash'))?.total ?? 0;

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Shift Report</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} disabled={loading}>
          <Icon name="redo" size={13} color={Colors.primaryDark} />
        </TouchableOpacity>
      </View>

      {!shiftID ? (
        <View style={styles.center}>
          <Icon name="chart-bar" size={28} color={Colors.textMuted} />
          <Text style={styles.noShiftText}>No active shift</Text>
        </View>
      ) : loading && !refreshing ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {summary && (
            <View style={styles.shiftInfo}>
              <Text style={styles.shiftInfoTitle}>{summary.branchName || 'Branch'}</Text>
              <Text style={styles.shiftInfoSub}>Cashier: {summary.cashierName}</Text>
              {summary.startedAt && <Text style={styles.shiftInfoSub}>Started: {new Date(summary.startedAt).toLocaleString()}</Text>}
            </View>
          )}

          <Text style={styles.sectionTitle}>Sales Summary</Text>
          <View style={styles.kpiGrid}>
            <KpiCard label="Total Sales" value={<Money amount={summary?.totalSales} currency={currency} style={[styles.kpiValue, { color: Colors.success }]} />} color={Colors.success} icon="coins" />
            <KpiCard label="Orders" value={String(summary?.orderCount ?? 0)} icon="receipt" />
            <KpiCard label="Avg Order" value={<Money amount={avgOrder} currency={currency} style={styles.kpiValue} />} icon="chart-line" />
            <KpiCard label="Total Tax" value={<Money amount={summary?.totalTax} currency={currency} style={[styles.kpiValue, { color: Colors.primary }]} />} color={Colors.primary} icon="percentage" />
            <KpiCard label="Discount" value={<Money amount={summary?.totalDiscount} currency={currency} style={[styles.kpiValue, { color: Colors.warning }]} />} color={Colors.warning} icon="tag" />
            <KpiCard label="Refunds" value={<Money amount={summary?.totalRefunds} currency={currency} style={[styles.kpiValue, { color: Colors.danger }]} />} color={Colors.danger} icon="undo" />
          </View>

          <Text style={styles.sectionTitle}>Cash Drawer</Text>
          <View style={styles.card}>
            <Row label="Opening Cash" value={<Money amount={summary?.openingCash} currency={currency} style={styles.rowValue} />} />
            <Row label="Cash Sales" value={<Money amount={cashRevenue} currency={currency} style={styles.rowValue} />} />
            <Row label="Paid In" value={<Money amount={summary?.totalPaidIn} currency={currency} style={styles.rowValue} />} />
            <Row label="Paid Out" value={<Money amount={summary?.totalPaidOut} currency={currency} style={[styles.rowValue, { color: Colors.danger }]} prefix="− " />} valueColor={Colors.danger} />
            <View style={styles.divider} />
            <Row label="Expected Cash" value={<Money amount={summary?.expectedCash} currency={currency} style={[styles.rowValue, styles.rowValueBold]} />} bold />
          </View>

          {payments.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Payment Methods</Text>
              <View style={styles.card}>
                {payments.map((p, i) => {
                  const mc = methodColor(p.paymentMethod);
                  return (
                    <View key={i} style={[styles.payRow, i < payments.length - 1 && styles.payRowBorder]}>
                      <View style={[styles.methodBadge, { backgroundColor: mc.bg }]}>
                        <Text style={[styles.methodText, { color: mc.text }]}>{p.paymentMethod}</Text>
                      </View>
                      <View style={styles.payRight}>
                        <Text style={styles.payCount}>{p.txCount} txn{p.txCount !== 1 ? 's' : ''}</Text>
                        <Money amount={p.total} currency={currency} style={styles.payTotal} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {orderTypes.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>By Order Type</Text>
              <View style={styles.card}>
                {orderTypes.map((ot, i) => (
                  <View key={i} style={[styles.payRow, i < orderTypes.length - 1 && styles.payRowBorder]}>
                    <Text style={styles.otName}>{ot.orderType || 'Walk-in'}</Text>
                    <View style={styles.payRight}>
                      <Text style={styles.payCount}>{ot.count} order{ot.count !== 1 ? 's' : ''}</Text>
                      <Money amount={ot.total} currency={currency} style={styles.payTotal} />
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Row({ label, value, bold, valueColor }: { label: string; value: React.ReactNode; bold?: boolean; valueColor?: string }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && styles.rowLabelBold]}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.rowValueBold, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 16, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text },
  refreshBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  noShiftText: { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },

  scroll: { padding: 24, paddingBottom: 48, maxWidth: 900, width: '100%', alignSelf: 'center' },

  shiftInfo: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: Colors.border },
  shiftInfoTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  shiftInfoSub: { fontSize: 13, color: Colors.textLight, marginTop: 2 },

  sectionTitle: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 20 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpiCard: { flexBasis: '31%', flexGrow: 1, backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border },
  kpiIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  kpiLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  kpiValue: { fontSize: 19, fontWeight: '800', color: Colors.text, marginTop: 4 },

  card: { backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16, paddingVertical: 6 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 4 },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  rowLabel: { fontSize: 13, color: Colors.textLight, fontWeight: '500' },
  rowLabelBold: { fontWeight: '700', color: Colors.text, fontSize: 14 },
  rowValue: { fontSize: 13, fontWeight: '600', color: Colors.text },
  rowValueBold: { fontSize: 14, fontWeight: '800' },

  payRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  payRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.background },
  methodBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  methodText: { fontSize: 13, fontWeight: '700' },
  payRight: { alignItems: 'flex-end', gap: 2 },
  payCount: { fontSize: 11, color: Colors.textMuted },
  payTotal: { fontSize: 14, fontWeight: '700', color: Colors.text },
  otName: { fontSize: 14, fontWeight: '600', color: Colors.text },
});
