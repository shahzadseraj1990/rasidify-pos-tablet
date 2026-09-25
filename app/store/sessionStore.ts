import { create } from 'zustand';
import { posApi } from '../services/api';
import { PosShift, PosTableLayout } from '../types';
import { useTaxStore } from './taxStore';
import { useTableStore } from './tableStore';

// GET /pos/session/bootstrap — one call after login that replaces the old
// per-screen lookups (user/get, get/currencies, tax/all, pos/order-types,
// get/payment/methods, get/accounts/type, pos/shift/active, table/layout).
// Fetched once per session (at passcode login and on cold-start restore) and
// reset on logout / Switch Device, same lifetime as Web POS's
// LookUpService.getPosBootstrap() cache.

export interface PosBootstrap {
  user: any;
  branch: any;
  taxes: any[];
  taxSettings: any;
  orderTypes: { orderTypeID: number; name: string; requiresTable?: boolean; sortOrder?: number }[];
  orderStates: any[];
  activeShift: PosShift | null;
  tables: PosTableLayout | null;
  currencies: { id: number; currency: string; country: string }[];
  paymentMethods: { id: number; name: string }[];
  accountTypes: { id: number; name: string }[];
}

interface SessionState {
  bootstrap: PosBootstrap | null;
  /** Concurrent calls share one request; no-op once loaded unless `force`. */
  load: (branchId: number | null, force?: boolean) => Promise<PosBootstrap>;
  reset: () => void;
}

const arr = (v: any): any[] => (Array.isArray(v) ? v : []);

function normalize(d: any): PosBootstrap {
  const t = d?.tables;
  return {
    user: d?.user ?? null,
    branch: d?.branch ?? null,
    taxes: arr(d?.taxes),
    taxSettings: d?.taxSettings ?? null,
    orderTypes: arr(d?.orderTypes),
    orderStates: arr(d?.orderStates),
    activeShift: d?.activeShift ?? null,
    tables: t ? { floors: arr(t.floors), sections: arr(t.sections), tables: arr(t.tables) } : null,
    currencies: arr(d?.currencies),
    paymentMethods: arr(d?.paymentMethods),
    accountTypes: arr(d?.accountTypes),
  };
}

// Pushes the bootstrap's lookups into the stores the screens already read, so
// no screen has to fetch them itself.
function apply(b: PosBootstrap, branchId: number | null) {
  const active = b.taxes.filter((t: any) => t.status !== 0);
  const def = active.find((t: any) => t.isDefault) ?? active[0];
  if (def) useTaxStore.getState().setTax(def.percentageRate ?? 0, def.taxName ?? 'Tax', def.taxID ?? 0);

  // Initial layout only — live table actions (open/release/transfer) and the
  // Tables screen's refresh still hit the dashboard's /table/layout.
  if (b.tables && branchId != null) {
    useTableStore.setState({ layout: b.tables, loadedBranchID: branchId });
  }
}

let inFlight: Promise<PosBootstrap> | null = null;

export const useSessionStore = create<SessionState>((set, get) => ({
  bootstrap: null,

  load: async (branchId, force = false) => {
    const cached = get().bootstrap;
    if (cached && !force) return cached;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        // Longer than the default 15s: a cold server took ~35s to answer.
        const res = await posApi.get('/pos/session/bootstrap', { params: { branchId: branchId ?? 0 }, timeout: 45000 });
        const b = normalize(res.data?.data ?? res.data);
        apply(b, branchId);
        set({ bootstrap: b });
        return b;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  },

  reset: () => set({ bootstrap: null }),
}));

/** Currency symbol + company info for the receipt/profile, from bootstrap.user. */
export function profileFromBootstrap(b: PosBootstrap) {
  const u = b.user ?? {};
  const currencyID: number | null = u.currencyID ?? null;
  const currency = b.currencies.find(c => c.id == currencyID)?.currency ?? 'SAR';
  return {
    currency,
    currencyID,
    companyName: u.company,
    companyAddress: u.address,
    companyPhone: u.contactNo,
    companyLogoUrl: u.imagePath,
    // Anything other than exactly "restaurant" (case-insensitive) is retail,
    // same normalization as Web POS.
    industryType: String(u.industryType ?? 'retail').toLowerCase() === 'restaurant' ? 'restaurant' : 'retail',
  };
}
