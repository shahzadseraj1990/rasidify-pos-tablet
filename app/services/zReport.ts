// End-of-shift Z report.
// - buildZReportHtml: the same HTML the web POS saves as the shift's
//   zReportData (web Shifts → reprint prints it), so a shift closed on the
//   tablet can still be reprinted from the web POS.
// - buildZReportEscPos: the thermal-printer version printed on the tablet.
import { EscPosBuilder } from './escpos/EscPosBuilder';
import { PosShiftSummary, PaymentBreakdown } from '../types';

export interface CashDrawerEntry {
  entryType: number;   // 1 = paid in, 2 = paid out
  amount: number;
  notes?: string | null;
  entryDate: string;
}

export interface ZReportInput {
  summary: PosShiftSummary & { closingCash: number };
  payments: PaymentBreakdown[];
  entries: CashDrawerEntry[];
  businessName: string;
  branchName?: string;
  cashierName?: string;
  currency: string;
  closedAt?: Date;
}

const fmt = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDateTime = (d: Date) =>
  d.toLocaleString('en-SA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const esc = (s: string | null | undefined) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const cashSales = (payments: PaymentBreakdown[]) =>
  payments.find(p => /cash|نقد/i.test(p.paymentMethod ?? ''))?.total ?? 0;

/** Port of the web POS ReportPrinterService.buildHtml({ type: 'Z' }). */
export function buildZReportHtml(d: ZReportInput): string {
  const cur = d.currency || 'SAR';
  const printedAt = fmtDateTime(d.closedAt ?? new Date());
  const shiftDate = fmtDateTime(new Date(d.summary.startedAt));

  const paymentRows = d.payments.length
    ? d.payments.map(p => `
        <tr>
          <td>${esc(p.paymentMethod)}</td>
          <td class="num">${p.txCount}x</td>
          <td class="num">${cur} ${fmt(p.total)}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" class="center muted">No payment data</td></tr>`;

  const paidIn = d.entries.filter(e => e.entryType === 1);
  const paidOut = d.entries.filter(e => e.entryType === 2);
  const drawerRows = (list: CashDrawerEntry[], sign: string) =>
    list.map(e => `
        <tr>
          <td>${new Date(e.entryDate).toLocaleTimeString('en-SA', { hour: '2-digit', minute: '2-digit' })}</td>
          <td>${esc(e.notes) || '—'}</td>
          <td class="num">${sign}${cur} ${fmt(e.amount)}</td>
        </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Z Report — Shift #${d.summary.shiftID}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; color: #000; background: #fff; width: 80mm; padding: 3mm 4mm 8mm; }
  h1 { font-size: 16px; text-align: center; margin-bottom: 2px; letter-spacing: 1px; }
  .sub { text-align: center; font-size: 11px; color: #555; margin-bottom: 12px; }
  .divider { border: none; border-top: 1px dashed #999; margin: 10px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3px 0; vertical-align: top; }
  td.num { text-align: right; white-space: nowrap; }
  td.center { text-align: center; }
  td.muted { color: #777; }
  .section-title { font-weight: bold; text-transform: uppercase; font-size: 10px; letter-spacing: 1px; color: #555; margin: 10px 0 4px; }
  .kv td:first-child { color: #555; }
  .kv td:last-child { text-align: right; font-weight: 600; }
  .total-row td { font-weight: 700; border-top: 1px solid #ccc; padding-top: 5px; margin-top: 4px; }
  .report-type { display: inline-block; padding: 2px 10px; border: 2px solid #111; font-weight: 700; font-size: 13px; letter-spacing: 2px; margin: 6px auto 10px; }
  .center { text-align: center; }
  @media print { body { padding: 0; } @page { margin: 8mm; } }
</style>
</head>
<body>
  <h1>${esc(d.businessName) || 'POS'}</h1>
  ${d.branchName ? `<div class="sub">${esc(d.branchName)}</div>` : ''}
  <div class="center"><span class="report-type">Z REPORT</span></div>
  <hr class="divider">
  <table class="kv">
    <tr><td>Shift #</td><td>${d.summary.shiftID}</td></tr>
    <tr><td>Cashier</td><td>${esc(d.cashierName ?? d.summary.cashierName) || '—'}</td></tr>
    <tr><td>Shift Start</td><td>${shiftDate}</td></tr>
    <tr><td>Printed At</td><td>${printedAt}</td></tr>
  </table>
  <hr class="divider">
  <div class="section-title">Sales Summary</div>
  <table class="kv">
    <tr><td>Total Orders</td><td>${d.summary.orderCount}</td></tr>
    <tr><td>Gross Sales</td><td>${cur} ${fmt(d.summary.totalSales)}</td></tr>
    <tr><td>Discounts</td><td>- ${cur} ${fmt(d.summary.totalDiscount)}</td></tr>
    <tr><td>Tax (VAT)</td><td>${cur} ${fmt(d.summary.totalTax)}</td></tr>
    <tr><td>Refunds</td><td>- ${cur} ${fmt(d.summary.totalRefunds)}</td></tr>
  </table>
  <hr class="divider">
  <div class="section-title">Payment Methods</div>
  <table>
    <tr><td><b>Method</b></td><td class="num"><b>Txns</b></td><td class="num"><b>Amount</b></td></tr>
    ${paymentRows}
  </table>
  <hr class="divider">
  <div class="section-title">Cash Drawer</div>
  <table class="kv">
    <tr><td>Opening Cash</td><td>${cur} ${fmt(d.summary.openingCash)}</td></tr>
    <tr><td>Cash Sales</td><td>+ ${cur} ${fmt(cashSales(d.payments))}</td></tr>
    <tr><td>Paid In</td><td>+ ${cur} ${fmt(d.summary.totalPaidIn)}</td></tr>
    <tr><td>Paid Out</td><td>- ${cur} ${fmt(d.summary.totalPaidOut)}</td></tr>
    <tr class="total-row"><td>Closing Cash</td><td></td><td class="num">${cur} ${fmt(d.summary.closingCash)}</td></tr>
    <tr class="total-row"><td>Expected Cash</td><td></td><td class="num">${cur} ${fmt(d.summary.expectedCash)}</td></tr>
  </table>
  ${paidIn.length || paidOut.length ? `
  <hr class="divider">
  <div class="section-title">Paid In / Paid Out Detail</div>
  <table>
    ${paidIn.length ? `<tr><td colspan="3"><b>Paid In</b></td></tr>${drawerRows(paidIn, '+')}` : ''}
    ${paidOut.length ? `<tr><td colspan="3"><b>Paid Out</b></td></tr>${drawerRows(paidOut, '-')}` : ''}
  </table>` : ''}
  <hr class="divider">
  <div class="sub" style="margin-top:8px">— Z Report (Final) —</div>
  <div class="sub">Shift is CLOSED</div>
</body>
</html>`;
}

/** Thermal-printer Z report (same sections as the HTML version). */
export function buildZReportEscPos(d: ZReportInput, paperWidth: 58 | 80 = 80): string {
  const p = new EscPosBuilder(paperWidth);
  const cur = d.currency || 'SAR';
  const money = (n: number | null | undefined, sign = '') => `${sign}${fmt(n)} ${cur}`;
  const W = 16;

  p.center().bold(true).size('dh').line(d.businessName || 'POS').size('normal').bold(false);
  if (d.branchName) p.center().line(d.branchName);
  p.feed(1).center().bold(true).size('dw').line('Z REPORT').size('normal').bold(false);
  p.separator();

  p.left();
  p.row2('Shift #', String(d.summary.shiftID), W);
  p.row2('Cashier', d.cashierName ?? d.summary.cashierName ?? '-', W + 6);
  p.row2('Shift Start', fmtDateTime(new Date(d.summary.startedAt)), W + 6);
  p.row2('Printed At', fmtDateTime(d.closedAt ?? new Date()), W + 6);
  p.separator();

  p.left().bold(true).line('SALES SUMMARY').bold(false);
  p.row2('Total Orders', String(d.summary.orderCount ?? 0), W);
  p.row2('Gross Sales', money(d.summary.totalSales), W);
  p.row2('Discounts', money(d.summary.totalDiscount, '-'), W);
  p.row2('Tax (VAT)', money(d.summary.totalTax), W);
  p.row2('Refunds', money(d.summary.totalRefunds, '-'), W);
  p.separator();

  p.left().bold(true).line('PAYMENT METHODS').bold(false);
  if (d.payments.length === 0) p.line('No payment data');
  d.payments.forEach(pay => p.row2(`${pay.paymentMethod} (${pay.txCount}x)`, money(pay.total), W));
  p.separator();

  p.left().bold(true).line('CASH DRAWER').bold(false);
  p.row2('Opening Cash', money(d.summary.openingCash), W);
  p.row2('Cash Sales', money(cashSales(d.payments), '+'), W);
  p.row2('Paid In', money(d.summary.totalPaidIn, '+'), W);
  p.row2('Paid Out', money(d.summary.totalPaidOut, '-'), W);
  p.separator();
  p.bold(true);
  p.row2('Closing Cash', money(d.summary.closingCash), W);
  p.row2('Expected Cash', money(d.summary.expectedCash), W);
  const variance = (d.summary.closingCash ?? 0) - (d.summary.expectedCash ?? 0);
  p.row2(variance >= 0 ? 'Over' : 'Short', money(Math.abs(variance)), W);
  p.bold(false);

  const paidIn = d.entries.filter(e => e.entryType === 1);
  const paidOut = d.entries.filter(e => e.entryType === 2);
  if (paidIn.length || paidOut.length) {
    p.separator();
    p.left().bold(true).line('PAID IN / PAID OUT').bold(false);
    paidIn.forEach(e => p.row2(`+ ${e.notes || 'Paid in'}`, money(e.amount), W));
    paidOut.forEach(e => p.row2(`- ${e.notes || 'Paid out'}`, money(e.amount), W));
  }

  p.separator('=');
  p.center().line('Z Report (Final) - Shift is CLOSED');
  p.feed(4).cut();
  return p.build();
}
