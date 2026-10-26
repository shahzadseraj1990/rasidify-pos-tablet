import React, { memo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { C, H, R, S, palette } from '../theme/tokens';
import { Txt, Glyph, GlyphName, CountBadge } from './ui';
import RasidifyLogo from './RasidifyLogo';
import { StatusBar } from 'expo-status-bar';

export interface TopBarSection<K extends string> { key: K; label: string; icon: GlyphName; badge?: number }

// Dark app header from the redesign: logo, section tabs (active = indigo
// pill), live-shift chip on the right.
function PosTopBar<K extends string>({ sections, active, onSelect, shiftID, topInset = 0 }: {
  sections: TopBarSection<K>[];
  active: K;
  onSelect: (k: K) => void;
  shiftID?: number | null;
  topInset?: number;
}) {
  return (
    <View style={[styles.bar, { paddingTop: topInset, height: H.header + topInset }]}>
      <StatusBar style="light" />
      <RasidifyLogo width={124} variant="white" />
      <View style={styles.nav}>
        {sections.map(s => {
          const on = s.key === active;
          const fg = on ? palette.white : C.headerText;
          return (
            <TouchableOpacity key={s.key} onPress={() => onSelect(s.key)} activeOpacity={0.8} style={[styles.tab, on && styles.tabOn]}>
              <Glyph name={s.icon} size={20} color={fg} />
              <Txt variant="label" weight={on ? 'semibold' : 'medium'} color={fg}>{s.label}</Txt>
              {s.badge ? <CountBadge value={s.badge} tone="accent" size={20} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
      {shiftID != null ? (
        <View style={styles.shift}>
          <View style={styles.liveDot} />
          <Txt variant="caption" weight="semibold" color={C.accent}>Live</Txt>
          <Txt variant="caption" color={C.headerText}>Shift #{shiftID}</Txt>
        </View>
      ) : null}
    </View>
  );
}

export default memo(PosTopBar) as typeof PosTopBar;

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: S.xl, paddingLeft: S.xl, paddingRight: S.lg, backgroundColor: C.header },
  nav: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: S.xs },
  tab: { flexDirection: 'row', alignItems: 'center', gap: S.sm, height: H.md, paddingHorizontal: S.lg, borderRadius: R.lg },
  tabOn: { backgroundColor: C.brand },
  shift: { flexDirection: 'row', alignItems: 'center', gap: S.sm, height: H.md, paddingHorizontal: 14, borderRadius: R.lg, backgroundColor: C.headerRaised },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
});
