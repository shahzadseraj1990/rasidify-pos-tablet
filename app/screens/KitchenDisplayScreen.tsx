// Menu → Kitchen Display: find / connect to the KDS Local Hub on the kitchen
// tablet, see the connection, and (Phase 0) send a test ticket.
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../utils/colors';
import { SettingsPage } from '../components/ui';
import Icon from '../components/Icon';
import { useKitchenStore } from '../store/kitchenStore';
import { discoverHubs, FoundHub } from '../kds-link/KdsClient';
import { KitchenTicket, newId } from '../kds-link/protocol';
import { useAuthStore } from '../store/authStore';

const STATUS_TEXT: Record<string, { label: string; color: string }> = {
  idle: { label: 'Not connected', color: Colors.textMuted },
  connecting: { label: 'Connecting…', color: '#D97706' },
  connected: { label: 'Connected', color: '#059669' },
  offline: { label: 'Kitchen offline – retrying', color: '#DC2626' },
  rejected: { label: 'Rejected by kitchen', color: '#DC2626' },
};

export default function KitchenDisplayScreen({ embedded }: { embedded?: boolean } = {}) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const user = useAuthStore(s => s.user);
  const { status, host, hub, pending, tickets, log, connectTo, disconnect, sendTicket } = useKitchenStore();
  const [manualIp, setManualIp] = useState(host ?? '');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [found, setFound] = useState<FoundHub[] | null>(null);
  const [testCount, setTestCount] = useState(1);

  const scan = async () => {
    setScanning(true);
    setFound(null);
    setProgress(0);
    const hubs = await discoverHubs((d, t) => setProgress(Math.round((d / t) * 100)));
    setFound(hubs);
    setScanning(false);
  };

  const sendTest = () => {
    const t: KitchenTicket = {
      ticketId: newId(),
      invoiceId: null,
      orderNo: `TEST-${testCount}`,
      round: 1,
      table: 'T01',
      orderType: 'Dine In',
      staff: user?.name ?? 'Waiter',
      source: 'waiter',
      note: null,
      status: 'new',
      createdAt: Date.now(),
      items: [
        { lineKey: 'burger', productId: 1, name: 'Signature Burger', qty: 2, modifiers: ['Size: Large'], note: 'No onion', change: 'add', status: 'new' },
        { lineKey: 'fries', productId: 2, name: 'Fries', qty: 1, modifiers: [], change: 'add', status: 'new' },
      ],
    };
    sendTicket(t);
    setTestCount(c => c + 1);
  };

  const st = STATUS_TEXT[status] ?? STATUS_TEXT.idle;
  const ticketList = Object.values(tickets).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <SettingsPage title="Kitchen display" subtitle="Send orders to the KDS on this network" embedded={embedded} scroll={false}>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: st.color }]} />
            <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
          </View>
          {host ? <Text style={styles.meta}>Kitchen address: {host}{hub ? ` · ${hub.hubName}` : ''}</Text> : null}
          {pending > 0 ? <Text style={styles.meta}>{pending} message(s) waiting to be delivered</Text> : null}
          {host ? (
            <TouchableOpacity style={styles.secondaryBtn} onPress={disconnect}>
              <Text style={styles.secondaryBtnText}>Disconnect</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>Find the kitchen</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.primaryBtn} onPress={(scanning) ? undefined : scan}>
            {scanning ? <ActivityIndicator color="#fff" /> : <Icon name="search" size={14} color="#fff" />}
            <Text style={styles.primaryBtnText}>{scanning ? `Searching… ${progress}%` : 'Search network'}</Text>
          </TouchableOpacity>
          {found && found.length === 0 && <Text style={styles.meta}>No kitchen display found. Make sure the KDS app is open and on the same Wi-Fi, or enter its IP below.</Text>}
          {found?.map(f => (
            <TouchableOpacity key={f.hub.hubId + f.host} style={styles.foundRow} onPress={() => { setManualIp(f.host); connectTo(f.host); }}>
              <Icon name="tv" size={14} color={Colors.text} />
              <Text style={styles.foundName}>{f.hub.hubName}</Text>
              <Text style={styles.foundHost}>{f.host}</Text>
              <Text style={styles.foundConnect}>Connect</Text>
            </TouchableOpacity>
          ))}
          <View style={styles.ipRow}>
            <TextInput
              style={styles.ipInput}
              value={manualIp}
              onChangeText={setManualIp}
              placeholder="KDS IP address, e.g. 192.168.1.50"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.connectBtn} onPress={() => manualIp.trim() && connectTo(manualIp.trim())}>
              <Text style={styles.primaryBtnText}>Connect</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Test</Text>
        <View style={styles.card}>
          <TouchableOpacity style={[styles.primaryBtn, !host && { opacity: 0.4 }]} onPress={(!host) ? undefined : sendTest}>
            <Icon name="paper-plane" size={14} color="#fff" />
            <Text style={styles.primaryBtnText}>Send test ticket</Text>
          </TouchableOpacity>
          {ticketList.map(t => (
            <View key={t.ticketId} style={styles.ticketRow}>
              <Text style={styles.ticketId}>{t.ticketId.slice(0, 8)}</Text>
              <Text style={styles.ticketStatus}>{t.status.toUpperCase()}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Log</Text>
        <View style={styles.card}>
          {log.length === 0 && <Text style={styles.meta}>No activity yet</Text>}
          {log.map((l, i) => <Text key={i} style={styles.logLine}>{l}</Text>)}
        </View>
      </ScrollView>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text },
  body: { padding: 20, maxWidth: 720, width: '100%', alignSelf: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 22, marginBottom: 8 },
  card: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, gap: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 16, fontWeight: '800' },
  meta: { fontSize: 13, color: Colors.textLight },
  primaryBtn: { flexDirection: 'row', gap: 10, height: 48, borderRadius: 12, backgroundColor: Colors.primaryDark, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  secondaryBtn: { height: 42, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { fontSize: 14, fontWeight: '700', color: Colors.danger },
  foundRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, backgroundColor: Colors.background },
  foundName: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.text },
  foundHost: { fontSize: 12.5, color: Colors.textLight },
  foundConnect: { fontSize: 13, fontWeight: '800', color: Colors.text },
  ipRow: { flexDirection: 'row', gap: 10 },
  ipInput: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, fontSize: 14, color: Colors.text, backgroundColor: Colors.background },
  connectBtn: { paddingHorizontal: 18, height: 46, borderRadius: 12, backgroundColor: Colors.primaryDark, alignItems: 'center', justifyContent: 'center' },
  ticketRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.border },
  ticketId: { fontSize: 13, fontFamily: 'monospace', color: Colors.text },
  ticketStatus: { fontSize: 12, fontWeight: '800', color: Colors.text },
  logLine: { fontSize: 11, fontFamily: 'monospace', color: Colors.textLight },
});
