import React from 'react';
import { View, ScrollView, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, S } from '../../theme/tokens';
import Txt from './Txt';
import { IconButton } from './Button';
import { Card, PageHeader } from './Layout';

/**
 * Frame for every settings page. Shown inside the Menu tab (`embedded`) it is
 * just a titled scroll area; opened as its own route it adds a back button.
 * `scroll={false}` for pages that bring their own list/scroll.
 */
export function SettingsPage({ title, subtitle, embedded, right, scroll = true, children, contentStyle }: {
  title: string;
  subtitle?: string;
  embedded?: boolean;
  right?: React.ReactNode;
  scroll?: boolean;
  children?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const header = embedded ? (
    <PageHeader title={title} subtitle={subtitle} right={right} style={styles.embeddedHeader} />
  ) : (
    <View style={[styles.bar, { paddingTop: insets.top + S.md }]}>
      <IconButton icon="chevronLeft" onPress={() => navigation.goBack()} />
      <View style={styles.barText}>
        <Txt variant="h2">{title}</Txt>
        {subtitle ? <Txt variant="caption" color={C.textMuted}>{subtitle}</Txt> : null}
      </View>
      {right}
    </View>
  );
  const body = scroll ? (
    <ScrollView contentContainerStyle={[embedded ? styles.embeddedBody : styles.body, contentStyle]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : <View style={[styles.flex, embedded ? styles.embeddedFill : styles.fill, contentStyle]}>{children}</View>;
  return (
    <View style={[styles.flex, !embedded && styles.root]}>
      {header}
      {body}
    </View>
  );
}

/** White card holding setting rows separated by hairlines. */
export function SettingGroup({ title, children, style }: { title?: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      {title ? <Txt variant="micro" color={C.textMuted} style={styles.groupTitle}>{title.toUpperCase()}</Txt> : null}
      <Card padded={false} style={style}>
        {rows.map((r, i) => <View key={i} style={i > 0 && styles.sep}>{r}</View>)}
      </Card>
    </View>
  );
}

/** Title + description on the left, a control (Toggle, Segmented…) on the right. */
export function SettingRow({ title, subtitle, right, children }: {
  title: string; subtitle?: string; right?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View style={styles.rowText}>
          <Txt variant="title">{title}</Txt>
          {subtitle ? <Txt variant="caption" color={C.textMuted}>{subtitle}</Txt> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { backgroundColor: C.bg },
  bar: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingHorizontal: S.xxl, paddingBottom: S.md, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  barText: { flex: 1 },
  embeddedHeader: { marginBottom: S.lg },
  body: { padding: S.xxl, gap: S.lg, maxWidth: 960, width: '100%', alignSelf: 'center' },
  embeddedBody: { gap: S.lg, paddingBottom: S.xxl },
  fill: { padding: S.xxl },
  embeddedFill: {},
  group: { gap: S.sm },
  groupTitle: { letterSpacing: 0.8 },
  sep: { borderTopWidth: 1, borderTopColor: C.divider },
  row: { paddingHorizontal: S.xl, paddingVertical: 14, gap: S.md },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: S.lg },
  rowText: { flex: 1, minWidth: 0 },
});
