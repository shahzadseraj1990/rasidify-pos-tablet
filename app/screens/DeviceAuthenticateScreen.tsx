import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Animated,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useAuthStore } from '../store/authStore';
import { deviceService } from '../services/deviceService';
import { Colors } from '../utils/colors';
import Icon from '../components/Icon';
import LogoDarkBg from '../components/LogoDarkBg';
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

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <LogoDarkBg width={150} />
        </View>

        <Animated.View style={[styles.card, { transform: [{ translateX: shakeAnim }] }]}>
          <View style={styles.iconCircle}>
            <Icon name="user" size={22} color="#fff" />
          </View>

          <Text style={styles.cardTitle}>Authenticate Device</Text>
          <Text style={styles.cardSub}>
            Enter the device code from your Rasidify dashboard to link this terminal to your branch.
            This is a one-time step.
          </Text>

          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Text style={styles.fieldLabel}>Device Code</Text>
          <View style={styles.codeRow}>
            {digits.map((d, i) => (
              <TextInput
                key={i}
                ref={el => { inputs.current[i] = el; }}
                style={styles.codeBox}
                value={d}
                onChangeText={t => onChangeDigit(i, t)}
                onKeyPress={e => onKeyPress(i, e.nativeEvent.key)}
                maxLength={CODE_LENGTH}
                autoCapitalize="characters"
                autoCorrect={false}
                selectionColor={Colors.primary}
                editable={!loading}
              />
            ))}
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#ffffff" size="small" />
              : (
                <>
                  <Text style={styles.submitBtnText}>Authenticate</Text>
                  <Icon name="arrow-right" size={14} color="#fff" />
                </>
              )}
          </TouchableOpacity>

          {__DEV__ && (
            <TouchableOpacity style={styles.devBtn} onPress={handleDevSkip} activeOpacity={0.7}>
              <Icon name="flask" size={12} color={Colors.warning} />
              <Text style={styles.devBtnText}>Skip to Sell Screen (Dev)</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.primaryDark },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },

  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 },

  card: {
    width: '100%', maxWidth: 420, backgroundColor: Colors.surface, borderRadius: 20,
    paddingVertical: 32, paddingHorizontal: 28, alignItems: 'center',
  },
  iconCircle: {
    width: 52, height: 52, borderRadius: 14, backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  cardTitle: { fontSize: 22, fontWeight: '800', color: Colors.text, marginBottom: 8, textAlign: 'center' },
  cardSub: { fontSize: 13, color: Colors.textLight, marginBottom: 22, textAlign: 'center', lineHeight: 19 },

  errorBox: { backgroundColor: Colors.dangerBg, borderRadius: 10, padding: 10, marginBottom: 16, width: '100%' },
  errorText: { color: Colors.danger, fontSize: 12, fontWeight: '600', textAlign: 'center' },

  fieldLabel: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '700', color: Colors.textLight, marginBottom: 8 },
  codeRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', marginBottom: 22 },
  codeBox: {
    width: 38, height: 46, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background, color: Colors.text, fontSize: 18, fontWeight: '800',
    textAlign: 'center',
  },

  submitBtn: {
    width: '100%', flexDirection: 'row', gap: 8, backgroundColor: Colors.primaryDark, borderRadius: 12, height: 52,
    justifyContent: 'center', alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },

  devBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center',
    marginTop: 18, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning,
  },
  devBtnText: { fontSize: 12, fontWeight: '700', color: Colors.warning },
});
