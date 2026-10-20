import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Animated } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors } from '../utils/colors';
import { useAlertStore, AlertButton, AlertKind } from '../store/alertStore';

// Renders the current appAlert() dialog. Mounted once at the app root.
// A transparent Modal (not an in-window overlay) so it also appears on top
// of other open Modals, e.g. the End Shift sheet. Not statusBarTranslucent,
// so the status bar keeps the app's dark icons.

const KIND: Record<AlertKind, { icon: string; color: string; bg: string }> = {
  success: { icon: 'check',                color: Colors.success,   bg: Colors.successBg },
  error:   { icon: 'times',                color: Colors.danger,    bg: Colors.dangerBg },
  warning: { icon: 'exclamation',          color: Colors.warning,   bg: Colors.warningBg },
  info:    { icon: 'info',                 color: Colors.primary, bg: Colors.primaryLight },
};

export default function AlertHost() {
  const current = useAlertStore(s => s.current);
  const dismiss = useAlertStore(s => s.dismiss);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!current) return;
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
  }, [current, anim]);

  if (!current) return null;
  const meta = KIND[current.kind];

  const press = (b: AlertButton) => {
    dismiss();
    // Run after the dialog is gone, so a handler that opens another alert
    // (or navigates) doesn't race this one's close.
    setTimeout(() => b.onPress?.(), 0);
  };
  const cancel = current.buttons.find(b => b.style === 'cancel');
  // Two buttons sit side by side (cancel first); three or more stack.
  const ordered = [...current.buttons].sort((a, b) => (a.style === 'cancel' ? -1 : 0) - (b.style === 'cancel' ? -1 : 0));
  const stacked = ordered.length > 2;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => (cancel ? press(cancel) : dismiss())}>
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.card,
            { opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] },
          ]}
        >
          <View style={[styles.iconRing, { backgroundColor: meta.bg }]}>
            <View style={[styles.iconDot, { backgroundColor: meta.color }]}>
              <FontAwesome5 name={meta.icon} size={20} color="#fff" />
            </View>
          </View>

          <Text style={styles.title}>{current.title}</Text>
          {!!current.message && <Text style={styles.message}>{current.message}</Text>}

          <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
            {ordered.map((b, i) => {
              const isCancel = b.style === 'cancel';
              const isDanger = b.style === 'destructive';
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.btn,
                    !stacked && { flex: 1 },
                    isCancel ? styles.btnCancel : isDanger ? styles.btnDanger : styles.btnPrimary,
                  ]}
                  onPress={() => press(b)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.btnText, isCancel && styles.btnTextCancel]}>{b.text}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: {
    width: '100%', maxWidth: 380, backgroundColor: Colors.surface, borderRadius: 24,
    paddingHorizontal: 22, paddingTop: 28, paddingBottom: 20, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 12,
  },
  iconRing: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  iconDot: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  message: { fontSize: 14.5, color: Colors.textLight, textAlign: 'center', marginTop: 8, lineHeight: 21 },
  buttons: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 22 },
  buttonsStacked: { flexDirection: 'column' },
  btn: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnPrimary: { backgroundColor: Colors.primary },
  btnDanger: { backgroundColor: Colors.danger },
  btnCancel: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  btnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  btnTextCancel: { color: Colors.text },
});
