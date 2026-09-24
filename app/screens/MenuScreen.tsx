import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { Colors } from '../utils/colors';
import Icon from '../components/Icon';

const ITEMS = [
  { key: 'posSettings', label: 'POS Settings', icon: 'sliders-h' },
  { key: 'printerSettings', label: 'Printer Settings', icon: 'print' },
  { key: 'settings', label: 'Settings', icon: 'cog' },
  { key: 'brandInfo', label: 'Brand Information', icon: 'store' },
  { key: 'receiptSettings', label: 'Receipt Settings', icon: 'receipt' },
];

type Props = {
  onLogout: () => void;
  onEndShift: () => void;
  navigation: NativeStackNavigationProp<RootStackParamList, 'Shell'>;
};

export default function MenuScreen({ onLogout, onEndShift, navigation }: Props) {
  const handlePress = (key: string, label: string) => {
    if (key === 'posSettings') {
      navigation.navigate('PosSettings');
      return;
    }
    if (key === 'printerSettings') {
      navigation.navigate('PrinterSetup');
      return;
    }
    if (key === 'receiptSettings') {
      navigation.navigate('ReceiptSettings');
      return;
    }
    if (key === 'brandInfo') {
      navigation.navigate('BrandInfo');
      return;
    }
    if (key === 'settings') {
      navigation.navigate('Settings');
      return;
    }
    Alert.alert(label, 'Coming soon.');
  };

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        {ITEMS.map(item => (
          <TouchableOpacity
            key={item.key}
            style={styles.row}
            onPress={() => handlePress(item.key, item.label)}
          >
            <View style={styles.rowIcon}>
              <Icon name={item.icon} size={15} color={Colors.text} />
            </View>
            <Text style={styles.rowLabel}>{item.label}</Text>
            <Icon name="chevron-right" size={13} color={Colors.textMuted} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.row} onPress={onEndShift}>
          <View style={[styles.rowIcon, styles.signOutIcon]}>
            <Icon name="clock" size={15} color={Colors.danger} />
          </View>
          <Text style={[styles.rowLabel, styles.signOutLabel]}>End Shift</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.row, styles.signOutRow]} onPress={onLogout}>
          <View style={[styles.rowIcon, styles.signOutIcon]}>
            <Icon name="sign-out-alt" size={15} color={Colors.danger} />
          </View>
          <Text style={[styles.rowLabel, styles.signOutLabel]}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', paddingTop: 32 },
  card: { width: 420, maxWidth: '92%', backgroundColor: Colors.surface, borderRadius: 16, overflow: 'hidden' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  rowIcon: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text },
  signOutRow: { borderBottomWidth: 0 },
  signOutIcon: { backgroundColor: Colors.dangerBg },
  signOutLabel: { color: Colors.danger, fontWeight: '700' },
});
