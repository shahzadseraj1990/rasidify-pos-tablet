import React, { useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import ViewShot, { ViewShotRef } from 'react-native-view-shot';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation';
import { useLastReceiptStore } from '../store/lastReceiptStore';
import { useReceiptSettingsStore } from '../store/receiptSettingsStore';
import { usePrinterStore } from '../store/printerStore';
import { Colors } from '../utils/colors';
import Icon from '../components/Icon';
import { ReceiptPaper } from '../components/receipt/ReceiptPaper';
import { printReceiptNow } from '../services/receiptPrintFlow';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ReceiptPreview'>;

// Kept in the app for manual/dev use (Menu → last receipt, testing print
// settings) even though checkout no longer navigates here automatically —
// see SellScreen's onComplete, which now prints directly and shows a toast.
export default function ReceiptPreviewScreen() {
  const navigation = useNavigation<Nav>();
  const receipt = useLastReceiptStore(s => s.receipt);
  const settings = useReceiptSettingsStore();
  const printer = usePrinterStore();

  const [printing, setPrinting] = useState(false);
  const viewShotRef = useRef<ViewShotRef>(null);
  const insets = useSafeAreaInsets();

  if (!receipt) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.noReceiptText}>No receipt to display.</Text>
        <TouchableOpacity style={styles.newOrderBtn} onPress={() => navigation.navigate('Shell')}>
          <Text style={styles.newOrderBtnText}>Back to Sell</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isDetailed = settings.receiptTemplate === 'detailed';

  const handlePrint = async () => {
    if (!printer.isConfigured) {
      Alert.alert(
        'Printer Not Configured',
        'Go to Menu → Printer Setup to configure your printer.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Printer Setup', onPress: () => navigation.navigate('PrinterSetup') },
        ],
      );
      return;
    }
    setPrinting(true);
    const result = await printReceiptNow(receipt, settings, printer, viewShotRef);
    setPrinting(false);
    if (result.success) {
      Alert.alert('Printed', 'Receipt sent to printer.');
    } else {
      Alert.alert('Print Failed', result.error);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.headerRow, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>Receipt</Text>
        <Text style={styles.templateBadge}>{isDetailed ? 'Detailed' : 'Simple'}</Text>
      </View>

      <View style={styles.body}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <ViewShot ref={viewShotRef} style={styles.paper} options={{ format: 'png', quality: 1 }}>
            <ReceiptPaper receipt={receipt} settings={settings} paperWidth={printer.paperWidth} />
          </ViewShot>
        </ScrollView>

        <View style={styles.actionBar}>
          <TouchableOpacity style={styles.printBtn} onPress={handlePrint} disabled={printing} activeOpacity={0.85}>
            {printing
              ? <ActivityIndicator color="#fff" size="small" />
              : (
                <>
                  <Icon name="print" size={16} color="#fff" />
                  <Text style={styles.printBtnText}>Print Receipt</Text>
                </>
              )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.newOrderBtn} onPress={() => navigation.navigate('Shell')} activeOpacity={0.85}>
            <Text style={styles.newOrderBtnText}>New Order</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { justifyContent: 'center', alignItems: 'center', gap: 16 },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, paddingHorizontal: 24, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text },
  templateBadge: {
    fontSize: 11, fontWeight: '700', color: Colors.primary,
    backgroundColor: Colors.primaryLight, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },

  body: { flex: 1, flexDirection: 'row', padding: 24, gap: 24 },
  scroll: { alignItems: 'center', paddingBottom: 24 },

  paper: {
    backgroundColor: '#fff', borderRadius: 8, padding: 20,
    borderWidth: 1, borderColor: Colors.border,
    width: 360,
  },

  actionBar: { width: 280, gap: 12, paddingTop: 8 },
  printBtn: {
    backgroundColor: Colors.primaryDark, borderRadius: 14, height: 54,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
  },
  printBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  newOrderBtn: { backgroundColor: Colors.primary, borderRadius: 14, height: 54, justifyContent: 'center', alignItems: 'center' },
  newOrderBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  noReceiptText: { fontSize: 16, color: Colors.textMuted, fontWeight: '600' },
});
