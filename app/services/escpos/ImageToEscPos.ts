/**
 * Converts a logo image (remote URL or local file URI) into an ESC/POS
 * raster bitmap (GS v 0) that can be embedded directly into the binary
 * ESC/POS byte stream sent to a network/USB printer.
 *
 * Pure-JS decode (no native modules, no Buffer/zlib polyfills needed):
 *   - PNG  → upng-js
 *   - JPEG → jpeg-js
 */

// @ts-ignore — no type defs published for these packages
import UPNG from 'upng-js';
// @ts-ignore
import jpeg from 'jpeg-js';

const ESC = '\x1b';
const GS  = '\x1d';

/** Standard print-head dot widths for common thermal paper sizes. */
const DOT_WIDTH: Record<58 | 80, number> = { 58: 384, 80: 576 };

function detectFormat(bytes: Uint8Array): 'png' | 'jpeg' | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  return null;
}

/** Nearest-neighbor resize of an RGBA buffer to targetWidth, preserving aspect ratio. */
function resizeRGBA(
  src: Uint8Array | Uint8ClampedArray,
  srcW: number,
  srcH: number,
  targetW: number,
): { data: Uint8Array; width: number; height: number } {
  const targetH = Math.max(1, Math.round((srcH * targetW) / srcW));
  const out = new Uint8Array(targetW * targetH * 4);
  for (let y = 0; y < targetH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / targetH));
    for (let x = 0; x < targetW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / targetW));
      const si = (sy * srcW + sx) * 4;
      const di = (y * targetW + x) * 4;
      out[di] = src[si]; out[di + 1] = src[si + 1]; out[di + 2] = src[si + 2]; out[di + 3] = src[si + 3];
    }
  }
  return { data: out, width: targetW, height: targetH };
}

/** RGBA → 1bpp monochrome bitmap (white background alpha-composited, mid-gray threshold). */
function toMonochromeBits(data: Uint8Array, width: number, height: number): Uint8Array {
  const bytesPerRow = Math.ceil(width / 8);
  const bitmap = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3] / 255;
      // Composite over white, then luminance
      const r = data[i] * a + 255 * (1 - a);
      const g = data[i + 1] * a + 255 * (1 - a);
      const b = data[i + 2] * a + 255 * (1 - a);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const isBlack = lum < 160; // threshold — tuned for logo line-art/stamps
      if (isBlack) {
        const byteIndex = y * bytesPerRow + (x >> 3);
        bitmap[byteIndex] |= 0x80 >> (x & 7);
      }
    }
  }
  return bitmap;
}

/** Packs a 1bpp bitmap into a GS v 0 raster-image ESC/POS command string. */
export function buildRasterCommand(bitmap: Uint8Array, width: number, height: number): string {
  const bytesPerRow = Math.ceil(width / 8);
  const xL = bytesPerRow & 0xff, xH = (bytesPerRow >> 8) & 0xff;
  const yL = height & 0xff, yH = (height >> 8) & 0xff;
  let out = `${GS}v0\x00${String.fromCharCode(xL)}${String.fromCharCode(xH)}${String.fromCharCode(yL)}${String.fromCharCode(yH)}`;
  let body = '';
  for (let i = 0; i < bitmap.length; i++) body += String.fromCharCode(bitmap[i]);
  return out + body;
}

/**
 * Fetches + decodes an image at `uri` into a monochrome ESC/POS-ready bitmap,
 * resized to fit `targetW` dots wide. Shared by the logo path (small, capped
 * height) and the full-receipt image-canvas path (full paper width, tall).
 */
async function decodeToMonochromeBitmap(
  uri: string,
  targetW: number,
  maxHeight: number,
  allowUpscale: boolean = false,
): Promise<{ bitmap: Uint8Array; width: number; height: number } | null> {
  const res = await fetch(uri);
  if (!res.ok) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  const format = detectFormat(buf);
  if (!format) return null;

  let rgba: Uint8Array | Uint8ClampedArray;
  let width: number;
  let height: number;

  if (format === 'png') {
    const decoded = UPNG.decode(buf.buffer);
    const frames = UPNG.toRGBA8(decoded);
    rgba = new Uint8Array(frames[0]);
    width = decoded.width;
    height = decoded.height;
  } else {
    const decoded = jpeg.decode(buf, { useTArray: true });
    rgba = decoded.data;
    width = decoded.width;
    height = decoded.height;
  }

  // Fit within both targetW and maxHeight (contain, preserving aspect ratio) —
  // don't just reject images that are tall relative to their width. A
  // screenshot capture (image-canvas mode) needs upscaling to fill the full
  // paper width when the on-screen view is narrower than the print head's
  // dot width; a logo should never be blown up past its native resolution.
  let fitW = allowUpscale ? targetW : Math.min(targetW, width);
  let fitH = Math.max(1, Math.round((height * fitW) / width));
  if (fitH > maxHeight) {
    fitH = maxHeight;
    fitW = Math.max(1, Math.round((width * fitH) / height));
  }
  const resized = resizeRGBA(rgba, width, height, fitW);

  const bitmap = toMonochromeBits(resized.data, resized.width, resized.height);
  return { bitmap, width: resized.width, height: resized.height };
}

/**
 * Fetches + decodes a logo image and returns an ESC/POS raster command string
 * ready to embed in the binary receipt content. Returns null on any failure
 * (unsupported format, network error, decode error) so callers can fall
 * back to a text-based logo.
 */
export async function imageUriToEscPosRaster(
  uri: string,
  paperWidth: 58 | 80,
): Promise<string | null> {
  try {
    // Cap logo width to ~45% of the paper so it prints as a small mark above
    // the store name, not a full-width banner.
    const logoTargetW = Math.round(DOT_WIDTH[paperWidth] * 0.45);
    const decoded = await decodeToMonochromeBitmap(uri, logoTargetW, 160);
    if (!decoded) return null;
    return buildRasterCommand(decoded.bitmap, decoded.width, decoded.height);
  } catch {
    return null;
  }
}

/**
 * Fetches + decodes a full receipt-preview capture (from react-native-view-shot)
 * into an ESC/POS raster command string spanning the full paper width. Used by
 * the "Image Canvas" print mode. Returns null on failure.
 */
export async function receiptImageUriToEscPosRaster(
  uri: string,
  paperWidth: 58 | 80,
): Promise<string | null> {
  try {
    // Receipts can be long — allow a tall bitmap (printers stream raster rows,
    // there's no fixed height limit like the small logo cap). Always upscale
    // to the full print-head width — the on-screen capture's pixel width
    // rarely matches the printer's dot width, so without this the receipt
    // prints small and centered with blank margins on both sides.
    const decoded = await decodeToMonochromeBitmap(uri, DOT_WIDTH[paperWidth], 20000, true);
    if (!decoded) return null;
    return buildRasterCommand(decoded.bitmap, decoded.width, decoded.height);
  } catch {
    return null;
  }
}
