/**
 * "Image Canvas" print mode: captures the on-screen ReceiptPaper preview
 * (via react-native-view-shot) and converts it into a single ESC/POS raster
 * command, so the printout is pixel-identical to what's shown in the app.
 * Alternative to the text-based ReceiptBuilder.ts path.
 */

import type { RefObject } from 'react';
import { captureRef } from 'react-native-view-shot';
import { EscPosBuilder } from './EscPosBuilder';
import { receiptImageUriToEscPosRaster } from './ImageToEscPos';

/**
 * @param viewShotRef ref attached to the <View> wrapping ReceiptPaper
 * @param paperWidth  58 or 80 (mm) — determines raster dot width
 */
export async function buildImageCanvasReceipt(
  viewShotRef: RefObject<any>,
  paperWidth: 58 | 80,
): Promise<string> {
  if (!viewShotRef.current) {
    throw new Error('Receipt preview is not ready to capture.');
  }

  const uri = await captureRef(viewShotRef, { format: 'png', quality: 1 });
  const raster = await receiptImageUriToEscPosRaster(uri, paperWidth);
  if (!raster) {
    throw new Error('Failed to capture and convert receipt image.');
  }

  const p = new EscPosBuilder(paperWidth);
  p.center().raster(raster).feed(4).cut();
  return p.build();
}
