// Branded start-up screen: the Rasidify logo with a small spinner, shown while
// the app restores the session (can take several seconds on a cold server).
// Follows the native splash, which shows only the symbol on the same colour.
// Brand kit 2026: indigo with the white logo; dark mode black with the violet
// logo. Landscape (tablet) uses the wide logo, portrait (phone) the stacked one.
// Same file in the tablet POS, mobile POS, waiter and KDS apps.
import React from 'react';
import { View, Image, ActivityIndicator, StyleSheet, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';

const ART = {
  wide: require('../../assets/brand/brand-tablet.png'),
  wideDark: require('../../assets/brand/brand-tablet-dark.png'),
  stacked: require('../../assets/brand/brand-mobile.png'),
  stackedDark: require('../../assets/brand/brand-mobile-dark.png'),
};
const WIDE_RATIO = 1600 / 387;
const STACKED_RATIO = 1080 / 1196;
const INDIGO = '#2815C2';
const BLACK = '#0B0B0B';

export default function BrandLoading({ dark = false }: { dark?: boolean }) {
  const { width, height } = useWindowDimensions();
  const wide = width > height;
  const w = wide ? Math.min(width * 0.4, 560) : Math.min(width * 0.7, 280);
  const source = wide ? (dark ? ART.wideDark : ART.wide) : (dark ? ART.stackedDark : ART.stacked);

  return (
    <View style={[styles.root, { backgroundColor: dark ? BLACK : INDIGO }]}>
      <StatusBar style="light" />
      <Image
        source={source}
        style={{ width: w, height: w / (wide ? WIDE_RATIO : STACKED_RATIO) }}
        resizeMode="contain"
      />
      <ActivityIndicator style={styles.spinner} color="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  spinner: { position: 'absolute', bottom: '14%' },
});
