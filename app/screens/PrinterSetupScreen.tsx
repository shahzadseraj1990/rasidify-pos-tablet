import React, { useCallback, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, FlatList, Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../utils/colors';
import Icon from '../components/Icon';
import { usePrinterStore } from '../store/printerStore';
import { useReceiptSettingsStore } from '../store/receiptSettingsStore';
import { useAuthStore } from '../store/authStore';
import { DiscoveredPrinter, UsbPrinterDevice } from '../types/receipt';
import {
  printReceipt,
  scanSubnetForPrinters,
  getUsbPrinters,
  scanBluetoothDevices,
  BluetoothDevice,
} from '../services/PrinterService';
import { buildSimpleReceipt } from '../services/escpos/ReceiptBuilder';

type DiscoverStep = 'idle' | 'scanning' | 'done';

const TYPES: { key: 'network' | 'bluetooth' | 'usb' | 'sunmi'; label: string; sub: string; icon: string; iconLib?: 'mci' }[] = [
  { key: 'network', label: 'Network', sub: 'WiFi / LAN', icon: 'wifi' },
  { key: 'bluetooth', label: 'Bluetooth', sub: 'Wireless', icon: 'bluetooth-b' },
  { key: 'usb', label: 'USB', sub: 'OTG Cable', icon: 'usb', iconLib: 'mci' },
  { key: 'sunmi', label: 'Sunmi', sub: 'Built-in', icon: 'tablet-alt' },
];

export default function PrinterSetupScreen() {
  const navigation = useNavigation();
  const printer = usePrinterStore();
  const settings = useReceiptSettingsStore();
  const user = useAuthStore(s => s.user);

  const [networkHost, setNetworkHost] = useState(printer.networkHost);
  const [networkPort, setNetworkPort] = useState(String(printer.networkPort || 9100));

  const [discoverStep, setDiscoverStep] = useState<DiscoverStep>('idle');
  const [scanProgress, setScanProgress] = useState(0);
  const [discovered, setDiscovered] = useState<DiscoveredPrinter[]>([]);
  const [showDiscovery, setShowDiscovery] = useState(false);

  const [usbDevices, setUsbDevices] = useState<UsbPrinterDevice[]>([]);
  const [loadingUsb, setLoadingUsb] = useState(false);

  const [btDevices, setBtDevices] = useState<BluetoothDevice[]>([]);
  const [scanningBt, setScanningBt] = useState(false);

  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);

  const type = printer.printerType;

  const save = useCallback(() => {
    const port = parseInt(networkPort, 10);
    const configured =
      type === 'sunmi' ? true :
      type === 'network' ? networkHost.trim().length > 0 :
      type === 'bluetooth' ? printer.bluetoothDeviceAddress.length > 0 :
      type === 'usb' ? printer.usbVendorId > 0 :
      false;
    const hostChanged = type === 'network' && networkHost.trim() !== printer.networkHost;
    printer.update({
      networkHost: networkHost.trim(),
      networkPort: isNaN(port) ? 9100 : port,
      isConfigured: configured,
      ...(hostChanged ? { networkVerified: false } : {}),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [type, networkHost, networkPort, printer]);

  const handleDiscover = async () => {
    setDiscovered([]);
    setShowDiscovery(true);
    setScanProgress(0);
    setDiscoverStep('scanning');
    const results = await scanSubnetForPrinters(9100, 2500, (done) => setScanProgress(done), networkHost);
    setDiscovered(results);
    setDiscoverStep('done');
  };

  const selectDiscovered = (item: DiscoveredPrinter) => {
    setNetworkHost(item.host);
    setNetworkPort(String(item.port));
    printer.update({
      printerType: 'network',
      networkHost: item.host,
      networkPort: item.port,
      isConfigured: true,
      networkVerified: false,
    });
    setShowDiscovery(false);
  };

  const handleDisconnectNetwork = () => {
    printer.disconnectNetwork();
    setNetworkHost('');
    setNetworkPort('9100');
  };

  const handleScanUsb = async () => {
    setLoadingUsb(true);
    const devices = await getUsbPrinters();
    setUsbDevices(devices);
    setLoadingUsb(false);
    if (devices.length === 0) {
      Alert.alert('No USB Printers Found', 'Make sure the printer is connected via OTG cable.');
    }
  };

  const selectUsb = (dev: UsbPrinterDevice) => {
    printer.update({
      printerType: 'usb',
      usbDeviceName: dev.deviceName,
      usbVendorId: dev.vendorId,
      usbProductId: dev.productId,
      isConfigured: true,
    });
  };

  const handleScanBluetooth = async () => {
    setScanningBt(true);
    try {
      const devices = await scanBluetoothDevices();
      setBtDevices(devices);
      if (devices.length === 0) {
        Alert.alert('No Devices Found', 'This lists already-paired printers. Pair the printer in Android Settings first.');
      }
    } catch (e: any) {
      Alert.alert('Bluetooth Scan Failed', e.message ?? 'Unknown error');
    } finally {
      setScanningBt(false);
    }
  };

  const selectBluetooth = (dev: BluetoothDevice) => {
    printer.update({
      bluetoothDeviceName: dev.name,
      bluetoothDeviceAddress: dev.address,
      isConfigured: true,
    });
  };

  const handleTestPrint = async () => {
    save();
    setTesting(true);
    try {
      const content = await buildSimpleReceipt(
        {
          orderNumber: '#TEST',
          invoiceCode: 'TEST-001',
          heading: 'TEST PRINT',
          items: [{ name: 'Test Item', qty: 1, price: 10.00 }],
          subtotal: 10.00, vat: 1.50, discount: 0,
          total: 11.50,
          payments: [{ method: 'Cash', amount: 11.50 }],
          change: 0, time: new Date(),
          companyName: settings.companyName || user?.companyName || 'Rasidify POS',
          address: settings.address || user?.companyAddress,
          vatNumber: settings.vatNumber,
          phone: settings.phone || user?.companyPhone,
          logoUrl: user?.companyLogoUrl,
          currency: 'SAR',
        },
        settings,
        printer.paperWidth,
      );
      const config = {
        ...printer,
        networkHost: networkHost.trim(),
        networkPort: parseInt(networkPort, 10) || 9100,
        isConfigured: true,
      };
      const result = await printReceipt(content, config);
      if (result.success) {
        printer.update({ networkVerified: true });
        Alert.alert('Test Print Sent', 'Check your printer.');
      } else {
        printer.update({ networkVerified: false });
        Alert.alert('Test Failed', result.error);
      }
    } finally {
      setTesting(false);
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.body, { paddingTop: 24 + insets.top }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Icon name="chevron-left" size={14} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.title}>Printer Setup</Text>
          </View>
          <TouchableOpacity style={styles.saveBtn} onPress={save}>
            <Text style={styles.saveBtnText}>{saved ? '✓ Saved' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.columns}>
          <View style={styles.leftCol}>
            <Label>Printer Type</Label>
            <View style={styles.typeGrid}>
              {TYPES.map(t => (
                <TypeCard
                  key={t.key}
                  iconName={t.icon}
                  iconLib={t.iconLib}
                  label={t.label}
                  sub={t.sub}
                  active={type === t.key}
                  onPress={() => printer.update({ printerType: t.key })}
                />
              ))}
            </View>

            <Label>Paper Width</Label>
            <View style={styles.card}>
              <View style={styles.widthRow}>
                <WidthBtn label="58mm" value={58} current={printer.paperWidth} onPress={w => printer.update({ paperWidth: w })} />
                <WidthBtn label="80mm" value={80} current={printer.paperWidth} onPress={w => printer.update({ paperWidth: w })} />
              </View>
              <Text style={styles.widthNote}>80mm — most countertop printers. 58mm — Sunmi V2, handheld devices.</Text>
            </View>

            <TouchableOpacity style={[styles.testBtn, testing && { opacity: 0.6 }]} onPress={handleTestPrint} disabled={testing}>
              {testing
                ? <ActivityIndicator color="#fff" size="small" />
                : (
                  <>
                    <Icon name="print" size={16} color="#fff" />
                    <Text style={styles.testBtnText}>Send Test Print</Text>
                  </>
                )}
            </TouchableOpacity>
          </View>

          <View style={styles.rightCol}>
            {type === 'network' && (
              <>
                <Label>Network Printer</Label>
                <View style={styles.card}>
                  <FieldLabel>IP Address</FieldLabel>
                  <TextInput
                    style={styles.input}
                    value={networkHost}
                    onChangeText={setNetworkHost}
                    placeholder="192.168.1.100"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="numbers-and-punctuation"
                    autoCapitalize="none"
                  />
                  <FieldLabel>Port</FieldLabel>
                  <TextInput
                    style={styles.input}
                    value={networkPort}
                    onChangeText={setNetworkPort}
                    placeholder="9100"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="number-pad"
                  />

                  <TouchableOpacity style={styles.discoverBtn} onPress={handleDiscover}>
                    <Icon name="search" size={14} color="#fff" />
                    <Text style={styles.discoverText}>Discover Printers on Network</Text>
                  </TouchableOpacity>
                  <Text style={styles.discoverSub}>Sweeps all devices on your WiFi subnet on port 9100</Text>

                  {printer.networkHost ? (
                    <View style={styles.pairedRow}>
                      <View style={[styles.activeChip, !printer.networkVerified && styles.activeChipUnverified, { flex: 1 }]}>
                        <Text style={[styles.activeChipDot, !printer.networkVerified && styles.activeChipDotUnverified]}>●</Text>
                        <Text style={[styles.activeChipText, !printer.networkVerified && styles.activeChipTextUnverified]}>
                          {printer.networkHost}:{printer.networkPort}{printer.networkVerified ? '' : ' (not verified)'}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={handleDisconnectNetwork}>
                        <Text style={styles.removeText}>Disconnect</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              </>
            )}

            {type === 'bluetooth' && (
              <>
                <Label>Bluetooth Printer</Label>
                <View style={styles.card}>
                  {printer.bluetoothDeviceAddress ? (
                    <View style={styles.pairedRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pairedName}>{printer.bluetoothDeviceName || 'Paired Printer'}</Text>
                        <Text style={styles.pairedAddr}>{printer.bluetoothDeviceAddress}</Text>
                      </View>
                      <TouchableOpacity onPress={() => printer.update({ bluetoothDeviceName: '', bluetoothDeviceAddress: '', isConfigured: false })}>
                        <Text style={styles.removeText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  <TouchableOpacity style={styles.scanBtn} onPress={handleScanBluetooth} disabled={scanningBt}>
                    {scanningBt
                      ? <ActivityIndicator color={Colors.primary} size="small" />
                      : (
                        <>
                          <Icon name="bluetooth-b" size={14} color={Colors.primary} />
                          <Text style={styles.scanBtnText}>Scan for Bluetooth Printers</Text>
                        </>
                      )}
                  </TouchableOpacity>

                  {btDevices.map((dev, idx) => (
                    <TouchableOpacity
                      key={dev.address ? `${dev.address}-${idx}` : idx}
                      style={[styles.deviceRow, printer.bluetoothDeviceAddress === dev.address && styles.deviceRowActive]}
                      onPress={() => selectBluetooth(dev)}
                    >
                      <Icon name="bluetooth-b" size={16} color={Colors.primary} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.deviceRowName}>{dev.name}</Text>
                        <Text style={styles.deviceRowSub}>{dev.address}</Text>
                      </View>
                      {printer.bluetoothDeviceAddress === dev.address
                        ? <Icon name="check" size={14} color={Colors.primary} />
                        : <Icon name="chevron-right" size={13} color={Colors.textMuted} />}
                    </TouchableOpacity>
                  ))}

                  <InfoBox>Requires a paired Bluetooth thermal printer. Pair it in Android Settings first, then scan.</InfoBox>
                </View>
              </>
            )}

            {type === 'usb' && (
              <>
                <Label>USB Printer (OTG)</Label>
                <View style={styles.card}>
                  {printer.usbVendorId > 0 ? (
                    <View style={styles.pairedRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pairedName}>{printer.usbDeviceName || 'USB Printer'}</Text>
                        <Text style={styles.pairedAddr}>VendorID: {printer.usbVendorId}  ProductID: {printer.usbProductId}</Text>
                      </View>
                      <TouchableOpacity onPress={() => printer.update({ usbDeviceName: '', usbVendorId: 0, usbProductId: 0, isConfigured: false })}>
                        <Text style={styles.removeText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  <TouchableOpacity style={styles.scanBtn} onPress={handleScanUsb} disabled={loadingUsb}>
                    {loadingUsb
                      ? <ActivityIndicator color={Colors.primary} size="small" />
                      : (
                        <>
                          <Icon name="usb" library="mci" size={16} color={Colors.primary} />
                          <Text style={styles.scanBtnText}>Scan for USB Printers</Text>
                        </>
                      )}
                  </TouchableOpacity>

                  {usbDevices.map((dev, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[
                        styles.deviceRow,
                        printer.usbVendorId === dev.vendorId && printer.usbProductId === dev.productId && styles.deviceRowActive,
                      ]}
                      onPress={() => selectUsb(dev)}
                    >
                      <Icon name="print" size={16} color={Colors.primaryDark} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.deviceRowName}>{dev.deviceName}</Text>
                        <Text style={styles.deviceRowSub}>VID:{dev.vendorId}  PID:{dev.productId}</Text>
                      </View>
                      {printer.usbVendorId === dev.vendorId
                        ? <Icon name="check" size={14} color={Colors.primary} />
                        : <Icon name="chevron-right" size={13} color={Colors.textMuted} />}
                    </TouchableOpacity>
                  ))}

                  <InfoBox>Connect your thermal printer via a USB OTG adapter. Android will prompt for USB permission on first connect.</InfoBox>
                </View>
              </>
            )}

            {type === 'sunmi' && (
              <>
                <Label>Sunmi Built-in Printer</Label>
                <View style={styles.card}>
                  <InfoBox>
                    Sunmi devices (T2, V2, P2, etc.) have a built-in thermal printer — no extra hardware needed, it prints directly.
                  </InfoBox>
                </View>
              </>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal visible={showDiscovery} transparent animationType="fade" onRequestClose={() => { setShowDiscovery(false); setDiscoverStep('idle'); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Discover Printers</Text>
              <TouchableOpacity onPress={() => setShowDiscovery(false)}>
                <Icon name="times" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {discoverStep === 'scanning' && (
              <View style={styles.progressRow}>
                <ActivityIndicator color={Colors.primary} size="small" />
                <Text style={styles.progressText}>Scanning subnet… {scanProgress}/254 hosts</Text>
              </View>
            )}
            {discoverStep === 'done' && discovered.length === 0 && (
              <View style={styles.emptyBox}>
                <Icon name="search" size={28} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No printers found on this network.</Text>
                <Text style={styles.emptySub}>Make sure the printer is on and connected to the same WiFi, then enter the IP manually.</Text>
              </View>
            )}

            <FlatList
              data={discovered}
              keyExtractor={(item, i) => `${item.host}-${i}`}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.deviceRow} onPress={() => selectDiscovered(item)}>
                  <Icon name="print" size={16} color={Colors.primaryDark} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.deviceRowName}>{item.name}</Text>
                    <Text style={styles.deviceRowSub}>{item.host}:{item.port}</Text>
                  </View>
                  <Icon name="chevron-right" size={13} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            />

            {discoverStep === 'done' && (
              <TouchableOpacity style={styles.rescanBtn} onPress={handleDiscover}>
                <Icon name="redo" size={13} color={Colors.primaryDark} />
                <Text style={styles.rescanText}>Scan Again</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Label({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}
function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}
function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.infoBox}>
      <Text style={styles.infoText}>{children}</Text>
    </View>
  );
}
function TypeCard({ iconName, iconLib, label, sub, active, onPress }: {
  iconName: string; iconLib?: 'mci'; label: string; sub: string; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.typeCard, active && styles.typeCardActive]} onPress={onPress}>
      {active && (
        <View style={styles.typeCheck}>
          <Icon name="check" size={8} color="#fff" />
        </View>
      )}
      <Icon name={iconName} library={iconLib === 'mci' ? 'mci' : 'fa5'} size={20} color={active ? Colors.primary : Colors.textMuted} />
      <Text style={[styles.typeLabel, active && { color: Colors.primary }]}>{label}</Text>
      <Text style={[styles.typeSub, active && { color: Colors.primary }]}>{sub}</Text>
    </TouchableOpacity>
  );
}
function WidthBtn({ label, value, current, onPress }: {
  label: string; value: 58 | 80; current: 58 | 80; onPress: (v: 58 | 80) => void;
}) {
  const active = current === value;
  return (
    <TouchableOpacity style={[styles.widthBtn, active && styles.widthBtnActive]} onPress={() => onPress(value)}>
      <Text style={[styles.widthBtnText, active && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  body: { padding: 24, paddingBottom: 48, maxWidth: 1100, width: '100%', alignSelf: 'center' },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9 },
  saveBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  columns: { flexDirection: 'row', gap: 24, marginTop: 12 },
  leftCol: { flex: 1 },
  rightCol: { flex: 1.3 },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 20, marginBottom: 8 },

  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 10 },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeCard: { width: '47%', backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border, padding: 14, alignItems: 'center', gap: 4, position: 'relative' },
  typeCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  typeCheck: { position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  typeLabel: { fontSize: 13, fontWeight: '700', color: Colors.text },
  typeSub: { fontSize: 10, color: Colors.textMuted, fontWeight: '500' },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: Colors.text },

  discoverBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.primaryDark, borderRadius: 14, height: 48, marginTop: 6 },
  discoverText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  discoverSub: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: 6 },

  activeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.successBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  activeChipDot: { fontSize: 10, color: Colors.success },
  activeChipText: { fontSize: 12, fontWeight: '700', color: Colors.success },
  activeChipUnverified: { backgroundColor: Colors.warningBg },
  activeChipDotUnverified: { color: Colors.warning },
  activeChipTextUnverified: { color: Colors.warning },

  scanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 12, paddingVertical: 12, backgroundColor: Colors.primaryLight },
  scanBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  pairedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.primaryLight, borderRadius: 12, padding: 12 },
  pairedName: { fontSize: 14, fontWeight: '700', color: Colors.primaryDark },
  pairedAddr: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  removeText: { fontSize: 12, fontWeight: '700', color: Colors.danger },

  deviceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  deviceRowActive: { backgroundColor: Colors.primaryLight, borderRadius: 10, paddingHorizontal: 8 },
  deviceRowName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  deviceRowSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  infoBox: { backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 12 },
  infoText: { fontSize: 11, color: Colors.textLight, lineHeight: 17 },

  widthRow: { flexDirection: 'row', gap: 10 },
  widthBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center' },
  widthBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  widthBtnText: { fontSize: 14, fontWeight: '700', color: Colors.textLight },
  widthNote: { fontSize: 11, color: Colors.textMuted, lineHeight: 16 },

  testBtn: { backgroundColor: Colors.primaryDark, borderRadius: 14, height: 52, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 20 },
  testBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center' },
  modalCard: { width: 480, maxWidth: '92%', backgroundColor: Colors.surface, borderRadius: 20, padding: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  progressText: { fontSize: 13, color: Colors.textLight, fontWeight: '600' },

  emptyBox: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 14, fontWeight: '700', color: Colors.text },
  emptySub: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },

  rescanBtn: { marginTop: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, backgroundColor: Colors.background },
  rescanText: { fontSize: 14, fontWeight: '700', color: Colors.primaryDark },
});
