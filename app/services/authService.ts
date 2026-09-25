import * as SecureStore from 'expo-secure-store';
import { useSessionStore } from '../store/sessionStore';
import { useProductStore } from '../store/productStore';
import { productCatalogService } from './productCatalogService';
import { PosUser } from '../types';

const TOKEN_KEY = 'pos_token';
const USER_KEY  = 'pos_user';

// Session-scoped caches (bootstrap, menu, per-product option configs) must not
// survive into the next staff member's / device's session — call on every
// logout, Switch Device, and fresh passcode login.
export function resetSessionCaches(): void {
  useSessionStore.getState().reset();
  useProductStore.getState().reset();
  productCatalogService.clear();
}

export const authService = {
  async logout(): Promise<void> {
    // Ends the staff session only — device claim (pos_device_unique_id /
    // pos_device_authenticated_code) is left intact so the next staff
    // member only has to enter their passcode.
    resetSessionCaches();
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  },

  async getStoredUser(): Promise<PosUser | null> {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },

  async getToken(): Promise<string | null> {
    return SecureStore.getItemAsync(TOKEN_KEY);
  },

  async isAuthenticated(): Promise<boolean> {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    return !!token;
  },
};
