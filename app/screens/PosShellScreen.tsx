import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, ActivityIndicator } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation';
import { useAuthStore } from '../store/authStore';
import { useShiftStore } from '../store/shiftStore';
import { shiftService } from '../services/shiftService';
import { authService } from '../services/authService';
import { Colors } from '../utils/colors';
import Icon from '../components/Icon';
import Money from '../components/Money';
import { useCustomerDisplayStore } from '../store/customerDisplayStore';
import { useKitchenStore } from '../store/kitchenStore';
import { flushCloudOutbox } from '../services/kitchenTicketService';
import { buildZReportEscPos, buildZReportHtml, ZReportInput } from '../services/zReport';
import { printReceipt } from '../services/PrinterService';
import { usePrinterStore } from '../store/printerStore';
import { useToastStore } from '../store/toastStore';
import { PosShiftSummary, PaymentBreakdown } from '../types';

import SellScreen from './SellScreen';
import OrdersScreen from './OrdersScreen';
import ReportsScreen from './ReportsScreen';
import MenuScreen from './MenuScreen';
import ShiftsScreen from './ShiftsScreen';
import TablesScreen from './TablesScreen';
import { appAlert } from '../utils/appAlert';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Shell'> };

type SectionKey = 'Sell' | 'Orders' | 'Tables' | 'Reports' | 'Menu' | 'Shifts';

const BASE_SECTIONS: { key: SectionKey; label: string; icon: string }[] = [
  { key: 'Sell', label: 'Sell', icon: 'cash-register' },
  { key: 'Orders', label: 'Orders', icon: 'clipboard-list' },
  { key: 'Tables', label: 'Tables', icon: 'chair' },
  { key: 'Reports', label: 'Reports', icon: 'chart-bar' },
  { key: 'Menu', label: 'Menu', icon: 'bars' },
  { key: 'Shifts', label: 'Shifts', icon: 'clock' },
];

export default function PosShellScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState<SectionKey>('Sell');
  const [endModalVisible, setEndModalVisible] = useState(false);
  const [closingCash, setClosingCash] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [endingShift, setEndingShift] = useState(false);
  // Fresh numbers from the server for the End Shift sheet and the Z report
  // (activeShift's totals are only as new as the last bootstrap).
  const [endSummary, setEndSummary] = useState<{ summary: PosShiftSummary; payments: PaymentBreakdown[]; entries: any[] } | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const printer = usePrinterStore();
  const toast = useToastStore(s => s.show);

  const clearAuth = useAuthStore(s => s.clearAuth);
  const user = useAuthStore(s => s.user);
  const currency = user?.currency ?? 'SAR';
  const activeShift = useShiftStore(s => s.activeShift);

  // Kitchen display (KDS): reconnect to the saved kitchen and load open tickets.
  useEffect(() => {
    useKitchenStore.getState().init('cashier', `Cashier · ${user?.name ?? 'POS'}`, activeShift?.branchID ?? user?.branchID ?? null);
    useCustomerDisplayStore.getState().init(`Cashier · ${user?.name ?? 'POS'}`);
    flushCloudOutbox().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const clearShift = useShiftStore(s => s.clearShift);

  const isRestaurant = user?.industryType === 'restaurant';
  const SECTIONS = isRestaurant ? BASE_SECTIONS : BASE_SECTIONS.filter(s => s.key !== 'Tables');

  const expectedCash = activeShift
    ? (activeShift.openingCash ?? 0) + (activeShift.totalSales ?? 0) + (activeShift.totalPaidIn ?? 0) - (activeShift.totalPaidOut ?? 0)
    : 0;

  const handleLogout = () => {
    appAlert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout', style: 'destructive',
        onPress: async () => {
          await authService.logout();
          clearAuth();
          clearShift();
          navigation.replace('PinLogin');
        },
      },
    ]);
  };

  const openEndShift = () => {
    setClosingCash(String(expectedCash.toFixed(2)));
    setEndSummary(null);
    setEndModalVisible(true);
    if (!activeShift) return;
    setLoadingSummary(true);
    shiftService.getSummary(activeShift.shiftID)
      .then(d => {
        if (!d?.summary) return;
        setEndSummary({ summary: d.summary, payments: d.payments ?? [], entries: d.entries ?? [] });
        setClosingCash((d.summary.expectedCash ?? 0).toFixed(2));
      })
      .catch(() => {})
      .finally(() => setLoadingSummary(false));
  };

  const handleEndShift = async () => {
    const cash = parseFloat(closingCash);
    if (isNaN(cash) || cash < 0) {
      appAlert('Invalid Amount', 'Please enter a valid closing cash amount.');
      return;
    }
    if (!activeShift) return;
    setEndingShift(true);
    try {
      // Z report: saved with the shift (same HTML as the web POS, so web can
      // reprint it) and printed here after the shift closes.
      const summary: PosShiftSummary = endSummary?.summary ?? {
        shiftID: activeShift.shiftID, branchName: activeShift.branchName, cashierName: activeShift.cashierName,
        openingCash: activeShift.openingCash, totalSales: activeShift.totalSales, totalDiscount: activeShift.totalDiscount,
        totalTax: activeShift.totalTax, totalRefunds: activeShift.totalRefunds, totalPaidIn: activeShift.totalPaidIn,
        totalPaidOut: activeShift.totalPaidOut, orderCount: activeShift.orderCount, expectedCash,
        startedAt: activeShift.startedAt, statusID: activeShift.statusID,
      };
      const z: ZReportInput = {
        summary: { ...summary, closingCash: cash },
        payments: endSummary?.payments ?? [],
        entries: endSummary?.entries ?? [],
        businessName: user?.companyName || user?.name || '',
        branchName: summary.branchName,
        cashierName: summary.cashierName || user?.name,
        currency,
        closedAt: new Date(),
      };
      await shiftService.end(activeShift.shiftID, {
        closingCash,
        closingNotes: closingNotes.trim() || undefined,
        zReportData: buildZReportHtml(z),
      });
      if (printer.isConfigured) {
        printReceipt(buildZReportEscPos(z, printer.paperWidth), printer)
          .then(r => toast('Shift closed', r.success ? 'success' : 'error', r.success ? 'Z report printed' : `Z report not printed: ${r.error}`))
          .catch(() => toast('Shift closed', 'error', 'Z report not printed'));
      } else {
        toast('Shift closed', 'success', 'No printer set up — Z report saved only');
      }
      clearShift();
      setEndModalVisible(false);
      navigation.replace('ShiftStart');
    } catch (err: any) {
      const d = err?.response?.data;
      const msg = d?.message ?? d?.Message ?? d?.error ?? d?.Error ?? err?.message ?? 'Please try again.';
      appAlert('Failed to End Shift', msg);
    } finally {
      setEndingShift(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.topbar, { paddingTop: insets.top, height: 56 + insets.top }]}>
        <View style={styles.topbarLeft}>
          {activeShift && (
            <View style={styles.shiftBadge}>
              <View style={styles.shiftDot} />
              <Text style={styles.shiftBadgeText}>Shift #{activeShift.shiftID} · Live</Text>
            </View>
          )}
        </View>

        <View style={styles.tabs}>
          {SECTIONS.map(s => (
            <TouchableOpacity
              key={s.key}
              style={styles.tabBtn}
              onPress={() => setSection(s.key)}
              activeOpacity={0.7}
            >
              <Icon name={s.icon} size={14} color={section === s.key ? Colors.text : Colors.textMuted} />
              <Text style={[styles.tabLabel, section === s.key && styles.tabLabelActive]}>{s.label}</Text>
              {section === s.key && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.topbarRight} />
      </View>

      <View style={styles.content}>
        {section === 'Sell' && <SellScreen navigation={navigation} />}
        {section === 'Orders' && <OrdersScreen onResumeOrder={() => setSection('Sell')} />}
        {section === 'Tables' && <TablesScreen onStartOrder={() => setSection('Sell')} />}
        {section === 'Reports' && <ReportsScreen />}
        {section === 'Menu' && <MenuScreen onLogout={handleLogout} onEndShift={openEndShift} navigation={navigation} />}
        {section === 'Shifts' && <ShiftsScreen />}
      </View>

      <Modal
        visible={endModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !endingShift && setEndModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>End Shift</Text>
            <Text style={styles.modalSub}>Shift #{activeShift?.shiftID}</Text>

            <View style={styles.summaryBox}>
              {loadingSummary && <ActivityIndicator color={Colors.primary} style={{ marginBottom: 8 }} />}
              <SummaryRow label="Total Orders" value={String(endSummary?.summary.orderCount ?? activeShift?.orderCount ?? 0)} />
              <SummaryRow label="Total Sales" value={<Money amount={endSummary?.summary.totalSales ?? activeShift?.totalSales ?? 0} currency={currency} style={styles.summaryValue} />} />
              <SummaryRow label="Total Discount" value={<Money amount={endSummary?.summary.totalDiscount ?? activeShift?.totalDiscount ?? 0} currency={currency} style={styles.summaryValue} />} />
              <SummaryRow label="Total Tax" value={<Money amount={endSummary?.summary.totalTax ?? activeShift?.totalTax ?? 0} currency={currency} style={styles.summaryValue} />} />
              <View style={styles.divider} />
              <SummaryRow label="Expected Cash" value={<Money amount={endSummary?.summary.expectedCash ?? expectedCash} currency={currency} style={[styles.summaryValue, styles.summaryHighlight]} />} highlight />
            </View>

            <Text style={styles.fieldLabel}>Closing Cash</Text>
            <TextInput
              style={styles.cashInput}
              value={closingCash}
              onChangeText={t => setClosingCash(t.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              editable={!endingShift}
            />

            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Notes (Optional)</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Any closing notes..."
              placeholderTextColor={Colors.textMuted}
              value={closingNotes}
              onChangeText={setClosingNotes}
              multiline
              editable={!endingShift}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEndModalVisible(false)} disabled={endingShift}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleEndShift} disabled={endingShift}>
                {endingShift ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.confirmBtnText}>Close Shift & Print Z</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SummaryRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, highlight && styles.summaryHighlight]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  topbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, paddingHorizontal: 20, height: 56,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  topbarLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  shiftBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.successBg,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, gap: 6,
  },
  shiftDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  shiftBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.success },

  tabs: { flexDirection: 'row', gap: 4 },
  tabBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 56, justifyContent: 'center' },
  tabLabel: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  tabLabelActive: { color: Colors.text, fontWeight: '800' },
  tabUnderline: { position: 'absolute', bottom: 0, left: 14, right: 14, height: 2, backgroundColor: Colors.text, borderRadius: 1 },

  topbarRight: { flex: 1 },

  content: { flex: 1 },

  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center' },
  modalCard: { width: 420, backgroundColor: Colors.surface, borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, marginBottom: 2 },
  modalSub: { fontSize: 13, color: Colors.textMuted, marginBottom: 16 },

  summaryBox: { backgroundColor: Colors.background, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  summaryLabel: { fontSize: 13, color: Colors.textLight },
  summaryValue: { fontSize: 13, fontWeight: '700', color: Colors.text },
  summaryHighlight: { color: Colors.primary, fontSize: 14 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 8 },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  cashInput: {
    backgroundColor: Colors.background, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: 14, height: 48, fontSize: 18, fontWeight: '800', color: Colors.text,
  },
  notesInput: {
    backgroundColor: Colors.background, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border,
    padding: 12, fontSize: 14, color: Colors.text, minHeight: 60, textAlignVertical: 'top',
  },

  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: {
    flex: 1, height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border,
    justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background,
  },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: Colors.textLight },
  confirmBtn: { flex: 2, height: 48, borderRadius: 12, backgroundColor: Colors.danger, justifyContent: 'center', alignItems: 'center' },
  confirmBtnText: { fontSize: 14, fontWeight: '800', color: '#ffffff' },
});
