// ZATCA Phase 1 (simplified tax invoice) QR — base64 of TLV fields:
// 1 seller name, 2 VAT number, 3 timestamp, 4 total incl. VAT, 5 VAT amount.
// Same encoding as Web POS's receipt-modal invoiceQR(); used only as the
// fallback when the server returned no signed Phase 2 QR (sign failed/timed out).

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function utf8(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    let c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function base64(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [b0, b1, b2] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    out += BASE64[b0 >> 2];
    out += BASE64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : BASE64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : BASE64[b2 & 63];
  }
  return out;
}

export function zatcaPhase1Qr(sellerName: string, vatNumber: string, time: Date, total: number, vat: number): string {
  const fields = [
    sellerName,
    vatNumber,
    time.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    total.toFixed(2),
    vat.toFixed(2),
  ];
  const bytes: number[] = [];
  fields.forEach((value, i) => {
    const v = utf8(value).slice(0, 255); // TLV length is one byte
    bytes.push(i + 1, v.length, ...v);
  });
  return base64(bytes);
}
