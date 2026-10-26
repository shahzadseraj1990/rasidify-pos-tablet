import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Image, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Animated, PanResponder, BackHandler, Keyboard } from 'react-native';
import { ViewShotRef } from 'react-native-view-shot';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { Colors } from '../utils/colors';
import { fmt } from '../utils/format';
import Icon from '../components/Icon';
import Money from '../components/Money';
import { buildDelta, sendKitchenTicket, SendTicketMeta } from '../services/kitchenTicketService';
import { useKitchenStore } from '../store/kitchenStore';
import { useCustomerDisplayStore, isCardMethod, isCashMethod, CardPayment } from '../store/customerDisplayStore';
import { PAY_FINAL } from '../kds-link/protocol';
import type { TicketItem } from '../kds-link/protocol';
import RiyalIcon from '../components/RiyalIcon';
import { ReceiptPaper, ReceiptPrintCapture } from '../components/receipt/ReceiptPaper';
import { KitchenTicketPrintCapture } from '../components/receipt/KitchenTicketPaper';
import { orderService } from '../services/orderService';
import { useCartStore } from '../store/cartStore';
import { useProductStore } from '../store/productStore';
import { useAuthStore } from '../store/authStore';
import { useShiftStore } from '../store/shiftStore';
import { useTaxStore } from '../store/taxStore';
import { useLastReceiptStore } from '../store/lastReceiptStore';
import { usePrinterStore } from '../store/printerStore';
import { useReceiptSettingsStore } from '../store/receiptSettingsStore';
import { usePosSettingsStore } from '../store/posSettingsStore';
import { useToastStore } from '../store/toastStore';
import { Product, Category, Customer, CartItem } from '../types';
import { ReceiptData } from '../types/receipt';
import { BarcodeScanEvent } from '../types/barcode';
import { useBarcodeHandler } from '../hooks/useBarcodeHandler';
import { useBarcodeScannerCapture } from '../providers/BarcodeScannerProvider';
import { buildSimpleReceipt } from '../services/escpos/ReceiptBuilder';
import { printReceipt } from '../services/PrinterService';
import { printReceiptNow, printKitchenTicketNow } from '../services/receiptPrintFlow';
import { posApi } from '../services/api';
import { useSessionStore, getStoreInfo, storeFields } from '../store/sessionStore';
import { zatcaPhase1Qr } from '../utils/zatcaPhase1Qr';
import { DEV_MOCK_PRODUCTS, DEV_MOCK_CATEGORIES } from '../utils/devBypass';
import { productCatalogService } from '../services/productCatalogService';
import ProductOptionsModal from '../components/ProductOptionsModal';
import { C, F } from '../theme/tokens';
import { Txt, Glyph, BrandMark, orderTypeGlyph, Button, IconButton, ActionTile, CountBadge, Avatar, Segmented, Field, Dialog, Numpad, NumDisplay } from '../components/ui';
import { CategoryGrid, ProductGrid, GRID_COLUMNS, GRID_GAP } from '../components/sell/Catalog';
import CartLine, { CartLineHandlers } from '../components/sell/CartLine';
import PaymentModal from '../components/sell/PaymentModal';
import TableSelectScreen from '../components/TableSelectScreen';
import ProductSearchPanel, { searchProducts } from '../components/ProductSearchPanel';
import { useSearchHistoryStore } from '../store/searchHistoryStore';
import { tableService } from '../services/tableService';
import { appAlert } from '../utils/appAlert';

const ORDER_TYPE_FALLBACK = [
  { id: -1, name: 'Pickup' },
  { id: -2, name: 'Walk-in' },
  { id: -3, name: 'Delivery' },
];

// The cashier enters what the customer handed over; only the bill amount is
// a payment. The excess (change) comes off cash rows first, then the rest,
// so e.g. 100 cash on a 51.75 bill is recorded as 51.75.
function capPaymentsToTotal(rows: { paymentMethod: string; paymentAmount: number }[], total: number) {
  const out = rows.map(r => ({ ...r }));
  let excess = out.reduce((s, r) => s + r.paymentAmount, 0) - total;
  const order = [
    ...out.map((r, i) => i).filter(i => /cash|نقد/i.test(out[i].paymentMethod)).reverse(),
    ...out.map((r, i) => i).filter(i => !/cash|نقد/i.test(out[i].paymentMethod)).reverse(),
  ];
  for (const i of order) {
    if (excess <= 0.005) break;
    const cut = Math.min(excess, out[i].paymentAmount);
    out[i].paymentAmount = Math.round((out[i].paymentAmount - cut) * 100) / 100;
    excess -= cut;
  }
  return out.filter(r => r.paymentAmount > 0);
}

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Shell'> };

export default function SellScreen({ navigation }: Props) {
  // Cached for the whole session in productStore (fetched once at login/session
  // restore — see PinLoginScreen.tsx and navigation/index.tsx) so switching
  // tabs and remounting this screen never re-hits the products API.
  const products = useProductStore(s => s.products);
  const categories = useProductStore(s => s.categories);
  const productsLoaded = useProductStore(s => s.loaded);
  const [orderTypes, setOrderTypes] = useState(ORDER_TYPE_FALLBACK);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const loadSearchHistory = useSearchHistoryStore(s => s.load);
  const addSearchTerm = useSearchHistoryStore(s => s.add);
  const [gridWidth, setGridWidth] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  // Redesign: category cards first, then that category's products.
  const [catalogView, setCatalogView] = useState<'cats' | 'products'>('cats');
  const [discountPct, setDiscountPct] = useState(0);
  const [discountMode, setDiscountMode] = useState<'preset' | 'custom'>('preset');
  const [customDiscountVisible, setCustomDiscountVisible] = useState(false);
  const [customDiscountValue, setCustomDiscountValue] = useState('');
  const [customDiscountType, setCustomDiscountType] = useState<'amount' | 'percent'>('amount');
  const [paymentVisible, setPaymentVisible] = useState(false);
  // Customer display shows "please pay" while the payment dialog is open.
  useEffect(() => { useCustomerDisplayStore.getState().setPaying(paymentVisible); }, [paymentVisible]);
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  // Per-item kitchen note being edited (cart lineID), and its draft text.
  const [itemNoteLine, setItemNoteLine] = useState<string | null>(null);
  const [itemNoteDraft, setItemNoteDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [holding, setHolding] = useState(false);
  const [printingBill, setPrintingBill] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '' });
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [tablePickerVisible, setTablePickerVisible] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [qtyEditItem, setQtyEditItem] = useState<CartItem | null>(null);
  const [qtyEditValue, setQtyEditValue] = useState('');

  const user = useAuthStore(s => s.user);
  const isRestaurant = user?.industryType === 'restaurant';
  const currency = user?.currency ?? 'SAR';
  const activeShift = useShiftStore(s => s.activeShift);
  const cart = useCartStore();
  const branchID = activeShift?.branchID ?? user?.branchID ?? null;
  const taxPercent = useTaxStore(s => s.taxPercent);
  const taxName = useTaxStore(s => s.taxName);
  const setReceipt = useLastReceiptStore(s => s.set);
  const printer = usePrinterStore();
  const receiptSettings = useReceiptSettingsStore();
  const swipeToDeleteEnabled = usePosSettingsStore(s => s.swipeToDeleteEnabled);
  const toast = useToastStore(s => s.show);
  // Off-screen ViewShot target for "Image Canvas" print mode — lets checkout
  // print directly (no visible preview screen) while that mode still has a
  // rendered receipt to screenshot. See app/components/receipt/ReceiptPaper.tsx.
  const printViewShotRef = useRef<ViewShotRef>(null);
  const kitchenShotRef = useRef<ViewShotRef>(null);
  const [printCaptureReceipt, setPrintCaptureReceipt] = useState<ReceiptData | null>(null);
  // Auto-print off: the paid order stays on the checkout's "Payment complete"
  // view (Print receipt / New order) instead of closing straight away.
  const [paidOrder, setPaidOrder] = useState<{ data: ReceiptData; payments: number; kicker?: string } | null>(null);
  const [printingPaid, setPrintingPaid] = useState(false);

  useEffect(() => {
    if (!usePosSettingsStore.getState().loaded) usePosSettingsStore.getState().load();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // load() is a no-op (resolves immediately, no network) once already
        // cached — this only actually fetches the first time in the session.
        // Order types come from the session bootstrap (cached — no request
        // here once login/cold-start has loaded it).
        // Loaded independently of the menu: a slow or failed menu request
        // must not leave the order-type tabs unselected (an order would then
        // be saved with no OrderTypeID).
        const boot = await useSessionStore.getState().load(user?.branchID ?? null).catch(() => null);
        const ot = (boot?.orderTypes ?? []).map(t => ({ id: t.orderTypeID, name: t.name ?? '' }));
        if (ot.length > 0) setOrderTypes(ot);
        const current = useCartStore.getState().orderTypeID;
        if (ot.length > 0 && (current == null || !ot.some(t => t.id === current))) cart.setOrderType(ot[0].id);
        else if (current == null) cart.setOrderType(ORDER_TYPE_FALLBACK[0].id);
        await useProductStore.getState().load();
      } catch (e) {
        // Non-fatal: in dev, fall back to mock data so the UI is testable
        // without a live backend; in production leave lists empty.
        if (__DEV__) {
          useProductStore.setState({ products: DEV_MOCK_PRODUCTS, categories: DEV_MOCK_CATEGORIES, loaded: true });
          if (cart.orderTypeID == null) cart.setOrderType(ORDER_TYPE_FALLBACK[0].id);
        }
      }
      try {
        const res = await posApi.get('/pos/customers');
        const raw: any[] = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
        setCustomers(raw.map((c: any) => ({
          customerID: c.customerInfoID ?? c.customerID,
          name: c.name ?? '',
          businessName: c.businessName ?? '',
          phone: c.contact ?? c.phone ?? '',
          email: c.email ?? '',
        })));
      } catch {
        // Non-fatal: customer picker just stays empty (Walk-in still works).
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search no longer filters the grid — it has its own results popup
  // (ProductSearchPanel), so the grid is category-only.
  const filteredProducts = useMemo(
    () => (activeCategory == null ? products : products.filter(p => p.categoryID === activeCategory)),
    [products, activeCategory]
  );

  const subtotal = cart.subtotal();
  useEffect(() => {
    if (discountMode !== 'preset') return;
    cart.setDiscount(Math.max(0, subtotal) * (discountPct / 100));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discountPct, subtotal, discountMode]);

  const [optionsProduct, setOptionsProduct] = useState<Product | null>(null);

  const isDineIn = (orderTypes.find(t => t.id === cart.orderTypeID)?.name ?? '').trim().toLowerCase() === 'dine in';

  // Clears the cart and resets order type back to the first tab (Pickup,
  // normally) — used after checkout/hold/clear so the next order never
  // silently inherits e.g. a Dine In selection from the previous one.
  const resetOrder = () => {
    cart.clearCart();
    const firstID = orderTypes[0]?.id ?? ORDER_TYPE_FALLBACK[0].id;
    cart.setOrderType(firstID);
  };

  const addProductToCart = async (item: Product, opts?: { skipTableGate?: boolean }) => {
    // Restaurant + Dine In: the very first item of a new order must pick a
    // table before it can be added — open the table picker and hold the
    // tapped product until a table is chosen (see tablePickerVisible modal).
    // skipTableGate is passed when resuming right after a table was just
    // selected — cart.tableNo here is still the stale pre-selection value
    // (zustand state read via a closure captured before this render), so
    // re-checking it would wrongly reopen the picker.
    if (!opts?.skipTableGate && isRestaurant && isDineIn && cart.items.length === 0 && !cart.tableNo) {
      setPendingProduct(item);
      setTablePickerVisible(true);
      return;
    }
    // Combos/bundles always carry a pos-config (their groups/contents ARE
    // the product), so open the picker without a pre-check. Any other
    // product might have modifier groups attached — check once (cached
    // after the first tap) and only open the picker if it actually has
    // options; otherwise add straight to cart like before.
    if (item.type === 'CB' || item.type === 'BN') {
      setOptionsProduct(item);
      return;
    }
    // Menu loaded (the normal case): the config is in memory, so this stays
    // synchronous — no await, no extra render before the item lands in the
    // cart. Only a tap before the menu finished loading waits for it.
    const loaded = useProductStore.getState().loaded;
    try {
      const config = loaded
        ? productCatalogService.peekPosConfig(item.productID)
        : await productCatalogService.getPosConfig(item.productID);
      if (config && productCatalogService.hasOptions(config)) {
        setOptionsProduct(item);
        return;
      }
    } catch {
      // Non-fatal: if the pos-config check fails, fall back to a plain add
      // rather than blocking the cashier from selling the item at all.
    }
    cart.addItem({
      productID: item.productID,
      name: item.name,
      nameAr: item.nameAr,
      sku: item.sku,
      type: item.type,
      price: item.price,
      qty: 1,
      discount: 0,
      taxRate: item.taxRate ?? 0,
    });
  };

  // POS-standard behavior: a scan adds straight to the cart rather than just
  // filtering the grid — the cashier shouldn't have to look and tap again.
  const handleBarcodeScan = ({ code }: BarcodeScanEvent) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const match = products.find(p => p.barcode === trimmed || p.sku === trimmed);
    if (match) {
      addProductToCart(match);
      setSearch('');
    } else {
      appAlert('Product Not Found', `No product matches barcode:\n${trimmed}`);
    }
  };

  useEffect(() => { loadSearchHistory(); }, [loadSearchHistory]);

  const closeSearch = () => {
    searchInputRef.current?.blur();
    Keyboard.dismiss();
    setSearchOpen(false);
    setSearch('');
  };

  const selectSearchResult = (p: Product) => {
    addSearchTerm(search);
    closeSearch();
    addProductToCart(p);
  };

  // Enter on the search field (on-screen keyboard or a scanner typing into
  // it): an exact SKU/barcode hit or a single result is added directly.
  const submitSearch = () => {
    const q = search.trim();
    if (!q) return;
    const exact = products.find(p => p.barcode === q || p.sku === q);
    const results = exact ? [exact] : searchProducts(products, q);
    if (results.length === 1) selectSearchResult(results[0]);
    else addSearchTerm(q);
  };

  useEffect(() => {
    if (!searchOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { closeSearch(); return true; });
    return () => sub.remove();
  }, [searchOpen]);

  useBarcodeHandler('SellScreen', handleBarcodeScan);
  const { pauseCapture, resumeCapture } = useBarcodeScannerCapture();

  useEffect(() => {
    if (customDiscountVisible || paymentVisible || noteModalVisible || customerModalVisible || tablePickerVisible || qtyEditItem) {
      pauseCapture();
      return resumeCapture;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customDiscountVisible, paymentVisible, noteModalVisible, customerModalVisible, tablePickerVisible, qtyEditItem]);


  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.businessName || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q)
    );
  }, [customers, customerSearch]);

  const closeCustomerModal = () => {
    Keyboard.dismiss();
    setCustomerModalVisible(false);
    setAddingCustomer(false);
  };

  // POST /pos/customers, then select the new customer for this order. Unlike
  // Web POS, a failure is reported instead of inventing a local customer ID
  // (a fake ID would be sent with the invoice as customerInfoID).
  const saveNewCustomer = async () => {
    const name = newCustomer.name.trim();
    if (!name || savingCustomer) return;
    const phone = newCustomer.phone.trim();
    // sp_invoicing_create_invoice resolves an invoice's customer by Email
    // only (it ignores CustomerInfoID), so a customer saved without a unique
    // email could never be attached to an order: it would fall back to the
    // walk-in customer. Give email-less customers a unique placeholder, same
    // pattern as the walk-in walkin_{tenant}@pos.internal address.
    const tenantID = (user as any)?.userID ?? 0;
    const email = newCustomer.email.trim() || `cust_${Date.now()}_${tenantID}@pos.internal`;
    setSavingCustomer(true);
    try {
      const res = await posApi.post('/pos/customers', {
        customerInfoID: 0, name, secondName: '', businessName: name,
        email, contact: phone,
        country: 'SA', city: 'Riyadh', district: '', state: '', street: '', buildingNo: '',
        additionalNo: '', shortAddress: '', poBox: '', cr: '', vat: '',
        metadataJson: '{}', isRegisteredBusiness: 0, status: '1',
      });
      const d = res.data;
      const ok = d?.status === 1 || d?.Status === 1 || d?.status === 'Success' || d?.Status === 'Success';
      const raw = d?.data ?? d?.Data;
      const id = Number(raw);
      if (!ok || !id) throw new Error(typeof raw === 'string' && raw ? raw : 'Customer not created');
      const created: Customer = { customerID: id, name, businessName: name, phone, email };
      setCustomers(list => [created, ...list]);
      cart.setCustomer(created);
      setNewCustomer({ name: '', phone: '', email: '' });
      closeCustomerModal();
      toast('Customer Added', 'success', name);
    } catch (err: any) {
      toast('Customer Not Added', 'error', err?.response?.data?.message ?? err?.message ?? 'Please try again.');
    } finally {
      setSavingCustomer(false);
    }
  };

  // Kitchen ticket for this save: only what changed since the last send
  // (everything for a new order). Captured before the cart is reset.
  const kitchenSnapshot = () => ({
    items: buildDelta(cart.items, cart.kitchenSent) as TicketItem[],
    round: cart.kitchenRounds + 1,
    table: cart.tableNo,
    note: cart.orderNote,
    orderType: orderTypes.find(t => t.id === cart.orderTypeID)?.name ?? null,
    customer: cart.customer?.name ?? null,
    phone: cart.customer?.phone ?? null,
  });
  const sendToKitchen = async (k: ReturnType<typeof kitchenSnapshot>, invoiceID: number, shiftOrderNo: number): Promise<string | null> => {
    if (k.items.length === 0) return null;
    const meta: SendTicketMeta = {
      invoiceID,
      orderNo: `#${String(shiftOrderNo || invoiceID).padStart(4, '0')}`,
      round: k.round,
      table: k.table,
      orderType: k.orderType,
      customer: k.customer,
      phone: k.phone,
      staffName: user?.name ?? null,
      staffUserID: user?.subUserID ?? null,
      branchID: activeShift?.branchID ?? user?.branchID ?? null,
      deviceID: user?.deviceID ?? null,
      note: k.note,
      source: 'cashier',
    };
    const { lan } = await sendKitchenTicket(meta, k.items);
    return lan ? 'Sent to kitchen' : 'Kitchen offline – will send when connected';
  };

  const handleHold = async () => {
    if (cart.items.length === 0) return;
    if (!activeShift) {
      appAlert('No Active Shift', 'Please start a shift first.');
      return;
    }
    setHolding(true);
    const kitchen = kitchenSnapshot();
    try {
      const heldTableID = cart.tableID;
      // Same payload as checkout (orderService._buildInvoice), OrderState 12.
      // A resumed held order is updated in place instead of duplicated.
      const { invoiceID, shiftOrderNo } = await orderService.holdOrder({
        existingInvoiceID: cart.checkoutInvoiceID,
        existingShiftOrderNo: cart.checkoutShiftOrderNo,
        shiftID: activeShift.shiftID,
        shiftOrderCount: activeShift.orderCount,
        branchID: activeShift.branchID ?? user?.branchID ?? null,
        orderTypeID: cart.orderTypeID,
        customerID: cart.customer?.customerID ?? null,
        customerName: cart.customer ? (cart.customer.businessName || cart.customer.name || 'Walk-in') : 'Walk-in',
        customerBusinessName: cart.customer?.businessName,
        customerEmail: cart.customer?.email,
        customerPhone: cart.customer?.phone,
        orderNote: cart.orderNote,
        discount: cart.totalDiscount(),
        currency,
        items: cart.items,
        tableID: heldTableID,
        tableNo: cart.tableNo,
      });
      // Mark the table Occupied + link this invoice — same lifecycle point as web's holdOrder().
      if (heldTableID) tableService.openTable(heldTableID, invoiceID).then(() => useKitchenStore.getState().notifyTablesChanged(heldTableID)).catch(() => {});
      const kitchenLine = await sendToKitchen(kitchen, invoiceID, shiftOrderNo);
      resetOrder();
      setDiscountPct(0);
      toast('Order Held', 'success', kitchenLine ?? 'Find it in the Orders tab.');
    } catch (err: any) {
      // Same reasoning as the checkout catch below: only simulate when there's
      // genuinely no backend reachable, never when it responded with an error.
      if (__DEV__ && !err?.response) {
        // No live backend in dev — simulate the hold so the flow is still testable.
        resetOrder();
        setDiscountPct(0);
        toast('Order Held (Dev)', 'success', 'Hold simulated — no backend call succeeded.');
        return;
      }
      appAlert('Hold Failed', failureText(err, 'Could not hold order. Please try again.'));
    } finally {
      setHolding(false);
    }
  };

  const handlePrintBill = async () => {
    if (cart.items.length === 0) return;
    if (!printer.isConfigured) {
      appAlert(
        'Printer Not Configured',
        'Go to Menu → Printer Settings to configure your printer.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Printer Setup', onPress: () => navigation.navigate('PrinterSetup') },
        ],
      );
      return;
    }
    setPrintingBill(true);
    try {
      const data: ReceiptData = {
        orderNumber: '#PREVIEW',
        heading: 'BILL PRINT',
        items: cart.items.map(i => ({ name: i.name, alternateName: i.nameAr, qty: i.qty, price: i.price, selections: i.selectionSummary })),
        subtotal: cart.subtotal(),
        vat: cart.totalTax(),
        taxRate: taxPercent,
        taxLabel: taxName,
        discount: cart.totalDiscount(),
        total: cart.grandTotal(),
        payments: [],
        change: 0,
        customerName: cart.customer?.name,
        orderType: orderTypes.find(t => t.id === cart.orderTypeID)?.name,
        tableNo: cart.tableNo ?? undefined,
        orderNote: cart.orderNote,
        time: new Date(),
        cashierName: user?.name,
        currency: user?.currency ?? 'SAR',
        ...storeFields(getStoreInfo(user)),
      };
      const content = await buildSimpleReceipt(data, receiptSettings, printer.paperWidth);
      const result = await printReceipt(content, printer);
      if (!result.success) appAlert('Print Failed', result.error);
    } catch (err: any) {
      appAlert('Print Failed', err?.message ?? 'Could not prepare bill for printing.');
    } finally {
      setPrintingBill(false);
    }
  };

  const customDiscountAmount = useMemo(() => {
    const val = parseFloat(customDiscountValue);
    if (isNaN(val) || val < 0) return 0;
    return customDiscountType === 'percent' ? Math.max(0, subtotal) * (val / 100) : val;
  }, [customDiscountValue, customDiscountType, subtotal]);

  const applyCustomDiscount = () => {
    const val = parseFloat(customDiscountValue);
    if (isNaN(val) || val < 0) return;
    // Always persisted as a flat amount — the percentage entry is just a
    // convenience for calculating it, since the backend only stores amount.
    setDiscountMode('custom');
    setDiscountPct(0);
    cart.setDiscount(customDiscountAmount);
    setCustomDiscountVisible(false);
    setCustomDiscountValue('');
  };

  const appendCustomDigit = (d: string) => {
    setCustomDiscountValue(prev => {
      if (d === '.' && prev.includes('.')) return prev;
      if (prev === '0' && d !== '.') return d;
      return prev + d;
    });
  };
  const backspaceCustomDigit = () => setCustomDiscountValue(prev => prev.slice(0, -1));

  const appendQtyDigit = (d: string) => setQtyEditValue(prev => (prev === '0' ? d : prev + d));
  const backspaceQtyDigit = () => setQtyEditValue(prev => prev.slice(0, -1));
  const applyQtyEdit = () => {
    if (!qtyEditItem) return;
    const q = parseInt(qtyEditValue, 10);
    if (!isNaN(q) && q > 0) cart.updateQty(qtyEditItem.lineID, q);
    else if (q === 0) cart.removeItem(qtyEditItem.lineID);
    setQtyEditItem(null);
  };

  // Prints a receipt (both print modes): the hidden ReceiptPaper must render
  // this order before Image Canvas mode captures it.
  // Prints after payment, following Receipt settings → Kitchen receipt:
  // off = customer receipt; kitchen = kitchen ticket only (web POS "Print
  // Kitchen"); both = customer receipt, then the kitchen ticket.
  const printReceiptData = async (data: ReceiptData) => {
    const mode = receiptSettings.kitchenReceipt ?? 'off';
    setPrintCaptureReceipt(data);
    if (receiptSettings.printMode === 'image') {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }
    if (mode === 'kitchen') return printKitchenTicketNow(data, receiptSettings, printer, kitchenShotRef);
    const result = await printReceiptNow(data, receiptSettings, printer, printViewShotRef);
    if (mode === 'both' && result.success) {
      const kitchen = await printKitchenTicketNow(data, receiptSettings, printer, kitchenShotRef);
      if (!kitchen.success) return { success: false, error: `Kitchen ticket: ${kitchen.error}` };
    }
    return result;
  };

  const printPaidReceipt = async () => {
    if (!paidOrder || printingPaid) return;
    if (!printer.isConfigured) {
      appAlert('Printer Not Configured', 'Set up a printer first in Menu → Printers.');
      return;
    }
    setPrintingPaid(true);
    const result = await printReceiptData(paidOrder.data);
    setPrintingPaid(false);
    if (result.success) toast('Receipt printed', 'success');
    else appAlert('Print Failed', result.error);
  };

  const startNewOrder = () => { setPaidOrder(null); setPaymentVisible(false); };

  const orderKicker = [cart.tableNo ? `Table ${cart.tableNo}` : null, orderTypes.find(t => t.id === cart.orderTypeID)?.name].filter(Boolean).join(' · ') || undefined;

  const cellWidth = gridWidth != null ? (gridWidth - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS : undefined;

  // Grid perf: one qty map per cart change (not a filter per card), and
  // stable callbacks so memoized cards/lines only re-render when their own
  // data changes — a tap no longer redraws the whole grid or order list.
  const qtyByProduct = useMemo(() => {
    const m = new Map<number, number>();
    for (const i of cart.items) m.set(i.productID, (m.get(i.productID) ?? 0) + i.qty);
    return m;
  }, [cart.items]);
  const addProductRef = useRef(addProductToCart);
  addProductRef.current = addProductToCart;
  const onProductPress = useCallback((p: Product) => { addProductRef.current(p); }, []);
  const pickCategory = useCallback((id: number | null) => { setActiveCategory(id); setCatalogView('products'); }, []);
  const backToCategories = useCallback(() => setCatalogView('cats'), []);
  const lineHandlers = useMemo<CartLineHandlers>(() => ({
    onDec: i => useCartStore.getState().updateQty(i.lineID, i.qty - 1),
    onInc: i => useCartStore.getState().updateQty(i.lineID, i.qty + 1),
    onEditQty: i => { setQtyEditItem(i); setQtyEditValue(String(i.qty)); },
    onRemove: i => useCartStore.getState().removeItem(i.lineID),
    onEditNote: i => { setItemNoteDraft(i.kitchenNote ?? ''); setItemNoteLine(i.lineID); },
  }), []);

  const itemCount = cart.items.reduce((s, i) => s + i.qty, 0);
  const hasItems = cart.items.length > 0;
  const discountTotal = cart.totalDiscount();
  const customerName = cart.customer ? (cart.customer.businessName || cart.customer.name) : null;
  const activeCategoryName = activeCategory == null ? 'All items' : categories.find(c => c.categoryID === activeCategory)?.name ?? 'Products';

  return (
    <View style={styles.root}>
      <View style={styles.main}>
        <View style={styles.searchRow}>
          <Field
            ref={searchInputRef}
            icon="search"
            containerStyle={[styles.searchField, searchOpen && styles.searchFieldOn]}
            placeholder="Search by name, SKU or barcode"
            value={search}
            onChangeText={setSearch}
            onFocus={() => { pauseCapture(); setSearchOpen(true); }}
            onBlur={resumeCapture}
            onSubmitEditing={submitSearch}
            returnKeyType="search"
            submitBehavior="submit"
            autoCorrect={false}
            autoCapitalize="none"
            right={searchOpen ? <IconButton icon="close" onPress={closeSearch} size={36} variant="ghost" iconSize={18} /> : null}
          />
          {/* The hardware scanner always listens; this closes search so scans go straight to the order. */}
          <IconButton icon="scan" onPress={closeSearch} size={56} iconSize={24} />
        </View>

        <View style={styles.catalog} onLayout={e => setGridWidth(e.nativeEvent.layout.width)}>
          {!productsLoaded ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={C.brand} />
          ) : catalogView === 'cats' ? (
            <CategoryGrid categories={categories} products={products} cellWidth={cellWidth} onPick={pickCategory} />
          ) : (
            <ProductGrid
              products={filteredProducts}
              qtyByProduct={qtyByProduct}
              cellWidth={cellWidth}
              currency={currency}
              backLabel={activeCategoryName}
              onBack={backToCategories}
              onAdd={onProductPress}
            />
          )}
          {searchOpen && (
            <ProductSearchPanel
              query={search}
              products={products}
              currency={currency}
              qtyInCart={id => qtyByProduct.get(id) ?? 0}
              onSelectProduct={selectSearchResult}
              onSelectTerm={t => { setSearch(t); searchInputRef.current?.focus(); }}
              onClose={closeSearch}
            />
          )}
        </View>
      </View>

      <View style={styles.aside}>
        <View style={styles.asideTop}>
          <Segmented
            stacked
            options={orderTypes.map(t => ({ key: t.id, label: t.name, icon: orderTypeGlyph(t.name) }))}
            value={cart.orderTypeID ?? -999}
            onChange={id => cart.setOrderType(id)}
          />
          <View style={styles.asideButtons}>
            {customerName ? (
              <TouchableOpacity style={styles.customerChip} onPress={() => setCustomerModalVisible(true)} activeOpacity={0.8}>
                <Avatar name={customerName} size={32} />
                <View style={styles.customerText}>
                  <Txt variant="label" numberOfLines={1}>{customerName}</Txt>
                  {cart.customer?.phone ? <Txt variant="small" weight="regular" color={C.textMuted} numberOfLines={1}>{cart.customer.phone}</Txt> : null}
                </View>
                <IconButton icon="close" onPress={() => cart.setCustomer(null)} size={32} variant="ghost" iconSize={16} />
              </TouchableOpacity>
            ) : (
              <Button variant="dashed" icon="addUser" label="Add customer" onPress={() => setCustomerModalVisible(true)} style={styles.flex} />
            )}
            {isRestaurant && (isDineIn || cart.tableNo) ? (
              <Button variant="outline" label={cart.tableNo ? `Table ${cart.tableNo}` : 'Table'} onPress={() => setTablePickerVisible(true)} />
            ) : null}
          </View>
        </View>

        <View style={styles.orderHead}>
          <View style={styles.orderTitle}>
            <Txt variant="title" weight="bold">Order</Txt>
            <CountBadge value={itemCount} />
          </View>
          {hasItems ? <Button variant="ghost" size="sm" label="Clear" onPress={resetOrder} /> : null}
        </View>

        {cart.orderNote ? (
          <TouchableOpacity style={styles.orderNote} onPress={() => { setNoteDraft(cart.orderNote); setNoteModalVisible(true); }} activeOpacity={0.8}>
            <Glyph name="pencil" size={16} color={C.textMuted} strokeWidth={2} />
            <Txt variant="caption" style={styles.flex} numberOfLines={2}><Txt variant="caption" weight="semibold">Note: </Txt>{cart.orderNote}</Txt>
          </TouchableOpacity>
        ) : null}

        <FlatList
          data={cart.items}
          keyExtractor={i => i.lineID}
          style={styles.lines}
          contentContainerStyle={!hasItems && styles.linesEmpty}
          ListEmptyComponent={
            <View style={styles.emptyOrder}>
              <BrandMark />
              <Txt variant="title">No items yet</Txt>
              <Txt variant="label" weight="regular" color={C.textMuted}>Pick a category or scan to start the order.</Txt>
            </View>
          }
          renderItem={({ item }) => <CartLine item={item} currency={currency} on={lineHandlers} swipeEnabled={swipeToDeleteEnabled} />}
        />

        <View style={styles.asideFoot}>
          <View style={styles.tiles}>
            <ActionTile icon="percent" label="Discount" tone="brand" onPress={() => setCustomDiscountVisible(true)} disabled={!hasItems} />
            <ActionTile icon="pencil" label={cart.orderNote ? 'Edit note' : 'Note'} tone="plain" onPress={() => { setNoteDraft(cart.orderNote); setNoteModalVisible(true); }} />
            <ActionTile icon="pause" label={holding ? 'Holding…' : 'Hold'} tone="warning" onPress={handleHold} disabled={holding || !hasItems} />
            <ActionTile icon="printer" label={printingBill ? 'Printing…' : 'Print bill'} tone="info" onPress={handlePrintBill} disabled={printingBill || !hasItems} />
          </View>
          <View style={styles.totals}>
            <View style={styles.sumRow}>
              <Txt variant="label" weight="regular" color={C.textMuted}>Subtotal</Txt>
              <Money amount={cart.subtotal()} currency={currency} style={styles.totalMuted} />
            </View>
            {discountTotal > 0 ? (
              <View style={styles.sumRow}>
                <Txt variant="label" weight="semibold" color={C.brand}>Discount</Txt>
                <Money amount={discountTotal} currency={currency} prefix="− " style={styles.totalDiscount} />
              </View>
            ) : null}
            <View style={styles.sumRow}>
              <Txt variant="label" weight="regular" color={C.textMuted}>{taxName ? `${taxName}${taxPercent ? ` (${taxPercent}%)` : ''}` : 'VAT'}</Txt>
              <Money amount={cart.totalTax()} currency={currency} style={styles.totalMuted} />
            </View>
            <View style={[styles.sumRow, styles.grandRow]}>
              <Txt variant="title">Total</Txt>
              <Money amount={cart.grandTotal()} currency={currency} style={styles.grand} />
            </View>
          </View>
          <Button size="xl" icon="card" label="Pay" disabled={!hasItems} onPress={() => setPaymentVisible(true)} />
        </View>
      </View>

      <Dialog
        visible={customDiscountVisible}
        onClose={() => setCustomDiscountVisible(false)}
        onShow={() => setCustomDiscountValue('')}
        title="Discount"
        subtitle="Applied to the whole order"
        footer={<>
          <Button variant="outline" size="lg" label="Cancel" onPress={() => setCustomDiscountVisible(false)} style={styles.flex} />
          <Button size="lg" label="Apply" onPress={applyCustomDiscount} style={styles.flex2} />
        </>}
      >
        <Segmented
          options={[{ key: 'amount', label: `Amount (${currency})` }, { key: 'percent', label: 'Percentage (%)' }]}
          value={customDiscountType}
          onChange={k => setCustomDiscountType(k as 'amount' | 'percent')}
          itemStyle={styles.flex}
        />
        <NumDisplay
          value={`${customDiscountValue || '0'}${customDiscountType === 'percent' ? '%' : ''}`}
          caption={customDiscountType === 'percent' ? <Txt variant="label" weight="regular" color={C.textMuted}>= {fmt(customDiscountAmount)} {currency}</Txt> : null}
        />
        <Numpad onDigit={appendCustomDigit} onBackspace={backspaceCustomDigit} />
      </Dialog>

      <Dialog
        visible={!!qtyEditItem}
        onClose={() => setQtyEditItem(null)}
        title="Edit quantity"
        subtitle={qtyEditItem?.name}
        footer={<>
          <Button variant="outline" size="lg" label="Cancel" onPress={() => setQtyEditItem(null)} style={styles.flex} />
          <Button size="lg" label="Apply" onPress={applyQtyEdit} style={styles.flex2} />
        </>}
      >
        <NumDisplay value={qtyEditValue || '0'} />
        <Numpad onDigit={appendQtyDigit} onBackspace={backspaceQtyDigit} extraKey={null} />
      </Dialog>

      <Dialog
        visible={noteModalVisible}
        onClose={() => setNoteModalVisible(false)}
        keyboard
        title="Order note"
        subtitle="Shown to the kitchen and printed on the bill"
        footer={<>
          <Button variant="outline" size="lg" label="Cancel" onPress={() => setNoteModalVisible(false)} style={styles.flex} />
          <Button size="lg" label="Save note" onPress={() => { cart.setOrderNote(noteDraft.trim()); setNoteModalVisible(false); }} style={styles.flex2} />
        </>}
      >
        <Field
          value={noteDraft}
          onChangeText={setNoteDraft}
          placeholder="Type a note for this order"
          multiline
          autoFocus
          height={120}
          containerStyle={styles.noteField}
          style={styles.noteInput}
        />
      </Dialog>

      <Dialog
        visible={itemNoteLine != null}
        onClose={() => setItemNoteLine(null)}
        keyboard
        title="Item note"
        subtitle={cart.items.find(i => i.lineID === itemNoteLine)?.name ?? 'Item'}
        footer={<>
          <Button variant="outline" size="lg" label="Cancel" onPress={() => setItemNoteLine(null)} style={styles.flex} />
          <Button size="lg" label="Save note" onPress={() => { if (itemNoteLine) cart.setItemNote(itemNoteLine, itemNoteDraft.trim()); setItemNoteLine(null); }} style={styles.flex2} />
        </>}
      >
        <Field
          value={itemNoteDraft}
          onChangeText={setItemNoteDraft}
          placeholder="e.g. No onion, well done..."
          multiline
          autoFocus
          height={120}
          containerStyle={styles.noteField}
          style={styles.noteInput}
        />
      </Dialog>

      <Modal visible={customerModalVisible} transparent animationType="slide" onRequestClose={closeCustomerModal}>
        <View style={styles.sidebarOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeCustomerModal} />
          <View style={styles.customerSidebarCard}>
            <View style={styles.paymentHeader}>
              <Text style={styles.modalTitle}>{addingCustomer ? 'New Customer' : 'Customers'}</Text>
              <TouchableOpacity onPress={closeCustomerModal}>
                <Icon name="times" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {addingCustomer ? (
              <View style={{ padding: 20, gap: 14 }}>
                <View>
                  <Text style={styles.formLabel}>NAME *</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Customer name"
                    placeholderTextColor={Colors.textMuted}
                    value={newCustomer.name}
                    onChangeText={v => setNewCustomer(c => ({ ...c, name: v }))}
                    autoFocus
                  />
                </View>
                <View>
                  <Text style={styles.formLabel}>PHONE</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="+966 5x xxx xxxx"
                    placeholderTextColor={Colors.textMuted}
                    value={newCustomer.phone}
                    onChangeText={v => setNewCustomer(c => ({ ...c, phone: v }))}
                    keyboardType="phone-pad"
                  />
                </View>
                <View>
                  <Text style={styles.formLabel}>EMAIL</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Optional"
                    placeholderTextColor={Colors.textMuted}
                    value={newCustomer.email}
                    onChangeText={v => setNewCustomer(c => ({ ...c, email: v }))}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                  <TouchableOpacity style={[styles.formBtn, styles.formBtnSecondary]} onPress={(savingCustomer) ? undefined : () => setAddingCustomer(false)}>
                    <Text style={styles.formBtnSecondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.formBtn, (!newCustomer.name.trim() || savingCustomer) && { opacity: 0.5 }]}
                    onPress={(!newCustomer.name.trim() || savingCustomer) ? undefined : saveNewCustomer}
                  >
                    {savingCustomer ? <ActivityIndicator color="#fff" /> : <Text style={styles.formBtnText}>Save & Select</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
            <>
            <View style={{ padding: 20, paddingBottom: 0 }}>
              <View style={styles.searchWrap}>
                <Icon name="search" size={13} color={Colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search name or phone..."
                  placeholderTextColor={Colors.textMuted}
                  value={customerSearch}
                  onChangeText={setCustomerSearch}
                />
              </View>
              <TouchableOpacity style={styles.addCustomerBtn} onPress={() => setAddingCustomer(true)}>
                <Icon name="plus" size={12} color={Colors.primary} />
                <Text style={styles.addCustomerText}>Add New Customer</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={filteredCustomers}
              keyExtractor={c => String(c.customerID)}
              style={{ flex: 1, marginTop: 8 }}
              contentContainerStyle={{ padding: 20, paddingTop: 8 }}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <TouchableOpacity
                  style={[styles.deviceRow, !cart.customer && styles.deviceRowActive]}
                  onPress={() => { cart.setCustomer(null); closeCustomerModal(); }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.deviceRowName}>Walk-in Customer</Text>
                    <Text style={styles.deviceRowSub}>No customer attached</Text>
                  </View>
                  {!cart.customer && <Icon name="check" size={13} color={Colors.primary} />}
                </TouchableOpacity>
              }
              ListEmptyComponent={<Text style={styles.emptyCartText}>No customers found</Text>}
              renderItem={({ item }) => {
                const sel = cart.customer?.customerID === item.customerID;
                return (
                  <TouchableOpacity
                    style={[styles.deviceRow, sel && styles.deviceRowActive]}
                    onPress={() => { cart.setCustomer(item); closeCustomerModal(); }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.deviceRowName}>{item.businessName || item.name}</Text>
                      <Text style={styles.deviceRowSub}>{item.phone || item.email || '—'}</Text>
                    </View>
                    {sel && <Icon name="check" size={13} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
            </>
            )}
          </View>
        </View>
      </Modal>

      <TableSelectScreen
        visible={tablePickerVisible}
        branchID={branchID}
        currentTableID={cart.tableID}
        onClose={() => { setTablePickerVisible(false); setPendingProduct(null); }}
        onClear={cart.tableNo ? () => { cart.setTable(null, null); setTablePickerVisible(false); setPendingProduct(null); } : undefined}
        onSelect={(tableID, tableName) => {
          cart.setTable(tableID, tableName);
          setTablePickerVisible(false);
          if (pendingProduct) {
            const p = pendingProduct;
            setPendingProduct(null);
            addProductToCart(p, { skipTableGate: true });
          }
        }}
      />

      <ProductOptionsModal
        visible={!!optionsProduct}
        product={optionsProduct}
        currency={user?.currency ?? 'SAR'}
        onClose={() => setOptionsProduct(null)}
        onConfirm={({ computedPrice, quantity, selectionSummary, lineSelections }) => {
          if (!optionsProduct) return;
          cart.addItem({
            productID: optionsProduct.productID,
            name: optionsProduct.name,
            nameAr: optionsProduct.nameAr,
            sku: optionsProduct.sku,
            type: optionsProduct.type,
            price: computedPrice,
            qty: quantity,
            discount: 0,
            taxRate: optionsProduct.taxRate ?? 0,
            selectionSummary,
            lineSelections,
          });
          setOptionsProduct(null);
        }}
      />

      <PaymentModal
        visible={paymentVisible}
        onClose={() => (paidOrder ? startNewOrder() : setPaymentVisible(false))}
        onComplete={async (rows) => {
          if (!activeShift) {
            appAlert('No Active Shift', 'Start a shift before taking payments.');
            return;
          }
          const currency = user?.currency ?? 'SAR';
          const orderTypeName = orderTypes.find(t => t.id === cart.orderTypeID)?.name;
          const totalPaid = rows.reduce((s, r) => s + r.paymentAmount, 0);
          const total = cart.grandTotal();

          const store = getStoreInfo(user);
          const buildReceiptData = (result?: { shiftOrderNo: number; invoiceID: number; invoiceCode: string; zatcaQrCode: string | null }): ReceiptData => {
            const time = new Date();
            // Signed Phase 2 QR from the server; if signing failed/timed out,
            // fall back to a Phase 1 QR (same as Web POS) for a tax-registered
            // store. No QR at all for the offline/simulated receipt (no result).
            const zatcaQrCode = result
              ? result.zatcaQrCode ?? (store.isTaxRegistered && store.vatNumber
                ? zatcaPhase1Qr(store.companyName, store.vatNumber, time, total, cart.totalTax())
                : null)
              : null;
            return {
            orderNumber: String(result?.shiftOrderNo ?? result?.invoiceID ?? Date.now()),
            invoiceCode: result?.invoiceCode,
            items: cart.items.map(i => ({ name: i.name, alternateName: i.nameAr, qty: i.qty, price: i.price, selections: i.selectionSummary, note: i.kitchenNote || undefined })),
            subtotal: cart.subtotal(),
            vat: cart.totalTax(),
            taxRate: taxPercent,
            taxLabel: taxName,
            discount: cart.totalDiscount(),
            total,
            payments: rows.map(r => ({ method: r.paymentMethod, amount: r.paymentAmount })),
            change: Math.max(0, totalPaid - total),
            customerName: cart.customer?.name,
            orderType: orderTypeName,
            tableNo: cart.tableNo ?? undefined,
            orderNote: cart.orderNote,
            time,
            cashierName: user?.name,
            currency,
            ...storeFields(store),
            zatcaQrCode,
            };
          };

          // Prints directly and reports success via toast — no receipt-preview
          // detour. ReceiptPreviewScreen/its route are kept in the app (manual
          // reprint, dev/testing) but checkout no longer navigates there.
          const printAndNotify = async (data: ReceiptData) => {
            const orderLabel = `Order #${data.orderNumber.replace(/^#/, '')} placed`;
            if (!receiptSettings.autoPrintOnComplete || !printer.isConfigured) {
              toast(orderLabel, 'success');
              return;
            }
            const result = await printReceiptData(data);
            toast(orderLabel, 'success', result.success ? 'Receipt printed' : `Print failed: ${result.error}`);
          };

          // Auto-print on: close and print (fastest for a queue). Off: keep the
          // checkout open on "Payment complete" so the cashier can print or
          // start the next order.
          const kickerAtPay = orderKicker;
          const finishPaid = (data: ReceiptData) => {
            resetOrder();
            setDiscountPct(0);
            if (receiptSettings.autoPrintOnComplete) {
              setPaymentVisible(false);
              printAndNotify(data);
            } else {
              setPaidOrder({ data, payments: rows.length, kicker: kickerAtPay });
            }
          };

          const paidTableID = cart.tableID;
          const kitchen = kitchenSnapshot();
          const recordedRows = capPaymentsToTotal(rows, total);
          try {
            const result = await orderService.createOrder({
              // Paying a resumed held order updates it in place (PUT) rather
              // than creating a second invoice next to the unpaid one.
              existingInvoiceID: cart.checkoutInvoiceID,
              existingShiftOrderNo: cart.checkoutShiftOrderNo,
              shiftID: activeShift.shiftID,
              shiftOrderCount: activeShift.orderCount,
              // Same source as Hold: the shift's branch, else the user's.
              branchID: activeShift.branchID ?? user?.branchID ?? null,
              orderTypeID: cart.orderTypeID,
              customerID: cart.customer?.customerID ?? null,
              customerName: cart.customer?.businessName || cart.customer?.name || 'Walk-in',
              customerBusinessName: cart.customer?.businessName,
              customerEmail: cart.customer?.email,
              customerPhone: cart.customer?.phone,
              orderNote: cart.orderNote,
              discount: cart.totalDiscount(),
              currency,
              items: cart.items,
              paymentMethod: recordedRows[0]?.paymentMethod ?? 'Cash',
              paymentAmount: recordedRows[0]?.paymentAmount ?? total,
              paymentRows: recordedRows,
              tableID: cart.tableID,
              tableNo: cart.tableNo,
            });
            // Paid orders still need cooking: send what the kitchen doesn't have yet.
            sendToKitchen(kitchen, result.invoiceID, result.shiftOrderNo).catch(() => {});
            const data = buildReceiptData(result);
            setReceipt(data);
            // Before resetOrder: the customer display keeps "thank you" up while the cart clears.
            useCustomerDisplayStore.getState().showPaid({
              total, paid: totalPaid, change: data.change, orderNo: data.orderNumber, zatcaQr: data.zatcaQrCode,
              cashPaid: rows.filter(r => isCashMethod(r.paymentMethod)).reduce((sum, r) => sum + r.paymentAmount, 0),
            });
            finishPaid(data);
            // Full payment frees the table — same lifecycle point as web's finishPayment().
            if (paidTableID) tableService.releaseTable(paidTableID).then(() => useKitchenStore.getState().notifyTablesChanged(paidTableID)).catch(() => {});
          } catch (err: any) {
            // Only simulate a successful checkout when there's genuinely no
            // backend to reach (err.response is undefined — e.g. offline dev
            // work with no server running). A real HTTP error response (4xx/5xx)
            // means the backend WAS reached and rejected the order — that must
            // always surface as a real failure, in dev or production, or the
            // cashier sees a "successful" receipt with fabricated order
            // number/no transaction#/no QR code while the order was never
            // actually created server-side.
            if (__DEV__ && !err?.response) {
              // No live backend in dev — simulate a successful checkout so the
              // full cart -> payment -> receipt flow can still be exercised.
              const data = buildReceiptData();
              setReceipt(data);
              useCustomerDisplayStore.getState().showPaid({
                total, paid: totalPaid, change: data.change, orderNo: data.orderNumber,
                cashPaid: rows.filter(r => isCashMethod(r.paymentMethod)).reduce((sum, r) => sum + r.paymentAmount, 0),
              });
              finishPaid(data);
              return;
            }
            // Native alert, not a toast: toasts render behind the payment
            // modal, so a failed checkout used to look like nothing happened.
            appAlert('Payment Failed', failureText(err, 'Please try again.'));
          }
        }}
        total={paidOrder ? paidOrder.data.total : cart.grandTotal()}
        subtotal={paidOrder ? paidOrder.data.subtotal : cart.subtotal()}
        discount={paidOrder ? paidOrder.data.discount : cart.totalDiscount()}
        tax={paidOrder ? paidOrder.data.vat : cart.totalTax()}
        taxLabel={taxName ? `${taxName}${taxPercent ? ` (${taxPercent}%)` : ''}` : undefined}
        currency={user?.currency ?? 'SAR'}
        kicker={paidOrder ? paidOrder.kicker : orderKicker}
        completed={paidOrder ? { payments: paidOrder.payments } : null}
        printing={printingPaid}
        onPrintReceipt={printPaidReceipt}
        onNewOrder={startNewOrder}
      />

      {/* Off-screen — exists only so "Image Canvas" print mode has a rendered
          receipt to screenshot without ever showing a preview screen. */}
      {printCaptureReceipt && (
        <ReceiptPrintCapture
          ref={printViewShotRef}
          receipt={printCaptureReceipt} settings={receiptSettings} paperWidth={printer.paperWidth}
        />
      )}
      {printCaptureReceipt && receiptSettings.printMode === 'image' && (receiptSettings.kitchenReceipt ?? 'off') !== 'off' && (
        <KitchenTicketPrintCapture
          ref={kitchenShotRef}
          receipt={printCaptureReceipt} paperWidth={printer.paperWidth} showAlternateName={receiptSettings.showAlternateName}
        />
      )}
    </View>
  );
}

// Error text for a failed hold/checkout, with the HTTP status for real HTTP
// errors, so a rejection can be told apart from a network problem.
function failureText(err: any, fallback: string): string {
  // Only real HTTP errors get the status: a 200 with status 2 is a business
  // rule rejection (e.g. out of stock) whose message already says it all.
  const status = err?.response?.status;
  const msg = err?.message || fallback;
  return status && status >= 400 ? `${msg} (HTTP ${status})` : msg;
}

const styles = StyleSheet.create({
  // ── Redesign layout (tokens from theme/tokens.ts) ──
  root: { flex: 1, flexDirection: 'row', backgroundColor: C.bg },
  main: { flex: 1, minWidth: 0, paddingHorizontal: 24, paddingTop: 22, gap: 18 },
  searchRow: { flexDirection: 'row', gap: 12 },
  searchField: { flex: 1 },
  searchFieldOn: { borderColor: C.brand },
  catalog: { flex: 1 },
  aside: { width: 460, backgroundColor: C.surface, borderLeftWidth: 1, borderLeftColor: C.border },
  asideTop: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 14, gap: 12 },
  asideButtons: { flexDirection: 'row', gap: 8 },
  customerChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingLeft: 8, borderRadius: 14, borderWidth: 1, borderColor: C.border },
  customerText: { flex: 1, minWidth: 0 },
  flex: { flex: 1 },
  flex2: { flex: 2 },
  orderHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 24, borderTopWidth: 1, borderTopColor: C.border },
  orderTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: 24, marginBottom: 8, padding: 10, borderRadius: 12, backgroundColor: C.bg },
  lines: { flex: 1, paddingHorizontal: 24 },
  linesEmpty: { flexGrow: 1 },
  emptyOrder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, borderTopWidth: 1, borderTopColor: C.divider, paddingHorizontal: 12 },
  asideFoot: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 20, gap: 14, borderTopWidth: 1, borderTopColor: C.border },
  tiles: { flexDirection: 'row', gap: 8 },
  totals: { gap: 6 },
  sumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalMuted: { fontSize: 15, fontFamily: F.regular, color: C.textMuted },
  totalDiscount: { fontSize: 15, fontFamily: F.semibold, color: C.brand },
  grandRow: { paddingTop: 6 },
  grand: { fontSize: 32, fontFamily: F.bold, color: C.text },
  noteField: { alignItems: 'flex-start', paddingVertical: 12 },
  noteInput: { textAlignVertical: 'top' },


  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, height: 50, marginBottom: 14,
  },
  searchInput: { flex: 1, fontSize: 16, color: Colors.text },

  emptyCartText: { color: Colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },

  sidebarOverlay: { flex: 1, flexDirection: 'row', backgroundColor: Colors.overlay },
  customerSidebarCard: { width: 420, maxWidth: '85%', height: '100%', backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderBottomLeftRadius: 20, overflow: 'hidden' },
  addCustomerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'flex-start' },
  addCustomerText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  formLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.5, marginBottom: 6 },
  formInput: {
    height: 50, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
    paddingHorizontal: 14, fontSize: 16, color: Colors.text,
  },
  formBtn: { flex: 1, height: 50, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  formBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  formBtnSecondary: { backgroundColor: Colors.surfaceAlt },
  formBtnSecondaryText: { fontSize: 15, fontWeight: '700', color: Colors.text },
  deviceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  deviceRowActive: { backgroundColor: Colors.primaryLight, borderRadius: 10, paddingHorizontal: 8 },
  deviceRowName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  deviceRowSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  paymentHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 28, paddingVertical: 22, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },

  // Fills the rest of the shared paymentCard footprint below its header,
  // centering the fixed-width numpad column so it never stretches edge-to-edge.
  // No flex:1/justifyContent:center here — those made Yoga lock the shared
  // paymentCard at its minHeight and clip (via paymentCard's overflow:hidden)
  // whatever didn't fit, instead of letting the card grow to fit content like
  // the checkout screen does. Just size naturally and center horizontally.
  keypadBody: { alignItems: 'center', padding: 28 },
});
