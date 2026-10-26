import React, { useEffect, useRef, useState } from 'react';
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
import Money from '../components/Money';
import { useCustomerDisplayStore } from '../store/customerDisplayStore';
import { useKitchenStore } from '../store/kitchenStore';
import { flushCloudOutbox } from '../services/kitchenTicketService';
import { buildZReportEscPos, buildZReportHtml, ZReportInput } from '../services/zReport';
import { printReceipt } from '../services/PrinterService';
import { usePrinterStore } from '../store/printerStore';
import { useReceiptSettingsStore } from '../store/receiptSettingsStore';
import { buildImageCanvasReceipt } from '../services/escpos/ImageCanvasBuilder';
import { ZReportPrintCapture } from '../components/receipt/ZReportPaper';
import { useToastStore } from '../store/toastStore';
import { PosShiftSummary, PaymentBreakdown } from '../types';

import SellScreen from './SellScreen';
import OrdersScreen from './OrdersScreen';
import ReportsScreen from './ReportsScreen';
import MenuScreen from './MenuScreen';
import ShiftsScreen from './ShiftsScreen';
import TablesScreen from './TablesScreen';
import { appAlert } from '../utils/appAlert';
import PosTopBar, { TopBarSection } from '../components/PosTopBar';
import { C, F } from '../theme/tokens';
import { Txt, Button, Field, Dialog, KeyValue } from '../components/ui';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Shell'> };

type SectionKey = 'Sell' | 'Orders' | 'Tables' | 'Reports' | 'Menu' | 'Shifts';

const BASE_SECTIONS: TopBarSection<SectionKey>[] = [
  { key: 'Sell', label: 'Sell', icon: 'sell' },
  { key: 'Orders', label: 'Orders', icon: 'orders' },
  { key: 'Tables', label: 'Tables', icon: 'tables' },
  { key: 'Reports', label: 'Reports', icon: 'reports' },
  { key: 'Menu', label: 'Menu', icon: 'menu' },
  { key: 'Shifts', label: 'Shifts', icon: 'clock' },
]

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
  // Image Canvas mode: the Z report is mounted off-screen and captured
  // (like the checkout receipt) before this screen is replaced.
  const [zPrint, setZPrint] = useState<ZReportInput | null>(null);
  const zShotRef = useRef<any>(null);

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
        let content: string;
        try {
          if (useReceiptSettingsStore.getState().printMode !== 'image') throw null;
          setZPrint(z);
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50))));
          content = await buildImageCanvasReceipt(zShotRef, printer.paperWidth);
        } catch {
          // ESC/POS Text mode, or the capture failed — still print the Z report.
          content = buildZReportEscPos(z, printer.paperWidth);
        }
        printReceipt(content, printer)
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
      <PosTopBar
        sections={SECTIONS}
        active={section}
        onSelect={setSection}
        shiftID={activeShift?.shiftID}
        topInset={insets.top}
      />

      <View style={styles.content}>
        {section === 'Sell' && <SellScreen navigation={navigation} />}
        {section === 'Orders' && <OrdersScreen onResumeOrder={() => setSection('Sell')} />}
        {section === 'Tables' && <TablesScreen onStartOrder={() => setSection('Sell')} />}
        {section === 'Reports' && <ReportsScreen onEndShift={openEndShift} />}
        {section === 'Menu' && <MenuScreen onLogout={handleLogout} onEndShift={openEndShift} navigation={navigation} />}
        {section === 'Shifts' && <ShiftsScreen onEndShift={openEndShift} />}
      </View>

      <Dialog
        visible={endModalVisible}
        onClose={() => !endingShift && setEndModalVisible(false)}
        keyboard
        width={460}
        title="Count cash and end shift"
        subtitle={`Shift #${activeShift?.shiftID ?? ''}`}
        footer={<>
          <Button variant="outline" size="lg" label="Cancel" onPress={() => setEndModalVisible(false)} disabled={endingShift} style={styles.flex} />
          <Button variant="dark" size="lg" icon="printer" label="End shift & print Z" onPress={handleEndShift} loading={endingShift} style={styles.flex2} />
        </>}
      >
        <View style={styles.summaryBox}>
          {loadingSummary && <ActivityIndicator color={C.brand} />}
          <KeyValue label="Orders" value={String(endSummary?.summary.orderCount ?? activeShift?.orderCount ?? 0)} />
          <KeyValue label="Total sales" value={<Money amount={endSummary?.summary.totalSales ?? activeShift?.totalSales ?? 0} currency={currency} style={styles.kv} />} />
          <KeyValue label="Discounts" value={<Money amount={endSummary?.summary.totalDiscount ?? activeShift?.totalDiscount ?? 0} currency={currency} style={styles.kv} />} />
          <KeyValue label="VAT" value={<Money amount={endSummary?.summary.totalTax ?? activeShift?.totalTax ?? 0} currency={currency} style={styles.kv} />} />
          <KeyValue strong label="Expected in drawer" value={<Money amount={endSummary?.summary.expectedCash ?? expectedCash} currency={currency} style={styles.kvStrong} />} divider={false} />
        </View>

        <View style={styles.fieldGroup}>
          <Txt variant="label">Counted cash</Txt>
          <Field
            value={closingCash}
            onChangeText={t => setClosingCash(t.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            editable={!endingShift}
            style={styles.cashInput}
          />
        </View>
        <View style={styles.fieldGroup}>
          <Txt variant="label">Closing note <Txt variant="caption" color={C.textMuted}>(optional)</Txt></Txt>
          <Field
            placeholder="Any closing notes..."
            value={closingNotes}
            onChangeText={setClosingNotes}
            multiline
            height={84}
            editable={!endingShift}
            containerStyle={styles.noteField}
            style={styles.noteInput}
          />
        </View>
      </Dialog>
      {zPrint && <ZReportPrintCapture ref={zShotRef} z={zPrint} paperWidth={printer.paperWidth} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  content: { flex: 1 },

  flex: { flex: 1 },
  flex2: { flex: 2 },
  summaryBox: { paddingHorizontal: 16, paddingVertical: 4, borderRadius: 16, backgroundColor: C.bg },
  kv: { fontSize: 14, fontFamily: F.bold, color: C.text },
  kvStrong: { fontSize: 20, fontFamily: F.bold, color: C.text },
  fieldGroup: { gap: 6 },
  cashInput: { fontSize: 22, fontFamily: F.bold },
  noteField: { alignItems: 'flex-start', paddingVertical: 10 },
  noteInput: { textAlignVertical: 'top' },
});
