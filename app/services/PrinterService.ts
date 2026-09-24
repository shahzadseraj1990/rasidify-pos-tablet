/**
 * Unified PrinterService — routes to Network (TCP), Bluetooth, USB, or Sunmi.
 *
 * Network (TCP):  react-native-tcp-socket                          — already installed
 * Bluetooth:      react-native-thermal-receipt-printer-image-qr   — installed
 * USB:            react-native-thermal-receipt-printer-image-qr   — same lib, USBPrinter class
 * Sunmi:          @mitsuharu/react-native-sunmi-printer-library    — installed
 *
 * Discovery:
 *   Subnet scan:  react-native-tcp-socket + @react-native-community/netinfo
 */

import { PrinterSettings, DiscoveredPrinter, UsbPrinterDevice } from '../types/receipt';

export type PrintResult = { success: true } | { success: false; error: string };

// ─────────────────────────────────────────────────────────────────────────────
// Network (TCP/IP)
// ─────────────────────────────────────────────────────────────────────────────

async function printNetwork(content: string, host: string, port: number): Promise<PrintResult> {
  console.log(`[Printer] printNetwork: connecting to ${host}:${port}`);
  return new Promise((resolve) => {
    let settled = false;
    let client: any = null;

    // A stale socket from a previous call whose listeners/timers never got torn
    // down can keep firing into this promise (or block the native bridge's
    // socket-id table) — every exit path funnels through here so exactly one
    // resolve happens and the socket + its listeners are always released,
    // which is what a full app restart was doing for us implicitly before.
    const finish = (result: PrintResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (client) {
        try { client.removeAllListeners?.(); } catch {}
        try { client.destroy(); } catch {}
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      console.log('[Printer] 8s timeout fired — no connect callback, no error event');
      finish({ success: false, error: 'Connection timeout (8 s)' });
    }, 8000);

    try {
      const TcpSocket = require('react-native-tcp-socket');
      console.log('[Printer] tcp-socket module loaded OK, createConnection called');
      client = TcpSocket.createConnection({ host, port, tls: false }, () => {
        console.log('[Printer] TCP connected, writing payload...');
        try {
          client.write(content, 'binary', () => {
            console.log('[Printer] write callback fired — data flushed');
            finish({ success: true });
          });
        } catch (e: any) {
          console.log('[Printer] write threw:', e.message);
          finish({ success: false, error: e.message ?? 'Write failed' });
        }
      });
      client.on('error', (err: any) => {
        console.log('[Printer] TCP error event:', err.message ?? err);
        finish({ success: false, error: err.message ?? 'TCP error' });
      });
      client.on('close', () => console.log('[Printer] socket closed'));
    } catch (e: any) {
      console.log('[Printer] require(tcp-socket) threw:', e.message);
      finish({ success: false, error: `react-native-tcp-socket unavailable: ${e.message}` });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: binary-string → base64
// ─────────────────────────────────────────────────────────────────────────────

// `content` from ReceiptBuilder/ImageCanvasBuilder is a raw byte string (one
// char = one byte, 0-255) — that's exactly what a TCP socket write needs.
// But the BLE/USB native `printRawData` methods in this library always run
// their input through `Base64.decode(...)` before writing to the
// socket/bulk-transfer — feeding them the raw byte string directly (as
// `printText`/`printRaw` do) makes Android decode garbage bytes as "base64",
// which is why Bluetooth (and USB, by the same code path) printed unreadable
// output while Network — which writes the same string straight to the
// socket — printed fine.
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function binaryStringToBase64(bin: string): string {
  let out = '';
  for (let i = 0; i < bin.length; i += 3) {
    const b0 = bin.charCodeAt(i) & 0xff;
    const b1 = i + 1 < bin.length ? bin.charCodeAt(i + 1) & 0xff : NaN;
    const b2 = i + 2 < bin.length ? bin.charCodeAt(i + 2) & 0xff : NaN;
    out += BASE64_CHARS[b0 >> 2];
    out += BASE64_CHARS[((b0 & 0x03) << 4) | (isNaN(b1) ? 0 : b1 >> 4)];
    out += isNaN(b1) ? '=' : BASE64_CHARS[((b1 & 0x0f) << 2) | (isNaN(b2) ? 0 : b2 >> 6)];
    out += isNaN(b2) ? '=' : BASE64_CHARS[b2 & 0x3f];
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bluetooth
// ─────────────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Tracks the address we last successfully connected+printed to, so repeat
// prints in the same session can skip the force-close/reconnect/settle-delay
// dance below and go straight to printRaw() — that dance was only ever needed
// to dodge a native crash (see comment further down) that's now fixed at its
// source via patch-package (BLEPrinterAdapter.java's fallback connect path).
// Reset to null on any failure or address change so the next print always
// does a full, safe reconnect instead of trusting a possibly-dead socket.
let lastGoodBluetoothAddress: string | null = null;

async function printBluetooth(content: string, deviceAddress: string): Promise<PrintResult> {
  try {
    const { BLEPrinter } = require('react-native-thermal-receipt-printer-image-qr');
    await BLEPrinter.init();

    const isWarmConnection = lastGoodBluetoothAddress === deviceAddress;
    if (!isWarmConnection) {
      // Switching printers, or the first print this session/after a failure —
      // force-close first. The native module's `selectDevice` otherwise skips
      // reconnecting whenever it still holds a non-null socket for the same
      // address (see BLEPrinterAdapter.java) without checking whether that
      // socket is actually still alive; a printer that silently dropped the
      // RFCOMM connection would then hand back a stale, half-dead socket.
      try { await BLEPrinter.closeConn(); } catch {}
    }
    await BLEPrinter.connectPrinter(deviceAddress);
    if (!isWarmConnection) {
      // Even a genuinely fresh connect() can return before the underlying
      // socket's I/O streams are ready on some Android/OEM stacks — writing
      // immediately after is a known crash source. Only pay this settle cost
      // on a real (re)connect, not on every single print.
      await sleep(250);
    }
    await BLEPrinter.printRaw(binaryStringToBase64(content));
    lastGoodBluetoothAddress = deviceAddress;
    return { success: true };
  } catch (e: any) {
    lastGoodBluetoothAddress = null;
    return {
      success: false,
      error: e.message?.includes('Cannot find module')
        ? 'Install library: npm install react-native-thermal-receipt-printer-image-qr'
        : (e.message ?? 'Bluetooth print failed'),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// USB
// ─────────────────────────────────────────────────────────────────────────────

async function printUsb(
  content: string,
  vendorId: number,
  productId: number,
): Promise<PrintResult> {
  try {
    const { USBPrinter } = require('react-native-thermal-receipt-printer-image-qr');
    await USBPrinter.init();
    await USBPrinter.connectPrinter(vendorId, productId);
    await USBPrinter.printRaw(binaryStringToBase64(content));
    return { success: true };
  } catch (e: any) {
    return {
      success: false,
      error: e.message?.includes('Cannot find module')
        ? 'Install library: npm install react-native-thermal-receipt-printer-image-qr'
        : (e.message ?? 'USB print failed'),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sunmi built-in
// ─────────────────────────────────────────────────────────────────────────────

async function printSunmi(content: string): Promise<PrintResult> {
  try {
    const SunmiPrinter = require('@mitsuharu/react-native-sunmi-printer-library');
    await SunmiPrinter.prepare();
    // `content` is raw ESC/POS bytes (including binary raster image data for
    // the logo) — printText() expects literal display text and mangles any
    // control/image bytes, same failure mode noted above for BLE/USB. Send it
    // as raw bytes instead, exactly like printBluetooth/printUsb do.
    await SunmiPrinter.sendRAWData(binaryStringToBase64(content));
    return { success: true };
  } catch (e: any) {
    return {
      success: false,
      error: e.message ?? 'Sunmi print failed',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function printReceipt(
  content: string,
  settings: PrinterSettings,
): Promise<PrintResult> {
  if (!settings.isConfigured) {
    return { success: false, error: 'Printer not configured. Go to Menu → Printer Setup.' };
  }
  switch (settings.printerType) {
    case 'network': {
      if (!settings.networkHost)
        return { success: false, error: 'Network printer IP not set.' };
      const host = settings.networkHost, port = settings.networkPort || 9100;
      // Many cheap WiFi-to-serial print modules accept only ONE TCP connection
      // at a time and need several seconds of cooldown after the previous one
      // closes before accepting a new one — a sub-second retry isn't enough
      // (this is why an app restart, which takes 10-30s, "fixes" it). Back off
      // across several seconds instead of retrying quickly.
      const backoffsMs = [2000, 4000, 6000];
      let last: PrintResult = { success: false, error: 'Not attempted' };
      for (let attempt = 0; attempt <= backoffsMs.length; attempt++) {
        last = await printNetwork(content, host, port);
        if (last.success) return last;
        if (attempt < backoffsMs.length) {
          const delay = backoffsMs[attempt];
          console.log(`[Printer] attempt ${attempt + 1} failed, retrying in ${delay}ms:`, last.error);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
      return last;
    }

    case 'bluetooth':
      if (!settings.bluetoothDeviceAddress)
        return { success: false, error: 'No Bluetooth device paired.' };
      return printBluetooth(content, settings.bluetoothDeviceAddress);

    case 'usb':
      if (!settings.usbVendorId)
        return { success: false, error: 'No USB printer selected.' };
      return printUsb(content, settings.usbVendorId, settings.usbProductId);

    case 'sunmi':
      return printSunmi(content);

    default:
      return { success: false, error: 'Unknown printer type.' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Discovery: subnet port scan (port 9100)
// ─────────────────────────────────────────────────────────────────────────────

// Probes a single host:port, resolving true/false. Shared by the hint-host
// fast path and the subnet sweep below.
function probeHost(port: number, ip: string, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((res) => {
    try {
      const TcpSocket = require('react-native-tcp-socket');
      let settled = false;
      const finish = (ok: boolean, why: string) => {
        if (settled) return;
        settled = true;
        console.log(`[Discover] ${ip}:${port} -> ${ok ? 'FOUND' : 'no'} (${why})`);
        clearTimeout(t);
        try { c.removeAllListeners?.(); } catch {}
        try { c.destroy(); } catch {}
        res(ok);
      };
      // Bare TCP connect only proves *something* answers on the port — a printer
      // that accepts the connection can still silently drop real ESC/POS data.
      // Write the same ESC/POS init byte the real print path sends, so a printer
      // that connects but doesn't actually accept print data is excluded here.
      const c = TcpSocket.createConnection({ host: ip, port, tls: false }, () => {
        try {
          c.write('\x1B\x40', 'binary', () => finish(true, 'write ok'));
        } catch (e: any) {
          finish(false, `write threw: ${e?.message}`);
        }
      });
      c.on('error', (err: any) => finish(false, `error event: ${err?.message ?? err}`));
      const t = setTimeout(() => finish(false, 'timeout'), timeoutMs);
    } catch (e: any) {
      console.log(`[Discover] ${ip}:${port} -> no (require threw: ${e?.message})`);
      res(false);
    }
  });
}

export async function scanSubnetForPrinters(
  port = 9100,
  timeoutMs = 2500,
  onProgress?: (scanned: number, total: number) => void,
  hintHost?: string,
): Promise<DiscoveredPrinter[]> {
  // Subnet to scan, in priority order:
  //   1. Whatever IP the user already typed in the form (most reliable — no OS
  //      permission/OEM quirks involved, and it's the network they *know* the
  //      printer is on).
  //   2. The phone's own WiFi IP via NetInfo (requires ACCESS_WIFI_STATE, and
  //      some OEM Android builds return null/unreliable data here anyway).
  //   3. Hardcoded 192.168.1.x as a last-resort guess.
  let subnet = '192.168.1';
  const hintTrimmed = hintHost?.trim();
  const hintParts = hintTrimmed?.split('.');
  const hintIsFullIp = hintParts?.length === 4 && hintParts.every((p) => /^\d{1,3}$/.test(p));
  console.log(`[Discover] hintHost received: ${JSON.stringify(hintHost)} -> hintIsFullIp=${hintIsFullIp}`);
  if (hintIsFullIp) {
    subnet = hintParts!.slice(0, 3).join('.');
  } else {
    try {
      const NetInfo = require('@react-native-community/netinfo').default;
      const info = await NetInfo.fetch();
      const localIP: string = (info?.details as any)?.ipAddress ?? '';
      if (localIP) subnet = localIP.split('.').slice(0, 3).join('.');
    } catch {
      // netinfo not installed — default to 192.168.1.x
    }
  }

  const found: DiscoveredPrinter[] = [];
  const total = 254;
  let scanned = 0;

  // Cheap WiFi-to-serial print modules (common in "cloud kitchen" style
  // printers) can take several seconds to complete a TCP handshake, far
  // longer than a typical port-scan timeout — so if the user already typed
  // the printer's IP, probe it alone first with a generous timeout before
  // the fast subnet sweep, instead of giving it the same 2.5s the sweep
  // gives to 253 other addresses that are probably just empty.
  if (hintIsFullIp) {
    const ok = await probeHost(port, hintTrimmed!, 8000);
    scanned += 1;
    onProgress?.(scanned, total);
    if (ok) found.push({ name: hintTrimmed!, host: hintTrimmed!, port, via: 'scan' });
  }

  // Batch in smaller groups than before (30 concurrent connection attempts
  // can itself cause the target device/router to drop or delay SYNs under
  // burst) and give each host more time to complete a slow handshake.
  const BATCH = 12;
  const hosts = Array.from({ length: total }, (_, i) => `${subnet}.${i + 1}`)
    .filter((ip) => ip !== hintTrimmed);

  for (let b = 0; b < hosts.length; b += BATCH) {
    const batch = hosts.slice(b, b + BATCH);
    const results = await Promise.all(batch.map((ip) => probeHost(port, ip, timeoutMs)));
    batch.forEach((ip, i) => {
      if (results[i]) found.push({ name: ip, host: ip, port, via: 'scan' });
    });
    scanned += batch.length;
    onProgress?.(scanned, total);
  }

  // If the hint IP still wasn't found, it may simply have been mid-cooldown
  // when we probed it first (many cheap WiFi-to-serial print modules accept
  // only one TCP connection at a time and refuse new ones for several
  // seconds after the last connection closes). By now the full subnet sweep
  // has taken ~20s+, which is usually enough for that cooldown to have
  // passed — so give the hint host one more try before giving up.
  if (hintIsFullIp && !found.some((f) => f.host === hintTrimmed)) {
    const ok = await probeHost(port, hintTrimmed!, 8000);
    if (ok) found.push({ name: hintTrimmed!, host: hintTrimmed!, port, via: 'scan' });
  }

  return found;
}

// ─────────────────────────────────────────────────────────────────────────────
// USB device list
// ─────────────────────────────────────────────────────────────────────────────

export async function getUsbPrinters(): Promise<UsbPrinterDevice[]> {
  try {
    const { USBPrinter } = require('react-native-thermal-receipt-printer-image-qr');
    await USBPrinter.init();
    const devices: any[] = await USBPrinter.getDeviceList();
    return devices.map((d) => ({
      deviceName: d.device_name ?? d.deviceName ?? 'USB Printer',
      vendorId:   d.vendor_id  ?? d.vendorId  ?? 0,
      productId:  d.product_id ?? d.productId ?? 0,
    }));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bluetooth device scan
// ─────────────────────────────────────────────────────────────────────────────

export interface BluetoothDevice { name: string; address: string; }

// Android 12+ (API 31+) treats BLUETOOTH_SCAN/BLUETOOTH_CONNECT as runtime
// ("dangerous") permissions — declaring them in app.json only lets the OS
// grant them, it does not grant them. Without an explicit runtime request
// here, BluetoothManager.scanDevices() throws and (previously) that error
// was swallowed, silently returning [] and looking like "not fetching".
async function ensureBluetoothPermissions(): Promise<boolean> {
  const { Platform, PermissionsAndroid } = require('react-native');
  if (Platform.OS !== 'android') return true;

  const perms: string[] =
    Platform.Version >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

  const results = await PermissionsAndroid.requestMultiple(perms);
  return Object.values(results).every(
    (r) => r === PermissionsAndroid.RESULTS.GRANTED,
  );
}

export async function scanBluetoothDevices(): Promise<BluetoothDevice[]> {
  const granted = await ensureBluetoothPermissions();
  if (!granted) {
    throw new Error('Bluetooth/location permission denied. Enable it in Android Settings → Apps → Rasidify POS → Permissions.');
  }
  // This library's BLEPrinter only exposes getDeviceList() (already-paired
  // devices), not a live BLE scan — pair the printer in Android Bluetooth
  // settings first, then it will show up here.
  const { BLEPrinter } = require('react-native-thermal-receipt-printer-image-qr');
  await BLEPrinter.init();
  const devices: any[] = await BLEPrinter.getDeviceList();
  return (devices ?? []).map((d: any) => ({
    name:    d.device_name ?? d.name    ?? 'Unknown',
    address: d.inner_mac_address ?? d.address ?? d.macAddress ?? '',
  }));
}
