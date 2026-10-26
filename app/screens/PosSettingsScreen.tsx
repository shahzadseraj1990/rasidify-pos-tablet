import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { C } from '../theme/tokens';
import {
  Txt, Button, IconButton, Toggle, Segmented, Field, Dialog, EmptyState,
  SettingsPage, SettingGroup, SettingRow,
} from '../components/ui';
import { usePosSettingsStore } from '../store/posSettingsStore';
import { appAlert } from '../utils/appAlert';

export default function PosSettingsScreen({ embedded }: { embedded?: boolean }) {
  const settings = usePosSettingsStore();
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
    appAlert('Remove Group', `Remove "${name}" from favourites?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => settings.removeGroup(id) },
    ]);
  };

  return (
    <SettingsPage title="POS settings" subtitle="How orders work on this device" embedded={embedded}>
      <SettingGroup>
        <SettingRow
          title="Show categories up to level"
          subtitle="How many category levels appear on the cashier screen"
          right={
            <Segmented
              options={[{ key: 1, label: 'Level 1' }, { key: 2, label: 'Level 2' }]}
              value={settings.categoryDisplayLevel}
              onChange={l => settings.setCategoryDisplayLevel(l as 1 | 2)}
            />
          }
        />
      </SettingGroup>

      <SettingGroup>
        <SettingRow
          title="Show Top Selling products"
          subtitle="A Top Selling group on the cashier screen"
          right={<Toggle value={settings.showTopSelling} onChange={settings.setShowTopSelling} />}
        />
        <SettingRow
          title="Swipe to edit or remove order lines"
          subtitle="When off, lines only show − and + (− at 1 removes the line)"
          right={<Toggle value={settings.swipeToDeleteEnabled} onChange={settings.setSwipeToDeleteEnabled} />}
        />
      </SettingGroup>

      <SettingGroup title="Favourites">
        <SettingRow
          title="Favourite groups"
          subtitle="Quick-access product groups shown on the cashier screen"
          right={<Button variant="soft" size="sm" icon="plus" label="New group" onPress={() => setGroupModalVisible(true)} />}
        />
        {settings.favourites.length === 0 ? (
          <EmptyState title="No favourite groups yet" subtitle="Create groups to pin product sets on the cashier screen" icon="grid" />
        ) : (
          settings.favourites.map(g => (
            <View key={g.id} style={styles.groupRow}>
              <View style={styles.flex}>
                <Txt variant="label">{g.name}</Txt>
                <Txt variant="small" weight="regular" color={C.textMuted}>{g.productIDs.length} products</Txt>
              </View>
              <IconButton icon="trash" variant="dangerSoft" size={40} iconSize={18} onPress={() => removeGroup(g.id, g.name)} />
            </View>
          ))
        )}
      </SettingGroup>

      <Dialog
        visible={groupModalVisible}
        onClose={() => setGroupModalVisible(false)}
        keyboard
        width={400}
        title="New favourite group"
        footer={<>
          <Button variant="outline" size="lg" label="Cancel" onPress={() => setGroupModalVisible(false)} style={styles.flex} />
          <Button size="lg" label="Create" onPress={createGroup} disabled={!groupName.trim()} style={styles.flex} />
        </>}
      >
        <Field value={groupName} onChangeText={setGroupName} placeholder="e.g. Combos, Best Sellers" autoFocus />
      </Dialog>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
});
