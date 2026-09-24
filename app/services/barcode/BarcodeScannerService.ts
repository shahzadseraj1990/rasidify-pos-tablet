import { BarcodeRouter } from './BarcodeRouter';
import { ScanSource } from '../../types/barcode';

const IDLE_TIMEOUT_MS   = 250;  // Mode 2: no Enter key — finalize after this gap.
                                 // Bluetooth HID (connection-interval jitter) needs more
                                 // slack than USB or a slow report burst gets split in two.
const MIN_BARCODE_LEN   = 3;    // reject partial/empty scans
const DEDUP_WINDOW_MS   = 150;  // reject an identical scan repeated this fast (double-fire only —
                                 // a cashier deliberately rescanning the same item to bump
                                 // quantity is normal POS usage and must NOT be swallowed)

// Pure buffering/parsing logic, deliberately kept out of any React component
// so a fast run of keystrokes never triggers a render until a full barcode
// is resolved. BarcodeScannerProvider feeds it raw text; it feeds
// BarcodeRouter the finished barcode.
class BarcodeScannerServiceImpl {
  private buffer = '';
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private lastCode = '';
  private lastCodeAt = 0;
  private clearNativeInput: (() => void) | null = null;

  // Provider calls this once so finalize() can clear the native field —
  // done only after a full scan completes, never per-keystroke, because
  // clearing mid-burst races the scanner's fast HID stream and corrupts it.
  attachNativeClear(fn: () => void) {
    this.clearNativeInput = fn;
  }

  // The hidden input is uncontrolled, so RN accumulates the full scanned
  // string natively across the whole burst with no bridge round-trip per
  // keystroke — `text` here is always the complete current value.
  onTextChanged(text: string) {
    this.buffer = text;
    this.resetIdleTimer();
  }

  // Lets the provider's focus-guard back off while a scan is mid-flight —
  // re-issuing focus() on a field that's already receiving a fast HID burst
  // can itself interrupt the native input and drop characters.
  isBuffering(): boolean {
    return this.buffer.length > 0;
  }

  // Fired by the hidden input's onSubmitEditing — the scanner sent Enter.
  onEnterKey() {
    this.finalize();
  }

  reset() {
    this.buffer = '';
    this.clearIdleTimer();
    this.clearNativeInput?.();
  }

  private resetIdleTimer() {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => this.finalize(), IDLE_TIMEOUT_MS);
  }

  private clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private finalize(source: ScanSource = 'usb') {
    this.clearIdleTimer();
    const code = this.buffer.trim();
    this.buffer = '';
    this.clearNativeInput?.();
    if (code.length < MIN_BARCODE_LEN) return;

    const now = Date.now();
    if (code === this.lastCode && now - this.lastCodeAt < DEDUP_WINDOW_MS) return;
    this.lastCode = code;
    this.lastCodeAt = now;

    BarcodeRouter.dispatch({ code, source, scannedAt: now });
  }
}

export const BarcodeScannerService = new BarcodeScannerServiceImpl();
