import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../utils/colors';
import Icon from '../components/Icon';
import { usePrinterStore } from '../store/printerStore';
import { useReceiptSettingsStore } from '../store/receiptSettingsStore';

export default function SettingsScreen() {
  const navigation = useNavigation();
  const printer = usePrinterStore();
  const receiptSettings = useReceiptSettingsStore();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="chevron-left" size={14} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.sectionLabel}>Receipt</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowBorder]}>
            <Text style={styles.rowLabel}>Printer width</Text>
            <View style={styles.widthToggle}>
              <TouchableOpacity
                style={[styles.widthOption, printer.paperWidth === 58 && styles.widthOptionActive]}
                onPress={() => printer.update({ paperWidth: 58 })}
              >
                <Text style={[styles.widthOptionText, printer.paperWidth === 58 && styles.widthOptionTextActive]}>58mm</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.widthOption, printer.paperWidth === 80 && styles.widthOptionActive]}
                onPress={() => printer.update({ paperWidth: 80 })}
              >
                <Text style={[styles.widthOptionText, printer.paperWidth === 80 && styles.widthOptionTextActive]}>80mm (Standard)</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Auto-print on complete</Text>
            <Switch
              value={receiptSettings.autoPrintOnComplete}
              onValueChange={v => receiptSettings.update({ autoPrintOnComplete: v })}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text },

  body: { padding: 24, maxWidth: 800, width: '100%', alignSelf: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 18 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  rowLabel: { fontSize: 13, fontWeight: '600', color: Colors.text },

  widthToggle: { flexDirection: 'row', gap: 6 },
  widthOption: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  widthOptionActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  widthOptionText: { fontSize: 12, fontWeight: '600', color: Colors.textLight },
  widthOptionTextActive: { color: '#fff' },
});
