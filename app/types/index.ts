// ── Auth ─────────────────────────────────────────────────────────────
export interface PosUser {
  userID: number;
  subUserID: number;
  name: string;
  email: string;
  roleID: number;
  branchID: number | null;
  currency: string;
  currencyID: number | null;
  rights: FormPermissionGroup[];
  // Store/company info — from GET /user/get/{userID}, used as the source of
  // truth for receipt printing (Receipt Settings fields are manual overrides).
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyLogoUrl?: string;
  // "restaurant" | "retail" — from GET /user/get/{userID}. Gates the Tables
  // tab; only "restaurant" shows it (mirrors web's pos_industry_type flag).
  industryType?: string;
}

export interface FormPermissionGroup {
  formID: number;
  methods: number[];
}

// ── Shift ─────────────────────────────────────────────────────────────
export interface PosShift {
  shiftID: number;
  subUserID: number;
  branchID: number | null;
  branchName: string;
  cashierName: string;
  openingCash: number;
  totalSales: number;
  totalDiscount: number;
  totalTax: number;
  totalRefunds: number;
  totalPaidIn: number;
  totalPaidOut: number;
  orderCount: number;
  startedAt: string;
  statusID: number;
}

export interface PosShiftSummary {
  shiftID: number;
  branchName: string;
  cashierName: string;
  openingCash: number;
  totalSales: number;
  totalDiscount: number;
  totalTax: number;
  totalRefunds: number;
  totalPaidIn: number;
  totalPaidOut: number;
  orderCount: number;
  expectedCash: number;
  startedAt: string;
  statusID: number;
}

// ── Products ─────────────────────────────────────────────────────────
export interface Product {
  productID: number;
  name: string;
  nameAr?: string;
  price: number;
  categoryID: number | null;
  sku?: string;
  barcode?: string;
  description?: string;
  imageUrl?: string;
  taxRate?: number;
  // MP=multi-price, PR=plain product, HW=hardware/stocked item, CB=combo, BN=bundle.
  // CB/BN always carry a pos-config (comboGroups/bundleItems); other types may or
  // may not have modifierGroups/variants attached.
  type?: string;
}

// ── Modifiers & Combos ───────────────────────────────────────────────
// One GET call (productCatalogService.getPosConfig) returns everything needed
// to render the options modal for a given product — variants, modifier
// groups, combo groups (with their items), and bundle contents.
export interface ProductVariant {
  variantID: number;
  name: string;
  sku: string;
  price: number;
}

export interface ModifierGroup {
  modifierGroupID: number;
  name: string;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  displayOrder: number;
}

export interface ModifierOption {
  modifierID: number;
  modifierGroupID: number;
  name: string;
  price: number;
  displayOrder: number;
}

export interface ComboGroup {
  comboGroupID: number;
  name: string;
  minSelect: number;
  maxSelect: number;
  displayOrder: number;
}

export interface ComboGroupItem {
  comboGroupItemID: number;
  comboGroupID: number;
  itemProductID: number;
  itemProductName: string;
  additionalPrice: number;
  displayOrder: number;
}

export interface BundleItem {
  bundleItemID: number;
  itemProductID: number;
  itemProductName: string;
  quantity: number;
  displayOrder: number;
}

export interface ProductPosConfig {
  product: { productID: number; type: string; name: string; price: number };
  variants: ProductVariant[];
  modifierGroups: ModifierGroup[];
  modifiers: ModifierOption[];
  comboGroups: ComboGroup[];
  comboItems: ComboGroupItem[];
  bundleItems: BundleItem[];
}

// Flat, backend-ready record of one chosen variant/modifier/combo option.
// Nested modifier picks (e.g. a combo's "Fries" item carrying its own "Size"
// group) are flattened into this same array with groupName built as
// "<parent combo item name> — <nested group name>" — that " — " separator is
// what buildSelectionTree() later uses to recover the hierarchy for display.
export interface LineItemSelection {
  selectionType: 'Variant' | 'Modifier' | 'Combo';
  groupID?: number | null;
  groupName?: string;
  itemID?: number | null;
  itemName: string;
  additionalPrice: number;
}

export interface Category {
  categoryID: number;
  name: string;
  nameAr?: string;
  parentID: number | null;
  sortOrder: number;
}

// ── Cart ─────────────────────────────────────────────────────────────
export interface CartItem {
  // Unique per cart row (not per product) — a configured line (with its own
  // modifier/combo selections) never merges quantity with a plain add of the
  // same product, since they may not have the same price/selections.
  lineID: string;
  productID: number;
  name: string;
  nameAr?: string;
  sku?: string;
  type?: string;
  price: number;   // base product price + all selection upcharges
  qty: number;
  discount: number;
  taxRate: number;
  total: number;
  selectionSummary?: string;        // "Beef Burger +3, Fries, Size: Large +2, Coke"
  lineSelections?: LineItemSelection[];
}

// ── Customer ─────────────────────────────────────────────────────────
export interface Customer {
  customerID: number;
  name: string;
  businessName?: string;
  phone?: string;
  email?: string;
  vatNumber?: string;
}

// ── Order / Invoice ──────────────────────────────────────────────────
export interface PosOrder {
  invoiceID: number;
  transactionNumber: string;
  transactionDate: string;
  totalAmount: number;
  discount: number;
  statusID: number;
  shiftID: number | null;
  branchID: number | null;
  shiftOrderNo: number | null;
  orderTypeID: number | null;
  orderType: string | null;
  customerName: string | null;
  customerEmail: string | null;
  paymentMethodTitle: string | null;
  // Table name string, e.g. "T3" — whatever the backend returns on the
  // invoice record (set at creation from CartState.tableNo).
  tableNo?: string | null;
  tableID?: number | null;
}

// ── Tables (restaurant industryType only) ───────────────────────────
// Mirrors web POS's table.service.ts PosTable/PosFloor/PosSection shapes.
export const POS_TABLE_STATUS = {
  Available: 1,
  Occupied: 2,
  Reserved: 3,
  BillRequested: 4,
  Cleaning: 5,
  Disabled: 6,
} as const;

export interface PosFloor {
  floorID: number;
  branchID: number;
  name: string;
  sortOrder: number;
}

export interface PosSection {
  sectionID: number;
  floorID: number;
  name: string;
  sortOrder: number;
}

export interface PosTable {
  tableID: number;
  sectionID: number;
  name: string;
  capacity: number;
  statusID: number; // see POS_TABLE_STATUS
  sortOrder: number;
  // Floor-plan coordinates from the dashboard's table layout editor — the
  // Tables screen positions tables absolutely at these coordinates so the
  // on-device layout matches what was arranged on the dashboard.
  shape: 'square' | 'rectangle' | 'circle';
  posX: number;
  posY: number;
  width: number;
  height: number;
  currentInvoiceID?: number | null;
  currentInvoiceCode?: string | null;
  currentOrderNumber?: number | null;
  currentInvoiceTotal?: number | null;
}

export interface PosTableLayout {
  floors: PosFloor[];
  sections: PosSection[];
  tables: PosTable[];
}

// ── Payment ──────────────────────────────────────────────────────────
export interface PaymentMethod {
  paymentMethodID: number;
  paymentMethod: string;
  isActive: boolean;
}

export interface PaymentBreakdown {
  paymentMethod: string;
  total: number;
  txCount: number;
}

// ── Order Types ──────────────────────────────────────────────────────
export interface OrderType {
  orderTypeID: number;
  name: string;
  nameAr?: string;
  sortOrder: number;
}

// ── Pending offline order ────────────────────────────────────────────
export interface PendingOrder {
  localID: string;
  shiftID: number;
  serverID: number | null;
  shiftOrderNo: number;
  orderJSON: string;
  syncStatus: 0 | 1 | 2; // 0=pending, 1=synced, 2=failed
  createdAt: string;
  syncedAt: string | null;
  errorMessage: string | null;
}

// ── API responses ────────────────────────────────────────────────────
export interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}
