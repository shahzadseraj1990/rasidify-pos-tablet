/**
 * Converts the real ZATCA QR string into an ESC/POS raster bitmap (GS v 0),
 * built directly from the same module matrix (buildQrMatrix) the on-screen
 * ZatcaQrCode component renders - no PNG/JPEG decode step needed, unlike the
 * logo path in ImageToEscPos.ts, since a QR is already just a 1-bit grid.
 * Shared raster-packing primitive comes from there to avoid duplicating it.
 */
import { buildQrMatrix } from '../../utils/qrMatrix';
import { buildRasterCommand } from './ImageToEscPos';

const DOT_WIDTH: Record<58 | 80, number> = { 58: 384, 80: 576 };

/**
 * Renders `text` to an ESC/POS raster command, each QR module scaled up to
 * `modulePx` printer dots so it stays scannable on a thermal printer's
 * typically-coarse resolution. Caps the whole QR at ~65% of the paper's dot
 * width - larger, more reliably scannable size without overflowing the receipt.
 */
export function zatcaQrToEscPosRaster(text: string, paperWidth: 58 | 80, modulePx = 6): string {
  const matrix = buildQrMatrix(text);
  const maxWidth = Math.floor(DOT_WIDTH[paperWidth] * 0.65);
  const scale = Math.max(1, Math.min(modulePx, Math.floor(maxWidth / matrix.size)));
  const px = matrix.size * scale;

  const bytesPerRow = Math.ceil(px / 8);
  const bitmap = new Uint8Array(bytesPerRow * px);

  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) {
      if (!matrix.isDark(row, col)) continue;
      // Expand this one dark module into a scale x scale block of set bits.
      for (let dy = 0; dy < scale; dy++) {
        const y = row * scale + dy;
        for (let dx = 0; dx < scale; dx++) {
          const x = col * scale + dx;
          const byteIndex = y * bytesPerRow + (x >> 3);
          bitmap[byteIndex] |= 0x80 >> (x & 7);
        }
      }
    }
  }

  return buildRasterCommand(bitmap, px, px);
}
