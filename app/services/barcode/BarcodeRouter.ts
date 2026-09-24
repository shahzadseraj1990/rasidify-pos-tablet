import { BarcodeHandler, BarcodeScanEvent } from '../../types/barcode';

// Stack-based registry. Screens register their handler when focused and
// unregister when blurred (see useBarcodeHandler). A modal opened on top of
// a screen (e.g. the customer drawer) registers its own handler after the
// screen's — the router always dispatches to whichever was registered last,
// so the app (not the scanner) decides where a barcode goes.
type ActiveChangeListener = (hasActiveHandler: boolean) => void;

class BarcodeRouterImpl {
  private stack: { id: string; handler: BarcodeHandler }[] = [];
  private listeners = new Set<ActiveChangeListener>();

  register(id: string, handler: BarcodeHandler) {
    this.stack = this.stack.filter(e => e.id !== id);
    this.stack.push({ id, handler });
    this.notify();
  }

  unregister(id: string) {
    this.stack = this.stack.filter(e => e.id !== id);
    this.notify();
  }

  dispatch(event: BarcodeScanEvent) {
    const active = this.stack[this.stack.length - 1];
    active?.handler.onScan(event);
  }

  hasActiveHandler(): boolean {
    return this.stack.length > 0;
  }

  // Lets BarcodeScannerProvider only claim keyboard focus while some screen
  // actually wants scans — everywhere else (Login, ShiftStart, ...) is left
  // completely alone.
  subscribe(listener: ActiveChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const active = this.hasActiveHandler();
    this.listeners.forEach(l => l(active));
  }
}

export const BarcodeRouter = new BarcodeRouterImpl();
