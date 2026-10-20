// Kitchen state of an order (from the KDS): "In kitchen", "Preparing",
// "Ready", "Served". Renders nothing if the kitchen never got the order.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from './Icon';
import { useKitchenStore, orderKitchenState, KITCHEN_STATE_META } from '../store/kitchenStore';

export default function KitchenBadge({ invoiceId, size = 'md' }: { invoiceId: number | null | undefined; size?: 'sm' | 'md' }) {
  const state = useKitchenStore(s => orderKitchenState(s.tickets, invoiceId));
  if (!state) return null;
  const meta = KITCHEN_STATE_META[state];
  const sm = size === 'sm';
  return (
    <View style={[styles.badge, sm && styles.badgeSm, { backgroundColor: meta.bg }]}>
      <Icon name="utensils" size={sm ? 8 : 10} color={meta.color} />
      <Text style={[styles.text, sm && styles.textSm, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeSm: { paddingHorizontal: 6, paddingVertical: 2, gap: 4 },
  text: { fontSize: 11, fontWeight: '800' },
  textSm: { fontSize: 9.5 },
});
