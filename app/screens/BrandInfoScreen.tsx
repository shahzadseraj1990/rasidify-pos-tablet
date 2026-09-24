import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../utils/colors';
import Icon from '../components/Icon';
import { useAuthStore } from '../store/authStore';

export default function BrandInfoScreen() {
  const navigation = useNavigation();
  const user = useAuthStore(s => s.user);
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="chevron-left" size={14} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Brand Information</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.profileCard}>
          {user?.companyLogoUrl ? (
            <Image source={{ uri: user.companyLogoUrl }} style={styles.logo} />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Text style={styles.logoPlaceholderText}>{(user?.companyName || 'S').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View>
            <Text style={styles.companyName}>{user?.companyName || '—'}</Text>
            <Text style={styles.companySub}>{user?.name || 'Owner'}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Contact</Text>
        <View style={styles.card}>
          <InfoRow label="Email" value={user?.email} />
          <InfoRow label="Phone" value={user?.companyPhone} last />
        </View>

        <Text style={styles.sectionLabel}>Location</Text>
        <View style={styles.card}>
          <InfoRow label="Address" value={user?.companyAddress} last />
        </View>
      </View>
    </View>
  );
}

function InfoRow({ label, value, last }: { label: string; value?: string; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text },

  body: { padding: 24, maxWidth: 800, width: '100%', alignSelf: 'center' },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: Colors.surface,
    borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 18, marginBottom: 4,
  },
  logo: { width: 52, height: 52, borderRadius: 26 },
  logoPlaceholder: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.primaryDark, alignItems: 'center', justifyContent: 'center' },
  logoPlaceholderText: { fontSize: 20, fontWeight: '800', color: '#fff' },
  companyName: { fontSize: 16, fontWeight: '800', color: Colors.text },
  companySub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 20, marginBottom: 8 },
  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 18 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  rowLabel: { fontSize: 13, fontWeight: '600', color: Colors.text },
  rowValue: { fontSize: 13, color: Colors.textLight },
});
