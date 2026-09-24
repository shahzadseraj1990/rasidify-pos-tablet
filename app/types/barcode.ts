// ── Barcode Scanning ─────────────────────────────────────────────────

// Where the scan physically came from. Screens never see this — only
// BarcodeScannerService cares. Keeping it here (not inline) is what lets
// camera/QR/RFID sources be added later without touching handler code.
export type ScanSource = 'usb' | 'bluetooth' | 'camera' | 'manual';

export interface BarcodeScanEvent {
  code: string;
  source: ScanSource;
  scannedAt: number;
}

// A screen (or a modal within a screen) implements this and registers it
// via useBarcodeHandler while it's the active target for scans.
export interface BarcodeHandler {
  onScan: (event: BarcodeScanEvent) => void;
}
