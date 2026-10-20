// Kitchen tickets for the KDS (see D:\Rasidify\KDS_APP\KDS-API-CHANGES.md).
//
// Each Send / Update Order produces at most one ticket holding only what
// changed since the last send (round 1 = the first send, round 2+ = "add more
// items"). "Already sent" is the order's kitchen history from the POS API
// (GET /pos/kds/tickets?invoiceId=), so it is correct across devices.
//
// A ticket goes two ways:
//   - LAN → the KDS Local Hub (instant, works without internet)
//   - POS API POST /pos/kds/tickets (cloud copy; idempotent by ticketId, so a
//     failed POST is kept in a small outbox and retried later)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { posApi } from './api';
import { CartItem } from '../types';
import { KitchenTicket, TicketItem, newId } from '../kds-link/protocol';
import { useKitchenStore } from '../store/kitchenStore';
import { useCartStore } from '../store/cartStore';

const CLOUD_OUTBOX_KEY = 'kds_cloud_outbox_v1';

/** Same product + same modifiers = the same kitchen line. */
export function kitchenLineKey(productID: number, modifiers?: string | null) {
  return `${productID}|${(modifiers ?? '').trim().toLowerCase()}`;
}

export interface KitchenSentState {
  sent: Record<string, number>; // lineKey → qty already sent to the kitchen
  rounds: number;               // tickets sent so far
}

/** Order lines as "already in the kitchen" — used for orders with no kitchen history. */
export function sentStateFromItems(items: Pick<CartItem, 'productID' | 'selectionSummary' | 'qty'>[]): KitchenSentState {
  const sent: Record<string, number> = {};
  items.forEach(i => {
    const k = kitchenLineKey(i.productID, i.selectionSummary);
    sent[k] = (sent[k] ?? 0) + i.qty;
  });
  return { sent, rounds: 0 };
}

/** What this order has already sent to the kitchen, from the cloud history. */
export async function fetchKitchenState(invoiceID: number): Promise<KitchenSentState | null> {
  const res = await posApi.get('/pos/kds/tickets', { params: { invoiceId: invoiceID } });
  const data = res.data?.data ?? res.data;
  const tickets: any[] = data?.tickets ?? [];
  const items: any[] = data?.items ?? [];
  if (tickets.length === 0) return null; // no kitchen history (e.g. order made before KDS)
  const sent: Record<string, number> = {};
  items.forEach(it => {
    const k = kitchenLineKey(it.productID, it.modifiersText);
    const qty = Number(it.qty) || 0;
    sent[k] = (sent[k] ?? 0) + (String(it.changeType).toLowerCase() === 'void' ? -qty : qty);
  });
  return { sent, rounds: tickets.length };
}

/**
 * After a saved order is opened into the cart: assume its current lines are
 * already in the kitchen, then replace that with the real kitchen history once
 * it loads (only if the same order is still open).
 */
export function loadKitchenStateIntoCart(invoiceID: number) {
  const cart = useCartStore.getState();
  const fallback = sentStateFromItems(cart.items);
  cart.setKitchenSent(fallback.sent, 0);
  fetchKitchenState(invoiceID)
    .then(s => {
      if (s && useCartStore.getState().checkoutInvoiceID === invoiceID) {
        useCartStore.getState().setKitchenSent(s.sent, s.rounds);
      }
    })
    .catch(() => {});
}

/** Lines to add or void compared with what the kitchen already has. */
export function buildDelta(items: CartItem[], sent: Record<string, number>): TicketItem[] {
  const now: Record<string, { item: CartItem; qty: number; notes: string[] }> = {};
  items.forEach(i => {
    const k = kitchenLineKey(i.productID, i.selectionSummary);
    const cur = now[k] ?? { item: i, qty: 0, notes: [] };
    cur.qty += i.qty;
    if (i.kitchenNote?.trim()) cur.notes.push(i.kitchenNote.trim());
    now[k] = cur;
  });

  const delta: TicketItem[] = [];
  const keys = new Set([...Object.keys(now), ...Object.keys(sent)]);
  keys.forEach(k => {
    const diff = (now[k]?.qty ?? 0) - (sent[k] ?? 0);
    if (diff === 0) return;
    const src = now[k]?.item;
    const [pid] = k.split('|');
    delta.push({
      lineKey: k,
      productId: src?.productID ?? Number(pid),
      name: src?.name ?? 'Item',
      qty: Math.abs(diff),
      modifiers: src?.selectionSummary ? [src.selectionSummary] : [],
      note: now[k]?.notes.join('; ') || undefined,
      change: diff > 0 ? 'add' : 'void',
      categoryId: null,
      stationId: null,
      status: 'new',
    });
  });
  return delta;
}

export interface SendTicketMeta {
  invoiceID: number;
  orderNo: string;
  round: number;
  table?: string | null;
  orderType?: string | null;
  staffName?: string | null;
  staffUserID?: number | null;
  customer?: string | null;
  phone?: string | null;
  branchID: number | null;
  deviceID?: number | null;
  note?: string | null;
  source?: 'waiter' | 'cashier';
}

/** Send one ticket to the kitchen: LAN hub + cloud. Never throws. */
export async function sendKitchenTicket(meta: SendTicketMeta, items: TicketItem[]): Promise<{ lan: boolean }> {
  const ticket: KitchenTicket = {
    ticketId: newId(),
    invoiceId: meta.invoiceID,
    orderNo: meta.orderNo,
    round: meta.round,
    table: meta.table ?? null,
    orderType: meta.orderType ?? null,
    staff: meta.staffName ?? null,
    customer: meta.customer || null,
    phone: meta.phone || null,
    source: meta.source ?? 'waiter',
    note: meta.note || null,
    status: 'new',
    createdAt: Date.now(),
    items,
  };

  // LAN first (instant). Queued in the client outbox if the kitchen is offline.
  const kitchen = useKitchenStore.getState();
  kitchen.sendTicket(ticket);
  const lan = kitchen.status === 'connected';

  // Cloud copy.
  const body = {
    ticketId: ticket.ticketId,
    invoiceID: meta.invoiceID,
    branchID: meta.branchID,
    round: meta.round,
    status: 'New',
    stationID: null,
    sourceDeviceID: meta.deviceID ?? null,
    staffUserID: meta.staffUserID ?? null,
    note: meta.note || null,
    items: items.map(i => ({
      invoiceDetailID: null,
      productID: i.productId,
      productName: i.name,
      qty: i.qty,
      modifiersText: i.modifiers.join(', '),
      note: i.note ?? null,
      changeType: i.change === 'void' ? 'Void' : 'Add',
      stationID: null,
    })),
  };
  await queueCloud(body);
  flushCloudOutbox().catch(() => {});
  return { lan };
}

// ── Cloud outbox ──────────────────────────────────────────────────────
async function readOutbox(): Promise<any[]> {
  try { return JSON.parse((await AsyncStorage.getItem(CLOUD_OUTBOX_KEY)) ?? '[]'); } catch { return []; }
}
async function writeOutbox(list: any[]) {
  try { await AsyncStorage.setItem(CLOUD_OUTBOX_KEY, JSON.stringify(list)); } catch {}
}
async function queueCloud(body: any) {
  const list = await readOutbox();
  list.push(body);
  await writeOutbox(list);
}

let flushing = false;
/** Post queued tickets to the POS API; keeps the ones that fail. */
export async function flushCloudOutbox() {
  if (flushing) return;
  flushing = true;
  try {
    const list = await readOutbox();
    const left: any[] = [];
    for (const body of list) {
      try {
        const res = await posApi.post('/pos/kds/tickets', body, { timeout: 20000 });
        if (res.data?.status === 2) {
          console.log('[KDS] cloud ticket rejected:', res.data?.message);
          // A permanent rejection would block the queue forever — drop it.
        }
      } catch (e: any) {
        left.push(body); // network / server error: retry later
      }
    }
    // Keep anything queued while this flush ran.
    const now = await readOutbox();
    const added = now.slice(list.length);
    await writeOutbox([...left, ...added]);
  } finally {
    flushing = false;
  }
}
