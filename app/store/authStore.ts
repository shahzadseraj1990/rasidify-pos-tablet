import { create } from 'zustand';
import { PosUser } from '../types';

interface AuthState {
  user: PosUser | null;
  isAuthenticated: boolean;
  deviceAuthenticated: boolean;
  setUser: (user: PosUser) => void;
  clearAuth: () => void;
  setDeviceAuthenticated: (v: boolean) => void;
  canDo: (formID: number) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  deviceAuthenticated: false,

  setUser: (user) => set({ user, isAuthenticated: true }),

  clearAuth: () => set({ user: null, isAuthenticated: false }),

  setDeviceAuthenticated: (v) => set({ deviceAuthenticated: v }),

  canDo: (formID: number) => {
    const rights = get().user?.rights ?? [];
    return rights.some(g => g.formID === formID || g.methods?.includes(formID));
  },
}));
