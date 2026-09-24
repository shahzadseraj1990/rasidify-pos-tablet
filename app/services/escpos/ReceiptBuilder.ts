/**
 * Builds ESC/POS receipt strings for both templates.
 * Mirrors the web POS buildHtml() (simple) and buildHtmlDetailed() (detailed) exactly,
 * adapting HTML → ESC/POS while preserving every conditional and dynamic field.
 */

import { EscPosBuilder } from './EscPosBuilder';
import { ReceiptData, ReceiptSettings } from '../../types/receipt';
import { imageUriToEscPosRaster } from './ImageToEscPos';
import { zatcaQrToEscPosRaster } from './QrToEscPos';
import Config from '../../config';

// Backend returns logoUrl as a relative path — must resolve to an absolute
// URL before fetch(), same as the on-screen preview does in ReceiptPreviewScreen.
const API_ORIGIN = Config.API_URL.replace(/\/api\/?$/, '');
const resolveLogoUri = (url?: string): string | undefined => {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}/${url.replace(/^\/+/, '')}`;
};

// Suffix currency style with thousands separators, matching the web POS
// printed receipt format exactly (e.g. "11,697.00 Rs", "12,890.09 Rs").
const fmt = (n: number, currency = 'SAR') =>
  `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-SA', { day: '2-digit', month: 'short', year: 'numeric' });

const fmtTime = (d: Date) =>
  d.toLocaleTimeString('en-SA', { hour: '2-digit', minute: '2-digit' });

const fmtOrderNo = (n: string) =>
  n.startsWith('#') ? n : `#${n.padStart(4, '0')}`;

// ── Bilingual label helper (matches web bilingualLabels setting) ────────────
const biLabel = (en: string, ar: string, bilingual: boolean) =>
  bilingual ? `${en} / ${ar}` : en;

// ── Shared: receipt header (logo image or text + store info) ───────────────
async function buildHeader(
  p: EscPosBuilder,
  data: ReceiptData,
  settings: ReceiptSettings,
  paperWidth: 58 | 80,
): Promise<void> {
  const logoUrl = resolveLogoUri(settings.logoUrl || data.logoUrl);
  let printedImage = false;

  if (settings.showLogoOnReceipt && logoUrl) {
    const raster = await imageUriToEscPosRaster(logoUrl, paperWidth);
    if (raster) {
      p.center().raster(raster).feed(1);
      printedImage = true;
    }
  }

  // Text fallback — store name acts as a logo placeholder when there's no
  // image, or when the image failed to fetch/decode.
  p.center();
  if (!printedImage) {
    p.bold(true).size('dw').line(settings.companyName || data.companyName || '').size('normal').bold(false);
  } else {
    p.bold(true).line(settings.companyName || data.companyName || '').bold(false);
  }

  const address = settings.address || data.address;
  if (address) p.center().line(address);

  const vatNo = settings.vatNumber || data.vatNumber;
  if (vatNo) p.center().line(`VAT# ${vatNo}`);
}

// ── Shared: receipt footer ──────────────────────────────────────────────────
function buildFooter(
  p: EscPosBuilder,
  data: ReceiptData,
  settings: ReceiptSettings,
  showPhone: boolean,
  paperWidth: 58 | 80,
): void {
  p.separator();
  p.center();

  // Bold footer line
  const footer = settings.receiptFooter || 'Thank you for your visit!';
  p.bold(true).line(footer).bold(false);

  // Phone (simple template puts phone here)
  const phone = settings.phone || data.phone;
  if (showPhone && phone) p.center().line(`Phone No: ${phone}`);

  // Transaction number
  if (data.invoiceCode) p.center().line(`Transaction# ${data.invoiceCode}`);

  // Footer note
  if (settings.receiptFooterNote) p.center().line(settings.receiptFooterNote);

  // Real ZATCA QR (government-signed) - same position as web POS's receipt:
  // after the transaction#/footer note, before social handles.
  if (data.zatcaQrCode) {
    try {
      const raster = zatcaQrToEscPosRaster(data.zatcaQrCode, paperWidth);
      p.feed(1).center().raster(raster);
    } catch {
      // Never let a QR rendering failure block the rest of the receipt.
    }
  }

  // Social handles (same order as web: X, IG, FB, TT)
  const socials: string[] = [];
  if (settings.socialX)         socials.push(`X: @${settings.socialX}`);
  if (settings.socialInstagram) socials.push(`IG: @${settings.socialInstagram}`);
  if (settings.socialFb)        socials.push(`FB: @${settings.socialFb}`);
  if (settings.socialTiktok)    socials.push(`TT: @${settings.socialTiktok}`);

  if (socials.length > 0) {
    p.feed(1).center();
    // Print 2 per row to match web 2-column social grid
    for (let i = 0; i < socials.length; i += 2) {
      const pair = [socials[i], socials[i + 1]].filter(Boolean);
      p.line(pair.join('  '));
    }
  }

  if (settings.showPoweredBy) {
    p.feed(1).center().font('B').line('Powered by Rasidify').font('A');
  }

  p.feed(3).cut();
}

// ── TEMPLATE A: Simple ─────────────────────────────────────────────────────
/** Mirrors web pos.component.ts buildHtml() */
export async function buildSimpleReceipt(
  data: ReceiptData,
  settings: ReceiptSettings,
  paperWidth: 58 | 80 = 80,
): Promise<string> {
  const p = new EscPosBuilder(paperWidth);
  const currency = data.currency || 'SAR';

  // ── Header ──
  await buildHeader(p, data, settings, paperWidth);

  // ── Order number (giant, center) — no "SALE RECEIPT" heading by default ──
  if (data.heading) {
    p.center().bold(true).line(data.heading.toUpperCase()).bold(false);
  }
  p.center().size('xl').bold(true).line(fmtOrderNo(data.orderNumber)).size('normal').bold(false);

  // ── Meta table (no colons, matches printed receipt style) ──
  p.left();
  if (data.customerName) p.row2('Customer Name', data.customerName);
  p.row2('Date', `${fmtTime(data.time)} ${fmtDate(data.time)}`);
  if (data.orderType)   p.row2('Order Type', data.orderType);
  if (data.tableNo)     p.row2('Table', data.tableNo);
  if (data.cashierName) p.row2('Order Taker', data.cashierName);

  p.separator();

  // ── Items (no column header row) ──
  data.items.forEach(item => {
    const itemLabel = `${item.qty} x ${item.name}`;
    const itemTotal = fmt(item.qty * item.price, currency);
    p.left().row2(itemLabel, itemTotal, 12);
    // Alt name (e.g. Arabic name) — separate row below
    if (settings.showAlternateName && item.alternateName) {
      p.left().font('B').line(`${item.alternateName}`).font('A');
    }
  });

  p.separator();

  // ── Totals ──
  p.left();
  if (data.discount > 0) {
    const label = biLabel('Discount', 'خصم', settings.bilingualLabels);
    p.row2(label, `-${fmt(data.discount, currency)}`, 14);
  }
  const subLabel = biLabel('Sub Total', 'المجموع', settings.bilingualLabels);
  p.row2(subLabel, fmt(data.subtotal, currency), 14);

  if (data.vat > 0) {
    const taxName = data.taxLabel || 'VAT';
    const vatLabel = biLabel(
      data.taxRate != null ? `${taxName} (${data.taxRate}%)` : taxName,
      'ضريبة',
      settings.bilingualLabels,
    );
    p.row2(vatLabel, fmt(data.vat, currency), 14);
  }
  p.separator('=');

  // Grand Total
  const totalLabel = biLabel('Grand Total', 'الإجمالي', settings.bilingualLabels);
  p.bold(true).size('dh').row2(totalLabel, fmt(data.total, currency), 14).size('normal').bold(false);

  // Payment rows
  data.payments.forEach(pay => {
    p.row2(`Payment - ${pay.method}`, fmt(pay.amount, currency), 14);
  });

  // Change
  if (data.change > 0) {
    p.row2('Change', fmt(data.change, currency), 14);
  }

  // ── Footer ──
  buildFooter(p, data, settings, true /* showPhone in footer for simple */, paperWidth);

  return p.build();
}

// ── TEMPLATE B: Detailed ───────────────────────────────────────────────────
/** Mirrors web pos.component.ts buildHtmlDetailed() */
export async function buildDetailedReceipt(
  data: ReceiptData,
  settings: ReceiptSettings,
  paperWidth: 58 | 80 = 80,
): Promise<string> {
  const p = new EscPosBuilder(paperWidth);
  const currency = data.currency || 'SAR';

  // ── Header ── (same as simple but phone shown here, not footer)
  await buildHeader(p, data, settings, paperWidth);
  const phone = settings.phone || data.phone;
  if (phone) p.center().line(`Phone No: ${phone}`);
  p.separator();

  // ── Heading ──
  const heading = data.heading || 'SALE RECEIPT';
  p.center().bold(true).line(heading.toUpperCase()).bold(false);
  p.separator();

  // ── Order number ──
  p.center().size('xl').bold(true).line(fmtOrderNo(data.orderNumber)).size('normal').bold(false);

  // ── Meta ──
  p.left();
  if (data.customerName) p.row2('Customer:', data.customerName);
  p.row2('Date:', fmtDate(data.time));
  p.row2('Time:', fmtTime(data.time));
  if (data.orderType) p.row2('Type:', data.orderType);
  if (data.tableNo)   p.row2('Table:', data.tableNo);
  if (data.cashierName) p.row2('Served By:', data.cashierName); // "Served By" in detailed

  p.separator();

  // ── Items: 4-column header (Qty | Item | Rate | Amt) ──
  const cols = p.columns;
  const w1 = 4;  // Qty
  const w3 = 8;  // Rate
  const w4 = 10; // Amt
  const w2 = cols - w1 - w3 - w4 - 3; // Name (remaining)

  // Manually build 4-column rows (EscPosBuilder.row3 is 3-col; extend inline)
  const row4 = (c1: string, c2: string, c3: string, c4: string) => {
    const col1 = c1.padEnd(w1).substring(0, w1);
    const col2 = c2.padEnd(w2).substring(0, w2);
    const col3 = c3.padStart(w3).substring(0, w3);
    const col4 = c4.padStart(w4).substring(0, w4);
    return `${col1} ${col2} ${col3} ${col4}\n`;
  };

  p.bold(true).text(row4('Qty', 'Item', 'Rate', 'Amt')).bold(false);
  p.separator('=');

  data.items.forEach(item => {
    // Name + optional alt name inline (detailed template)
    let nameStr = item.name;
    if (settings.showAlternateName && item.alternateName) {
      // Print inline (limited space — just append in brackets)
      nameStr = `${item.name} (${item.alternateName})`;
    }
    p.text(row4(
      String(item.qty),
      nameStr,
      item.price.toFixed(2),
      (item.qty * item.price).toFixed(2),
    ));
  });

  p.separator();

  // ── Totals (right-aligned using row2) ──
  p.left();
  if (data.discount > 0) {
    const label = biLabel('Discount', 'خصم', settings.bilingualLabels);
    p.row2(label, `-${fmt(data.discount, currency)}`, 16);
  }
  const subLabel = biLabel('Sub Total', 'المجموع', settings.bilingualLabels);
  p.row2(subLabel, fmt(data.subtotal, currency), 16);

  if (data.vat > 0) {
    const taxName = data.taxLabel || 'VAT';
    const vatLabel = biLabel(
      data.taxRate != null ? `${taxName} (${data.taxRate}%)` : taxName,
      'ضريبة',
      settings.bilingualLabels,
    );
    p.row2(vatLabel, fmt(data.vat, currency), 16);
  }
  p.separator('=');

  const totalLabel = biLabel('Grand Total', 'الإجمالي', settings.bilingualLabels);
  p.bold(true).size('dh').row2(totalLabel, fmt(data.total, currency), 16).size('normal').bold(false);

  data.payments.forEach(pay => {
    p.row2(`Payment - ${pay.method}`, fmt(pay.amount, currency), 16);
  });
  if (data.change > 0) {
    p.row2('Change', fmt(data.change, currency), 16);
  }

  if (data.orderNote) {
    p.feed(1).left().bold(true).line('Note:').bold(false).line(data.orderNote);
  }

  // ── Footer ── (no phone in footer for detailed — phone is in header)
  buildFooter(p, data, settings, false, paperWidth);

  return p.build();
}

/** Selects and builds the receipt based on settings.receiptTemplate */
export async function buildReceipt(
  data: ReceiptData,
  settings: ReceiptSettings,
  paperWidth: 58 | 80 = 80,
): Promise<string> {
  return settings.receiptTemplate === 'detailed'
    ? buildDetailedReceipt(data, settings, paperWidth)
    : buildSimpleReceipt(data, settings, paperWidth);
}
