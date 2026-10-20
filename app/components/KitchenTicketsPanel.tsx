// Order detail → "Kitchen": each round sent to the KDS with its items and
// kitchen status. Loads the order's full kitchen history from the POS API.
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../utils/colors';
import { useKitchenStore, orderTickets, KITCHEN_STATE_META } from '../store/kitchenStore';

export default function KitchenTicketsPanel({ invoiceId }: { invoiceId: number }) {
  const tickets = useKitchenStore(s => s.tickets);
  const loadOrder = useKitchenStore(s => s.loadOrder);
  useEffect(() => { loadOrder(invoiceId).catch(() => {}); }, [invoiceId, loadOrder]);

  const list = orderTickets(tickets, invoiceId);
  if (list.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Kitchen</Text>
      {list.map(t => {
        const meta = KITCHEN_STATE_META[t.status] ?? KITCHEN_STATE_META.new;
        return (
          <View key={t.ticketId} style={styles.ticket}>
            <View style={styles.head}>
              <Text style={styles.round}>{t.round > 1 ? `Round ${t.round} · Add-on` : 'Round 1'}</Text>
              <View style={[styles.pill, { backgroundColor: meta.bg }]}>
                <Text style={[styles.pillText, { color: meta.color }]}>{meta.label}</Text>
              </View>
            </View>
            {t.items.map((it, i) => (
              <View key={i} style={styles.item}>
                <Text style={[styles.itemText, it.change === 'void' && styles.itemVoid]}>
                  {it.change === 'void' ? 'VOID ' : ''}{it.qty}× {it.name}
                </Text>
                {it.modifiers.filter(Boolean).map((m, j) => <Text key={j} style={styles.mod}>{m}</Text>)}
                {it.note ? <Text style={styles.note}>{it.note}</Text> : null}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14, gap: 8 },
  title: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  ticket: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 12, gap: 4, backgroundColor: Colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  round: { fontSize: 12.5, fontWeight: '800', color: Colors.text },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pillText: { fontSize: 11, fontWeight: '800' },
  item: { paddingVertical: 2 },
  itemText: { fontSize: 13, fontWeight: '700', color: Colors.text },
  itemVoid: { color: '#B91C1C', textDecorationLine: 'line-through' },
  mod: { fontSize: 11.5, color: Colors.textLight, marginLeft: 18 },
  note: { fontSize: 11.5, fontWeight: '700', color: '#B45309', marginLeft: 18 },
});
