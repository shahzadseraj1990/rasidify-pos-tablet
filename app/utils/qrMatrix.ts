/**
 * Shared QR-matrix generator - one source of truth feeding both the on-screen
 * receipt QR (app/components/common/ZatcaQrCode.tsx) and the ESC/POS raster QR
 * (app/services/escpos/QrToEscPos.ts), so what's shown on screen and what
 * actually prints are always pixel-identical.
 *
 * Pure JS, no native modules - safe in RN/Expo without any linking.
 */
// @ts-ignore — CommonJS module, no ESM-friendly types
import qrcodegen from 'qrcode-generator';

export interface QrMatrix {
  size: number;
  isDark: (row: number, col: number) => boolean;
}

/**
 * Builds a QR matrix for `text`. Type-number 0 lets the library auto-pick the
 * smallest version that fits the data - ZATCA's base64 TLV QR strings vary in
 * length, so a fixed type-number would risk "data too big" for longer ones.
 */
export function buildQrMatrix(text: string): QrMatrix {
  const qr = qrcodegen(0, 'M');
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  return {
    size,
    isDark: (row: number, col: number) => qr.isDark(row, col),
  };
}
