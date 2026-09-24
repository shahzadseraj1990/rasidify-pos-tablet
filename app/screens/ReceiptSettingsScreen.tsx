import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../utils/colors';
import Icon from '../components/Icon';
import { useReceiptSettingsStore } from '../store/receiptSettingsStore';
import { useAuthStore } from '../store/authStore';

export default function ReceiptSettingsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const s = useReceiptSettingsStore();
  const user = useAuthStore(state => state.user);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const patch: Record<string, string> = {};
    if (!s.companyName && user?.companyName) patch.companyName = user.companyName;
    if (!s.address && user?.companyAddress) patch.address = user.companyAddress;
    if (!s.phone && user?.companyPhone) patch.phone = user.companyPhone;
    if (Object.keys(patch).length > 0) s.update(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Icon name="chevron-left" size={14} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Receipt Settings</Text>
        </View>
        <TouchableOpacity style={styles.saveBtn} onPress={save}>
          <Text style={styles.saveBtnText}>{saved ? '✓ Saved' : 'Done'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.columns}>
          <View style={styles.col}>
            <Label>Receipt Template</Label>
            <View style={styles.card}>
              <TemplateRow label="Simple" sub="Single price column. Standard layout." active={s.receiptTemplate === 'simple'} onPress={() => s.update({ receiptTemplate: 'simple' })} />
              <View style={styles.divider} />
              <TemplateRow label="Detailed" sub="4-column: Qty | Item | Rate | Amount" active={s.receiptTemplate === 'detailed'} onPress={() => s.update({ receiptTemplate: 'detailed' })} />
            </View>

            <Label>Print Mode</Label>
            <View style={styles.card}>
              <TemplateRow label="ESC/POS Text" sub="Fast native text/commands sent to the printer." active={s.printMode === 'escpos'} onPress={() => s.update({ printMode: 'escpos' })} />
              <View style={styles.divider} />
              <TemplateRow label="Image Canvas" sub="Prints an exact image of the on-screen receipt preview." active={s.printMode === 'image'} onPress={() => s.update({ printMode: 'image' })} />
            </View>

            <Label>Print Behavior</Label>
            <View style={styles.card}>
              <ToggleRow label="Auto-print after payment" sub="Automatically print receipt when payment completes" value={s.autoPrintOnComplete} onChange={v => s.update({ autoPrintOnComplete: v })} />
            </View>

            <Label>Display Options</Label>
            <View style={styles.card}>
              <ToggleRow label="Show logo on receipt" sub="Display store logo at top of receipt" value={s.showLogoOnReceipt} onChange={v => s.update({ showLogoOnReceipt: v })} />
              <View style={styles.divider} />
              <ToggleRow label="Bilingual labels" sub="Add Arabic labels to Subtotal / VAT / Grand Total / Discount" value={s.bilingualLabels} onChange={v => s.update({ bilingualLabels: v })} />
              <View style={styles.divider} />
              <ToggleRow label="Show alternate item name" sub="Show Arabic / alternate product name below English name" value={s.showAlternateName} onChange={v => s.update({ showAlternateName: v })} />
              <View style={styles.divider} />
              <ToggleRow label='Show "Powered by Rasidify"' sub="Display branding line at bottom of receipt" value={s.showPoweredBy} onChange={v => s.update({ showPoweredBy: v })} />
            </View>
          </View>

          <View style={styles.col}>
            <Label>Store Information</Label>
            <View style={[styles.card, styles.cardPad]}>
              <InputField label="Store Name" value={s.companyName} onChangeText={v => s.update({ companyName: v })} placeholder="Your business name" />
              <InputField label="Address" value={s.address} onChangeText={v => s.update({ address: v })} placeholder="Street, City, Country" />
              <InputField label="VAT Number" value={s.vatNumber} onChangeText={v => s.update({ vatNumber: v })} placeholder="3XXXXXXXXXX" keyboardType="numbers-and-punctuation" />
              <InputField label="Phone Number" value={s.phone} onChangeText={v => s.update({ phone: v })} placeholder="+966 50 000 0000" keyboardType="phone-pad" />
            </View>

            <Label>Receipt Footer</Label>
            <View style={[styles.card, styles.cardPad]}>
              <InputField label="Footer Message (bold)" value={s.receiptFooter} onChangeText={v => s.update({ receiptFooter: v })} placeholder="Thank you for your visit!" />
              <InputField label="Footer Note (small)" value={s.receiptFooterNote} onChangeText={v => s.update({ receiptFooterNote: v })} placeholder="We look forward to seeing you again" />
            </View>

            <Label>Social Media</Label>
            <View style={[styles.card, styles.cardPad]}>
              <InputField label="X (Twitter)" value={s.socialX} onChangeText={v => s.update({ socialX: v })} placeholder="username (no @)" />
              <InputField label="Instagram" value={s.socialInstagram} onChangeText={v => s.update({ socialInstagram: v })} placeholder="username" />
              <InputField label="Facebook" value={s.socialFb} onChangeText={v => s.update({ socialFb: v })} placeholder="page name" />
              <InputField label="TikTok" value={s.socialTiktok} onChangeText={v => s.update({ socialTiktok: v })} placeholder="username" />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Label({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function ToggleRow({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {sub ? <Text style={styles.toggleSub}>{sub}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: Colors.border, true: Colors.primary }} thumbColor="#fff" />
    </View>
  );
}

function TemplateRow({ label, sub, active, onPress }: { label: string; sub: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.templateRow, active && styles.templateRowActive]} onPress={onPress}>
      <View style={[styles.radio, active && styles.radioActive]}>{active && <View style={styles.radioDot} />}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.templateLabel, active && { color: Colors.primary }]}>{label}</Text>
        <Text style={styles.templateSub}>{sub}</Text>
      </View>
    </TouchableOpacity>
  );
}

function InputField({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; keyboardType?: any;
}) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        keyboardType={keyboardType}
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surface, paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9 },
  saveBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  body: { padding: 24, paddingBottom: 48, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  columns: { flexDirection: 'row', gap: 24 },
  col: { flex: 1 },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 20, marginBottom: 8 },

  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  cardPad: { padding: 16, gap: 14 },
  divider: { height: 1, backgroundColor: Colors.divider },

  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  toggleLabel: { fontSize: 13, fontWeight: '600', color: Colors.text },
  toggleSub: { fontSize: 11, color: Colors.textMuted, lineHeight: 15, marginTop: 2 },

  templateRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  templateRowActive: { backgroundColor: Colors.primaryLight },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: Colors.primary },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.primary },
  templateLabel: { fontSize: 14, fontWeight: '700', color: Colors.text },
  templateSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  inputLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.text },
});
