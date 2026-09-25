import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { setUnauthorizedHandler } from '../services/api';
import { resetSessionCaches } from '../services/authService';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';
import { useShiftStore } from '../store/shiftStore';
import { deviceService } from '../services/deviceService';
import { shiftService } from '../services/shiftService';
import { useSessionStore, profileFromBootstrap } from '../store/sessionStore';
import { useProductStore } from '../store/productStore';
import { Colors } from '../utils/colors';

import DeviceAuthenticateScreen from '../screens/DeviceAuthenticateScreen';
import PinLoginScreen from '../screens/PinLoginScreen';
import ShiftStartScreen from '../screens/ShiftStartScreen';
import PosShellScreen from '../screens/PosShellScreen';
import PrinterSetupScreen from '../screens/PrinterSetupScreen';
import ReceiptPreviewScreen from '../screens/ReceiptPreviewScreen';
import ReceiptSettingsScreen from '../screens/ReceiptSettingsScreen';
import BrandInfoScreen from '../screens/BrandInfoScreen';
import SettingsScreen from '../screens/SettingsScreen';
import PosSettingsScreen from '../screens/PosSettingsScreen';

export type RootStackParamList = {
  DeviceAuthenticate: undefined;
  PinLogin: undefined;
  ShiftStart: undefined;
  Shell: undefined;
  PrinterSetup: undefined;
  ReceiptPreview: undefined;
  ReceiptSettings: undefined;
  BrandInfo: undefined;
  Settings: undefined;
  PosSettings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function Navigation() {
  const [bootstrapping, setBootstrapping] = useState(true);
  const deviceAuthenticated = useAuthStore(s => s.deviceAuthenticated);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const activeShift = useShiftStore(s => s.activeShift);
  const setDeviceAuthenticated = useAuthStore(s => s.setDeviceAuthenticated);
  const setUser = useAuthStore(s => s.setUser);
  const clearAuth = useAuthStore(s => s.clearAuth);
  const setShift = useShiftStore(s => s.setShift);

  // Any authenticated request answered with 401 (expired or revoked token)
  // ends the session and returns to the passcode screen. A wrong passcode at
  // login is not affected: the user isn't authenticated yet at that point.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!useAuthStore.getState().isAuthenticated) return;
      resetSessionCaches();
      clearAuth();
      if (navigationRef.isReady()) {
        navigationRef.reset({ index: 0, routes: [{ name: 'PinLogin' }] });
      }
    });
    return () => setUnauthorizedHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const session = await deviceService.getStoredSession();
        setDeviceAuthenticated(session.deviceAuthenticated);
        if (session.token && session.user) {
          setUser(session.user);
          // Cached for the session (see productStore.load) — restoring a
          // session on cold start should also skip re-fetching products
          // just because Sell mounts, same as a fresh PinLogin does.
          useProductStore.getState().load().catch(() => {});
          try {
            // One call restores the active shift, tax, and table layout.
            // Tax in particular was never restored on cold start before this
            // (only at passcode login), so orders after an app restart went
            // out with 0 VAT.
            const b = await useSessionStore.getState().load(session.user.branchID);
            if (b.activeShift) setShift(b.activeShift);
            // Refresh the stored profile (currency/company/industry) in case
            // it changed on the dashboard since this session was created.
            setUser({ ...session.user, ...profileFromBootstrap(b) });
          } catch (err: any) {
            // Token rejected server-side — fall back to the passcode screen.
            if (err?.response?.status === 401) {
              clearAuth();
            } else {
              // Bootstrap failed for another reason (typically a timeout on a
              // cold server). Don't treat that as "no open shift": that
              // routes to Start New Shift and invites a duplicate shift. Ask
              // the lightweight shift endpoint directly instead.
              try {
                const shift = await shiftService.getActive();
                if (shift) setShift(shift);
              } catch (e: any) {
                if (e?.response?.status === 401) clearAuth();
              }
            }
          }
        }
      } finally {
        setBootstrapping(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getInitialRoute = (): keyof RootStackParamList => {
    if (!deviceAuthenticated) return 'DeviceAuthenticate';
    if (!isAuthenticated) return 'PinLogin';
    if (!activeShift) return 'ShiftStart';
    return 'Shell';
  };

  if (bootstrapping) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName={getInitialRoute()}
        screenOptions={{ headerShown: false, animation: 'fade' }}
      >
        <Stack.Screen name="DeviceAuthenticate" component={DeviceAuthenticateScreen} />
        <Stack.Screen name="PinLogin" component={PinLoginScreen} />
        <Stack.Screen name="ShiftStart" component={ShiftStartScreen} />
        <Stack.Screen name="Shell" component={PosShellScreen} />
        <Stack.Screen name="PrinterSetup" component={PrinterSetupScreen} options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="ReceiptPreview" component={ReceiptPreviewScreen} options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="ReceiptSettings" component={ReceiptSettingsScreen} options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="BrandInfo" component={BrandInfoScreen} options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="PosSettings" component={PosSettingsScreen} options={{ animation: 'slide_from_right' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
