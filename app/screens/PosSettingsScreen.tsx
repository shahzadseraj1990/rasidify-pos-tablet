import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Modal, TextInput, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../utils/colors';
import Icon from '../components/Icon';
import { usePosSettingsStore } from '../store/posSettingsStore';

export default function PosSettingsScreen() {
  const navigation = useNavigation();
  const settings = usePosSettingsStore();
  const insets = useSafeAreaInsets();
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [groupName, setGroupName] = useState('');

  useEffect(() => {
    if (!settings.loaded) settings.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createGroup = async () => {
    const name = groupName.trim();
    if (!name) return;
    await settings.addGroup(name);
    setGroupName('');
    setGroupModalVisible(false);
  };

  const removeGroup = (id: string, name: string) => {
    Alert.alert('Remove Group', `Remove "${name}" from favourites?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => settings.removeGroup(id) },
    ]);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="chevron-left" size={14} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>POS Settings</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.sectionLabel}>Category Display</Text>
        <View style={styles.card}>
          <Text style={styles.rowTitle}>Show categories up to level</Text>
          <Text style={styles.rowSub}>Controls how many category levels appear on the cashier screen</Text>
          <View style={styles.levelRow}>
            <TouchableOpacity
              style={[styles.levelPill, settings.categoryDisplayLevel === 1 && styles.levelPillActive]}
              onPress={() => settings.setCategoryDisplayLevel(1)}
            >
              <Text style={[styles.levelPillText, settings.categoryDisplayLevel === 1 && styles.levelPillTextActive]}>Level 1</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.levelPill, settings.categoryDisplayLevel === 2 && styles.levelPillActive]}
              onPress={() => settings.setCategoryDisplayLevel(2)}
            >
              <Text style={[styles.levelPillText, settings.categoryDisplayLevel === 2 && styles.levelPillTextActive]}>Level 2</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Display Options</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <Text style={styles.rowTitle}>Show Top Selling products</Text>
            <Switch
              value={settings.showTopSelling}
              onValueChange={settings.setShowTopSelling}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.rowTitle}>Swipe to edit/remove cart items</Text>
              <Text style={[styles.rowSub, { marginBottom: 0 }]}>When off, cart rows just show +/- and an X button — no swipe gesture</Text>
            </View>
            <Switch
              value={settings.swipeToDeleteEnabled}
              onValueChange={settings.setSwipeToDeleteEnabled}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <View style={styles.favHeaderRow}>
          <View>
            <Text style={styles.sectionLabel}>Favourites</Text>
            <Text style={styles.favSub}>Quick-access product groups shown on the cashier screen</Text>
          </View>
          <TouchableOpacity style={styles.newGroupBtn} onPress={() => setGroupModalVisible(true)}>
            <Icon name="plus" size={12} color="#fff" />
            <Text style={styles.newGroupText}>New Group</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, styles.favCard]}>
          {settings.favourites.length === 0 ? (
            <View style={styles.emptyFav}>
              <Icon name="star" size={28} color={Colors.textMuted} />
              <Text style={styles.emptyFavTitle}>No favourite groups yet</Text>
              <Text style={styles.emptyFavSub}>Create groups to pin product sets on the cashier screen</Text>
            </View>
          ) : (
            settings.favourites.map(g => (
              <View key={g.id} style={styles.groupRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.groupName}>{g.name}</Text>
                  <Text style={styles.groupCount}>{g.productIDs.length} products</Text>
                </View>
                <TouchableOpacity onPress={() => removeGroup(g.id, g.name)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Icon name="trash-alt" size={14} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </View>

      <Modal visible={groupModalVisible} transparent animationType="fade" onRequestClose={() => setGroupModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Favourite Group</Text>
            <Text style={styles.fieldLabel}>Group Name</Text>
            <TextInput
              style={styles.input}
              value={groupName}
              onChangeText={setGroupName}
              placeholder="e.g. Combos, Best Sellers"
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setGroupModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.createBtn} onPress={createGroup}>
                <Text style={styles.createBtnText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text },

  body: { padding: 24, maxWidth: 900, width: '100%', alignSelf: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },

  card: { backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 18, marginBottom: 20 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  rowSub: { fontSize: 12, color: Colors.textMuted, marginTop: 4, marginBottom: 14 },

  levelRow: { flexDirection: 'row', gap: 8 },
  levelPill: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  levelPillActive: { backgroundColor: Colors.primaryDark, borderColor: Colors.primaryDark },
  levelPillText: { fontSize: 13, fontWeight: '600', color: Colors.textLight },
  levelPillTextActive: { color: '#fff' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  divider: { height: 1, backgroundColor: Colors.divider, marginVertical: 14 },

  favHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  favSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  newGroupBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryDark, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  newGroupText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  favCard: { minHeight: 180, justifyContent: 'center' },
  emptyFav: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  emptyFavTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  emptyFavSub: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },

  groupRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  groupName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  groupCount: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  modalOverlay: { flex: 1, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center' },
  modalCard: { width: 360, backgroundColor: Colors.surface, borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.6, marginBottom: 8 },
  input: { backgroundColor: Colors.background, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, height: 48, paddingHorizontal: 14, fontSize: 14, color: Colors.text },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textLight },
  createBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: Colors.primaryDark, alignItems: 'center', justifyContent: 'center' },
  createBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
});
