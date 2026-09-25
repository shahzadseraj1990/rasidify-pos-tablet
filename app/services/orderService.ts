import AsyncStorage from '@react-native-async-storage/async-storage';
import { posApi } from './api';
import { CartItem } from '../types';
import { useTaxStore } from '../store/taxStore';
import { useAuthStore } from '../store/authStore';
import { useSessionStore } from '../store/sessionStore';
import { deviceService } from './deviceService';

export interface PaymentRow {
  paymentMethod: string; // label string e.g. "Cash"
  paymentAmount: number;
}

export interface CreateOrderPayload {
  // Set when paying/re-holding an order that already exists (resumed from
  // Orders or Tables) — it's updated in place via PUT instead of creating a
  // second invoice.
  existingInvoiceID?: number | null;
  existingShiftOrderNo?: number;
  shiftID:      number;
  shiftOrderCount?: number; // orders already placed this shift, per the server — used to seed the order number
  branchID:     number | null;
  orderTypeID:  number | null;
  customerID:   number | null;
  customerName?: string | null;
  customerBusinessName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  orderNote:    string;
  discount:     number;    // absolute discount amount (not %)
  currency:     string;
  items:        CartItem[];
  paymentMethod?: string;
  paymentAmount?: number;
  paymentRows?: PaymentRow[];  // split payment support
  tableID?: number | null;
  tableNo?: string | null;
}

export interface CreateOrderResult {
  invoiceID: number;
  invoiceCode: string;
  shiftOrderNo: number;
  // Real ZATCA QR — signed inline by POST /pos/order/create, or fetched via
  // /zatca/sign when the save didn't return one. Null if this device has no
  // active ZATCA registration or signing failed/timed out.
  zatcaQrCode: string | null;
}

// ── Shift-scoped order number ────────────────────────────────────────────
// Persisted per shift (same as Web POS's localStorage counter) so an app
// restart mid-shift never reissues a number. Seeded from the server's order
// count for the shift, and only committed after the order is actually saved.
const counterKey = (shiftID: number) => `shift_order_counter_${shiftID}`;

async function peekNextShiftOrderNo(shiftID: number, knownOrderCount: number): Promise<number> {
  let stored = 0;
  try { stored = parseInt((await AsyncStorage.getItem(counterKey(shiftID))) ?? '0', 10) || 0; } catch {}
  return Math.max(stored, knownOrderCount) + 1;
}

async function commitShiftOrderNo(shiftID: number, no: number): Promise<void> {
  try { await AsyncStorage.setItem(counterKey(shiftID), String(no)); } catch {}
}

// Payment methods + account types come from the session bootstrap (they're
// static server-side constants) — no separate lookup calls.
function lookups() {
  const b = useSessionStore.getState().bootstrap;
  return {
    methods: (b?.paymentMethods ?? []).map(m => ({ id: m.id, label: m.name })),
    accountTypes: b?.accountTypes ?? [],
  };
}

const failMessage = (d: any, fallback: string): string =>
  d?.message ?? d?.Message ?? d?.error ?? d?.Error ?? fallback;

export const orderService = {
  // Resolve numeric payment method ID from label (matches web POS logic)
  _getMethodID(label: string, methods: { id: number; label: string }[]): number {
    const n = label.toLowerCase();
    let m = methods.find(m => m.label.toLowerCase() === n);
    if (!m) m = methods.find(m => m.label.toLowerCase().includes(n) || n.includes(m.label.toLowerCase()));
    if (!m && n.includes('cash')) m = methods.find(m => m.label.toLowerCase().includes('cash'));
    if (!m && n.includes('card')) m = methods.find(m => m.label.toLowerCase().includes('bank') || m.label.toLowerCase().includes('card'));
    return m ? m.id : (methods[0]?.id ?? 1);
  },

  _getAccountTypeID(label: string, types: { id: number; name: string }[]): number {
    const n = label.toLowerCase();
    let a = n.includes('cash')
      ? types.find(t => t.name.toLowerCase().includes('cash'))
      : types.find(t => t.name.toLowerCase().includes('bank') || t.name.toLowerCase().includes('current'));
    return a ? a.id : (types[0]?.id ?? 1);
  },

  // One invoice payload for both Hold (OrderState 12 = Pending) and Checkout
  // (OrderState 20) — same fields as Web POS's pages.component.
  async _buildInvoice(payload: CreateOrderPayload, orderState: number, shiftOrderNo: number) {
    const { taxRate, taxPercent, taxName, taxID } = useTaxStore.getState();
    const user = useAuthStore.getState().user;
    const tenantID = (user as any)?.userID ?? 0;

    const subtotal    = payload.items.reduce((s, i) => s + i.total, 0);
    const discountAmt = payload.discount;
    // Tax on subtotal after discount; total = (subtotal - discount) + vat
    const vatAmt      = Math.max(0, subtotal - discountAmt) * taxRate;
    const total       = Math.max(0, subtotal - discountAmt) + vatAmt;
    const now         = new Date().toISOString().replace(/\.\d{3}Z$/, '');
    const refNo       = String(Math.floor(Date.now() / 1000));

    const invoiceObj: any = {
      UserID:           String(tenantID),
      CreatedBy:        String(tenantID),
      Company:          { Name: '', Address: '', VAT: '0000000001010101' },
      DealID:           '00000000',
      Customer: {
        customerInfoID:       payload.customerID ?? 0,
        name:                 payload.customerName ?? 'Walk-in',
        businessName:         payload.customerBusinessName ?? payload.customerName ?? 'Walk-in',
        email:                payload.customerEmail || `walkin_${tenantID}@pos.internal`,
        contact:              payload.customerPhone ?? '',
        status:               'Active',
        isRegisteredBusiness: 0,
      },
      SalesPerson:       '',
      TransactionNumber: refNo,
      OrderRefrenceNo:   refNo,
      TransactionDate:   now,
      TransactionPeriod: now,
      ExpireDate:        now,
      NextPaymentDate:   now,
      Subtotal:          subtotal,
      Discount:          discountAmt,
      VATAmount:         vatAmt,
      TotalAmount:       total,
      Balance:           total,
      StatusID:          106,
      InculsiveTax:      0,
      TaxID:             taxID,
      BillingCycle:      8,
      PackageID:         0,
      ParentID:          0,
      SendEmail:         false,
      Currency:          payload.currency,
      PaymentTerms:      365,
      ShiftID:           payload.shiftID,
      ShiftOrderNo:      shiftOrderNo,
      OrderState:        orderState,
      TableNo:           payload.tableNo || undefined,
      customerNote:      payload.orderNote || '',
      description:       'POS Order',
      // Omitted when there's no real TaxID — an entry with taxID 0 fails the
      // FK on insert (see the 2026-09-18 Hold investigation).
      taxes:             taxID > 0 ? [{
        taxID,
        invoiceID:    0,
        name:         taxName,
        value:        taxPercent,
        status:       1,
        type:         'Percentage',
        applicableOn: 'Invoice',
        percentage:   0,
        amount:       vatAmt,
      }] : [],
      line_items: payload.items.map(i => ({
        ProductType:        i.type ?? 'HW',
        Action:             'general',
        ProductID:          i.productID,
        ProductName:        i.name,
        ProductDescription: i.selectionSummary ?? '',
        SKU:                i.sku ?? '',
        Price:              String(i.price),
        Qty:                String(i.qty),
        Discount:           '0',
        // Structured modifier/combo picks, persisted to InvoiceDetailSelections
        // and correlated back to this line by array position (no line ID).
        Selections:         i.lineSelections ?? [],
        Amount:             String(i.total),
        GrandTotal:         String(i.total * (1 + taxRate)),
      })),
      attachments: [],
      metadata:    [],
    };

    // Omit null optional fields — API may crash on null values
    if (payload.branchID != null)    invoiceObj.BranchID    = payload.branchID;
    if (payload.orderTypeID != null) invoiceObj.OrderTypeID = payload.orderTypeID;

    // Device/staff attribution (device auth flow)
    const authenticatedCode = await deviceService.getDeviceAuthenticatedCode();
    if (authenticatedCode) invoiceObj.AuthenticatedCode = authenticatedCode;
    if (user?.subUserID != null) invoiceObj.SubUserID = user.subUserID;

    return { invoiceObj, total, now, refNo, userName: user?.name ?? '' };
  },

  // Creates a new order (POST /pos/order/create) or updates an existing one in
  // place (PUT /pos/order/{id}). A response without a real invoice ID is a
  // failure either way — the backend answers HTTP 200 with status 2 for
  // rejections like insufficient stock (see project receipt-data-bug notes).
  async _saveInvoice(invoiceObj: any, existingInvoiceID?: number | null): Promise<{ invoiceID: number; invoiceCode: string; zatcaQrCode: string | null }> {
    let res: any;
    try {
      res = existingInvoiceID
        ? await posApi.put(`/pos/order/${existingInvoiceID}`, { Invoice: invoiceObj })
        : await posApi.post('/pos/order/create', { Invoice: invoiceObj });
    } catch (err: any) {
      const d = err?.response?.data;
      const msg = typeof d === 'string' && d ? d : failMessage(d, err?.message ?? 'Invoice creation failed');
      const wrapped: any = new Error(`Invoice: ${msg}`);
      // Preserve whether the backend was actually reached — the dev-mode
      // "simulate when offline" fallbacks must tell a real HTTP error apart
      // from a genuine network failure.
      wrapped.response = err?.response;
      throw wrapped;
    }

    const d = res.data;
    const failed = d?.status === 2 || d?.Status === 2;
    const inv = d?.invoice ?? d?.Invoice ?? d?.data ?? d;
    const invoiceID = failed ? null : (existingInvoiceID ?? inv?.invoiceID ?? inv?.InvoiceID ?? d?.invoiceID);
    if (!invoiceID) {
      const wrapped: any = new Error(failMessage(d, 'Invoice created but ID missing'));
      wrapped.response = res; // backend WAS reached
      throw wrapped;
    }
    return {
      invoiceID,
      // An update response carries no transaction number — show the ID, same as Web POS.
      invoiceCode: existingInvoiceID ? String(existingInvoiceID) : (inv?.transactionNumber ?? inv?.TransactionNumber ?? String(invoiceID)),
      // create() signs with ZATCA inline and returns the real QR; update() doesn't.
      zatcaQrCode: inv?.zatcaQrCode ?? inv?.ZatcaQrCode ?? null,
    };
  },

  // POST /pos/order/{id}/zatca/sign — fallback when the save response had no
  // QR (updated order, or the inline sign timed out). Never throws: resolves
  // to null on any failure so printing is never blocked.
  async signForReceipt(invoiceID: number): Promise<string | null> {
    try {
      const res = await posApi.post(`/pos/order/${invoiceID}/zatca/sign`, {}, { timeout: 8000 });
      return res.data?.data?.qrCode ?? res.data?.Data?.qrCode ?? null;
    } catch {
      return null;
    }
  },

  async _shiftOrderNo(payload: CreateOrderPayload): Promise<{ no: number; isNew: boolean }> {
    if (payload.existingInvoiceID && payload.existingShiftOrderNo) {
      return { no: payload.existingShiftOrderNo, isNew: false };
    }
    return { no: await peekNextShiftOrderNo(payload.shiftID, payload.shiftOrderCount ?? 0), isNew: true };
  },

  /** Hold: saves the order unpaid (OrderState 12 = Pending). */
  async holdOrder(payload: CreateOrderPayload): Promise<{ invoiceID: number; shiftOrderNo: number }> {
    const order = await orderService._shiftOrderNo(payload);
    const { invoiceObj } = await orderService._buildInvoice(payload, 12, order.no);
    const { invoiceID } = await orderService._saveInvoice(invoiceObj, payload.existingInvoiceID);
    if (order.isNew) await commitShiftOrderNo(payload.shiftID, order.no);
    return { invoiceID, shiftOrderNo: order.no };
  },

  /** Checkout: saves the order (OrderState 20), then records each payment. */
  async createOrder(payload: CreateOrderPayload): Promise<CreateOrderResult> {
    const order = await orderService._shiftOrderNo(payload);
    const { invoiceObj, total, now, refNo, userName } = await orderService._buildInvoice(payload, 20, order.no);
    const saved = await orderService._saveInvoice(invoiceObj, payload.existingInvoiceID);
    if (order.isNew) await commitShiftOrderNo(payload.shiftID, order.no);

    // ── Record payments (POST /pos/invoice/payment/create) ─────────────────
    const { methods, accountTypes } = lookups();
    const rows = payload.paymentRows && payload.paymentRows.length > 0
      ? payload.paymentRows
      : [{ paymentMethod: payload.paymentMethod ?? 'Cash', paymentAmount: payload.paymentAmount ?? total }];

    for (const row of rows) {
      const methodID      = orderService._getMethodID(row.paymentMethod, methods);
      const accountTypeID = orderService._getAccountTypeID(row.paymentMethod, accountTypes);
      try {
        await posApi.post('/pos/invoice/payment/create', {
          paymentID:       0,
          invoiceID:       saved.invoiceID,
          paymentDate:     now,
          paymentMethod:   String(methodID),
          referenceNo:     refNo,
          accountType:     accountTypeID,
          paymentAmount:   row.paymentAmount,
          invoiceAmount:   total,
          lastUpdatedBy:   userName,
          lastUpdatedDate: now,
          status:          105,
          sendEmail:       false,
        });
      } catch (err: any) {
        const msg = failMessage(err?.response?.data, `Payment (${row.paymentMethod}) failed`);
        const wrapped: any = new Error(`Payment: ${msg}`);
        wrapped.response = err?.response;
        throw wrapped;
      }
    }

    const zatcaQrCode = saved.zatcaQrCode ?? await orderService.signForReceipt(saved.invoiceID);
    return { invoiceID: saved.invoiceID, invoiceCode: saved.invoiceCode, shiftOrderNo: order.no, zatcaQrCode };
  },
};
