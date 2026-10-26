import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { C } from '../theme/tokens';
import { Txt, Button, IconButton, Card, Pill, Segmented, EmptyState } from './ui';
import { TableShape, TableLegend } from './tables/TableShape';
import { useTableStore } from '../store/tableStore';
import { PosTable, POS_TABLE_STATUS } from '../types';

const CANVAS_PADDING = 60;

type Props = {
  visible: boolean;
  branchID: number | null;
  currentTableID: number | null;
  onClose: () => void;
  onSelect: (tableID: number, tableName: string) => void;
  onClear?: () => void;
};

export default function TableSelectScreen({ visible, branchID, currentTableID, onClose, onSelect, onClear }: Props) {
  const insets = useSafeAreaInsets();
  const layout = useTableStore(s => s.layout);
  const loading = useTableStore(s => s.loading);
  const loadLayout = useTableStore(s => s.loadLayout);

  const [activeFloorID, setActiveFloorID] = useState<number | null>(null);

  useEffect(() => {
    if (visible && branchID != null) loadLayout(branchID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, branchID]);

  useEffect(() => {
    if (activeFloorID == null && layout.floors.length > 0) {
      setActiveFloorID(layout.floors[0].floorID);
    }
  }, [layout.floors, activeFloorID]);

  const floorSectionIDs = useMemo(() => {
    if (activeFloorID == null) return new Set<number>();
    return new Set(layout.sections.filter(s => s.floorID === activeFloorID).map(s => s.sectionID));
  }, [layout.sections, activeFloorID]);

  const floorTables = useMemo(
    () => layout.tables.filter(t => floorSectionIDs.has(t.sectionID)),
    [layout.tables, floorSectionIDs]
  );

  const canvasSize = useMemo(() => {
    const maxX = floorTables.reduce((m, t) => Math.max(m, (t.posX ?? 0) + (t.width ?? 80)), 0);
    const maxY = floorTables.reduce((m, t) => Math.max(m, (t.posY ?? 0) + (t.height ?? 80)), 0);
    return { width: maxX + CANVAS_PADDING, height: maxY + CANVAS_PADDING };
  }, [floorTables]);

  function onTablePress(t: PosTable) {
    const isCurrent = t.tableID === currentTableID;
    const available = t.statusID === POS_TABLE_STATUS.Available || isCurrent;
    if (!available) return;
    onSelect(t.tableID, t.name);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {visible && <StatusBar style="dark" />}
      <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <Txt variant="h1">Select table</Txt>
            <Txt variant="caption" color={C.textMuted}>Tap an available table for this dine-in order</Txt>
          </View>
          {currentTableID != null && onClear ? <Button variant="dangerSoft" icon="close" label="Clear table" onPress={onClear} /> : null}
          <IconButton icon="close" variant="outline" onPress={onClose} />
        </View>

        <View style={styles.toolbar}>
          {layout.floors.length > 1 ? (
            <Segmented options={layout.floors.map(f => ({ key: f.floorID, label: f.name }))} value={activeFloorID ?? layout.floors[0].floorID} onChange={setActiveFloorID} />
          ) : <View />}
          <TableLegend tables={floorTables} />
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={C.brand} />
        ) : floorTables.length === 0 ? (
          <EmptyState title="No tables configured for this branch yet." icon="tables" />
        ) : (
          <Card padded={false} style={styles.plan}>
            <ScrollView contentContainerStyle={{ minWidth: '100%' }}>
              <ScrollView horizontal contentContainerStyle={{ minWidth: '100%' }}>
                <View style={[styles.canvas, { width: canvasSize.width, height: canvasSize.height }]}>
                  {floorTables.map(t => {
                    const isCurrent = t.tableID === currentTableID;
                    const available = t.statusID === POS_TABLE_STATUS.Available || isCurrent;
                    return (
                      <TableShape key={t.tableID} table={t} selected={isCurrent} disabled={!available} onPress={onTablePress}>
                        {isCurrent ? <Pill label="Selected" tone="brand" /> : null}
                      </TableShape>
                    );
                  })}
                </View>
              </ScrollView>
            </ScrollView>
          </Card>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24, paddingBottom: 20, gap: 16 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  plan: { flex: 1, overflow: 'hidden' },
  canvas: { position: 'relative', margin: 20 },
});
