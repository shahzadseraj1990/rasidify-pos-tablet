import React, { useState } from 'react';
import { View, ScrollView, Image, StyleSheet } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { C, R, palette, initials } from '../theme/tokens';
import { Txt, Button, Card, NavRow, GlyphName } from '../components/ui';
import { useAuthStore } from '../store/authStore';
import { useShiftStore } from '../store/shiftStore';
import PosSettingsScreen from './PosSettingsScreen';
import PrinterSetupScreen from './PrinterSetupScreen';
import ReceiptSettingsScreen from './ReceiptSettingsScreen';
import BrandInfoScreen from './BrandInfoScreen';
import SettingsScreen from './SettingsScreen';
import KitchenDisplayScreen from './KitchenDisplayScreen';
import CustomerDisplaySetupScreen from './CustomerDisplaySetupScreen';

type PageKey = 'pos' | 'printers' | 'receipt' | 'brand' | 'general' | 'kitchen' | 'customer';

// Menu (redesign): settings list on the left, the picked page on the right.
// The same pages still open as their own routes from elsewhere.
const PAGES: { key: PageKey; title: string; subtitle: string; icon: GlyphName; render: () => React.ReactNode }[] = [
  { key: 'pos', title: 'POS settings', subtitle: 'Categories, swipe, favourites', icon: 'sliders', render: () => <PosSettingsScreen embedded /> },
  { key: 'printers', title: 'Printers', subtitle: 'Receipt printer, paper width', icon: 'printer', render: () => <PrinterSetupScreen embedded /> },
  { key: 'receipt', title: 'Receipt', subtitle: 'Logo, QR code, footer', icon: 'receipt', render: () => <ReceiptSettingsScreen embedded /> },
  { key: 'brand', title: 'Brand information', subtitle: 'Name, VAT number, address', icon: 'store', render: () => <BrandInfoScreen embedded /> },
  { key: 'kitchen', title: 'Kitchen display', subtitle: 'Send orders to the KDS', icon: 'kitchen', render: () => <KitchenDisplayScreen embedded /> },
  { key: 'customer', title: 'Customer display', subtitle: 'Second screen for customers', icon: 'display', render: () => <CustomerDisplaySetupScreen embedded /> },
  { key: 'general', title: 'General', subtitle: 'Device options', icon: 'gear', render: () => <SettingsScreen embedded /> },
];

type Props = {
  onLogout: () => void;
  onEndShift: () => void;
  navigation: NativeStackNavigationProp<RootStackParamList, 'Shell'>;
};

export default function MenuScreen({ onLogout, onEndShift }: Props) {
  const user = useAuthStore(s => s.user);
  const shift = useShiftStore(s => s.activeShift);
  const [page, setPage] = useState<PageKey>('pos');
  const current = PAGES.find(p => p.key === page) ?? PAGES[0];
  const company = user?.companyName || 'Store';

  return (
    <View style={styles.root}>
      <View style={styles.side}>
        <Card style={styles.store}>
          {user?.companyLogoUrl
            ? <Image source={{ uri: user.companyLogoUrl }} style={styles.logo} resizeMode="contain" />
            : <View style={[styles.logo, styles.logoText]}><Txt variant="h3" color={palette.white}>{initials(company)}</Txt></View>}
          <View style={styles.flex}>
            <Txt variant="title" weight="bold" numberOfLines={1}>{company}</Txt>
            {shift?.branchName ? <Txt variant="caption" color={C.textMuted} numberOfLines={1}>{shift.branchName}</Txt> : null}
            <Txt variant="caption" color={C.textMuted} numberOfLines={1}>
              Signed in as <Txt variant="caption" weight="semibold">{user?.name ?? '—'}</Txt>
            </Txt>
          </View>
        </Card>

        <Card padded={false} style={styles.nav}>
          <ScrollView contentContainerStyle={styles.navList} showsVerticalScrollIndicator={false}>
            {PAGES.map(p => (
              <NavRow key={p.key} icon={p.icon} title={p.title} subtitle={p.subtitle} active={p.key === page} onPress={() => setPage(p.key)} />
            ))}
          </ScrollView>
        </Card>

        <View style={styles.actions}>
          {shift ? <Button variant="outline" size="lg" icon="clock" label={`End shift #${shift.shiftID}`} onPress={onEndShift} /> : null}
          <Button variant="dangerSoft" size="lg" icon="signOut" label="Sign out" onPress={onLogout} />
        </View>
      </View>

      <View style={styles.page}>
        {current.render()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', gap: 20, padding: 24, paddingBottom: 20, backgroundColor: C.bg },
  side: { width: 360, gap: 14 },
  store: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  logo: { width: 52, height: 52, borderRadius: R.lg },
  logoText: { backgroundColor: palette.ink, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  nav: { flex: 1 },
  navList: { padding: 6, gap: 2 },
  actions: { gap: 10 },
  page: { flex: 1, minWidth: 0 },
});
