// "Order ready" banner: when the kitchen marks a ticket Ready, the waiter and
// the cashier get a chime, a short vibration and a card at the top of the
// screen until they tap OK. Mounted once in App.tsx, above the navigator.
// Same file in the waiter app, tablet POS and mobile POS.
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Vibration, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useAudioPlayer } from 'expo-audio';
import { useKitchenStore } from '../store/kitchenStore';

const MAX_ITEMS_SHOWN = 4;

export default function KitchenReadyAlert() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const alerts = useKitchenStore(s => s.readyAlerts);
  const dismissReady = useKitchenStore(s => s.dismissReady);
  const chime = useAudioPlayer(require('../../assets/sounds/order-ready.wav'));

  // Chime + vibrate once for every alert that wasn't there before.
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    const fresh = alerts.filter(a => !seen.current.has(a.ticketId));
    seen.current = new Set(alerts.map(a => a.ticketId));
    if (fresh.length === 0) return;
    try { chime.seekTo(0); chime.play(); } catch {}
    Vibration.vibrate([0, 250, 120, 250]);
  }, [alerts, chime]);

  const current = alerts[0];
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(slide, { toValue: current ? 1 : 0, useNativeDriver: true, friction: 8, tension: 70 }).start();
  }, [current?.ticketId, slide]);

  if (!current) return null;

  const more = alerts.length - 1;
  const title = [current.orderNo, current.table ? `Table ${current.table}` : null].filter(Boolean).join(' · ');
  const shown = current.items.slice(0, MAX_ITEMS_SHOWN);
  const hidden = current.items.length - shown.length;

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.layer]}>
      <Animated.View
        style={[
          styles.card,
          {
            top: insets.top + 8,
            width: Math.min(560, width - 24),
            opacity: slide,
            transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) }],
          },
        ]}
      >
        <View style={styles.row}>
          <View style={styles.iconRing}>
            <FontAwesome5 name="concierge-bell" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>ORDER READY{current.round > 1 ? ` · ROUND ${current.round}` : ''}</Text>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
          </View>
          {more > 0 && (
            <View style={styles.moreChip}>
              <Text style={styles.moreText}>+{more} more</Text>
            </View>
          )}
        </View>

        {shown.length > 0 && (
          <View style={styles.items}>
            {shown.map((line, i) => (
              <Text key={i} style={styles.item} numberOfLines={1}>{line}</Text>
            ))}
            {hidden > 0 && <Text style={styles.itemMore}>and {hidden} more item{hidden > 1 ? 's' : ''}</Text>}
          </View>
        )}

        <View style={styles.actions}>
          {more > 0 && (
            <TouchableOpacity style={styles.ghostBtn} onPress={() => dismissReady()}>
              <Text style={styles.ghostText}>Dismiss all</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.okBtn} onPress={() => dismissReady(current.ticketId)}>
            <Text style={styles.okText}>OK</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

// Fixed colours (not the app theme) so the card reads the same in light and dark.
const styles = StyleSheet.create({
  layer: { zIndex: 1000, elevation: 1000, alignItems: 'center' },
  card: {
    position: 'absolute', alignSelf: 'center',
    backgroundColor: '#064E3B', borderRadius: 18, padding: 16, gap: 12,
    borderWidth: 1, borderColor: '#10B981',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
    elevation: 24,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconRing: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 11, fontWeight: '800', color: '#6EE7B7', letterSpacing: 0.8 },
  title: { fontSize: 18, fontWeight: '800', color: '#fff', marginTop: 1 },
  moreChip: { backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  moreText: { fontSize: 11.5, fontWeight: '800', color: '#fff' },
  items: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  item: { fontSize: 14, fontWeight: '600', color: '#ECFDF5' },
  itemMore: { fontSize: 12.5, color: '#A7F3D0', marginTop: 2 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  ghostBtn: { paddingHorizontal: 16, height: 42, borderRadius: 12, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  ghostText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  okBtn: { paddingHorizontal: 28, height: 42, borderRadius: 12, justifyContent: 'center', backgroundColor: '#10B981' },
  okText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
