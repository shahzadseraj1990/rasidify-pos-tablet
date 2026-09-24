# Rasidify Tablet POS

Standalone Expo/React Native tablet POS app. Independent from `rasidify-pos-mobile` (read-only functional reference — never modify it).

## Status

**Scaffolded — UI/navigation not yet implemented.**

Done:
- Expo TypeScript project (SDK 57, RN 0.86, landscape orientation)
- `app/` folder structure mirroring the mobile app's conventions (screens, navigation, store, services, hooks, providers, types, utils)
- Dependencies installed: react-navigation, zustand, axios, expo-secure-store, async-storage, react-native-tcp-socket, react-native-thermal-receipt-printer-image-qr, @mitsuharu/react-native-sunmi-printer-library, expo-camera, react-native-svg, @expo/vector-icons
- Reusable business logic ported as-is from the mobile app (near-zero RN coupling): `services/barcode/*`, `services/escpos/*`, `services/PrinterService.ts`, `services/orderService.ts`, `services/productService.ts`, `services/shiftService.ts`, `services/authService.ts`, `services/deviceService.ts`, `services/api.ts`, all `store/*`, `types/*`, `utils/format.ts`, `utils/qrMatrix.ts`, `hooks/useBarcodeHandler.ts`, `providers/BarcodeScannerProvider.tsx`, `components/common/ZatcaQrCode.tsx`, `components/Icon.tsx`, `config.ts`
- `npx tsc --noEmit` passes clean

Not done yet:
- Navigation stack / screens (design language: light theme, off-white bg, teal accent, dense split-screen master-detail — see `Tablet POS UI/` reference, which is actually the **web POS** design reference, not tablet-native mockups)
- New `utils/colors.ts` for the tablet's own palette (mobile's `colors.ts` was intentionally not copied — different design language)
- Printer setup screen: port mobile's `PrinterSetupScreen.tsx` flow (printer type select, network IP discovery, Bluetooth/USB pairing) but restyle to tablet design language — no equivalent screen exists in the web UI reference
- Reports screen parity check against mobile's `ReportsScreen.tsx` (not yet deep-reviewed)
- Two tablet-only features with no mobile equivalent, need fresh design: POS Settings category-display-depth control, "favourite product groups"

## Notes

- `.npmrc` sets `legacy-peer-deps=true` — `react-native-ping` (a transitive dep of the thermal printer package) has a peer range that doesn't include current RN versions; same conflict exists in the mobile project's dependency tree.
- Printing logic ports over as-is; only the native module bindings in `PrinterService.ts` are RN-specific glue, already present via the installed packages.
