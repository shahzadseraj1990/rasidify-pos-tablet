import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

interface ToastState {
  visible: boolean;
  message: string;
  subMessage?: string;
  type: ToastType;
  seq: number; // bumped on every show() so ToastHost can restart its timer/animation even for an identical message
  show: (message: string, type?: ToastType, subMessage?: string) => void;
  hide: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  visible: false,
  message: '',
  subMessage: undefined,
  type: 'info',
  seq: 0,
  show: (message, type = 'info', subMessage) =>
    set((s) => ({ visible: true, message, subMessage, type, seq: s.seq + 1 })),
  hide: () => set({ visible: false }),
}));
