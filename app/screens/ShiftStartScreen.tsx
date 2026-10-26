import React, { useRef, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useAuthStore } from '../store/authStore';
import { useShiftStore } from '../store/shiftStore';
import { shiftService } from '../services/shiftService';
import { authService } from '../services/authService';
import { C, R } from '../theme/tokens';
import { Txt, Button, Field, Numpad } from '../components/ui';
import AuthLayout, { AuthHeading, AuthError } from '../components/auth/AuthLayout';

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

  const currency = user?.currency ?? 'SAR';
  const typeDigit = (d: string) => {
    setError('');
    setOpeningCash(prev => {
      if (d === '.' && prev.includes('.')) return prev;
      if (prev.includes('.') && prev.split('.')[1].length >= 2) return prev;
      return prev === '0' && d !== '.' ? d : prev + d;
    });
  };

  return (
    <AuthLayout
      step={3}
      facts={[
        { label: 'Cashier', value: user?.name ?? '—', tone: 'ok' },
        { label: 'Store', value: user?.companyName || '—', tone: 'ok' },
        { label: 'Status', value: 'No open shift', tone: 'warn' },
      ]}
      footerRight={<Button variant="ghost" size="sm" icon="signOut" label="Sign out" onPress={handleLogout} disabled={loading} />}
    >
      <AuthHeading title={`Good ${getGreeting().toLowerCase()}, ${user?.name?.split(' ')[0] ?? 'there'}`} subtitle="Count the cash in the drawer and open your shift." />
      <AuthError message={error} />
      <Animated.View style={[styles.cashBox, { transform: [{ translateX: shakeAnim }] }]}>
        <Txt variant="caption" weight="semibold" color={C.textMuted}>Opening cash</Txt>
        <View style={styles.cashValue}>
          <Txt variant="h3" weight="semibold" color={C.textMuted}>{currency}</Txt>
          <Txt size={44} weight="bold" style={styles.cashText}>{openingCash || '0'}</Txt>
        </View>
      </Animated.View>
      <View style={styles.presets}>
        {QUICK_AMOUNTS.map(amount => (
          <Button key={amount} variant="outline" size="sm" label={`+${amount}`} onPress={() => addQuickAmount(amount)} disabled={loading} style={styles.preset} />
        ))}
      </View>
      <Numpad outline keyHeight={52} onDigit={typeDigit} onBackspace={() => setOpeningCash(p => p.slice(0, -1) || '0')} onClear={() => setOpeningCash('0')} />
      <Field
        height={48}
        placeholder="Opening note (optional)"
        value={notes}
        onChangeText={setNotes}
        editable={!loading}
      />
      <Button size="xl" label="Open shift" iconRight="arrowRight" onPress={handleStartShift} loading={loading} />
    </AuthLayout>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

const styles = StyleSheet.create({
  cashBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderRadius: R.xxl, backgroundColor: C.bg },
  cashValue: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  cashText: { letterSpacing: -1, lineHeight: 50 },
  presets: { flexDirection: 'row', gap: 8 },
  preset: { flex: 1, paddingHorizontal: 0 },
});
