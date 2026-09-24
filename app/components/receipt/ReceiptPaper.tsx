import React, { useContext, useMemo, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Config from '../../config';
import { Colors } from '../../utils/colors';
import Money from '../Money';
import { ReceiptData, ReceiptSettings } from '../../types/receipt';
import ZatcaQrCode from '../common/ZatcaQrCode';

// Shared between ReceiptPreviewScreen (visible, printable via Image Canvas
// mode) and SellScreen's hidden print-capture mount (invisible, only used so
// Image Canvas mode has something to screenshot without showing a preview
// screen). Keep both callers' visuals identical — this is the one source of
// truth for what a receipt looks like on-screen/in an Image Canvas printout.

const fmtDate = (d: Date) => d.toLocaleDateString('en-SA', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtTime = (d: Date) => d.toLocaleTimeString('en-SA', { hour: '2-digit', minute: '2-digit' });
const fmtOrder = (n: string) => n.startsWith('#') ? n : `#${n.padStart(4, '0')}`;

const API_ORIGIN = Config.API_URL.replace(/\/api\/?$/, '');
const resolveLogoUri = (url?: string): string | undefined => {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}/${url.replace(/^\/+/, '')}`;
};

export function ReceiptPaper({
  receipt, settings, paperWidth = 80,
}: {
  receipt: ReceiptData;
  settings: ReceiptSettings;
  paperWidth?: 58 | 80;
}) {
  const cur = receipt.currency || 'SAR';
  const detailed = settings.receiptTemplate === 'detailed';
  const phone = settings.phone || receipt.phone;
  const logoUri = resolveLogoUri(settings.logoUrl || receipt.logoUrl);
  const [logoFailed, setLogoFailed] = useState(false);
  const rStyles = useMemo(() => createReceiptStyles(paperWidth <= 58 ? 1.2 : 1), [paperWidth]);
  return (
    <RStylesContext.Provider value={rStyles}>
      <ReceiptPaperContent
        receipt={receipt} settings={settings} cur={cur} detailed={detailed}
        phone={phone} logoUri={logoUri} logoFailed={logoFailed} setLogoFailed={setLogoFailed}
      />
    </RStylesContext.Provider>
  );
}

function ReceiptPaperContent({
  receipt, settings, cur, detailed, phone, logoUri, logoFailed, setLogoFailed,
}: {
  receipt: ReceiptData;
  settings: ReceiptSettings;
  cur: string;
  detailed: boolean;
  phone?: string;
  logoUri?: string;
  logoFailed: boolean;
  setLogoFailed: (v: boolean) => void;
}) {
  const rStyles = useContext(RStylesContext);

  return (
    <View style={rStyles.root}>
      <View style={rStyles.storeHeader}>
        {settings.showLogoOnReceipt && (
          logoUri && !logoFailed ? (
            <Image source={{ uri: logoUri }} style={rStyles.logoImage} resizeMode="contain" onError={() => setLogoFailed(true)} />
          ) : (
            <View style={rStyles.logoPlaceholder}>
              <Text style={rStyles.logoText}>{(settings.companyName || receipt.companyName || 'STORE').charAt(0).toUpperCase()}</Text>
            </View>
          )
        )}
        <Text style={rStyles.storeName}>{settings.companyName || receipt.companyName || ''}</Text>
        {(settings.address || receipt.address) ? <Text style={rStyles.storeMeta}>{settings.address || receipt.address}</Text> : null}
        {(settings.vatNumber || receipt.vatNumber) ? <Text style={rStyles.storeMeta}>VAT# {settings.vatNumber || receipt.vatNumber}</Text> : null}
        {detailed && phone ? <Text style={rStyles.storeMeta}>Phone No: {phone}</Text> : null}
      </View>

      {receipt.heading ? (
        <>
          <Text style={rStyles.heading}>{receipt.heading.toUpperCase()}</Text>
          <Dashes />
        </>
      ) : null}

      <Text style={rStyles.orderNumber}>{fmtOrder(receipt.orderNumber)}</Text>

      <View style={rStyles.metaBox}>
        {receipt.customerName ? <MetaRow label="Customer Name" value={receipt.customerName} /> : null}
        <MetaRow label="Date" value={`${fmtTime(receipt.time)} ${fmtDate(receipt.time)}`} />
        {receipt.orderType ? <MetaRow label="Order Type" value={receipt.orderType} /> : null}
        {receipt.tableNo ? <MetaRow label="Table" value={receipt.tableNo} /> : null}
        {receipt.cashierName ? <MetaRow label={detailed ? 'Served By' : 'Order Taker'} value={receipt.cashierName} /> : null}
      </View>

      <Dashes />

      {detailed
        ? <DetailedItems items={receipt.items} settings={settings} cur={cur} />
        : <SimpleItems items={receipt.items} settings={settings} cur={cur} />}

      <Dashes />

      <View style={rStyles.totals}>
        {receipt.discount > 0 && (
          <TotalRow label={bilabel('Discount', 'خصم', settings.bilingualLabels)} value={<Money amount={receipt.discount} currency={cur} prefix="-" style={[rStyles.totalValue, { color: Colors.danger }]} />} valueColor={Colors.danger} />
        )}
        <TotalRow label={bilabel('Sub Total', 'المجموع', settings.bilingualLabels)} value={<Money amount={receipt.subtotal} currency={cur} style={rStyles.totalValue} />} />
        {receipt.vat > 0 && (
          <TotalRow
            label={bilabel(receipt.taxRate != null ? `${receipt.taxLabel || 'VAT'} (${receipt.taxRate}%)` : (receipt.taxLabel || 'VAT'), 'ضريبة', settings.bilingualLabels)}
            value={<Money amount={receipt.vat} currency={cur} style={rStyles.totalValue} />}
          />
        )}
        <Dashes />
        <TotalRow label={bilabel('Grand Total', 'الإجمالي', settings.bilingualLabels)} value={<Money amount={receipt.total} currency={cur} style={rStyles.totalValue} />} bold large />
        {receipt.payments.map((pay, i) => (
          <TotalRow key={i} label={`Payment - ${pay.method}`} value={<Money amount={pay.amount} currency={cur} style={rStyles.totalValue} />} />
        ))}
        {receipt.change > 0 && <TotalRow label="Change" value={<Money amount={receipt.change} currency={cur} style={[rStyles.totalValue, { color: Colors.success }]} />} valueColor={Colors.success} />}
      </View>

      {receipt.orderNote ? (
        <View style={rStyles.noteBox}>
          <Text style={rStyles.noteLabel}>Note:</Text>
          <Text style={rStyles.noteText}>{receipt.orderNote}</Text>
        </View>
      ) : null}

      <Dashes />

      {receipt.zatcaQrCode ? (
        <View style={rStyles.qrBox}>
          <ZatcaQrCode value={receipt.zatcaQrCode} size={180} />
        </View>
      ) : null}

      <View style={rStyles.footer}>
        <Text style={rStyles.footerBold}>{settings.receiptFooter || 'Thank you for your visit!'}</Text>
        {!detailed && phone ? <Text style={rStyles.footerSmall}>Phone No: {phone}</Text> : null}
        {receipt.invoiceCode ? <Text style={rStyles.footerSmall}>Transaction# {receipt.invoiceCode}</Text> : null}
        {settings.receiptFooterNote ? <Text style={rStyles.footerSmall}>{settings.receiptFooterNote}</Text> : null}
        {settings.showPoweredBy && <Text style={rStyles.poweredBy}>Powered by Rasidify</Text>}
      </View>
    </View>
  );
}

function Dashes() {
  const rStyles = useContext(RStylesContext);
  return <View style={rStyles.divider} />;
}
function MetaRow({ label, value }: { label: string; value: string }) {
  const rStyles = useContext(RStylesContext);
  return (
    <View style={rStyles.metaRow}>
      <Text style={rStyles.metaLabel}>{label}:</Text>
      <Text style={rStyles.metaValue}>{value}</Text>
    </View>
  );
}
function SimpleItems({ items, settings, cur }: { items: ReceiptData['items']; settings: ReceiptSettings; cur: string }) {
  const rStyles = useContext(RStylesContext);
  return (
    <View>
      {items.map((item, i) => (
        <View key={i}>
          <View style={rStyles.itemRow}>
            <Text style={rStyles.itemName} numberOfLines={2}>{item.qty} x {item.name}</Text>
            <Money amount={item.qty * item.price} currency={cur} style={rStyles.itemAmt} />
          </View>
          {settings.showAlternateName && item.alternateName ? <Text style={rStyles.itemAltName}>{item.alternateName}</Text> : null}
          {item.selections ? <Text style={rStyles.itemAltName}>{item.selections}</Text> : null}
        </View>
      ))}
    </View>
  );
}
function DetailedItems({ items, settings, cur }: { items: ReceiptData['items']; settings: ReceiptSettings; cur: string }) {
  const rStyles = useContext(RStylesContext);
  const fs = rStyles.fontScale;
  return (
    <View>
      <View style={rStyles.detailedHeader}>
        <Text style={[rStyles.detailedHeaderText, { width: 28 }]}>Qty</Text>
        <Text style={[rStyles.detailedHeaderText, { flex: 1 }]}>Item</Text>
        <Text style={[rStyles.detailedHeaderText, { width: 56, textAlign: 'right' }]}>Rate</Text>
        <Text style={[rStyles.detailedHeaderText, { width: 64, textAlign: 'right' }]}>Amt</Text>
      </View>
      <Dashes />
      {items.map((item, i) => (
        <View key={i} style={rStyles.detailedRow}>
          <Text style={{ width: 28, fontSize: 13 * fs, color: Colors.text }}>{item.qty}</Text>
          <View style={{ flex: 1 }}>
            <Text style={rStyles.detailedName} numberOfLines={2}>{item.name}</Text>
            {settings.showAlternateName && item.alternateName ? <Text style={rStyles.detailedAlt}>{item.alternateName}</Text> : null}
            {item.selections ? <Text style={rStyles.detailedAlt}>{item.selections}</Text> : null}
          </View>
          <Text style={{ width: 56, fontSize: 13 * fs, color: Colors.textLight, textAlign: 'right' }}>{item.price.toFixed(2)}</Text>
          <Text style={{ width: 64, fontSize: 13 * fs, fontWeight: '700', color: Colors.text, textAlign: 'right' }}>{(item.qty * item.price).toFixed(2)}</Text>
        </View>
      ))}
    </View>
  );
}
function TotalRow({ label, value, bold, large, valueColor }: { label: string; value: React.ReactNode; bold?: boolean; large?: boolean; valueColor?: string }) {
  const rStyles = useContext(RStylesContext);
  const fs = rStyles.fontScale;
  return (
    <View style={rStyles.totalRow}>
      <Text style={[rStyles.totalLabel, bold && { fontWeight: '800', fontSize: (large ? 16 : 14) * fs, color: Colors.text }]}>{label}</Text>
      <Text style={[rStyles.totalValue, bold && { fontWeight: '900', fontSize: (large ? 17 : 14) * fs }, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  );
}
function bilabel(en: string, ar: string, bilingual: boolean) {
  return bilingual ? `${en} / ${ar}` : en;
}

const createReceiptStyles = (fs: number) => ({
  fontScale: fs,
  ...StyleSheet.create({
    root: { gap: 0 },
    storeHeader: { alignItems: 'center', paddingVertical: 8, gap: 3 },
    logoPlaceholder: { width: 52 * fs, height: 52 * fs, borderRadius: 26 * fs, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
    logoText: { fontSize: 22 * fs, fontWeight: '900', color: '#fff' },
    logoImage: { width: 52 * fs, height: 52 * fs, borderRadius: 8, marginBottom: 6 },
    storeName: { fontSize: 17 * fs, fontWeight: '800', color: '#000', textAlign: 'center' },
    storeMeta: { fontSize: 13 * fs, color: '#333', textAlign: 'center' },
    divider: { height: 1, backgroundColor: '#555', marginVertical: 8 },
    heading: { fontSize: 15 * fs, fontWeight: '800', color: '#000', textAlign: 'center', letterSpacing: 1 },
    orderNumber: { fontSize: 36 * fs, fontWeight: '900', color: '#000', textAlign: 'center', letterSpacing: 2, marginVertical: 6 },
    metaBox: { gap: 3, marginVertical: 4 },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1 },
    metaLabel: { fontSize: 12 * fs, color: '#444', fontWeight: '600', flex: 1 },
    metaValue: { fontSize: 12 * fs, color: '#000', fontWeight: '700', flex: 1.4, textAlign: 'right' },
    itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 7 },
    itemName: { fontSize: 13 * fs, color: '#000', fontWeight: '600', flex: 1, paddingRight: 6 },
    itemAmt: { fontSize: 13 * fs, color: '#000', fontWeight: '700', minWidth: 70, textAlign: 'right' },
    itemAltName: { fontSize: 11 * fs, color: '#555', marginLeft: 12, marginBottom: 7 },
    detailedHeader: { flexDirection: 'row', paddingBottom: 2 },
    detailedHeaderText: { fontSize: 12 * fs, fontWeight: '800', color: '#000' },
    detailedRow: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 7, gap: 0 },
    detailedName: { fontSize: 13 * fs, color: '#000', fontWeight: '600' },
    detailedAlt: { fontSize: 11 * fs, color: '#555', marginBottom: 7 },
    totals: { gap: 2, marginVertical: 4 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
    totalLabel: { fontSize: 13 * fs, color: '#333', fontWeight: '500', flex: 1 },
    totalValue: { fontSize: 13 * fs, color: '#000', fontWeight: '700', textAlign: 'right' },
    noteBox: { backgroundColor: '#f9f9f9', borderRadius: 4, borderWidth: 1, borderColor: '#ddd', borderStyle: 'dashed', padding: 6, marginTop: 4 },
    qrBox: { alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
    noteLabel: { fontSize: 12 * fs, fontWeight: '800', color: '#000' },
    noteText: { fontSize: 12 * fs, color: '#333', marginTop: 2 },
    footer: { alignItems: 'center', gap: 3, paddingTop: 4 },
    footerBold: { fontSize: 14 * fs, fontWeight: '800', color: '#000', textAlign: 'center' },
    footerSmall: { fontSize: 12 * fs, color: '#444', textAlign: 'center' },
    poweredBy: { fontSize: 13 * fs, color: '#999', marginTop: 4, textAlign: 'center' },
  }),
});

const RStylesContext = React.createContext(createReceiptStyles(1));
