import { create } from 'zustand';
import { PosShift } from '../types';

interface ShiftState {
  activeShift: PosShift | null;
  isLoading: boolean;
  setShift: (shift: PosShift | null) => void;
  setLoading: (v: boolean) => void;
  clearShift: () => void;
}

export const useShiftStore = create<ShiftState>((set) => ({
  activeShift: null,
  isLoading: false,

  setShift:   (shift) => set({ activeShift: shift }),
  setLoading: (v)     => set({ isLoading: v }),
  clearShift: ()      => set({ activeShift: null }),
}));
