// Kitchen ticket ("KITCHEN ORDER") in ESC/POS text — port of the web POS
// printKitchenReceipt (pages.component.ts): big order number, order type /
// table / taken by / customer, then items with quantity (no prices), the
// order note and the date/time. Adds each item's options and kitchen note,
// which the kitchen needs.
import { EscPosBuilder } from './EscPosBuilder';
import { ReceiptData } from '../../types/receipt';

const fmtTime = (d: Date) => d.toLocaleTimeString('en-SA', { hour: '2-digit', minute: '2-digit', hour12: true });
const fmtDate = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

export function buildKitchenTicket(r: ReceiptData, paperWidth: 58 | 80 = 80, showAlternateName = true): string {
  const p = new EscPosBuilder(paperWidth);
  const qtyW = 5;

  p.center().bold(true).size('dw').line('KITCHEN ORDER').size('normal');
  p.separator('=');
  p.center().bold(true).size('xl').line(r.orderNumber.startsWith('#') ? r.orderNumber : `#${r.orderNumber}`).size('normal').bold(false);
  p.feed(1);

  p.left().bold(true);
  if (r.orderType) p.row2('Order Type', r.orderType, 20);
  if (r.tableNo) p.row2('Table', r.tableNo, 20);
  if (r.cashierName) p.row2('Taken By', r.cashierName, 20);
  if (r.customerName) p.row2('Customer', r.customerName, 20);
  p.bold(false).separator();

  p.left().bold(true).row2('ITEM', 'QTY', qtyW).bold(false).separator();
  for (const item of r.items) {
    p.left().bold(true).row2(item.name, `x${item.qty}`, qtyW).bold(false);
    if (showAlternateName && item.alternateName) p.line(`  ${item.alternateName}`);
    if (item.selections) p.line(`  + ${item.selections}`);
    if (item.note) p.bold(true).line(`  ** ${item.note}`).bold(false);
  }
  p.separator();

  if (r.orderNote) {
    p.left().bold(true).line('NOTE:').bold(false).line(r.orderNote).separator();
  }

  const t = r.time instanceof Date ? r.time : new Date(r.time);
  p.center().line(`${fmtDate(t)}   ${fmtTime(t)}`);
  p.feed(4).cut();
  return p.build();
}
