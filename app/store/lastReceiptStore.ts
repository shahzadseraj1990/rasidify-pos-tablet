import { create } from 'zustand';
import { ReceiptData } from '../types/receipt';

interface LastReceiptState {
  receipt: ReceiptData | null;
  set:   (r: ReceiptData) => void;
  clear: () => void;
}

export const useLastReceiptStore = create<LastReceiptState>((set) => ({
  receipt: null,
  set:     (r) => set({ receipt: r }),
  clear:   () => set({ receipt: null }),
}));
