import { create } from 'zustand';

// App-wide alert dialog (see components/AlertHost + utils/appAlert). Replaces
// the plain system Alert with a branded dialog: icon, title, message, buttons.

export type AlertKind = 'success' | 'error' | 'warning' | 'info';

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface AlertRequest {
  title: string;
  message?: string;
  kind: AlertKind;
  buttons: AlertButton[];
}

interface AlertState {
  current: AlertRequest | null;
  queue: AlertRequest[];
  show: (req: AlertRequest) => void;
  dismiss: () => void;
}

export const useAlertStore = create<AlertState>((set, get) => ({
  current: null,
  queue: [],
  // Alerts raised while one is showing wait their turn instead of replacing it.
  show: (req) => {
    if (get().current) set(s => ({ queue: [...s.queue, req] }));
    else set({ current: req });
  },
  dismiss: () => {
    const [next, ...rest] = get().queue;
    set({ current: next ?? null, queue: rest });
  },
}));
