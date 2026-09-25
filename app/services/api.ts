import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import Config from '../config';

// Set by the navigation root: clears the session and returns to PinLogin.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

// Both backends accept the same device-login JWT, so both clients share the
// same token attach + 401 handling.
function createClient(baseURL: string): AxiosInstance {
  const client = axios.create({
    baseURL,
    timeout: Config.API_TIMEOUT,
    headers: { 'Content-Type': 'application/json' },
  });

  // Attach pos_token to every request
  client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    const token = await SecureStore.getItemAsync('pos_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Handle 401 — token expired or invalid
  client.interceptors.response.use(
    res => res,
    async err => {
      if (err.response?.status === 401) {
        await SecureStore.deleteItemAsync('pos_token');
        await SecureStore.deleteItemAsync('pos_user');
        // Token expired or revoked (e.g. a backend redeploy with a new
        // signing key) — send the cashier to the passcode screen.
        onUnauthorized?.();
      }
      return Promise.reject(err);
    }
  );

  return client;
}

/** RASIDIFY-POS-API (pos-api.rasidify.com) — everything except live table actions. */
export const posApi = createClient(Config.POS_API_URL);

/** Dashboard API (api.rasidify.com) — only live table actions remain here. */
const api = createClient(Config.API_URL);

export default api;
