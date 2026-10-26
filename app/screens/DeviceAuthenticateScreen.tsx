import React, { useRef, useState } from 'react';
import { View, TextInput, StyleSheet, Animated } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useAuthStore } from '../store/authStore';
import { deviceService } from '../services/deviceService';
import { C, F, R } from '../theme/tokens';
import { Txt, Glyph, Button } from '../components/ui';
import AuthLayout, { AuthHeading, AuthError } from '../components/auth/AuthLayout';
import { applyDevBypass } from '../utils/devBypass';

const CODE_LENGTH = 8;

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'DeviceAuthenticate'> };

export default function DeviceAuthenticateScreen({ navigation }: Props) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const inputs = useRef<Array<TextInput | null>>([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;
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

  const fillFrom = (startIndex: number, raw: string) => {
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const next = [...digits];
    let i = startIndex;
    for (const ch of clean) {
      if (i >= CODE_LENGTH) break;
      next[i] = ch;
      i++;
    }
    setDigits(next);
    inputs.current[Math.min(i, CODE_LENGTH - 1)]?.focus();
  };

  const onChangeDigit = (index: number, raw: string) => {
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length > 1) { fillFrom(index, clean); return; }
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    if (clean && index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const onKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      inputs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async () => {
    const code = digits.join('');
    if (code.length < CODE_LENGTH) {
      setError('Please enter the full device code.');
      shake();
      return;
    }
    setError('');
    setLoading(true);
    try {
      await deviceService.authenticateDevice(code);
      setDeviceAuthenticated(true);
      navigation.replace('PinLogin');
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Invalid device code. Please try again.';
      setError(msg);
      shake();
    } finally {
      setLoading(false);
    }
  };

  const handleDevSkip = () => {
    applyDevBypass();
    navigation.replace('Shell');
  };

  const complete = digits.every(Boolean);

  return (
    <AuthLayout
      step={1}
      facts={[
        { label: 'Branch', value: '—', tone: 'muted' },
        { label: 'Device', value: '—', tone: 'muted' },
        { label: 'Status', value: 'Not linked yet', tone: 'warn' },
      ]}
    >
      <AuthHeading
        title="Link this device"
        subtitle="Enter the 8-character code from your Rasidify dashboard to connect this terminal to your branch. You only do this once."
      />
      <AuthError message={error} />
      <Animated.View style={[styles.field, { transform: [{ translateX: shakeAnim }] }]}>
        <Txt variant="caption" weight="semibold">Device code</Txt>
        <View style={styles.codeRow}>
          {digits.map((d, i) => (
            <React.Fragment key={i}>
              {i === CODE_LENGTH / 2 ? <Txt variant="h2" style={styles.dash}>-</Txt> : null}
              <TextInput
                ref={el => { inputs.current[i] = el; }}
                style={[styles.codeBox, d ? styles.codeBoxFilled : null]}
                value={d}
                onChangeText={t => onChangeDigit(i, t)}
                onKeyPress={e => onKeyPress(i, e.nativeEvent.key)}
                maxLength={CODE_LENGTH}
                autoCapitalize="characters"
                autoCorrect={false}
                selectionColor={C.brand}
                editable={!loading}
              />
            </React.Fragment>
          ))}
        </View>
      </Animated.View>
      <View style={styles.hint}>
        <Glyph name="info" size={18} color={C.brand} strokeWidth={2} />
        <Txt variant="caption" color={C.textMuted} style={styles.flex}>Find it in Rasidify dashboard → Settings → Devices → Add device.</Txt>
      </View>
      <Button size="xl" label="Link device" iconRight="arrowRight" onPress={handleSubmit} loading={loading} disabled={!complete} />
      {__DEV__ && (
        <Button variant="ghost" label="Skip to Sell Screen (Dev)" onPress={handleDevSkip} />
      )}
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  field: { gap: 8 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dash: { width: 14, textAlign: 'center' },
  codeBox: {
    flex: 1, height: 60, borderRadius: R.md, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface,
    color: C.text, fontSize: 22, fontFamily: F.bold, textAlign: 'center', paddingVertical: 0,
  },
  codeBoxFilled: { borderColor: C.brand },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: R.md, backgroundColor: C.bg },
});
