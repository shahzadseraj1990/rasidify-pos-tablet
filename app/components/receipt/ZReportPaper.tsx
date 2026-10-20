import React, { forwardRef } from 'react';
import { View, Text, StyleSheet, PixelRatio } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { ZReportInput, CashDrawerEntry, fmt, fmtDateTime, cashSales } from '../../services/zReport';
import { PRINT_DOTS, PRINT_REF_WIDTH } from './ReceiptPaper';

// "Image Canvas" Z report: the same sections as buildZReportEscPos, laid out
// as a view and captured at the print head's dot width (like
// ReceiptPrintCapture) so it prints with the receipt's look. All text is pure
// black — the capture becomes a 1-bit image.

export const ZReportPrintCapture = forwardRef<any, { z: ZReportInput; paperWidth: 58 | 80 }>(
  function ZReportPrintCapture({ z, paperWidth }, ref) {
    const widthDp = PRINT_DOTS[paperWidth] / PixelRatio.get();
    const s = (widthDp - 4) / PRINT_REF_WIDTH * (paperWidth <= 58 ? 1.2 : 1);
    return (
      <View style={styles.offscreen} pointerEvents="none">
        <ViewShot ref={ref} style={[styles.paper, { width: widthDp }]} options={{ format: 'png', quality: 1 }}>
          <ZReportPaper z={z} s={s} />
        </ViewShot>
      </View>
    );
  },
);

function ZReportPaper({ z, s }: { z: ZReportInput; s: number }) {
  const cur = z.currency || 'SAR';
  const money = (n: number | null | undefined, sign = '') => `${sign}${fmt(n)} ${cur}`;
  const t = (size: number, bold = false) => ({ fontSize: size * s, color: '#000', fontWeight: bold ? '700' as const : '400' as const });
  const variance = (z.summary.closingCash ?? 0) - (z.summary.expectedCash ?? 0);
  const paidIn = z.entries.filter(e => e.entryType === 1);
  const paidOut = z.entries.filter(e => e.entryType === 2);

  const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
    <View style={styles.row}>
      <Text style={[t(13, bold), styles.label]}>{label}</Text>
      <Text style={[t(13, true), styles.value]}>{value}</Text>
    </View>
  );
  const Section = ({ title }: { title: string }) => (
    <Text style={[t(13, true), { letterSpacing: 1, marginBottom: 3 * s }]}>{title}</Text>
  );
  const Divider = () => <View style={[styles.divider, { marginVertical: 7 * s }]} />;
  const entryRows = (list: CashDrawerEntry[], sign: '+' | '-', fallback: string) =>
    list.map((e, i) => <Row key={`${sign}${i}`} label={`${sign} ${e.notes || fallback}`} value={money(e.amount)} />);

  return (
    <View style={{ paddingVertical: 8 * s }}>
      <Text style={[t(18, true), styles.center]}>{z.businessName || 'POS'}</Text>
      {z.branchName ? <Text style={[t(13), styles.center]}>{z.branchName}</Text> : null}
      <View style={[styles.badge, { marginTop: 8 * s, paddingHorizontal: 12 * s, paddingVertical: 3 * s }]}>
        <Text style={[t(16, true), { letterSpacing: 2 }]}>Z REPORT</Text>
      </View>
      <Divider />

      <Row label="Shift #" value={String(z.summary.shiftID)} />
      <Row label="Cashier" value={z.cashierName ?? z.summary.cashierName ?? '-'} />
      <Row label="Shift Start" value={fmtDateTime(new Date(z.summary.startedAt))} />
      <Row label="Printed At" value={fmtDateTime(z.closedAt ?? new Date())} />
      <Divider />

      <Section title="SALES SUMMARY" />
      <Row label="Total Orders" value={String(z.summary.orderCount ?? 0)} />
      <Row label="Gross Sales" value={money(z.summary.totalSales)} />
      <Row label="Discounts" value={money(z.summary.totalDiscount, '-')} />
      <Row label="Tax (VAT)" value={money(z.summary.totalTax)} />
      <Row label="Refunds" value={money(z.summary.totalRefunds, '-')} />
      <Divider />

      <Section title="PAYMENT METHODS" />
      {z.payments.length === 0
        ? <Text style={t(13)}>No payment data</Text>
        : z.payments.map((p, i) => <Row key={i} label={`${p.paymentMethod} (${p.txCount}x)`} value={money(p.total)} />)}
      <Divider />

      <Section title="CASH DRAWER" />
      <Row label="Opening Cash" value={money(z.summary.openingCash)} />
      <Row label="Cash Sales" value={money(cashSales(z.payments), '+')} />
      <Row label="Paid In" value={money(z.summary.totalPaidIn, '+')} />
      <Row label="Paid Out" value={money(z.summary.totalPaidOut, '-')} />
      <Divider />
      <Row label="Closing Cash" value={money(z.summary.closingCash)} bold />
      <Row label="Expected Cash" value={money(z.summary.expectedCash)} bold />
      <Row label={variance >= 0 ? 'Over' : 'Short'} value={money(Math.abs(variance))} bold />

      {paidIn.length || paidOut.length ? (
        <>
          <Divider />
          <Section title="PAID IN / PAID OUT" />
          {entryRows(paidIn, '+', 'Paid in')}
          {entryRows(paidOut, '-', 'Paid out')}
        </>
      ) : null}

      <Divider />
      <Text style={[t(13, true), styles.center]}>Z Report (Final)</Text>
      <Text style={[t(13), styles.center]}>Shift is CLOSED</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', left: -10000, top: 0 },
  paper: { backgroundColor: '#fff', paddingHorizontal: 2 },
  center: { textAlign: 'center' },
  badge: { alignSelf: 'center', borderWidth: 2, borderColor: '#000' },
  divider: { height: 1, backgroundColor: '#000' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  label: { flex: 1, paddingRight: 6 },
  value: { textAlign: 'right' },
});
