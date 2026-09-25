import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Image, ActivityIndicator, Modal, Alert,
  KeyboardAvoidingView, Platform, Animated, PanResponder, BackHandler, Keyboard,
} from 'react-native';
import ViewShot, { ViewShotRef } from 'react-native-view-shot';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { Colors } from '../utils/colors';
import { fmt } from '../utils/format';
import Icon from '../components/Icon';
import Money from '../components/Money';
import RiyalIcon from '../components/RiyalIcon';
import { ReceiptPaper } from '../components/receipt/ReceiptPaper';
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
import { printReceiptNow } from '../services/receiptPrintFlow';
import { posApi } from '../services/api';
import { useSessionStore } from '../store/sessionStore';
import { DEV_MOCK_PRODUCTS, DEV_MOCK_CATEGORIES } from '../utils/devBypass';
import { productCatalogService } from '../services/productCatalogService';
import ProductOptionsModal from '../components/ProductOptionsModal';
import TableSelectScreen from '../components/TableSelectScreen';
import ProductSearchPanel, { searchProducts } from '../components/ProductSearchPanel';
import { useSearchHistoryStore } from '../store/searchHistoryStore';
import { tableService } from '../services/tableService';

const ORDER_TYPE_FALLBACK = [
  { id: -1, name: 'Pickup' },
  { id: -2, name: 'Walk-in' },
  { id: -3, name: 'Delivery' },
];
const PAYMENT_METHODS = [
  { key: 'Cash', label: 'Cash', icon: 'money-bill-wave' },
  { key: 'Card', label: 'Card', icon: 'credit-card' },
  { key: 'Wallet', label: 'Wallet', icon: 'wallet' },
  { key: 'STC Pay', label: 'STC Pay', icon: 'mobile-alt' },
];

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
  const [discountPct, setDiscountPct] = useState(0);
  const [discountMode, setDiscountMode] = useState<'preset' | 'custom'>('preset');
  const [customDiscountVisible, setCustomDiscountVisible] = useState(false);
  const [customDiscountValue, setCustomDiscountValue] = useState('');
  const [customDiscountType, setCustomDiscountType] = useState<'amount' | 'percent'>('amount');
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [noteModalVisible, setNoteModalVisible] = useState(false);
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
  const [printCaptureReceipt, setPrintCaptureReceipt] = useState<ReceiptData | null>(null);

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
  const [checkingOptions, setCheckingOptions] = useState<number | null>(null);

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
    setCheckingOptions(item.productID);
    try {
      const config = await productCatalogService.getPosConfig(item.productID);
      if (productCatalogService.hasOptions(config)) {
        setOptionsProduct(item);
        return;
      }
    } catch {
      // Non-fatal: if the pos-config check fails, fall back to a plain add
      // rather than blocking the cashier from selling the item at all.
    } finally {
      setCheckingOptions(null);
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
      Alert.alert('Product Not Found', `No product matches barcode:\n${trimmed}`);
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

  const handleHold = async () => {
    if (cart.items.length === 0) return;
    if (!activeShift) {
      Alert.alert('No Active Shift', 'Please start a shift first.');
      return;
    }
    setHolding(true);
    try {
      const heldTableID = cart.tableID;
      // Same payload as checkout (orderService._buildInvoice), OrderState 12.
      // A resumed held order is updated in place instead of duplicated.
      const { invoiceID } = await orderService.holdOrder({
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
      if (heldTableID) tableService.openTable(heldTableID, invoiceID).catch(() => {});
      resetOrder();
      setDiscountPct(0);
      toast('Order Held', 'success', 'Find it in the Orders tab.');
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
      Alert.alert('Hold Failed', failureText(err, 'Could not hold order. Please try again.'));
    } finally {
      setHolding(false);
    }
  };

  const handlePrintBill = async () => {
    if (cart.items.length === 0) return;
    if (!printer.isConfigured) {
      Alert.alert(
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
        companyName: user?.companyName,
        address: user?.companyAddress,
        phone: user?.companyPhone,
        logoUrl: user?.companyLogoUrl,
      };
      const content = await buildSimpleReceipt(data, receiptSettings, printer.paperWidth);
      const result = await printReceipt(content, printer);
      if (!result.success) Alert.alert('Print Failed', result.error);
    } catch (err: any) {
      Alert.alert('Print Failed', err?.message ?? 'Could not prepare bill for printing.');
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

  const openQtyEdit = (item: CartItem) => { setQtyEditItem(item); setQtyEditValue(String(item.qty)); };
  const appendQtyDigit = (d: string) => setQtyEditValue(prev => (prev === '0' ? d : prev + d));
  const backspaceQtyDigit = () => setQtyEditValue(prev => prev.slice(0, -1));
  const applyQtyEdit = () => {
    if (!qtyEditItem) return;
    const q = parseInt(qtyEditValue, 10);
    if (!isNaN(q) && q > 0) cart.updateQty(qtyEditItem.lineID, q);
    else if (q === 0) cart.removeItem(qtyEditItem.lineID);
    setQtyEditItem(null);
  };

  const GRID_COLUMNS = 6;
  const GRID_GAP = 14;
  const contentWidth = gridWidth != null ? gridWidth - 40 : undefined; // `left` has 20px horizontal padding on each side
  const itemWidth = contentWidth != null ? (contentWidth - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS : undefined;

  return (
    <View style={styles.root}>
      <View style={styles.left} onLayout={e => setGridWidth(e.nativeEvent.layout.width)}>
        <View style={styles.categoryRow}>
          <CategoryPill label="All" active={activeCategory == null} onPress={() => setActiveCategory(null)} />
          {categories.map(c => (
            <CategoryPill
              key={c.categoryID}
              label={c.name}
              active={activeCategory === c.categoryID}
              onPress={() => setActiveCategory(c.categoryID)}
            />
          ))}
        </View>

        <View style={[styles.searchWrap, searchOpen && styles.searchWrapActive]}>
          <Icon name="search" size={16} color={searchOpen ? Colors.primary : Colors.textMuted} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search products by name, SKU or barcode..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            onFocus={() => { pauseCapture(); setSearchOpen(true); }}
            onBlur={resumeCapture}
            onSubmitEditing={submitSearch}
            returnKeyType="search"
            submitBehavior="submit"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchOpen && (
            <TouchableOpacity onPress={closeSearch} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.searchCloseBtn}>
              <Icon name="times" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={{ flex: 1 }}>
        {!productsLoaded ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
        ) : (
          <FlatList
            data={filteredProducts}
            keyExtractor={p => String(p.productID)}
            numColumns={6}
            key="grid-6"
            contentContainerStyle={styles.grid}
            columnWrapperStyle={{ gap: 14 }}
            ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
            renderItem={({ item }) => (
              <ProductCard
                product={item}
                qtyInCart={cart.items.filter(i => i.productID === item.productID).reduce((s, i) => s + i.qty, 0)}
                onPress={() => addProductToCart(item)}
                width={itemWidth}
                currency={currency}
              />
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No products found.</Text>}
          />
        )}
        {searchOpen && (
          <ProductSearchPanel
            query={search}
            products={products}
            currency={currency}
            qtyInCart={id => cart.items.filter(i => i.productID === id).reduce((s, i) => s + i.qty, 0)}
            onSelectProduct={selectSearchResult}
            onSelectTerm={t => { setSearch(t); searchInputRef.current?.focus(); }}
            onClose={closeSearch}
          />
        )}
        </View>
      </View>

      <View style={styles.right}>
        <View style={styles.orderTypeRow}>
          {orderTypes.map(t => (
            <TouchableOpacity
              key={t.id}
              style={[styles.orderTypeTab, cart.orderTypeID === t.id && styles.orderTypeTabActive]}
              onPress={() => cart.setOrderType(t.id)}
            >
              <Text style={[styles.orderTypeText, cart.orderTypeID === t.id && styles.orderTypeTextActive]}>{t.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isRestaurant && cart.tableNo && (
          <TouchableOpacity style={styles.customerRow} onPress={() => setTablePickerVisible(true)}>
            <View style={styles.customerAvatar}>
              <Icon name="chair" size={14} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>Table {cart.tableNo}</Text>
            </View>
            <TouchableOpacity
              style={styles.chipCloseBtn}
              onPress={() => cart.setTable(null, null)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="times" size={14} color={Colors.textMuted} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}

        {cart.customer ? (
          <TouchableOpacity style={styles.customerRow} onPress={() => setCustomerModalVisible(true)}>
            <View style={styles.customerAvatar}>
              <Text style={styles.customerAvatarText}>{(cart.customer.businessName || cart.customer.name || 'W').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>{cart.customer.businessName || cart.customer.name}</Text>
              {cart.customer.phone ? <Text style={styles.customerPhone}>{cart.customer.phone}</Text> : null}
            </View>
            <TouchableOpacity style={styles.chipCloseBtn} onPress={() => cart.setCustomer(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="times" size={14} color={Colors.textMuted} />
            </TouchableOpacity>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.customerPickerBtn} onPress={() => setCustomerModalVisible(true)}>
            <Icon name="user-plus" size={14} color={Colors.textLight} />
            <Text style={styles.customerPickerText}>Select Customer</Text>
          </TouchableOpacity>
        )}

        <View style={styles.itemsHeader}>
          <Text style={styles.itemsHeaderText}>ORDER ITEMS</Text>
          <View style={styles.itemsCountBadge}>
            <Text style={styles.itemsCountText}>{cart.items.reduce((s, i) => s + i.qty, 0)}</Text>
          </View>
          <View style={{ flex: 1 }} />
          {cart.items.length > 0 && (
            <TouchableOpacity onPress={resetOrder}>
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={cart.items}
          keyExtractor={i => i.lineID}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 12 }}
          ListEmptyComponent={<Text style={styles.emptyCartText}>No items yet. Tap a product to add it.</Text>}
          renderItem={({ item }) => (
            <SwipeableCartRow
              item={item}
              currency={currency}
              onDec={() => cart.updateQty(item.lineID, item.qty - 1)}
              onInc={() => cart.updateQty(item.lineID, item.qty + 1)}
              onEditQty={() => openQtyEdit(item)}
              onRemove={() => cart.removeItem(item.lineID)}
              swipeEnabled={swipeToDeleteEnabled}
            />
          )}
        />

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, cart.totalDiscount() > 0 && styles.actionBtnActive]}
            onPress={() => setCustomDiscountVisible(true)}
            disabled={cart.items.length === 0}
          >
            <Icon name="tag" size={14} color={cart.totalDiscount() > 0 ? '#fff' : Colors.textLight} />
            <Text style={[styles.actionBtnText, cart.totalDiscount() > 0 && styles.actionBtnTextActive]}>Discount</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handlePrintBill} disabled={printingBill || cart.items.length === 0}>
            {printingBill
              ? <ActivityIndicator size="small" color={Colors.textLight} />
              : <><Icon name="print" size={14} color={Colors.textLight} /><Text style={styles.actionBtnText}>Print Bill</Text></>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => { setNoteDraft(cart.orderNote); setNoteModalVisible(true); }}>
            <Icon name="edit" size={14} color={Colors.textLight} />
            <Text style={styles.actionBtnText}>{cart.orderNote ? 'Edit Note' : 'Add Note'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.holdBtn} onPress={handleHold} disabled={holding || cart.items.length === 0}>
            {holding
              ? <ActivityIndicator size="small" color={Colors.warning} />
              : <><Icon name="pause" size={14} color={Colors.warning} /><Text style={styles.holdBtnText}>Hold</Text></>}
          </TouchableOpacity>
        </View>

        <View style={styles.totalsBox}>
          <TotalRow label="Subtotal" value={<Money amount={cart.subtotal()} currency={currency} style={styles.totalValue} />} />
          <TotalRow label="Discount" value={<Money amount={cart.totalDiscount()} currency={currency} style={[styles.totalValue, { color: Colors.danger }]} prefix="- " />} danger />
          <TotalRow label="VAT" value={<Money amount={cart.totalTax()} currency={currency} style={styles.totalValue} />} />
        </View>

        <View style={styles.payRow}>
          <TouchableOpacity
            style={[styles.checkoutBtn, cart.items.length === 0 && styles.payBtnDisabled]}
            disabled={cart.items.length === 0}
            onPress={() => setPaymentVisible(true)}
          >
            <Icon name="credit-card" size={17} color="#fff" />
            <Text style={styles.payBtnText}>Checkout ({cart.grandTotal().toFixed(2)})</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={customDiscountVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomDiscountVisible(false)}
        onShow={() => { setCustomDiscountValue(''); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.customDiscountCard}>
            <Text style={styles.modalTitle}>Custom Discount</Text>

            <View style={styles.typeToggleRow}>
              <TouchableOpacity
                style={[styles.typeToggleBtn, customDiscountType === 'amount' && styles.typeToggleBtnActive]}
                onPress={() => setCustomDiscountType('amount')}
              >
                <Text style={[styles.typeToggleText, customDiscountType === 'amount' && styles.typeToggleTextActive]}>
                  Amount ({user?.currency ?? 'SAR'})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeToggleBtn, customDiscountType === 'percent' && styles.typeToggleBtnActive]}
                onPress={() => setCustomDiscountType('percent')}
              >
                <Text style={[styles.typeToggleText, customDiscountType === 'percent' && styles.typeToggleTextActive]}>
                  Percentage (%)
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.discountDisplay}>
              <Text style={styles.discountDisplayValue}>
                {customDiscountValue || '0'}{customDiscountType === 'percent' ? '%' : ''}
              </Text>
              {customDiscountType === 'percent' && (
                <Text style={styles.discountPreview}>
                  = {fmt(customDiscountAmount)} {user?.currency ?? 'SAR'}
                </Text>
              )}
            </View>

            <View style={styles.numpadGrid}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'].map(key => (
                <TouchableOpacity
                  key={key}
                  style={styles.numpadKey}
                  onPress={() => key === 'back' ? backspaceCustomDigit() : appendCustomDigit(key)}
                >
                  {key === 'back'
                    ? <Icon name="backspace-outline" library="mci" size={18} color={Colors.text} />
                    : <Text style={styles.numpadKeyText}>{key}</Text>}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setCustomDiscountVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={applyCustomDiscount}>
                <Text style={styles.applyBtnText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!qtyEditItem}
        transparent
        animationType="fade"
        onRequestClose={() => setQtyEditItem(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.customDiscountCard}>
            <Text style={styles.modalTitle}>Edit Quantity</Text>
            <Text style={styles.modalSub} numberOfLines={1}>{qtyEditItem?.name}</Text>

            <View style={styles.discountDisplay}>
              <Text style={styles.discountDisplayValue}>{qtyEditValue || '0'}</Text>
            </View>

            <View style={styles.numpadGrid}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'].map((key, i) => (
                key === '' ? (
                  <View key={`spacer-${i}`} style={styles.numpadKey} />
                ) : (
                  <TouchableOpacity
                    key={key}
                    style={styles.numpadKey}
                    onPress={() => key === 'back' ? backspaceQtyDigit() : appendQtyDigit(key)}
                  >
                    {key === 'back'
                      ? <Icon name="backspace-outline" library="mci" size={18} color={Colors.text} />
                      : <Text style={styles.numpadKeyText}>{key}</Text>}
                  </TouchableOpacity>
                )
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setQtyEditItem(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={applyQtyEdit}>
                <Text style={styles.applyBtnText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={noteModalVisible} transparent animationType="fade" onRequestClose={() => setNoteModalVisible(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={-120}
        >
          <View style={styles.customDiscountCard}>
            <Text style={styles.modalTitle}>Order Note</Text>
            <Text style={styles.fieldLabel}>Note for kitchen / staff</Text>
            <TextInput
              style={styles.noteInput}
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder="e.g. No onions, extra spicy..."
              placeholderTextColor={Colors.textMuted}
              multiline
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setNoteModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyBtn}
                onPress={() => { cart.setOrderNote(noteDraft.trim()); setNoteModalVisible(false); }}
              >
                <Text style={styles.applyBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
                  <TouchableOpacity style={[styles.formBtn, styles.formBtnSecondary]} onPress={() => setAddingCustomer(false)} disabled={savingCustomer}>
                    <Text style={styles.formBtnSecondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.formBtn, (!newCustomer.name.trim() || savingCustomer) && { opacity: 0.5 }]}
                    onPress={saveNewCustomer}
                    disabled={!newCustomer.name.trim() || savingCustomer}
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
        onConfirm={({ computedPrice, selectionSummary, lineSelections }) => {
          if (!optionsProduct) return;
          cart.addItem({
            productID: optionsProduct.productID,
            name: optionsProduct.name,
            nameAr: optionsProduct.nameAr,
            sku: optionsProduct.sku,
            type: optionsProduct.type,
            price: computedPrice,
            qty: 1,
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
        onClose={() => setPaymentVisible(false)}
        onComplete={async (rows) => {
          if (!activeShift) {
            Alert.alert('No Active Shift', 'Start a shift before taking payments.');
            return;
          }
          const currency = user?.currency ?? 'SAR';
          const orderTypeName = orderTypes.find(t => t.id === cart.orderTypeID)?.name;
          const totalPaid = rows.reduce((s, r) => s + r.paymentAmount, 0);
          const total = cart.grandTotal();

          const buildReceiptData = (result?: { shiftOrderNo: number; invoiceID: number; invoiceCode: string; zatcaQrCode: string | null }): ReceiptData => ({
            orderNumber: String(result?.shiftOrderNo ?? result?.invoiceID ?? Date.now()),
            invoiceCode: result?.invoiceCode,
            items: cart.items.map(i => ({ name: i.name, alternateName: i.nameAr, qty: i.qty, price: i.price, selections: i.selectionSummary })),
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
            time: new Date(),
            cashierName: user?.name,
            currency,
            companyName: user?.companyName,
            address: user?.companyAddress,
            phone: user?.companyPhone,
            logoUrl: user?.companyLogoUrl,
            zatcaQrCode: result?.zatcaQrCode ?? null,
          });

          // Prints directly and reports success via toast — no receipt-preview
          // detour. ReceiptPreviewScreen/its route are kept in the app (manual
          // reprint, dev/testing) but checkout no longer navigates there.
          const printAndNotify = async (data: ReceiptData) => {
            const orderLabel = `Order #${data.orderNumber.replace(/^#/, '')} placed`;
            if (!receiptSettings.autoPrintOnComplete || !printer.isConfigured) {
              toast(orderLabel, 'success');
              return;
            }
            setPrintCaptureReceipt(data);
            if (receiptSettings.printMode === 'image') {
              // Let the hidden ReceiptPaper actually render this order's data
              // before ViewShot captures it — state updates aren't visible to
              // a screenshot until React has flushed at least one frame.
              await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            }
            const result = await printReceiptNow(data, receiptSettings, printer, printViewShotRef);
            toast(orderLabel, 'success', result.success ? 'Receipt printed' : `Print failed: ${result.error}`);
          };

          const paidTableID = cart.tableID;
          try {
            const result = await orderService.createOrder({
              // Paying a resumed held order updates it in place (PUT) rather
              // than creating a second invoice next to the unpaid one.
              existingInvoiceID: cart.checkoutInvoiceID,
              existingShiftOrderNo: cart.checkoutShiftOrderNo,
              shiftID: activeShift.shiftID,
              shiftOrderCount: activeShift.orderCount,
              branchID: user?.branchID ?? null,
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
              paymentMethod: rows[0]?.paymentMethod ?? 'Cash',
              paymentAmount: rows[0]?.paymentAmount ?? total,
              paymentRows: rows,
              tableID: cart.tableID,
              tableNo: cart.tableNo,
            });
            const data = buildReceiptData(result);
            setReceipt(data);
            resetOrder();
            setDiscountPct(0);
            setPaymentVisible(false);
            printAndNotify(data);
            // Full payment frees the table — same lifecycle point as web's finishPayment().
            if (paidTableID) tableService.releaseTable(paidTableID).catch(() => {});
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
              resetOrder();
              setDiscountPct(0);
              setPaymentVisible(false);
              printAndNotify(data);
              return;
            }
            // Native alert, not a toast: toasts render behind the payment
            // modal, so a failed checkout used to look like nothing happened.
            Alert.alert('Payment Failed', failureText(err, 'Please try again.'));
          }
        }}
        total={cart.grandTotal()}
        subtotal={cart.subtotal()}
        discount={cart.totalDiscount()}
        tax={cart.totalTax()}
        currency={user?.currency ?? 'SAR'}
      />

      {/* Off-screen — exists only so "Image Canvas" print mode has a rendered
          receipt to screenshot without ever showing a preview screen. Laid
          out normally (not display:none/width:0) since ViewShot needs real
          dimensions to capture; pushed out of the viewport instead. */}
      {printCaptureReceipt && (
        <View style={styles.hiddenPrintCapture} pointerEvents="none">
          <ViewShot ref={printViewShotRef} options={{ format: 'png', quality: 1 }}>
            <View style={styles.hiddenPrintPaper}>
              <ReceiptPaper receipt={printCaptureReceipt} settings={receiptSettings} paperWidth={printer.paperWidth} />
            </View>
          </ViewShot>
        </View>
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

function CategoryPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.categoryPill, active && styles.categoryPillActive]} onPress={onPress}>
      <Text style={[styles.categoryPillText, active && styles.categoryPillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const SWIPE_ACTION_BTN_WIDTH = 72;
const SWIPE_ACTION_WIDTH = SWIPE_ACTION_BTN_WIDTH * 2;

// Swipe-left reveals both an Edit (qty numpad) and a Remove action, as a
// bigger, easier-to-hit alternative to the trailing X button (kept, now with
// a larger circular hit target, in case swipe isn't discovered). Tapping the
// qty number also opens the numpad directly; the +/- buttons stay as-is.
// The swipe gesture itself can be turned off in POS Settings — when off this
// renders as a static row (still +/- and the trailing X, no gesture at all).
function SwipeableCartRow({
  item, currency, onDec, onInc, onEditQty, onRemove, swipeEnabled,
}: { item: CartItem; currency: string; onDec: () => void; onInc: () => void; onEditQty: () => void; onRemove: () => void; swipeEnabled: boolean }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => swipeEnabled && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        const base = openRef.current ? -SWIPE_ACTION_WIDTH : 0;
        const next = Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, base + g.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const base = openRef.current ? -SWIPE_ACTION_WIDTH : 0;
        const shouldOpen = base + g.dx < -SWIPE_ACTION_WIDTH / 2;
        openRef.current = shouldOpen;
        Animated.spring(translateX, { toValue: shouldOpen ? -SWIPE_ACTION_WIDTH : 0, useNativeDriver: true, bounciness: 0 }).start();
      },
    })
  ).current;

  const rowContent = (
    <>
      <View style={{ flex: 1 }}>
        <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
        {item.selectionSummary ? (
          <Text style={styles.cartItemSelections} numberOfLines={2}>{item.selectionSummary}</Text>
        ) : null}
        <Money amount={item.price} currency={currency} style={styles.cartItemPrice} />
      </View>
      <TouchableOpacity style={styles.qtyBtn} onPress={onDec} hitSlop={{ top: 10, bottom: 10, left: 10, right: 6 }}>
        <Icon name="minus" size={11} color={Colors.text} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onEditQty} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}>
        <Text style={styles.qtyText}>{item.qty}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.qtyBtn} onPress={onInc} hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}>
        <Icon name="plus" size={11} color={Colors.text} />
      </TouchableOpacity>
      <Money amount={item.total} currency={currency} style={styles.cartItemTotal} />
      <TouchableOpacity style={styles.cartRowRemoveBtn} onPress={onRemove} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Icon name="times" size={14} color={Colors.textMuted} />
      </TouchableOpacity>
    </>
  );

  if (!swipeEnabled) {
    return <View style={styles.cartRow}>{rowContent}</View>;
  }

  return (
    <View style={styles.cartRowWrap}>
      <View style={styles.cartRowActions}>
        <TouchableOpacity style={styles.cartRowEditBtn} onPress={onEditQty}>
          <Icon name="edit" size={16} color="#fff" />
          <Text style={styles.cartRowActionText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cartRowDeleteBtn} onPress={onRemove}>
          <Icon name="trash-alt" size={16} color="#fff" />
          <Text style={styles.cartRowActionText}>Remove</Text>
        </TouchableOpacity>
      </View>
      <Animated.View style={[styles.cartRow, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
        {rowContent}
      </Animated.View>
    </View>
  );
}

function ProductCard({ product, qtyInCart, onPress, width, currency }: { product: Product; qtyInCart: number; onPress: () => void; width?: number; currency: string }) {
  return (
    <TouchableOpacity style={[styles.productCard, width != null && { flexBasis: width }, qtyInCart > 0 && styles.productCardActive]} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.productImageWrap}>
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={styles.productImage} />
        ) : (
          <View style={[styles.productImage, styles.productImagePlaceholder]}>
            <Icon name="box" size={22} color={Colors.textMuted} />
          </View>
        )}
        {qtyInCart > 0 && (
          <View style={styles.qtyBadge}>
            <Text style={styles.qtyBadgeText}>{qtyInCart}</Text>
          </View>
        )}
      </View>
      <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
      <Money amount={product.price} currency={currency} style={styles.productPrice} />
    </TouchableOpacity>
  );
}

function TotalRow({ label, value, danger }: { label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={[styles.totalValue, danger && { color: Colors.danger }]}>{value}</Text>
    </View>
  );
}

// Split-payment entry: at most one entry per method, editable/removable — the
// cashier can type an exact amount for each method instead of a tap always
// consuming the full remaining balance, matching the web POS's keypad flow.
interface PaymentEntry { method: string; amount: number; }

function PaymentModal({
  visible, onClose, onComplete, total, subtotal, discount, tax, currency,
}: {
  visible: boolean;
  onClose: () => void;
  onComplete: (rows: { paymentMethod: string; paymentAmount: number }[]) => void;
  total: number; subtotal: number; discount: number; tax: number; currency: string;
}) {
  const [entries, setEntries] = useState<PaymentEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [keypadMethod, setKeypadMethod] = useState<string | null>(null);
  const [keypadValue, setKeypadValue] = useState('0');

  useEffect(() => {
    if (visible) { setEntries([]); setKeypadMethod(null); }
  }, [visible]);

  const totalPaid = entries.reduce((s, e) => s + e.amount, 0);
  const remaining = Math.max(0, total - totalPaid);
  const change = Math.max(0, totalPaid - total);
  const canComplete = entries.length > 0 && totalPaid >= total - 0.001;

  const getEntryAmount = (method: string): number | null =>
    entries.find(e => e.method === method)?.amount ?? null;

  const openKeypad = (method: string) => {
    const existing = getEntryAmount(method);
    const defaultAmt = existing != null ? existing.toFixed(2) : (remaining > 0 ? remaining : total).toFixed(2);
    setKeypadValue(defaultAmt);
    setKeypadMethod(method);
  };

  const keypadPress = (key: string) => {
    setKeypadValue(prev => {
      if (key === 'backspace') return prev.length > 1 ? prev.slice(0, -1) : '0';
      if (key === 'clear') return '0';
      if (key === '.') return prev.includes('.') ? prev : prev + '.';
      const next = prev === '0' ? key : prev + key;
      const parts = next.split('.');
      if (parts[1] && parts[1].length > 2) return prev;
      return next;
    });
  };

  const confirmKeypad = () => {
    const amount = parseFloat(keypadValue) || 0;
    if (!keypadMethod || amount <= 0) return;
    setEntries(prev => [...prev.filter(e => e.method !== keypadMethod), { method: keypadMethod, amount }]);
    setKeypadMethod(null);
  };

  const removeEntry = (method: string) => setEntries(prev => prev.filter(e => e.method !== method));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.paymentCard}>
          <View style={styles.paymentHeader}>
            <Text style={styles.modalTitle}>Checkout</Text>
            <TouchableOpacity onPress={onClose}>
              <Icon name="times" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.paymentBody}>
            <View style={styles.paymentLeft}>
              <Text style={styles.orderTotalLabel}>ORDER TOTAL</Text>
              <Money amount={total} currency={currency} style={styles.orderTotalValue} />

              <Text style={[styles.fieldLabel, { marginTop: 20 }]}>PAYMENT METHOD</Text>
              <View style={styles.methodGrid}>
                {PAYMENT_METHODS.map(m => {
                  const entryAmt = getEntryAmount(m.key);
                  return (
                    <TouchableOpacity
                      key={m.key}
                      style={[styles.methodTile, entryAmt != null && styles.methodTileSelected]}
                      onPress={() => openKeypad(m.key)}
                    >
                      <Icon name={m.icon} size={16} color={Colors.text} />
                      <Text style={styles.methodTileText}>{m.label}</Text>
                      {entryAmt != null && (
                        <View style={styles.methodTileBadge}>
                          <Icon name="check" size={9} color={Colors.text} />
                          <Money amount={entryAmt} currency={currency} style={styles.methodTileBadgeText} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.paymentRight}>
              <Text style={styles.fieldLabel}>ORDER SUMMARY</Text>
              <View style={styles.summaryBoxSmall}>
                <TotalRow label="Subtotal" value={<Money amount={subtotal} currency={currency} style={styles.totalValue} />} />
                <TotalRow label="Discount" value={<Money amount={discount} currency={currency} style={[styles.totalValue, { color: Colors.danger }]} prefix="- " />} danger />
                <TotalRow label="VAT" value={<Money amount={tax} currency={currency} style={styles.totalValue} />} />
                <View style={styles.divider} />
                <TotalRow label="Total" value={<Money amount={total} currency={currency} style={styles.totalValue} />} />
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>PAYMENTS ADDED</Text>
              <View style={styles.paymentsAdded}>
                {entries.length === 0 && <Text style={styles.emptyCartText}>Select a payment method.</Text>}
                {entries.map(e => (
                  <View key={e.method} style={styles.paymentAddedRow}>
                    <Icon name="check-circle" size={13} color={Colors.success} />
                    <Text style={styles.paymentAddedLabel}>{e.method}</Text>
                    <Money amount={e.amount} currency={currency} style={styles.paymentAddedAmount} />
                    <TouchableOpacity onPress={() => openKeypad(e.method)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Icon name="edit" size={12} color={Colors.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeEntry(e.method)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Icon name="times" size={12} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              <View style={[styles.changeBox, remaining >= 0.01 && styles.changeBoxDue]}>
                <TotalRow label="Total Paid" value={<Money amount={totalPaid} currency={currency} style={styles.totalValue} />} />
                <TotalRow
                  label={remaining < 0.01 ? 'Change' : 'Remaining'}
                  value={<Money amount={remaining < 0.01 ? change : remaining} currency={currency} style={[styles.totalValue, remaining >= 0.01 && { color: Colors.danger }]} />}
                />
              </View>

              <TouchableOpacity
                style={[styles.completeBtn, (!canComplete || submitting) && styles.payBtnDisabled]}
                disabled={!canComplete || submitting}
                onPress={async () => {
                  setSubmitting(true);
                  await onComplete(entries.map(e => ({ paymentMethod: e.method, paymentAmount: e.amount })));
                  setSubmitting(false);
                }}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.completeBtnText}>✓ Complete Payment</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      <Modal visible={!!keypadMethod} transparent animationType="fade" onRequestClose={() => setKeypadMethod(null)}>
        <View style={styles.modalOverlay}>
          {/* Same outer footprint AND same header style as the checkout card
              (styles.paymentCard / paymentHeader) so switching between the two
              never changes the modal's size, position, or header layout —
              only the centered inner column (below) sizes itself to content. */}
          <View style={styles.paymentCard}>
            <View style={styles.paymentHeader}>
              <Text style={styles.modalTitle}>{keypadMethod}</Text>
              <TouchableOpacity onPress={() => setKeypadMethod(null)}>
                <Icon name="times" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.keypadBody}
              activeOpacity={1}
              onPress={() => setKeypadMethod(null)}
            >
            <TouchableOpacity activeOpacity={1} style={styles.keypadInner} onPress={() => {}}>
              <Text style={styles.keypadHint}>Enter amount to charge</Text>

              <View style={styles.keypadDisplay}>
                {currency === 'SAR'
                  ? <RiyalIcon size={24} color={Colors.text} style={{ marginRight: 8 }} />
                  : <Text style={styles.keypadCurrency}>{currency}</Text>}
                <Text style={styles.keypadAmount}>{keypadValue}</Text>
              </View>

              <View style={styles.keypadQuickRow}>
                <TouchableOpacity style={styles.kqBtn} onPress={() => setKeypadValue((remaining > 0 ? remaining : total).toFixed(2))}>
                  <Text style={styles.kqLabel}>Exact</Text>
                  <Money amount={remaining > 0 ? remaining : total} currency={currency} style={styles.kqValue} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.kqBtn}
                  onPress={() => setKeypadValue((Math.ceil((remaining > 0 ? remaining : total) / 10) * 10).toFixed(2))}
                >
                  <Text style={styles.kqLabel}>Round</Text>
                  <Money amount={Math.ceil((remaining > 0 ? remaining : total) / 10) * 10} currency={currency} style={styles.kqValue} />
                </TouchableOpacity>
              </View>
              <View style={styles.keypadQuickRow}>
                {[50, 100, 200, 500].map(v => (
                  <TouchableOpacity key={v} style={styles.kqFixedBtn} onPress={() => setKeypadValue(v.toFixed(2))}>
                    <Text style={styles.kqFixedText}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.numpadGrid}>
                {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'backspace'].map(k => (
                  <TouchableOpacity key={k} style={styles.numpadKey} onPress={() => keypadPress(k)}>
                    {k === 'backspace'
                      ? <Icon name="backspace-outline" library="mci" size={20} color={Colors.text} />
                      : <Text style={styles.numpadKeyText}>{k}</Text>}
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.keypadConfirmBtn} onPress={confirmKeypad}>
                <Icon name="check" size={18} color="#fff" />
                <Text style={styles.keypadConfirmText}>Add {keypadMethod} · {keypadValue}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },

  // Rendered but positioned far outside the viewport — see the print-capture
  // block above. `left/top` (not opacity:0) so it's still fully laid out and
  // capturable by react-native-view-shot.
  hiddenPrintCapture: { position: 'absolute', left: -9999, top: 0 },
  hiddenPrintPaper: { backgroundColor: '#fff', padding: 20, width: 360 },

  left: { flex: 2.8, padding: 20 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  categoryPill: { backgroundColor: Colors.surface, borderRadius: 22, paddingHorizontal: 20, paddingVertical: 13, borderWidth: 1, borderColor: Colors.border },
  categoryPillActive: { backgroundColor: Colors.primaryDark, borderColor: Colors.primaryDark },
  categoryPillText: { fontSize: 15, fontWeight: '600', color: Colors.textLight },
  categoryPillTextActive: { color: '#fff' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, height: 50, marginBottom: 14,
  },
  searchWrapActive: { borderColor: Colors.primary, borderWidth: 1.5 },
  searchInput: { flex: 1, fontSize: 16, color: Colors.text },
  searchCloseBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },

  grid: { paddingBottom: 40 },
  emptyText: { textAlign: 'center', color: Colors.textMuted, marginTop: 40 },

  productCard: {
    flexGrow: 0, flexShrink: 0, flexBasis: '15%', backgroundColor: Colors.surface, borderRadius: 14,
    padding: 12, borderWidth: 1.5, borderColor: 'transparent',
  },
  productCardActive: { borderColor: Colors.primary },
  productImageWrap: { position: 'relative', marginBottom: 8 },
  productImage: { width: '100%', aspectRatio: 1, borderRadius: 10 },
  productImagePlaceholder: { backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  qtyBadge: {
    position: 'absolute', top: 6, right: 6, backgroundColor: Colors.primary, borderRadius: 10,
    minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  qtyBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  productName: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 3 },
  productPrice: { fontSize: 13.5, color: Colors.textMuted, fontWeight: '600' },

  right: { flex: 1.2, backgroundColor: Colors.surface, borderLeftWidth: 1, borderLeftColor: Colors.border, padding: 18 },

  orderTypeRow: {
    flexDirection: 'row', gap: 6, backgroundColor: Colors.background, borderRadius: 10,
    padding: 4, marginBottom: 12,
  },
  orderTypeTab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 8 },
  orderTypeTabActive: { backgroundColor: Colors.primaryDark },
  orderTypeText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  orderTypeTextActive: { color: '#fff', fontWeight: '800' },

  itemsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  itemsHeaderText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.6 },
  itemsCountBadge: { backgroundColor: Colors.primaryLight, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },
  itemsCountText: { fontSize: 12, fontWeight: '800', color: Colors.primary },
  clearText: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },

  emptyCartText: { color: Colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 20 },

  cartRowWrap: { position: 'relative', overflow: 'hidden', borderBottomWidth: 1, borderBottomColor: Colors.divider },
  cartRowActions: {
    position: 'absolute', top: 0, bottom: 0, right: 0, width: SWIPE_ACTION_WIDTH,
    flexDirection: 'row', alignItems: 'stretch',
  },
  cartRowEditBtn: { width: SWIPE_ACTION_BTN_WIDTH, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: Colors.primary },
  cartRowDeleteBtn: { width: SWIPE_ACTION_BTN_WIDTH, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: Colors.danger },
  cartRowActionText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  cartRowRemoveBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  cartRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingRight: 10, backgroundColor: Colors.surface },
  cartItemName: { fontSize: 14.5, fontWeight: '700', color: Colors.text },
  cartItemPrice: { fontSize: 12, color: Colors.textMuted },
  cartItemSelections: { fontSize: 11.5, color: Colors.textLight, marginTop: 1, marginBottom: 1 },
  qtyBtn: { width: 26, height: 26, borderRadius: 7, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontSize: 14.5, fontWeight: '700', color: Colors.text, minWidth: 18, textAlign: 'center' },
  cartItemTotal: { fontSize: 14.5, fontWeight: '800', color: Colors.text, minWidth: 60, textAlign: 'right' },

  actionsRow: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  actionBtn: {
    flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    height: 44, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  actionBtnText: { fontSize: 12.5, fontWeight: '700', color: Colors.textLight },
  actionBtnActive: { backgroundColor: Colors.primaryDark, borderColor: Colors.primaryDark },
  actionBtnTextActive: { color: '#fff' },
  holdBtn: {
    flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    height: 44, borderRadius: 10, borderWidth: 1, borderColor: Colors.warning, backgroundColor: Colors.warningBg,
  },
  holdBtnText: { fontSize: 12.5, fontWeight: '700', color: Colors.warning },


  totalsBox: { marginBottom: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: Colors.textLight },
  totalValue: { fontSize: 16, fontWeight: '800', color: Colors.text },

  payRow: { paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  checkoutBtn: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary,
    borderRadius: 12, width: '100%', height: 56,
  },
  payBtnDisabled: { opacity: 0.5 },
  payBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },

  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  modalSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.6, marginBottom: 8 },

  customDiscountCard: { width: 360, backgroundColor: Colors.surface, borderRadius: 20, padding: 24 },
  customDiscountInput: {
    backgroundColor: Colors.background, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border,
    height: 52, paddingHorizontal: 14, fontSize: 20, fontWeight: '800', color: Colors.text, marginTop: 12,
  },

  typeToggleRow: { flexDirection: 'row', gap: 8, backgroundColor: Colors.background, borderRadius: 10, padding: 4, marginTop: 16 },
  typeToggleBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 8 },
  typeToggleBtnActive: { backgroundColor: Colors.primaryDark },
  typeToggleText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  typeToggleTextActive: { color: '#fff' },

  discountDisplay: { alignItems: 'flex-end', paddingVertical: 18, borderBottomWidth: 1.5, borderBottomColor: Colors.border, marginTop: 14, marginBottom: 14 },
  discountDisplayValue: { fontSize: 34, fontWeight: '800', color: Colors.text },
  discountPreview: { fontSize: 13, fontWeight: '600', color: Colors.primary, marginTop: 4 },

  numpadGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  numpadKey: {
    width: '31%', height: 50, borderRadius: 12, backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  numpadKeyText: { fontSize: 18, fontWeight: '700', color: Colors.text },
  noteInput: {
    backgroundColor: Colors.background, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border,
    minHeight: 90, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: Colors.text,
    marginTop: 12, textAlignVertical: 'top',
  },

  customerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.primaryLight,
    borderRadius: 12, padding: 10, marginBottom: 14,
  },
  customerAvatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  customerAvatarText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  chipCloseBtn: { marginLeft: 4, marginRight: 4 },
  customerName: { fontSize: 14.5, fontWeight: '700', color: Colors.primaryDark },
  customerPhone: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  customerPickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: Colors.border,
    borderStyle: 'dashed', borderRadius: 12, padding: 12, marginBottom: 14, justifyContent: 'center',
  },
  customerPickerText: { fontSize: 14.5, fontWeight: '600', color: Colors.textLight },

  customerModalCard: { width: 460, maxWidth: '92%', maxHeight: '80%', backgroundColor: Colors.surface, borderRadius: 20, overflow: 'hidden' },

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
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textLight },
  applyBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: Colors.primaryDark, alignItems: 'center', justifyContent: 'center' },
  applyBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  // Checkout card and the amount keypad share this exact footprint (width +
  // minHeight) so switching between them never resizes/repositions the
  // modal — only the content inside changes. Keep both in sync if either
  // needs to change.
  paymentCard: {
    width: 820, maxWidth: '94%', minHeight: 620, backgroundColor: Colors.surface,
    borderRadius: 24, overflow: 'hidden',
  },
  paymentHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 28, paddingVertical: 22, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  paymentBody: { flex: 1, flexDirection: 'row', padding: 28, gap: 32 },
  paymentLeft: { flex: 1 },
  paymentRight: { flex: 1 },
  orderTotalLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase' },
  orderTotalValue: { fontSize: 34, fontWeight: '800', color: Colors.text, marginTop: 6 },

  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  methodTile: {
    width: '47%', height: 76, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.background,
  },
  methodTileSelected: { borderColor: Colors.success, backgroundColor: Colors.successBg },
  methodTileText: { fontSize: 13, fontWeight: '700', color: Colors.text },
  methodTileBadge: {
    position: 'absolute', bottom: -9, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.success, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3,
  },
  methodTileBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },

  summaryBoxSmall: { backgroundColor: Colors.background, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 8 },

  paymentsAdded: { minHeight: 44 },
  paymentAddedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  paymentAddedLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.text },
  paymentAddedAmount: { fontSize: 14, fontWeight: '700', color: Colors.text },

  changeBox: { backgroundColor: Colors.successBg, borderRadius: 14, padding: 16, marginTop: 14 },
  changeBoxDue: { backgroundColor: '#FEF2F2' },

  completeBtn: { marginTop: 18, height: 56, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  completeBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  // Fills the rest of the shared paymentCard footprint below its header,
  // centering the fixed-width numpad column so it never stretches edge-to-edge.
  // No flex:1/justifyContent:center here — those made Yoga lock the shared
  // paymentCard at its minHeight and clip (via paymentCard's overflow:hidden)
  // whatever didn't fit, instead of letting the card grow to fit content like
  // the checkout screen does. Just size naturally and center horizontally.
  keypadBody: { alignItems: 'center', padding: 28 },
  keypadInner: { width: 380, maxWidth: '100%' },
  keypadHint: { fontSize: 13, color: Colors.textMuted, marginBottom: 16, textAlign: 'center' },
  keypadDisplay: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.background, borderRadius: 14, paddingVertical: 20, marginBottom: 16,
  },
  keypadCurrency: { fontSize: 22, fontWeight: '700', color: Colors.textLight },
  keypadAmount: { fontSize: 32, fontWeight: '800', color: Colors.text },
  keypadQuickRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  kqBtn: {
    flex: 1, backgroundColor: Colors.background, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 10, alignItems: 'center', gap: 3,
  },
  kqLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
  kqValue: { fontSize: 14, fontWeight: '800', color: Colors.text },
  kqFixedBtn: {
    flex: 1, backgroundColor: Colors.background, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 10, alignItems: 'center',
  },
  kqFixedText: { fontSize: 14, fontWeight: '700', color: Colors.text },
  keypadConfirmBtn: {
    marginTop: 14, height: 56, borderRadius: 14, backgroundColor: Colors.primary,
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
  },
  keypadConfirmText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
