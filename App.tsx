import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Navigation from './app/navigation';
import { BarcodeScannerProvider } from './app/providers/BarcodeScannerProvider';
import ToastHost from './app/components/ToastHost';
import KitchenReadyAlert from './app/components/KitchenReadyAlert';
import AlertHost from './app/components/AlertHost';

export default function App() {
  return (
    <SafeAreaProvider>
      <BarcodeScannerProvider>
        <Navigation />
        <AlertHost />
      </BarcodeScannerProvider>
      <ToastHost />
      <KitchenReadyAlert />
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
