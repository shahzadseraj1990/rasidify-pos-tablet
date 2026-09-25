import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { posApi } from './api';
import { resetSessionCaches } from './authService';
import { useSessionStore, profileFromBootstrap } from '../store/sessionStore';
import { PosUser } from '../types';

const DEVICE_UNIQUE_ID_KEY = 'pos_device_unique_id';
const DEVICE_AUTH_CODE_KEY = 'pos_device_authenticated_code';
const TOKEN_KEY = 'pos_token';
const USER_KEY  = 'pos_user';

const APP_VERSION = require('../../app.json').expo.version ?? '1.0.0';

// RFC4122-ish v4 UUID — only needs to be unique per install, not cryptographically secure.
function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const deviceService = {
  /** Persistent per-install device fingerprint — created once, reused forever. */
  async getDeviceUniqueId(): Promise<string> {
    let id = await SecureStore.getItemAsync(DEVICE_UNIQUE_ID_KEY);
    if (!id) {
      id = generateUuid();
      await SecureStore.setItemAsync(DEVICE_UNIQUE_ID_KEY, id);
    }
    return id;
  },

  async isDeviceAuthenticated(): Promise<boolean> {
    const code = await SecureStore.getItemAsync(DEVICE_AUTH_CODE_KEY);
    return !!code;
  },

  async getDeviceAuthenticatedCode(): Promise<string | null> {
    return SecureStore.getItemAsync(DEVICE_AUTH_CODE_KEY);
  },

  /**
   * Step 1 — operator enters the DeviceCode given to them from the dashboard. One-time —
   * if the code is already claimed by another terminal, an admin must Disconnect it from
   * the dashboard first. There is no self-service reconnect (by design: a bare DeviceCode
   * isn't strong enough proof to let someone silently reclaim an active terminal).
   */
  async authenticateDevice(deviceCode: string): Promise<{ authenticatedCode: string }> {
    const deviceUniqueID = await deviceService.getDeviceUniqueId();
    const body = {
      deviceCode,
      deviceUniqueID,
      deviceModel: (Platform as any).constants?.Model ?? Platform.OS,
      platform: Platform.OS === 'ios' ? 'iOS' : 'Android',
      osVersion: String(Platform.Version ?? ''),
      appVersion: APP_VERSION,
      vendorIdentifier: '',
      serialNumber: '',
    };
    const res = await posApi.post('/pos/device/authenticate', body);
    const code: string | undefined = res.data?.data?.authenticatedCode;
    // Matches web's auth.service.ts: status is numeric (1 = success), not the
    // string "Success" shown in the spec doc's example — the code's presence
    // is the real signal, status is just a secondary check like on web.
    if (code) {
      await SecureStore.setItemAsync(DEVICE_AUTH_CODE_KEY, code);
      return { authenticatedCode: code };
    }
    throw new Error(res.data?.message ?? 'Invalid device code. Please try again.');
  },

  /** Step 2 (every session) — staff enter just their 6-digit Passcode. */
  async deviceLogin(passcode: string): Promise<{ token: string; user: PosUser }> {
    const deviceUniqueID = await deviceService.getDeviceUniqueId();
    const authenticatedCode = (await deviceService.getDeviceAuthenticatedCode()) ?? '';
    const res = await posApi.post('/pos/device-login', { deviceUniqueID, authenticatedCode, passcode });

    const token: string = res.data.token;
    const u = res.data.authenticatedUser;
    if (!token || !u) {
      throw new Error(res.data?.message ?? 'Invalid passcode. Please try again.');
    }

    // Fresh session: drop anything cached from a previous staff member, store
    // the token so the bootstrap call is authenticated, then take the
    // company/currency profile from the session bootstrap (one call instead
    // of the old user/get + get/currencies pair).
    resetSessionCaches();
    await SecureStore.setItemAsync(TOKEN_KEY, token);

    const branchID: number | null = u.branchID ?? null;
    let profile: ReturnType<typeof profileFromBootstrap> | null = null;
    try {
      profile = profileFromBootstrap(await useSessionStore.getState().load(branchID, true));
    } catch {
      // Non-fatal: login still succeeds with defaults; PinLogin retries the
      // bootstrap before leaving the screen.
    }

    const user: PosUser = {
      userID:     u.tenantID,
      subUserID:  u.subUserID,
      name:       `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || 'Cashier',
      email:      u.email ?? '',
      roleID:     u.roleID,
      branchID:   branchID,
      currency:       profile?.currency ?? 'SAR',
      currencyID:     profile?.currencyID ?? null,
      companyName:    profile?.companyName,
      companyAddress: profile?.companyAddress,
      companyPhone:   profile?.companyPhone,
      companyLogoUrl: profile?.companyLogoUrl,
      rights:     u.rights ?? [],
      industryType: profile?.industryType ?? 'retail',
    };

    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    return { token, user };
  },

  /** Cold-start rehydration — restores whatever this install last logged in as. */
  async getStoredSession(): Promise<{ deviceAuthenticated: boolean; token: string | null; user: PosUser | null }> {
    const [authCode, token, userRaw] = await Promise.all([
      SecureStore.getItemAsync(DEVICE_AUTH_CODE_KEY),
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(USER_KEY),
    ]);
    let user: PosUser | null = null;
    try {
      user = userRaw ? JSON.parse(userRaw) : null;
    } catch {}
    return { deviceAuthenticated: !!authCode, token, user };
  },

  /**
   * "Switch Device" — forgets this install's device link entirely so a different
   * DeviceCode can be registered on it. Purely local: does NOT free the old
   * DeviceCode server-side — that still requires Disconnect Device from the dashboard.
   */
  async switchDevice(): Promise<void> {
    resetSessionCaches();
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    await SecureStore.deleteItemAsync(DEVICE_AUTH_CODE_KEY);
    await SecureStore.deleteItemAsync(DEVICE_UNIQUE_ID_KEY);
  },
};
