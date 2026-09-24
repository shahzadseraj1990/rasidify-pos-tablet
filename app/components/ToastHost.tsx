import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore } from '../store/toastStore';
import { Colors } from '../utils/colors';
import Icon from './Icon';

const AUTO_HIDE_MS = 2800;

// Mounted once at the app root (App.tsx) so a toast can be shown from any
// screen — checkout success/failure, print result, etc. — without each
// screen owning its own overlay. Anchored to the bottom-right corner as a
// single compact row (message + subMessage on one line) rather than a tall
// top banner — a full-width top toast covered the order list/totals every
// time a checkout completed, which got in the way of the next order.
export default function ToastHost() {
  const { visible, message, subMessage, type, seq, hide } = useToastStore();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();

    hideTimer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => hide());
    }, AUTO_HIDE_MS);

    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, seq]);

  if (!visible) return null;

  const palette = type === 'success'
    ? { bg: Colors.success, icon: 'check-circle' as const }
    : type === 'error'
      ? { bg: Colors.danger, icon: 'exclamation-circle' as const }
      : { bg: Colors.primaryDark, icon: 'info-circle' as const };

  const text = subMessage ? `${message} · ${subMessage}` : message;

  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 20, right: 20 }]}>
      <Animated.View style={[styles.toast, { backgroundColor: palette.bg, opacity, transform: [{ translateY }] }]}>
        <Icon name={palette.icon} size={15} color="#fff" />
        <Text style={styles.message} numberOfLines={1}>{text}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', alignItems: 'flex-end', zIndex: 999, elevation: 999 },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 9, maxWidth: 420,
    borderRadius: 11, paddingVertical: 10, paddingHorizontal: 14,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  message: { color: '#fff', fontSize: 13, fontWeight: '700', flexShrink: 1 },
});
