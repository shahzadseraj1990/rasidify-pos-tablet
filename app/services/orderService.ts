import api from './api';
import { CartItem } from '../types';
import { useTaxStore } from '../store/taxStore';
import { useAuthStore } from '../store/authStore';
import { deviceService } from './deviceService';

export interface PaymentRow {
  paymentMethod: string; // label string e.g. "Cash"
  paymentAmount: number;
}

export interface CreateOrderPayload {
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
  paymentMethod: string;
  paymentAmount: number;
  paymentRows?: PaymentRow[];  // split payment support
  tableID?: number | null;
  tableNo?: string | null;
}

export interface CreateOrderResult {
  invoiceID: number;
  invoiceCode: string;
  shiftOrderNo: number;
  // Real ZATCA QR, signed inline by the backend right after invoice creation
  // (see InvoiceController.Create -> TrySignForQrAsync) - null if this device
  // has no active ZATCA registration or signing failed/timed out.
  zatcaQrCode: string | null;
}

// Cache payment methods & account types after first fetch
let _cachedMethods: { id: number; label: string }[] | null = null;
let _cachedAccountTypes: { id: number; name: string }[] | null = null;

// Shift-scoped order number counter (in-memory; seeded from the shift's known
// order count so it survives app restarts instead of always starting at 1)
const _shiftCounters: Record<number, number> = {};
function _nextShiftOrderNo(shiftID: number, knownOrderCount: number): number {
  if (!_shiftCounters[shiftID]) _shiftCounters[shiftID] = knownOrderCount + 1;
  return _shiftCounters[shiftID]++;
}

export const orderService = {
  async getPaymentMethods(): Promise<{ id: number; label: string }[]> {
    const res = await api.get('/get/payment/methods');
    const d = res.data;
    const raw: any[] = Array.isArray(d) ? d
      : Array.isArray(d?.data) ? d.data
      : [];
    const mapped = raw.map(m => ({
      id:    m.id ?? m.paymentMethodID ?? m.PaymentMethodID,
      label: m.value ?? m.name ?? m.paymentMethod ?? m.paymentMethodTitle ?? '',
    })).filter(m => m.id != null && m.label);
    _cachedMethods = mapped.length > 0 ? mapped : null;
    return mapped;
  },

  async getAccountTypes(): Promise<{ id: number; name: string }[]> {
    if (_cachedAccountTypes) return _cachedAccountTypes;
    const res = await api.get('/get/accounts/type');
    const raw: any[] = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.data) ? res.data.data : []);
    const mapped = raw.map(a => ({ id: a.id ?? a.accountTypeID, name: a.name ?? a.accountType ?? '' }));
    _cachedAccountTypes = mapped;
    return mapped;
  },

  async getOrderTypes(): Promise<{ id: number; name: string }[]> {
    const res = await api.get('/pos/order-types');
    const raw: any[] = Array.isArray(res.data?.data) ? res.data.data : [];
    return raw.map(t => ({ id: t.orderTypeID, name: t.name ?? t.orderType ?? '' }));
  },

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

  async createOrder(payload: CreateOrderPayload): Promise<CreateOrderResult> {
    const { taxRate, taxPercent, taxName, taxID } = (() => {
      const s = useTaxStore.getState();
      return { taxRate: s.taxRate, taxPercent: s.taxPercent, taxName: s.taxName, taxID: (s as any).taxID ?? 0 };
    })();

    const user = useAuthStore.getState().user;
    const tenantID = (user as any)?.userID ?? 0;

    const subtotal    = payload.items.reduce((s, i) => s + i.total, 0);
    const discountAmt = payload.discount;
    // Tax on subtotal after discount
    const vatAmt      = Math.max(0, subtotal - discountAmt) * taxRate;
    // total = (subtotal - discount) + vat
    const total       = Math.max(0, subtotal - discountAmt) + vatAmt;
    const now         = new Date().toISOString().replace(/\.\d{3}Z$/, '');
    const refNo       = String(Math.floor(Date.now() / 1000));
    const shiftOrderNo = _nextShiftOrderNo(payload.shiftID, payload.shiftOrderCount ?? 0);

    // ── Step 1: Pre-fetch payment methods + account types before creating invoice ──
    // Errors here are surfaced separately so we know which call failed
    let methods: { id: number; label: string }[] = _cachedMethods ?? [];
    let accountTypes: { id: number; name: string }[] = _cachedAccountTypes ?? [];

    if (methods.length === 0) {
      try {
        methods = await orderService.getPaymentMethods();
      } catch {
        // Non-fatal: fallback IDs will be used
        methods = [];
      }
    }
    if (accountTypes.length === 0) {
      try {
        accountTypes = await orderService.getAccountTypes();
      } catch {
        accountTypes = [];
      }
    }

    // ── Step 2: Create invoice ────────────────────────────────────────────────
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
      OrderState:        20,
      TableNo:           payload.tableNo || undefined,
      customerNote:      payload.orderNote || '',
      description:       'POS Order',
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
    if (payload.orderTypeID != null)  invoiceObj.OrderTypeID = payload.orderTypeID;

    // Device/staff attribution (device auth flow — see MOBILE_POS_DEVICE_AUTH_IMPLEMENTATION.md §6)
    const authenticatedCode = await deviceService.getDeviceAuthenticatedCode();
    if (authenticatedCode) invoiceObj.AuthenticatedCode = authenticatedCode;
    if (user?.subUserID != null) invoiceObj.SubUserID = user.subUserID;
    // Customer ID only if a real customer was selected
    if (payload.customerID && payload.customerID > 0) {
      invoiceObj.Customer.customerInfoID = payload.customerID;
    }

    // ── DEBUG: log full payload and any error ──
    console.log('[ORDER] Invoice payload:', JSON.stringify({ Invoice: invoiceObj }, null, 2));

    let createRes: any;
    try {
      createRes = await api.post('/invoicing/create/invoice', { Invoice: invoiceObj });
      console.log('[ORDER] Invoice response:', JSON.stringify(createRes.data, null, 2));
    } catch (err: any) {
      console.log('[ORDER] Invoice ERROR status:', err?.response?.status);
      console.log('[ORDER] Invoice ERROR data:', JSON.stringify(err?.response?.data, null, 2));
      console.log('[ORDER] Invoice ERROR message:', err?.message);
      console.log('[ORDER] Invoice ERROR headers:', JSON.stringify(err?.response?.headers, null, 2));
      console.log('[ORDER] Invoice ERROR data type:', typeof err?.response?.data, 'raw:', String(err?.response?.data).slice(0, 2000));
      const msg = err?.response?.data?.message ?? err?.response?.data?.Message
        ?? err?.response?.data?.error ?? err?.response?.data?.Error
        ?? JSON.stringify(err?.response?.data)
        ?? 'Invoice creation failed';
      const wrapped: any = new Error(`Invoice: ${msg}`);
      // Preserve whether the backend was actually reached — callers (e.g.
      // SellScreen's dev-mode "simulate checkout when offline" fallback) need
      // to tell a real HTTP error response (server reachable, order rejected)
      // apart from a genuine network failure (no server reachable at all).
      // Without this, a plain re-thrown Error looks identical to both, and a
      // real backend 500 gets silently treated as "no backend, fake success".
      wrapped.response = err?.response;
      throw wrapped;
    }

    const inv = createRes.data?.invoice ?? createRes.data?.data ?? createRes.data;
    const invoiceID = inv?.invoiceID ?? inv?.InvoiceID ?? inv?.id;
    if (!invoiceID) {
      const wrapped: any = new Error(createRes.data?.message ?? createRes.data?.Message ?? 'Invoice created but ID missing');
      // The backend WAS reached (it responded, just without an ID) — mark it
      // reachable so callers don't mistake this for an offline/no-backend case.
      wrapped.response = createRes;
      throw wrapped;
    }
    const invoiceCode: string = inv?.transactionNumber ?? inv?.invoiceCode ?? inv?.TransactionNumber ?? String(invoiceID);
    const zatcaQrCode: string | null = inv?.zatcaQrCode ?? inv?.ZatcaQrCode ?? null;

    // ── Step 3: Record payments ───────────────────────────────────────────────
    const rows = payload.paymentRows && payload.paymentRows.length > 0
      ? payload.paymentRows
      : [{ paymentMethod: payload.paymentMethod, paymentAmount: payload.paymentAmount }];

    for (const row of rows) {
      const methodID      = orderService._getMethodID(row.paymentMethod, methods);
      const accountTypeID = orderService._getAccountTypeID(row.paymentMethod, accountTypes);
      try {
        await api.post('/invoice/payment/create', {
          paymentID:       0,
          invoiceID,
          paymentDate:     now,
          paymentMethod:   String(methodID),
          referenceNo:     refNo,
          accountType:     accountTypeID,
          paymentAmount:   row.paymentAmount,
          invoiceAmount:   total,
          lastUpdatedBy:   user?.name ?? '',
          lastUpdatedDate: now,
          status:          105,
          sendEmail:       false,
        });
      } catch (err: any) {
        const msg = err?.response?.data?.message ?? err?.response?.data?.Message ?? `Payment (${row.paymentMethod}) failed`;
        const wrapped: any = new Error(`Payment: ${msg}`);
        wrapped.response = err?.response;
        throw wrapped;
      }
    }

    return { invoiceID, invoiceCode, shiftOrderNo, zatcaQrCode };
  },
};
