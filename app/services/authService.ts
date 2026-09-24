import * as SecureStore from 'expo-secure-store';
import api from './api';
import { PosUser } from '../types';

const TOKEN_KEY = 'pos_token';
const USER_KEY  = 'pos_user';

export interface ResolvedProfile {
  currency: string;
  currencyID: number | null;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyLogoUrl?: string;
  industryType?: string;
}

export async function resolveCurrency(userID: number): Promise<ResolvedProfile> {
  try {
    console.log(`[Auth] fetching /user/get/${userID}`);
    const [userRes, currencyRes] = await Promise.all([
      api.get(`/user/get/${userID}`),
      api.get('/get/currencies'),
    ]);

    console.log('[Auth] /user/get raw response:', JSON.stringify(userRes.data));

    const u = userRes.data?.data ?? userRes.data ?? {};
    const currencyID: number | null = u?.currencyID ?? null;
    const currencies: any[] = Array.isArray(currencyRes.data) ? currencyRes.data : [];
    const match = currencies.find(c => c.id == currencyID);
    const currency: string = match?.currency ?? 'SAR';

    const profile = {
      currency,
      currencyID,
      companyName:    u?.company,
      companyAddress: u?.address,
      companyPhone:   u?.contactNo,
      companyLogoUrl: u?.imagePath,
      // Normalized like web's auth.service.ts: anything other than the exact
      // string "restaurant" (case-insensitive) is treated as "retail".
      industryType:   (String(u?.industryType ?? 'retail').toLowerCase() === 'restaurant') ? 'restaurant' : 'retail',
    };
    console.log('[Auth] resolved profile:', JSON.stringify(profile));
    return profile;
  } catch (e: any) {
    console.log('[Auth] /user/get FAILED:', e?.message, e?.response?.status, JSON.stringify(e?.response?.data));
    return { currency: 'SAR', currencyID: null, industryType: 'retail' };
  }
}

export const authService = {
  async logout(): Promise<void> {
    // Ends the staff session only — device claim (pos_device_unique_id /
    // pos_device_authenticated_code) is left intact so the next staff
    // member only has to enter their passcode.
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
