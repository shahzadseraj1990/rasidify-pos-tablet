import { useEffect, useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { BarcodeRouter } from '../services/barcode/BarcodeRouter';
import { BarcodeScanEvent } from '../types/barcode';

// Registers `onScan` as the active barcode target for as long as the owning
// screen is focused AND `enabled` is true (e.g. a modal only wants scans
// while it's open). Unregisters automatically on blur/unmount — screens
// never manage this by hand.
export function useBarcodeHandler(id: string, onScan: (event: BarcodeScanEvent) => void, enabled: boolean = true) {
  const isFocused = useIsFocused();
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!isFocused || !enabled) return;
    BarcodeRouter.register(id, { onScan: e => onScanRef.current(e) });
    return () => BarcodeRouter.unregister(id);
  }, [id, isFocused, enabled]);
}
