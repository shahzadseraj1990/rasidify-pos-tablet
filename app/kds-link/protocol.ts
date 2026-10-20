// kds-link protocol — shared by the KDS app (hub) and the waiter / cashier apps
// (clients), by the customer display (CDS app, its own hub on CDS_PORT) and by
// the order board (Order Board app, a read-only client of the KDS hub).
// Keep this file identical in every app that uses it.
//
// Transport: plain TCP on the restaurant LAN, one JSON envelope per line
// ("\n"-terminated). Every envelope except `ack`, `ping` and `pong` is
// acknowledged by the receiver with `{ type: 'ack', payload: { ackId } }`;
// senders re-send until acked, receivers ignore envelope ids they already saw.

export const KDS_PORT = 8765;
export const CDS_PORT = 8766;
export const PROTOCOL_VERSION = 1;

export type DeviceType = 'kds' | 'waiter' | 'cashier' | 'cds' | 'board' | 'probe';

export interface Envelope<P = any> {
  id: string;        // unique per message (dedupe + ack)
  type: MessageType;
  ts: number;        // sender clock, ms
  from: string;      // sender deviceId
  payload: P;
}

export type MessageType =
  | 'hello' | 'welcome' | 'reject'
  | 'ack' | 'ping' | 'pong'
  | 'snapshot'
  | 'ticket.create' | 'ticket.void' | 'ticket.status' | 'item.status'
  | 'table.changed'   // an order was held / paid → other devices reload their tables
  | 'cds.state'       // cashier → customer display: what the customer should see now
  | 'pay.request'     // cashier → display: take this card amount (re-sent until final)
  | 'pay.cancel'      // cashier → display: stop that card payment
  | 'pay.status'      // display → cashier: where a card payment is now
  | 'test.echo';

export interface HelloPayload {
  deviceId: string;
  deviceType: DeviceType;
  name: string;              // e.g. "Waiter tablet 1"
  branchId: number | null;
  token?: string;            // pairing token (Phase 1)
  appVersion?: string;
  protocol: number;
}

export interface WelcomePayload {
  hubId: string;
  hubName: string;
  branchId: number | null;
  serverTime: number;
  protocol: number;
  store?: StoreInfo;         // merchant shown on the order board (KDS hub only)
}

export interface StoreInfo {
  name?: string;
  sub?: string;              // branch / tagline line under the name
  logoUrl?: string;
}

// Messages that don't need an ack.
// cds.state is latest-wins: the cashier re-sends the whole state on every
// change and on reconnect, so a lost one needs no outbox / re-send.
// pay.* are idempotent by requestId: the cashier repeats request/cancel every
// couple of seconds and the display answers each with the current pay.status,
// so they need no ack or outbox either (an outbox could replay a stale request).
export const UNACKED: MessageType[] = ['ack', 'ping', 'pong', 'welcome', 'reject', 'hello', 'cds.state', 'pay.request', 'pay.cancel', 'pay.status'];

// Cloud timestamps are stored in UTC (GETUTCDATE into DATETIME), and the API
// returns them without a zone ("2026-09-26T05:48:10.12"). Date.parse would read
// that as device-local time (3 h off in KSA), so a zone-less string is UTC.
export function parseUtc(s: string | null | undefined): number {
  if (!s) return NaN;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(s.trim());
  return Date.parse(hasZone ? s : `${s.trim().replace(' ', 'T')}Z`);
}

export function newId(): string {
  // RFC4122-ish v4; crypto isn't guaranteed in RN, collisions don't matter at this scale.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function makeEnvelope<P>(type: MessageType, from: string, payload: P, id = newId()): Envelope<P> {
  return { id, type, ts: Date.now(), from, payload };
}

export function encode(env: Envelope): string {
  return JSON.stringify(env) + '\n';
}

// Splits a TCP byte stream into complete lines; keeps a partial tail between chunks.
export class LineBuffer {
  private tail = '';
  push(chunk: string): string[] {
    this.tail += chunk;
    const parts = this.tail.split('\n');
    this.tail = parts.pop() ?? '';
    return parts.filter(l => l.trim().length > 0);
  }
}

export function decode(line: string): Envelope | null {
  try {
    const env = JSON.parse(line);
    return env && typeof env.type === 'string' ? env : null;
  } catch {
    return null;
  }
}

// Remembers recently seen envelope ids so re-sent messages are handled once.
export class SeenIds {
  private ids = new Map<string, number>();
  constructor(private max = 2000) {}
  has(id: string) { return this.ids.has(id); }
  add(id: string) {
    this.ids.set(id, Date.now());
    if (this.ids.size > this.max) {
      const first = this.ids.keys().next().value;
      if (first !== undefined) this.ids.delete(first);
    }
  }
}

// ── Kitchen ticket model (Phase 1 uses it fully; Phase 0 only for tests) ──
export type KitchenStatus = 'new' | 'preparing' | 'ready' | 'bumped' | 'voided';

export interface TicketItem {
  lineKey: string;           // product + modifiers key (no API line ids yet)
  productId: number;
  name: string;
  qty: number;
  modifiers: string[];
  note?: string;
  change: 'add' | 'void';
  categoryId?: number | null;
  stationId?: number | null; // multi-station later
  status: KitchenStatus;
}

export interface KitchenTicket {
  ticketId: string;
  invoiceId: number | null;
  orderNo: string;
  round: number;
  table?: string | null;
  orderType?: string | null;
  staff?: string | null;
  customer?: string | null;  // customer name (the order board shows the first name)
  phone?: string | null;     // customer phone (the order board shows only the last 3 digits)
  source: string;            // sending deviceId
  note?: string | null;
  status: KitchenStatus;
  createdAt: number;
  startedAt?: number | null;
  readyAt?: number | null;
  bumpedAt?: number | null;
  items: TicketItem[];
}

// ── Customer display (CDS app) ──────────────────────────────────────────
export type CdsMode = 'idle' | 'cart' | 'payment' | 'paid';

export interface CdsLine {
  name: string;
  nameAr?: string;
  qty: number;
  price: number;
  total: number;
  selections?: string;
}

/** Everything the customer display shows; the cashier always sends all of it. */
export interface CdsState {
  seq: number;               // grows with every change (older ones are ignored)
  mode: CdsMode;
  storeName?: string;
  storeSub?: string;         // branch line under the store name, e.g. "Olaya"
  logoUrl?: string;
  currency: string;
  orderType?: string;        // e.g. "Dine In"
  table?: string | null;     // e.g. "T04"
  taxRate?: number;          // whole percent, e.g. 15
  methods?: string[];        // payment methods the POS accepts (Please pay chips)
  lines: CdsLine[];
  subtotal: number;
  discount: number;
  tax: number;
  taxLabel?: string;
  total: number;
  // mode 'paid' (orderNo also while the order has a number, e.g. a resumed one)
  paid?: number;
  change?: number;
  orderNo?: string;
  zatcaQr?: string | null;
  cashPaid?: number;         // cash part of the payment (Paid / Change cards show only for cash)
}

// ── Card payment on the customer display (tap to pay) ────────────────────
export type PayStatus = 'waiting' | 'processing' | 'approved' | 'declined' | 'cancelled' | 'error';
export const PAY_FINAL: PayStatus[] = ['approved', 'declined', 'cancelled', 'error'];

export interface PayRequest {
  requestId: string;
  amount: number;
  currency: string;
  method: string;            // the POS payment method name, e.g. "Card"
  orderRef?: string;         // shown to the customer / sent to the acquirer
  createdAt: number;
}

export interface PayStatusPayload {
  requestId: string;
  status: PayStatus;
  amount: number;
  at: number;
  message?: string;          // decline / error reason
  approvalCode?: string;
  cardScheme?: string;       // Visa, Mastercard, mada…
  cardLast4?: string;
  reference?: string;        // acquirer transaction id (NearPay later)
  simulated?: boolean;       // true while the test reader is used
}
