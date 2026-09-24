import { create } from 'zustand';
import { CartItem, Customer, OrderType } from '../types';
import { useTaxStore } from './taxStore';

interface CartState {
  items: CartItem[];
  customer: Customer | null;
  orderTypeID: number | null;
  orderNote: string;
  discount: number;          // global discount absolute amount (SAR)
  checkoutInvoiceID: number | null;  // set when editing existing order
  checkoutShiftOrderNo: number;      // original order number when editing

  // Dine-in table for this order (restaurant industryType only). tableID
  // (numeric, drives the Table-entity open/release/transfer calls) and
  // tableNo (display name, e.g. "T3") are kept as separate fields — same
  // duality as web POS — so a manually-typed table number can still be set
  // without a real Table entity behind it.
  tableID: number | null;
  tableNo: string | null;

  addItem: (item: Omit<CartItem, 'total' | 'lineID'>) => void;
  updateQty: (lineID: string, qty: number) => void;
  removeItem: (lineID: string) => void;
  setCustomer: (c: Customer | null) => void;
  setOrderType: (id: number | null) => void;
  setOrderNote: (note: string) => void;
  setDiscount: (pct: number) => void;
  setCheckoutInvoice: (invoiceID: number, shiftOrderNo: number) => void;
  setTable: (tableID: number | null, tableNo: string | null) => void;
  clearCart: () => void;

  // computed helpers
  subtotal: () => number;
  totalDiscount: () => number;
  totalTax: () => number;
  grandTotal: () => number;
}


export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  customer: null,
  orderTypeID: null,
  orderNote: '',
  discount: 0,
  checkoutInvoiceID: null,
  checkoutShiftOrderNo: 0,
  tableID: null,
  tableNo: null,

  addItem: (item) => {
    // A configured line (modifiers/combo selections) never merges quantity
    // with an existing row — two adds of the same product can carry
    // different selections and thus different prices, so each is its own
    // cart line. Plain adds (no selections) keep the old merge-by-product
    // behavior for a familiar tap-tap-tap qty bump.
    const hasSelections = (item.lineSelections?.length ?? 0) > 0;
    const existing = !hasSelections
      ? get().items.find(i => i.productID === item.productID && (i.lineSelections?.length ?? 0) === 0)
      : undefined;
    if (existing) {
      set(s => ({
        items: s.items.map(i =>
          i.lineID === existing.lineID
            ? { ...i, qty: i.qty + 1, total: (i.qty + 1) * i.price }
            : i
        ),
      }));
    } else {
      const lineID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      set(s => ({
        items: [...s.items, { ...item, lineID, total: item.qty * item.price }],
      }));
    }
  },

  updateQty: (lineID, qty) => {
    if (qty <= 0) {
      get().removeItem(lineID);
      return;
    }
    set(s => ({
      items: s.items.map(i =>
        i.lineID === lineID ? { ...i, qty, total: qty * i.price } : i
      ),
    }));
  },

  removeItem: (lineID) =>
    set(s => ({ items: s.items.filter(i => i.lineID !== lineID) })),

  setCustomer:   (c)    => set({ customer: c }),
  setOrderType:  (id)   => set({ orderTypeID: id }),
  setOrderNote:  (note) => set({ orderNote: note }),
  setDiscount:   (amt)  => set({ discount: amt }),

  setCheckoutInvoice: (invoiceID, shiftOrderNo) =>
    set({ checkoutInvoiceID: invoiceID, checkoutShiftOrderNo: shiftOrderNo }),

  setTable: (tableID, tableNo) => set({ tableID, tableNo }),

  clearCart: () => set({
    items: [],
    customer: null,
    orderTypeID: null,
    orderNote: '',
    discount: 0,
    checkoutInvoiceID: null,
    checkoutShiftOrderNo: 0,
    tableID: null,
    tableNo: null,
  }),

  subtotal: () => get().items.reduce((s, i) => s + i.total, 0),

  // discount is an absolute amount; totalDiscount() just returns it
  totalDiscount: () => get().discount,

  totalTax: () => {
    const taxRate = useTaxStore.getState().taxRate;
    // Tax on subtotal after discount
    return Math.max(0, get().subtotal() - get().discount) * taxRate;
  },

  // total = (subtotal - discount) + vat
  grandTotal: () => Math.max(0, get().subtotal() - get().discount) + get().totalTax(),
}));
