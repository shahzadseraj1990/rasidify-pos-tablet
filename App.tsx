import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Navigation from './app/navigation';
import { BarcodeScannerProvider } from './app/providers/BarcodeScannerProvider';
import ToastHost from './app/components/ToastHost';

export default function App() {
  return (
    <SafeAreaProvider>
      <BarcodeScannerProvider>
        <Navigation />
      </BarcodeScannerProvider>
      <ToastHost />
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
