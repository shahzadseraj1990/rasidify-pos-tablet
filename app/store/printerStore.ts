import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PrinterSettings, PRINTER_SETTINGS_DEFAULTS } from '../types/receipt';

interface PrinterStoreState extends PrinterSettings {
  update:            (patch: Partial<PrinterSettings>) => void;
  reset:             () => void;
  disconnectNetwork: () => void;
}

export const usePrinterStore = create<PrinterStoreState>()(
  persist(
    (set) => ({
      ...PRINTER_SETTINGS_DEFAULTS,
      update: (patch) => set((s) => ({ ...s, ...patch })),
      reset:  () => set({ ...PRINTER_SETTINGS_DEFAULTS }),
      disconnectNetwork: () => set((s) => ({
        ...s,
        networkHost:     '',
        networkPort:     9100,
        isConfigured:    false,
        networkVerified: false,
      })),
    }),
    {
      name:    'rasidify_pos_printer_settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
