import type { RefObject } from 'react';
import { ReceiptData, ReceiptSettings, PrinterSettings } from '../types/receipt';
import { buildReceipt } from './escpos/ReceiptBuilder';
import { buildImageCanvasReceipt } from './escpos/ImageCanvasBuilder';
import { printReceipt, PrintResult } from './PrinterService';

// Shared by ReceiptPreviewScreen (manual "Print Receipt" button, visible
// paper) and SellScreen (automatic print right after checkout, using a
// hidden off-screen ReceiptPaper+ViewShot so Image Canvas mode still has
// something to capture without ever showing a preview screen).
export async function printReceiptNow(
  receipt: ReceiptData,
  settings: ReceiptSettings,
  printer: PrinterSettings & { update: (patch: Partial<PrinterSettings>) => void },
  viewShotRef: RefObject<any>,
): Promise<PrintResult> {
  if (!printer.isConfigured) {
    return { success: false, error: 'Printer not configured. Go to Menu → Printer Setup.' };
  }
  try {
    const content = settings.printMode === 'image'
      ? await buildImageCanvasReceipt(viewShotRef, printer.paperWidth)
      : await buildReceipt(receipt, settings, printer.paperWidth);
    const result = await printReceipt(content, printer);
    if (printer.printerType === 'network') printer.update({ networkVerified: result.success });
    return result;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Could not prepare receipt for printing.' };
  }
}
