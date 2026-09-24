import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Animated,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation';
import { useAuthStore } from '../store/authStore';
import { useShiftStore } from '../store/shiftStore';
import { shiftService } from '../services/shiftService';
import { authService } from '../services/authService';
import { Colors } from '../utils/colors';
import Icon from '../components/Icon';
import Money from '../components/Money';
import RiyalIcon from '../components/RiyalIcon';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'ShiftStart'> };

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

export default function ShiftStartScreen({ navigation }: Props) {
  const [openingCash, setOpeningCash] = useState('0');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const user = useAuthStore(s => s.user);
  const clearAuth = useAuthStore(s => s.clearAuth);
  const setShift = useShiftStore(s => s.setShift);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const addQuickAmount = (amount: number) => {
    const current = parseFloat(openingCash) || 0;
    setOpeningCash(String(current + amount));
  };

  const handleStartShift = async () => {
    const cash = parseFloat(openingCash);
    if (isNaN(cash) || cash < 0) {
      setError('Please enter a valid opening cash amount.');
      shake();
      return;
    }
    setError('');
    setLoading(true);
    try {
      await shiftService.start({
        branchID: user?.branchID ?? null,
        openingCash: cash,
        openingNotes: notes.trim() || undefined,
      });
      const shift = await shiftService.getActive();
      setShift(shift ?? null);
      navigation.replace('Shell');
    } catch (err: any) {
      const d = err?.response?.data;
      const msg = d?.message ?? d?.Message ?? d?.error ?? d?.Error
        ?? err?.message
        ?? `Server error ${err?.response?.status ?? ''}`.trim();
      setError(msg || 'Failed to start shift. Please try again.');
      shake();
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await authService.logout();
    clearAuth();
    navigation.replace('PinLogin');
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <View>
          <Text style={styles.greeting}>Good {getGreeting()},</Text>
          <Text style={styles.cashierName}>{user?.name ?? 'Cashier'}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.card, { transform: [{ translateX: shakeAnim }] }]}>
          <View style={styles.iconCircle}>
            <Icon name="cash-register" size={22} color="#fff" />
          </View>

          <Text style={styles.cardTitle}>Start New Shift</Text>
          <Text style={styles.cardSub}>Enter your opening cash balance to begin</Text>

          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.row}>
            <View style={styles.cashSection}>
              <Text style={styles.label}>Opening Cash ({user?.currency ?? 'SAR'})</Text>
              <View style={styles.cashInputWrap}>
                {(user?.currency ?? 'SAR') === 'SAR'
                  ? <RiyalIcon size={14} color={Colors.primary} style={{ marginRight: 10 }} />
                  : <Text style={styles.sarSymbol}>{user?.currency ?? 'SAR'}</Text>}
                <TextInput
                  style={styles.cashInput}
                  value={openingCash}
                  onChangeText={t => { setOpeningCash(t.replace(/[^0-9.]/g, '')); setError(''); }}
                  keyboardType="decimal-pad"
                  placeholderTextColor={Colors.textMuted}
                  selectionColor={Colors.primary}
                  editable={!loading}
                />
              </View>
              <Money amount={parseFloat(openingCash) || 0} currency={user?.currency ?? 'SAR'} style={styles.cashFormatted} />

              <Text style={[styles.label, { marginTop: 20 }]}>Quick Add</Text>
              <View style={styles.quickGrid}>
                {QUICK_AMOUNTS.map(amount => (
                  <TouchableOpacity key={amount} style={styles.quickBtn} onPress={() => addQuickAmount(amount)} disabled={loading}>
                    <Text style={styles.quickBtnText}>+{amount}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={() => setOpeningCash('0')} style={styles.clearBtn} disabled={loading}>
                <Text style={styles.clearBtnText}>Clear Amount</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.notesSection}>
              <Text style={styles.label}>Opening Notes (Optional)</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="e.g. Received cash from manager..."
                placeholderTextColor={Colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
                editable={!loading}
                selectionColor={Colors.primary}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.startBtn, loading && styles.startBtnDisabled]}
            onPress={handleStartShift}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#ffffff" size="small" />
              : (
                <>
                  <Text style={styles.startBtnText}>Start Shift</Text>
                  <Money amount={parseFloat(openingCash) || 0} currency={user?.currency ?? 'SAR'} style={styles.startBtnAmount} />
                </>
              )}
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 32, paddingVertical: 20,
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  greeting: { fontSize: 13, color: Colors.textLight, fontWeight: '500' },
  cashierName: { fontSize: 20, fontWeight: '800', color: Colors.text, marginTop: 2 },
  logoutBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.surfaceAlt,
  },
  logoutText: { fontSize: 13, color: Colors.textLight, fontWeight: '600' },

  scroll: { flexGrow: 1, alignItems: 'center', padding: 32 },

  card: {
    width: '100%', maxWidth: 720, backgroundColor: Colors.surface, borderRadius: 20, padding: 32,
  },
  iconCircle: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  cardTitle: { fontSize: 22, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  cardSub: { fontSize: 13, color: Colors.textLight, marginBottom: 24 },

  errorBox: { backgroundColor: Colors.dangerBg, borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText: { color: Colors.danger, fontSize: 13, fontWeight: '600' },

  row: { flexDirection: 'row', gap: 32 },
  cashSection: { flex: 1 },
  label: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  cashInputWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background,
    borderRadius: 14, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: 16, height: 64,
  },
  sarSymbol: { fontSize: 14, color: Colors.primary, marginRight: 10, fontWeight: '700' },
  cashInput: { flex: 1, fontSize: 28, fontWeight: '800', color: Colors.text },
  cashFormatted: { fontSize: 13, color: Colors.textMuted, marginTop: 6, marginLeft: 4 },

  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickBtn: {
    backgroundColor: Colors.background, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.border, minWidth: '30%', alignItems: 'center',
  },
  quickBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  clearBtn: { alignSelf: 'flex-end', marginTop: 8, padding: 4 },
  clearBtnText: { fontSize: 12, color: Colors.textMuted, fontWeight: '600', textDecorationLine: 'underline' },

  notesSection: { flex: 1 },
  notesInput: {
    backgroundColor: Colors.background, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border,
    padding: 14, fontSize: 14, color: Colors.text, minHeight: 140, textAlignVertical: 'top',
  },

  startBtn: {
    marginTop: 28, backgroundColor: Colors.primaryDark, borderRadius: 14, height: 56,
    justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 12,
  },
  startBtnDisabled: { opacity: 0.7 },
  startBtnText: { fontSize: 16, fontWeight: '800', color: '#ffffff' },
  startBtnAmount: { fontSize: 14, fontWeight: '700', color: '#ffffff', opacity: 0.85 },
});
