import React, { forwardRef } from 'react';
import { View, Text, StyleSheet, PixelRatio } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { ReceiptData } from '../../types/receipt';
import { PRINT_DOTS, PRINT_REF_WIDTH } from './ReceiptPaper';

// "Image Canvas" kitchen ticket — same content as KitchenTicketBuilder (web POS
// "KITCHEN ORDER" layout), captured at the print head's dot width like
// ReceiptPrintCapture. Pure black text: the capture becomes a 1-bit image.

const fmtTime = (d: Date) => d.toLocaleTimeString('en-SA', { hour: '2-digit', minute: '2-digit', hour12: true });
const fmtDate = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

export const KitchenTicketPrintCapture = forwardRef<any, { receipt: ReceiptData; paperWidth: 58 | 80; showAlternateName?: boolean }>(
  function KitchenTicketPrintCapture({ receipt, paperWidth, showAlternateName = true }, ref) {
    const widthDp = PRINT_DOTS[paperWidth] / PixelRatio.get();
    const s = ((widthDp - 4) / PRINT_REF_WIDTH) * (paperWidth <= 58 ? 1.2 : 1);
    const t = receipt.time instanceof Date ? receipt.time : new Date(receipt.time);
    const txt = (size: number, bold = false) => ({ fontSize: size * s, color: '#000', fontWeight: bold ? '700' as const : '400' as const });
    const meta: [string, string | undefined][] = [
      ['Order Type', receipt.orderType], ['Table', receipt.tableNo], ['Taken By', receipt.cashierName], ['Customer', receipt.customerName],
    ];
    return (
      <View style={styles.offscreen} pointerEvents="none">
        <ViewShot ref={ref} style={[styles.paper, { width: widthDp }]} options={{ format: 'png', quality: 1 }}>
          <View style={{ paddingVertical: 8 * s }}>
            <View style={[styles.titleBox, { paddingVertical: 4 * s, marginBottom: 8 * s }]}>
              <Text style={[txt(16, true), styles.center, { letterSpacing: 1 }]}>KITCHEN ORDER</Text>
            </View>
            <Text style={[txt(34, true), styles.center, { marginBottom: 10 * s }]}>
              {receipt.orderNumber.startsWith('#') ? receipt.orderNumber : `#${receipt.orderNumber}`}
            </Text>
            {meta.filter(([, v]) => !!v).map(([k, v]) => (
              <View key={k} style={[styles.metaRow, { paddingVertical: 3 * s }]}>
                <Text style={txt(13, true)}>{k}</Text>
                <Text style={[txt(13, true), styles.flex, styles.right]}>{v}</Text>
              </View>
            ))}
            <View style={[styles.headRow, { marginTop: 6 * s, paddingVertical: 4 * s }]}>
              <Text style={[txt(11, true), styles.flex]}>ITEM</Text>
              <Text style={txt(11, true)}>QTY</Text>
            </View>
            {receipt.items.map((it, i) => (
              <View key={i} style={[styles.itemRow, { paddingVertical: 5 * s }]}>
                <View style={styles.flex}>
                  <Text style={txt(14, true)}>{it.name}</Text>
                  {showAlternateName && it.alternateName ? <Text style={txt(14, true)}>{it.alternateName}</Text> : null}
                  {it.selections ? <Text style={txt(12)}>+ {it.selections}</Text> : null}
                  {it.note ? <Text style={txt(13, true)}>** {it.note}</Text> : null}
                </View>
                <Text style={[txt(16, true), { minWidth: 34 * s, textAlign: 'right' }]}>x{it.qty}</Text>
              </View>
            ))}
            {receipt.orderNote ? (
              <View style={[styles.note, { padding: 6 * s, marginTop: 8 * s }]}>
                <Text style={txt(13)}><Text style={txt(13, true)}>Note: </Text>{receipt.orderNote}</Text>
              </View>
            ) : null}
            <Text style={[txt(12), styles.center, { marginTop: 10 * s }]}>{fmtDate(t)}   {fmtTime(t)}</Text>
          </View>
        </ViewShot>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', left: -10000, top: 0 },
  paper: { backgroundColor: '#fff', paddingHorizontal: 2 },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  right: { textAlign: 'right' },
  titleBox: { borderWidth: 2, borderColor: '#000' },
  metaRow: { flexDirection: 'row', gap: 8, borderBottomWidth: 1, borderBottomColor: '#000' },
  headRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000' },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderBottomWidth: 1, borderBottomColor: '#000', borderStyle: 'dashed' },
  note: { borderWidth: 1, borderColor: '#000', borderStyle: 'dashed' },
});
