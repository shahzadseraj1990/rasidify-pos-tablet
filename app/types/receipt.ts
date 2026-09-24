export interface PaymentEntry {
  method: string;
  amount: number;
}

export interface ReceiptItem {
  name: string;
  alternateName?: string;
  qty: number;
  price: number; // unit price (ex-VAT)
  // "Beef Burger +3, Fries, Size: Large +2, Coke" — chosen modifiers/combo
  // items for this line, printed as a smaller sub-line under the item name.
  selections?: string;
}

/** Mirrors web POS ReceiptData interface exactly */
export interface ReceiptData {
  // Order
  orderNumber: string;       // "#0001" from shiftOrderNo
  invoiceCode?: string;      // DB transaction code
  heading?: string;          // "SALE RECEIPT" | "BILL PRINT" | "DUPLICATE BILL" | "UNPAID BILL"

  // Items
  items: ReceiptItem[];

  // Totals
  subtotal:  number;
  vat:       number;
  taxRate?:  number;   // e.g. 16 for "GST (16%)"
  taxLabel?: string;   // e.g. "GST" or "VAT" — defaults to "VAT"
  discount:  number;
  total:     number;
  payments:  PaymentEntry[];
  change:    number;

  // Customer & meta
  customerName?: string;
  orderType?:    string;
  tableNo?:      string;
  time:          Date;
  cashierName?:  string;
  orderNote?:    string;

  // Company info (populated from settings or API)
  logoUrl?:     string;
  companyName?: string;
  address?:     string;
  vatNumber?:   string;
  phone?:       string;
  currency?:    string;

  // Real ZATCA Phase 2 QR (government-signed, government-verifiable), returned
  // inline on the create/invoice response when this device has an active
  // registration. Null/undefined when not registered, or signing failed/timed
  // out server-side - the receipt just prints without a QR in that case.
  zatcaQrCode?: string | null;
}

/** Receipt display + printing settings — mirrors web PosSettings receipt fields */
export interface ReceiptSettings {
  receiptTemplate:     'simple' | 'detailed';
  printMode:           'escpos' | 'image';
  autoPrintOnComplete: boolean;
  showLogoOnReceipt:   boolean;
  receiptFooter:       string;  // Bold footer line
  receiptFooterNote:   string;  // Smaller secondary footer
  socialX:             string;
  socialInstagram:     string;
  socialFb:            string;
  socialTiktok:        string;
  showPoweredBy:       boolean;
  bilingualLabels:     boolean;
  showAlternateName:   boolean;
  // Company info (configured once in Receipt Settings screen)
  companyName: string;
  address:     string;
  vatNumber:   string;
  phone:       string;
  logoUrl:     string;
}

export type PrinterType = 'network' | 'bluetooth' | 'usb' | 'sunmi';

export interface DiscoveredPrinter {
  name: string;
  host: string;
  port: number;
  via:  'mdns' | 'scan';
}

export interface UsbPrinterDevice {
  deviceName: string;
  vendorId:   number;
  productId:  number;
}

export interface PrinterSettings {
  printerType:            PrinterType;
  paperWidth:             58 | 80;
  // Network
  networkHost:            string;
  networkPort:            number;
  // Bluetooth
  bluetoothDeviceName:    string;
  bluetoothDeviceAddress: string;
  // USB
  usbDeviceName:          string;
  usbVendorId:            number;
  usbProductId:           number;
  isConfigured:           boolean;
  networkVerified:        boolean;
}

export const RECEIPT_SETTINGS_DEFAULTS: ReceiptSettings = {
  receiptTemplate:     'simple',
  printMode:           'escpos',
  autoPrintOnComplete: true,
  showLogoOnReceipt:   true,
  receiptFooter:       'Thank you for your visit!',
  receiptFooterNote:   'We look forward to seeing you again',
  socialX:             '',
  socialInstagram:     '',
  socialFb:            '',
  socialTiktok:        '',
  showPoweredBy:       true,
  bilingualLabels:     false,
  showAlternateName:   true,
  companyName:         '',
  address:             '',
  vatNumber:           '',
  phone:               '',
  logoUrl:             '',
};

export const PRINTER_SETTINGS_DEFAULTS: PrinterSettings = {
  printerType:            'network',
  paperWidth:             80,
  networkHost:            '',
  networkPort:            9100,
  bluetoothDeviceName:    '',
  bluetoothDeviceAddress: '',
  usbDeviceName:          '',
  usbVendorId:            0,
  usbProductId:           0,
  isConfigured:           false,
  networkVerified:        false,
};
