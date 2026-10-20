// Local Hub — runs inside the KDS app on the kitchen tablet. Waiter and cashier
// devices connect to it over the LAN (see protocol.ts).
import {
  KDS_PORT, PROTOCOL_VERSION, Envelope, MessageType, HelloPayload, WelcomePayload, StoreInfo,
  UNACKED, LineBuffer, SeenIds, decode, encode, makeEnvelope,
} from './protocol';

export interface HubClient {
  key: string;               // socket key (remote address:port)
  deviceId: string | null;   // set after `hello`
  deviceType: HelloPayload['deviceType'] | null;
  name: string;
  connectedAt: number;
  lastSeen: number;
}

interface Conn extends HubClient {
  socket: any;
  buffer: LineBuffer;
}

export interface HubOptions {
  hubId: string;
  hubName: string;
  branchId: number | null;
  port?: number;
  /** Merchant name/logo for the order board, sent in every welcome. */
  getStore?: () => StoreInfo | undefined;
  /** Current active tickets, sent to every device right after it connects. */
  getSnapshot?: () => unknown;
  /** Return a reason string to refuse a device (pairing, other branch…). */
  authorize?: (hello: HelloPayload) => string | null;
  onMessage?: (env: Envelope, client: HubClient) => void;
  onClientsChange?: (clients: HubClient[]) => void;
  onLog?: (line: string) => void;
}

const HEARTBEAT_MS = 5000;
const CLIENT_TIMEOUT_MS = 20000;

export class KdsHub {
  private server: any = null;
  private conns = new Map<string, Conn>();
  private seen = new SeenIds();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private opts: HubOptions) {}

  get port() { return this.opts.port ?? KDS_PORT; }
  get running() { return this.server != null; }

  clients(): HubClient[] {
    return [...this.conns.values()]
      .filter(c => c.deviceId)
      .map(({ socket, buffer, ...c }) => c);
  }

  start(): Promise<void> {
    if (this.server) return Promise.resolve();
    const TcpSocket = require('react-native-tcp-socket');
    return new Promise((resolve, reject) => {
      const server = TcpSocket.createServer((socket: any) => this.accept(socket));
      server.on('error', (e: any) => {
        this.log(`server error: ${e?.message ?? e}`);
        reject(e);
      });
      server.listen({ port: this.port, host: '0.0.0.0', reuseAddress: true }, () => {
        this.server = server;
        this.log(`hub listening on :${this.port}`);
        this.sweepTimer = setInterval(() => this.sweep(), HEARTBEAT_MS);
        resolve();
      });
    });
  }

  stop() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    for (const c of this.conns.values()) { try { c.socket.destroy(); } catch {} }
    this.conns.clear();
    try { this.server?.close(); } catch {}
    this.server = null;
    this.emitClients();
    this.log('hub stopped');
  }

  /** Send to every identified device, optionally skipping one deviceId. */
  broadcast(type: MessageType, payload: unknown, exceptDeviceId?: string) {
    const env = makeEnvelope(type, this.opts.hubId, payload);
    for (const c of this.conns.values()) {
      if (c.deviceId && c.deviceType !== 'probe' && c.deviceId !== exceptDeviceId) this.write(c, env);
    }
    return env.id;
  }

  sendTo(deviceId: string, type: MessageType, payload: unknown) {
    const env = makeEnvelope(type, this.opts.hubId, payload);
    for (const c of this.conns.values()) if (c.deviceId === deviceId) this.write(c, env);
    return env.id;
  }

  // ── internals ────────────────────────────────────────────────────────
  private accept(socket: any) {
    const key = `${socket.remoteAddress ?? '?'}:${socket.remotePort ?? Math.random()}`;
    const conn: Conn = {
      key, socket, buffer: new LineBuffer(), deviceId: null, deviceType: null,
      name: key, connectedAt: Date.now(), lastSeen: Date.now(),
    };
    this.conns.set(key, conn);
    socket.setEncoding?.('utf8');
    socket.on('data', (data: any) => {
      conn.lastSeen = Date.now();
      const text = typeof data === 'string' ? data : data.toString('utf8');
      for (const line of conn.buffer.push(text)) this.handleLine(conn, line);
    });
    socket.on('error', (e: any) => this.log(`${conn.name}: socket error ${e?.message ?? e}`));
    socket.on('close', () => {
      this.conns.delete(key);
      if (conn.deviceId && conn.deviceType !== 'probe') this.log(`${conn.name} disconnected`);
      this.emitClients();
    });
  }

  private handleLine(conn: Conn, line: string) {
    const env = decode(line);
    if (!env) return;

    if (env.type === 'ping') { this.write(conn, makeEnvelope('pong', this.opts.hubId, {})); return; }
    if (env.type === 'pong' || env.type === 'ack') return;

    if (env.type === 'hello') { this.handleHello(conn, env as Envelope<HelloPayload>); return; }
    if (!conn.deviceId) return; // must say hello first

    // Ack first, then process once (the sender re-sends until acked).
    if (!UNACKED.includes(env.type)) this.write(conn, makeEnvelope('ack', this.opts.hubId, { ackId: env.id }));
    if (this.seen.has(env.id)) return;
    this.seen.add(env.id);
    this.opts.onMessage?.(env, this.publicClient(conn));
  }

  private handleHello(conn: Conn, env: Envelope<HelloPayload>) {
    const hello = env.payload;
    const reason = hello.deviceType === 'probe' ? null : this.opts.authorize?.(hello) ?? null;
    if (reason) {
      this.write(conn, makeEnvelope('reject', this.opts.hubId, { reason }));
      this.log(`rejected ${hello.name}: ${reason}`);
      setTimeout(() => { try { conn.socket.destroy(); } catch {} }, 200);
      return;
    }
    // One live connection per device: drop an older socket of the same device.
    for (const other of this.conns.values()) {
      if (other !== conn && other.deviceId === hello.deviceId) { try { other.socket.destroy(); } catch {} }
    }
    conn.deviceId = hello.deviceId;
    conn.deviceType = hello.deviceType;
    conn.name = hello.name || hello.deviceId;
    const welcome: WelcomePayload = {
      hubId: this.opts.hubId, hubName: this.opts.hubName, branchId: this.opts.branchId,
      serverTime: Date.now(), protocol: PROTOCOL_VERSION, store: this.opts.getStore?.(),
    };
    this.write(conn, makeEnvelope('welcome', this.opts.hubId, welcome));
    if (hello.deviceType === 'probe') return; // discovery scan: welcome only
    if (this.opts.getSnapshot) this.write(conn, makeEnvelope('snapshot', this.opts.hubId, this.opts.getSnapshot()));
    this.log(`${conn.name} (${hello.deviceType}) connected`);
    this.emitClients();
  }

  private write(conn: Conn, env: Envelope) {
    try { conn.socket.write(encode(env)); } catch (e: any) { this.log(`write to ${conn.name} failed: ${e?.message}`); }
  }

  private sweep() {
    const now = Date.now();
    for (const c of this.conns.values()) {
      if (now - c.lastSeen > CLIENT_TIMEOUT_MS) {
        this.log(`${c.name} timed out`);
        try { c.socket.destroy(); } catch {}
      }
    }
  }

  private publicClient(c: Conn): HubClient {
    const { socket, buffer, ...rest } = c;
    return rest;
  }

  private emitClients() { this.opts.onClientsChange?.(this.clients()); }
  private log(line: string) { this.opts.onLog?.(line); }
}
