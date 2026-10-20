// Client side of kds-link — used by the waiter and cashier apps to talk to the
// Local Hub on the KDS tablet (see protocol.ts).
//
// - Auto-reconnect with back-off; heartbeat ping every 5 s, reconnect after
//   15 s of silence.
// - Outbox: every sent message is kept (and persisted) until the hub acks it,
//   then re-sent after reconnect, so a ticket sent while the kitchen is offline
//   arrives once it is back.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  KDS_PORT, PROTOCOL_VERSION, Envelope, MessageType, HelloPayload, WelcomePayload,
  UNACKED, LineBuffer, SeenIds, decode, encode, makeEnvelope,
} from './protocol';

export type LinkStatus = 'idle' | 'connecting' | 'connected' | 'offline' | 'rejected';

export interface ClientOptions {
  deviceId: string;
  deviceType: HelloPayload['deviceType'];
  name: string;
  branchId: number | null;
  token?: string;
  appVersion?: string;
  /** Where unacked messages are saved; give each hub connection its own. */
  outboxKey?: string;
  onMessage?: (env: Envelope) => void;
  onStatus?: (status: LinkStatus, info?: { hub?: WelcomePayload; reason?: string }) => void;
  onLog?: (line: string) => void;
}

const OUTBOX_KEY = 'kds_outbox_v1';
const PING_MS = 5000;
const SILENCE_MS = 15000;
const RESEND_MS = 5000;
const MAX_BACKOFF_MS = 10000;
const CONNECT_TIMEOUT_MS = 8000;

export class KdsClient {
  private socket: any = null;
  private buffer = new LineBuffer();
  private seen = new SeenIds();
  private outbox: Envelope[] = [];
  private host: string | null = null;
  private port = KDS_PORT;
  private status: LinkStatus = 'idle';
  private hub: WelcomePayload | undefined;
  private lastData = 0;
  private backoff = 1000;
  private wanted = false;
  private timers: ReturnType<typeof setInterval>[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSent = new Map<string, number>();

  constructor(private opts: ClientOptions) {}

  get currentStatus() { return this.status; }
  get hubInfo() { return this.hub; }
  get pending() { return this.outbox.length; }

  async connect(host: string, port = KDS_PORT) {
    this.host = host;
    this.port = port;
    this.wanted = true;
    await this.loadOutbox();
    this.open();
  }

  disconnect() {
    this.wanted = false;
    this.clearTimers();
    try { this.socket?.destroy(); } catch {}
    this.socket = null;
    this.setStatus('idle');
  }

  /** Queue a message for the hub; delivered (and re-sent) until acked. */
  send(type: MessageType, payload: unknown): string {
    const env = makeEnvelope(type, this.opts.deviceId, payload);
    if (!UNACKED.includes(type)) {
      this.outbox.push(env);
      this.saveOutbox();
    }
    if (this.status === 'connected') this.write(env);
    return env.id;
  }

  // ── internals ────────────────────────────────────────────────────────
  private open() {
    if (!this.host || !this.wanted) return;
    this.clearTimers();
    this.setStatus('connecting');
    const TcpSocket = require('react-native-tcp-socket');
    this.buffer = new LineBuffer();
    const socket = TcpSocket.createConnection({ host: this.host, port: this.port, tls: false }, () => {
      this.lastData = Date.now();
      const hello: HelloPayload = {
        deviceId: this.opts.deviceId, deviceType: this.opts.deviceType, name: this.opts.name,
        branchId: this.opts.branchId, token: this.opts.token, appVersion: this.opts.appVersion,
        protocol: PROTOCOL_VERSION,
      };
      this.write(makeEnvelope('hello', this.opts.deviceId, hello));
    });
    this.socket = socket;
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null;
      if (this.socket === socket && this.status !== 'connected') {
        this.log('connect timed out, retrying');
        this.socket = null;
        try { socket.destroy(); } catch {}
        this.setStatus('offline');
        this.scheduleReconnect();
      }
    }, CONNECT_TIMEOUT_MS);
    socket.setEncoding?.('utf8');
    socket.on('data', (data: any) => {
      this.lastData = Date.now();
      const text = typeof data === 'string' ? data : data.toString('utf8');
      for (const line of this.buffer.push(text)) this.handleLine(line);
    });
    socket.on('error', (e: any) => this.log(`socket error: ${e?.message ?? e}`));
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearTimers();
      if (this.status !== 'rejected') this.setStatus('offline');
      this.scheduleReconnect();
    });
  }

  private handleLine(line: string) {
    const env = decode(line);
    if (!env) return;
    switch (env.type) {
      case 'welcome':
        if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
        this.hub = env.payload as WelcomePayload;
        this.backoff = 1000;
        this.setStatus('connected', { hub: this.hub });
        this.startTimers();
        this.flushOutbox(true);
        return;
      case 'reject':
        this.wanted = false;
        this.setStatus('rejected', { reason: env.payload?.reason });
        try { this.socket?.destroy(); } catch {}
        return;
      case 'ack': {
        const before = this.outbox.length;
        this.outbox = this.outbox.filter(e => e.id !== env.payload?.ackId);
        this.lastSent.delete(env.payload?.ackId);
        if (this.outbox.length !== before) this.saveOutbox();
        return;
      }
      case 'ping':
        this.write(makeEnvelope('pong', this.opts.deviceId, {}));
        return;
      case 'pong':
        return;
      default:
        if (!UNACKED.includes(env.type)) this.write(makeEnvelope('ack', this.opts.deviceId, { ackId: env.id }));
        if (this.seen.has(env.id)) return;
        this.seen.add(env.id);
        this.opts.onMessage?.(env);
    }
  }

  private startTimers() {
    this.clearTimers();
    this.timers.push(setInterval(() => {
      if (Date.now() - this.lastData > SILENCE_MS) {
        this.log('no data from hub, reconnecting');
        try { this.socket?.destroy(); } catch {}
        return;
      }
      this.write(makeEnvelope('ping', this.opts.deviceId, {}));
    }, PING_MS));
    this.timers.push(setInterval(() => this.flushOutbox(false), RESEND_MS));
  }

  private flushOutbox(all: boolean) {
    if (this.status !== 'connected') return;
    const now = Date.now();
    for (const env of this.outbox) {
      const last = this.lastSent.get(env.id) ?? 0;
      if (all || now - last >= RESEND_MS) this.write(env);
    }
  }

  private write(env: Envelope) {
    if (!this.socket) return;
    try {
      this.socket.write(encode(env));
      this.lastSent.set(env.id, Date.now());
    } catch (e: any) {
      this.log(`write failed: ${e?.message}`);
    }
  }

  private scheduleReconnect() {
    if (!this.wanted || this.reconnectTimer) return;
    const wait = this.backoff;
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, wait);
  }

  private clearTimers() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
  }

  private setStatus(status: LinkStatus, info?: { hub?: WelcomePayload; reason?: string }) {
    if (this.status === status && !info) return;
    this.status = status;
    this.opts.onStatus?.(status, info);
  }

  private async loadOutbox() {
    try {
      const raw = await AsyncStorage.getItem(this.opts.outboxKey ?? OUTBOX_KEY);
      if (raw) this.outbox = JSON.parse(raw);
    } catch {}
  }

  private saveOutbox() {
    AsyncStorage.setItem(this.opts.outboxKey ?? OUTBOX_KEY, JSON.stringify(this.outbox)).catch(() => {});
  }

  private log(line: string) { this.opts.onLog?.(line); }
}

// ── Discovery ──────────────────────────────────────────────────────────
export interface FoundHub { host: string; hub: WelcomePayload }

/** Probe one address: connect, say hello as a probe, wait for `welcome`. */
export function probeHub(host: string, port = KDS_PORT, timeoutMs = 900): Promise<FoundHub | null> {
  return new Promise(resolve => {
    let done = false;
    let sock: any;
    const finish = (r: FoundHub | null) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      try { sock?.destroy(); } catch {}
      resolve(r);
    };
    const t = setTimeout(() => finish(null), timeoutMs);
    try {
      const TcpSocket = require('react-native-tcp-socket');
      const buf = new LineBuffer();
      sock = TcpSocket.createConnection({ host, port, tls: false }, () => {
        const hello: HelloPayload = { deviceId: 'probe', deviceType: 'probe', name: 'probe', branchId: null, protocol: PROTOCOL_VERSION };
        sock.write(encode(makeEnvelope('hello', 'probe', hello)));
      });
      sock.setEncoding?.('utf8');
      sock.on('data', (d: any) => {
        for (const line of buf.push(typeof d === 'string' ? d : d.toString('utf8'))) {
          const env = decode(line);
          if (env?.type === 'welcome') finish({ host, hub: env.payload });
        }
      });
      sock.on('error', () => finish(null));
    } catch {
      finish(null);
    }
  });
}

/** Scan this device's /24 subnet for a hub (about 3–8 s on a normal LAN): the KDS, or a customer display with port = CDS_PORT. */
export async function discoverHubs(onProgress?: (done: number, total: number) => void, port = KDS_PORT): Promise<FoundHub[]> {
  let subnet = '192.168.1';
  let ownIp = '';
  // expo-network first (no permission needed); NetInfo's Wi-Fi details need
  // location permission on some phones.
  try {
    const Network = require('expo-network');
    const addr: string = await Network.getIpAddressAsync();
    if (addr && addr !== '0.0.0.0') ownIp = addr;
  } catch {}
  if (!ownIp) {
    try {
      const NetInfo = require('@react-native-community/netinfo').default;
      const info = await NetInfo.fetch();
      ownIp = (info?.details as any)?.ipAddress ?? '';
    } catch {}
  }
  if (ownIp) subnet = ownIp.split('.').slice(0, 3).join('.');

  const hosts: string[] = [];
  for (let i = 1; i <= 254; i++) hosts.push(`${subnet}.${i}`);
  // The hub may run on this same device (testing): try it first.
  if (ownIp) hosts.unshift('127.0.0.1');

  const found: FoundHub[] = [];
  let done = 0;
  const BATCH = 32;
  for (let i = 0; i < hosts.length; i += BATCH) {
    const batch = hosts.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(h => probeHub(h, port)));
    results.forEach(r => {
      if (!r) return;
      const i = found.findIndex(f => f.hub.hubId === r.hub.hubId);
      if (i < 0) found.push(r);
      else if (found[i].host === '127.0.0.1') found[i] = r; // same hub on the LAN: other devices can use this address
    });
    done += batch.length;
    onProgress?.(done, hosts.length);
  }
  return found;
}
