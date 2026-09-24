import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReceiptSettings, RECEIPT_SETTINGS_DEFAULTS } from '../types/receipt';

interface ReceiptSettingsState extends ReceiptSettings {
  update: (patch: Partial<ReceiptSettings>) => void;
  reset:  () => void;
}

export const useReceiptSettingsStore = create<ReceiptSettingsState>()(
  persist(
    (set) => ({
      ...RECEIPT_SETTINGS_DEFAULTS,
      update: (patch) => set((s) => ({ ...s, ...patch })),
      reset:  () => set({ ...RECEIPT_SETTINGS_DEFAULTS }),
    }),
    {
      name:    'rasidify_pos_receipt_settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
