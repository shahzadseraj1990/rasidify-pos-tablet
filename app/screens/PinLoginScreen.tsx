import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Animated, Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useAuthStore } from '../store/authStore';
import { useShiftStore } from '../store/shiftStore';
import { useTaxStore } from '../store/taxStore';
import { useProductStore } from '../store/productStore';
import { deviceService } from '../services/deviceService';
import { shiftService } from '../services/shiftService';
import api from '../services/api';
import { Colors } from '../utils/colors';
import Icon from '../components/Icon';
import LogoDarkBg from '../components/LogoDarkBg';

const PASSCODE_LENGTH = 6;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'PinLogin'> };

export default function PinLoginScreen({ navigation }: Props) {
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const shakeAnim = useRef(new Animated.Value(0)).current;

  const setUser = useAuthStore(s => s.setUser);
  const setShift = useShiftStore(s => s.setShift);
  const setTax = useTaxStore(s => s.setTax);
  const setDeviceAuthenticated = useAuthStore(s => s.setDeviceAuthenticated);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const press = (key: string) => {
    if (loading) return;
    if (key === 'back') {
      setPasscode(p => p.slice(0, -1));
      return;
    }
    if (!key || passcode.length >= PASSCODE_LENGTH) return;
    setError('');
    const next = passcode + key;
    setPasscode(next);
    if (next.length === PASSCODE_LENGTH) submit(next);
  };

  const submit = async (code: string) => {
    setLoading(true);
    try {
      const { user } = await deviceService.deviceLogin(code);
      setUser(user);
      try {
        const [shift, taxRes] = await Promise.all([
          shiftService.getActive(),
          api.get('/tax/all').catch(() => null),
          // Fire-and-forget: products/categories are cached for the whole
          // session (see productStore.load) so Sell never needs to fetch
          // them itself just because it remounted. Don't block login on
          // this — SellScreen shows its own loading state if it beats this.
          useProductStore.getState().load().catch(() => {}),
        ]);
        if (taxRes) {
          const taxes: any[] = Array.isArray(taxRes.data?.data)
            ? taxRes.data.data
            : Array.isArray(taxRes.data) ? taxRes.data : [];
          const active = taxes.filter((t: any) => t.status !== 0);
          const def = active.find((t: any) => t.isDefault) ?? active[0];
          if (def) setTax(def.percentageRate ?? 0, def.taxName ?? 'Tax', def.taxID ?? 0);
        }
        if (shift) {
          setShift(shift);
          navigation.replace('Shell');
          return;
        }
      } catch {}
      navigation.replace('ShiftStart');
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Invalid passcode. Please try again.';
      if (msg === 'Device not recognized.') {
        await deviceService.switchDevice();
        setDeviceAuthenticated(false);
        navigation.replace('DeviceAuthenticate');
        return;
      }
      setError(msg);
      setPasscode('');
      shake();
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchDevice = () => {
    if (loading) return;
    Alert.alert(
      'Switch Device',
      "This terminal will forget its current device link and ask for a new Device Code. An admin must disconnect the old device from the dashboard first if you want to reuse that code elsewhere.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch Device', style: 'destructive',
          onPress: async () => {
            await deviceService.switchDevice();
            setDeviceAuthenticated(false);
            navigation.replace('DeviceAuthenticate');
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.brand}>
        <LogoDarkBg width={140} />
      </View>

      <Animated.View style={[styles.card, { transform: [{ translateX: shakeAnim }] }]}>
        <View style={styles.iconCircle}>
          <Icon name="lock" size={20} color="#fff" />
        </View>
        <Text style={styles.cardTitle}>Enter Passcode</Text>
        <Text style={styles.cardSub}>Enter your 6-digit staff passcode to start your session</Text>

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.dotsRow}>
          {Array.from({ length: PASSCODE_LENGTH }).map((_, i) => (
            <View key={i} style={[styles.dot, i < passcode.length && styles.dotFilled]} />
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.primary} size="large" style={styles.loader} />
        ) : (
          <View style={styles.keypad}>
            {KEYS.map((key, i) => {
              if (key === '') return <View key={i} style={styles.key} />;
              if (key === 'back') {
                return (
                  <TouchableOpacity key={i} style={styles.key} onPress={() => press('back')} activeOpacity={0.7}>
                    <Icon name="backspace-outline" library="mci" size={20} color={Colors.textMuted} />
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity key={i} style={styles.key} onPress={() => press(key)} activeOpacity={0.7}>
                  <Text style={styles.keyText}>{key}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <TouchableOpacity style={styles.switchBtn} onPress={handleSwitchDevice} disabled={loading}>
          <Text style={styles.switchBtnText}>Switch Device</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.primaryDark, alignItems: 'center', justifyContent: 'center', padding: 24 },

  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, position: 'absolute', top: 48 },

  card: {
    width: '100%', maxWidth: 380, backgroundColor: Colors.surface, borderRadius: 20,
    paddingVertical: 32, paddingHorizontal: 28, alignItems: 'center',
  },
  iconCircle: {
    width: 52, height: 52, borderRadius: 14, backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  cardTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, marginBottom: 6, textAlign: 'center' },
  cardSub: { fontSize: 12, color: Colors.textLight, marginBottom: 20, textAlign: 'center' },

  errorBox: { backgroundColor: Colors.dangerBg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 16 },
  errorText: { color: Colors.danger, fontSize: 12, fontWeight: '600', textAlign: 'center' },

  dotsRow: { flexDirection: 'row', gap: 14, marginBottom: 24 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: Colors.border, backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: Colors.primary, borderColor: Colors.primary },

  loader: { height: 200 },

  keypad: { width: 240, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  key: {
    width: 68, height: 68, borderRadius: 34, marginBottom: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  keyText: { fontSize: 22, fontWeight: '700', color: Colors.text },

  switchBtn: { marginTop: 16, padding: 8 },
  switchBtnText: { color: Colors.textLight, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
});
