import React, { useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useAuthStore } from '../store/authStore';
import { useShiftStore } from '../store/shiftStore';
import { useProductStore } from '../store/productStore';
import { useSessionStore, profileFromBootstrap } from '../store/sessionStore';
import * as SecureStore from 'expo-secure-store';
import { deviceService } from '../services/deviceService';
import { shiftService } from '../services/shiftService';
import { C } from '../theme/tokens';
import { Button, Numpad } from '../components/ui';
import AuthLayout, { AuthHeading, AuthError } from '../components/auth/AuthLayout';
import { appAlert } from '../utils/appAlert';

const PASSCODE_LENGTH = 6;

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'PinLogin'> };

export default function PinLoginScreen({ navigation }: Props) {
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const shakeAnim = useRef(new Animated.Value(0)).current;

  const setUser = useAuthStore(s => s.setUser);
  const setShift = useShiftStore(s => s.setShift);
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
      // Fire-and-forget: the menu is cached for the whole session (see
      // productStore.load) so Sell never fetches it just because it remounted.
      useProductStore.getState().load().catch(() => {});
      try {
        // Already fetched inside deviceLogin — this returns the cached copy
        // (or retries once if that attempt failed). Tax + table layout are
        // applied to their stores by the session store itself.
        const boot = await useSessionStore.getState().load(user.branchID);
        const { activeShift } = boot;
        // deviceLogin falls back to default profile values (retail, SAR, no
        // company) when its bootstrap call was slow or failed. This load is the
        // retry, so take the real profile from it — otherwise a restaurant
        // loses its Tables tab until the next app restart.
        const fixed = { ...user, ...profileFromBootstrap(boot) };
        setUser(fixed);
        SecureStore.setItemAsync('pos_user', JSON.stringify(fixed)).catch(() => {});
        if (activeShift) {
          setShift(activeShift);
          navigation.replace('Shell');
          return;
        }
      } catch {
        // Bootstrap failed (e.g. cold-server timeout): check the shift
        // directly rather than assuming none is open, which would offer
        // Start New Shift and risk a duplicate shift.
        try {
          const shift = await shiftService.getActive();
          if (shift) {
            setShift(shift);
            navigation.replace('Shell');
            return;
          }
        } catch {}
      }
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
    appAlert(
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
    <AuthLayout
      step={2}
      facts={[
        { label: 'Device', value: 'Linked', tone: 'ok' },
        { label: 'Status', value: loading ? 'Signing in…' : 'Waiting for PIN', tone: 'warn' },
      ]}
      footerRight={<Button variant="ghost" size="sm" label="Switch device" onPress={handleSwitchDevice} disabled={loading} />}
    >
      <AuthHeading title="Enter your PIN" subtitle={`Enter your ${PASSCODE_LENGTH}-digit staff passcode to start your session.`} />
      <AuthError message={error} />
      <Animated.View style={[styles.dots, { transform: [{ translateX: shakeAnim }] }]}>
        {Array.from({ length: PASSCODE_LENGTH }).map((_, i) => (
          <View key={i} style={[styles.dot, i < passcode.length && styles.dotOn]} />
        ))}
      </Animated.View>
      {loading ? (
        <ActivityIndicator color={C.brand} size="large" style={styles.loader} />
      ) : (
        <Numpad outline keyHeight={64} onDigit={press} onBackspace={() => press('back')} onClear={() => { setPasscode(''); setError(''); }} />
      )}
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 14, paddingVertical: 6 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: C.border },
  dotOn: { backgroundColor: C.brand, borderColor: C.brand },
  loader: { height: 286 },
});
