// Connection to the kitchen (KDS Local Hub) and the kitchen state of orders.
// Shared by the waiter app and the cashier POS (same file in both; only the
// deviceType passed to init differs).
//
// Kitchen state comes from two places:
//   - the LAN hub: snapshot on connect, then live ticket.create / ticket.status
//   - the POS API (GET /pos/kds/tickets?status=active) as a fallback when the
//     kitchen is not reachable, and to fill in tickets sent before connecting
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KdsClient, LinkStatus } from '../kds-link/KdsClient';
import { DeviceType, KitchenStatus, KitchenTicket, WelcomePayload, newId, parseUtc } from '../kds-link/protocol';
import { posApi } from '../services/api';

const HOST_KEY = 'kds_host';
const DEVICE_ID_KEY = 'kds_device_id';

/** A ticket as this device knows it (items may be empty if only a status event arrived). */
export interface KnownTicket extends KitchenTicket {
  updatedAt: number;
}

/** "Food is ready" notice for the waiter / cashier (see KitchenReadyAlert). */
export interface ReadyAlert {
  ticketId: string;
  invoiceId: number | null;
  orderNo: string;
  table: string | null;
  round: number;
  items: string[];
  at: number;
}

// Only a change this device sees happen live raises an alert — not tickets
// that were already Ready when loaded (snapshot / cloud catch-up after a restart).
const READY_ALERT_MAX_AGE_MS = 10 * 60 * 1000;

/** Overall kitchen state of one order, from all of its tickets (rounds). */
export type OrderKitchenState = 'new' | 'preparing' | 'ready' | 'served';

interface KitchenState {
  status: LinkStatus;
  host: string | null;
  hub: WelcomePayload | null;
  pending: number;
  tickets: Record<string, KnownTicket>;
  log: string[];
  /** Bumped when another device says tables changed (order held / paid) → reload tables. */
  tablesVersion: number;
  /** Tickets that just turned Ready, oldest first, until dismissed. */
  readyAlerts: ReadyAlert[];
  dismissReady: (ticketId?: string) => void;
  /** Tell the other devices (via the hub) that tables changed. */
  notifyTablesChanged: (tableID?: number | null) => void;
  /** Start the saved connection (call once when the main screen opens). */
  init: (deviceType: DeviceType, deviceName: string, branchId: number | null) => Promise<void>;
  connectTo: (host: string) => Promise<void>;
  disconnect: () => Promise<void>;
  sendTicket: (ticket: KitchenTicket) => string | null;
  /** Load active tickets from the POS API (fallback / catch-up). */
  refreshFromCloud: () => Promise<void>;
  /** Load one order's full kitchen history (all rounds, incl. served) from the POS API. */
  loadOrder: (invoiceId: number) => Promise<void>;
}

let client: KdsClient | null = null;
let deviceType: DeviceType = 'waiter';
let deviceName = 'Device';
let deviceBranch: number | null = null;

async function getDeviceId() {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) { id = newId(); await AsyncStorage.setItem(DEVICE_ID_KEY, id); }
  return id;
}

const lower = (s: any): KitchenStatus => String(s ?? 'new').toLowerCase() as KitchenStatus;

export const useKitchenStore = create<KitchenState>((set, get) => {
  const addLog = (line: string) =>
    set(s => ({ log: [`${new Date().toLocaleTimeString()}  ${line}`, ...s.log].slice(0, 60) }));

  // Keep the newer version of a ticket; fill in details a status-only update lacks.
  const upsert = (incoming: Partial<KnownTicket> & { ticketId: string; updatedAt: number }) =>
    set(s => {
      const cur = s.tickets[incoming.ticketId];
      if (cur && cur.updatedAt > incoming.updatedAt) return s;
      const merged: KnownTicket = {
        ...(cur ?? {
          ticketId: incoming.ticketId, invoiceId: null, orderNo: '', round: 1, source: '',
          status: 'new', createdAt: incoming.updatedAt, items: [],
        }),
        ...Object.fromEntries(Object.entries(incoming).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0 && cur?.items?.length))),
      } as KnownTicket;
      const tickets = { ...s.tickets, [incoming.ticketId]: merged };
      const justReady = !!cur && (cur.status === 'new' || cur.status === 'preparing') && merged.status === 'ready'
        && Date.now() - merged.updatedAt < READY_ALERT_MAX_AGE_MS
        && !s.readyAlerts.some(a => a.ticketId === merged.ticketId);
      if (!justReady) return { tickets };
      const alert: ReadyAlert = {
        ticketId: merged.ticketId,
        invoiceId: merged.invoiceId ?? null,
        orderNo: merged.orderNo || (merged.invoiceId ? `Inv ${merged.invoiceId}` : 'Order'),
        table: merged.table ?? null,
        round: merged.round ?? 1,
        items: (merged.items ?? []).filter(i => i.change !== 'void').map(i => `${i.qty}× ${i.name}`),
        at: Date.now(),
      };
      return { tickets, readyAlerts: [...s.readyAlerts, alert].slice(-10) };
    });

  const makeClient = async () => {
    client?.disconnect();
    client = new KdsClient({
      deviceId: await getDeviceId(),
      deviceType,
      name: deviceName,
      branchId: deviceBranch,
      onLog: addLog,
      onStatus: (status, info) => {
        set({ status, hub: info?.hub ?? get().hub, pending: client?.pending ?? 0 });
        addLog(`kitchen ${status}${info?.reason ? ` (${info.reason})` : ''}`);
      },
      onMessage: env => {
        if (env.type === 'ticket.status') {
          const p = env.payload;
          const at = Number(p.at) || Date.now();
          upsert({ ticketId: p.ticketId, invoiceId: p.invoiceId ?? undefined, status: lower(p.status), updatedAt: at });
          addLog(`ticket ${String(p.ticketId).slice(0, 8)} → ${p.status}`);
        } else if (env.type === 'ticket.create') {
          const t: KitchenTicket = env.payload?.ticket;
          if (t?.ticketId) upsert({ ...t, status: lower(t.status), updatedAt: t.createdAt || Date.now() });
        } else if (env.type === 'table.changed') {
          set(s => ({ tablesVersion: s.tablesVersion + 1 }));
        } else if (env.type === 'snapshot') {
          const list: KitchenTicket[] = env.payload?.tickets ?? [];
          list.forEach(t => upsert({ ...t, status: lower(t.status), updatedAt: t.bumpedAt ?? t.readyAt ?? t.startedAt ?? t.createdAt ?? Date.now() }));
          addLog(`snapshot: ${list.length} ticket(s)`);
        }
        set({ pending: client?.pending ?? 0 });
      },
    });
    return client;
  };

  return {
    status: 'idle',
    host: null,
    hub: null,
    pending: 0,
    tickets: {},
    log: [],
    tablesVersion: 0,
    readyAlerts: [],

    dismissReady: ticketId => set(s => ({
      readyAlerts: ticketId ? s.readyAlerts.filter(a => a.ticketId !== ticketId) : [],
    })),

    notifyTablesChanged: tableID => {
      client?.send('table.changed', { tableID: tableID ?? null, at: Date.now() });
    },

    init: async (type, name, branchId) => {
      deviceType = type;
      deviceName = name;
      deviceBranch = branchId;
      const host = await AsyncStorage.getItem(HOST_KEY);
      set({ host });
      if (host && !client) await (await makeClient()).connect(host);
      get().refreshFromCloud().catch(() => {});
    },

    connectTo: async host => {
      await AsyncStorage.setItem(HOST_KEY, host);
      set({ host, hub: null });
      await (await makeClient()).connect(host);
    },

    disconnect: async () => {
      client?.disconnect();
      client = null;
      await AsyncStorage.removeItem(HOST_KEY);
      set({ host: null, hub: null, status: 'idle' });
    },

    sendTicket: ticket => {
      // Remember it locally right away (so this device shows "New" too).
      upsert({ ...ticket, updatedAt: ticket.createdAt });
      if (!client) return null;
      const id = client.send('ticket.create', { ticket });
      set({ pending: client.pending });
      return id;
    },

    refreshFromCloud: async () => {
      const res = await posApi.get('/pos/kds/tickets', {
        params: { status: 'active', ...(deviceBranch != null ? { branchId: deviceBranch } : {}) },
      });
      const n = ingestCloud(res.data?.data ?? res.data);
      addLog(`cloud: ${n} active ticket(s)`);
    },

    loadOrder: async invoiceId => {
      const res = await posApi.get('/pos/kds/tickets', { params: { invoiceId } });
      ingestCloud(res.data?.data ?? res.data);
    },
  };

  // POS API shape: { tickets: [...], items: [...] } joined on ticketID.
  function ingestCloud(data: any): number {
      const tickets: any[] = data?.tickets ?? [];
      const items: any[] = data?.items ?? [];
      tickets.forEach(t => {
        const id = t.ticketID ?? t.ticketId;
        const updated = parseUtc(t.updatedAt ?? t.createdAt ?? '') || 0;
        upsert({
          ticketId: id,
          invoiceId: t.invoiceID ?? null,
          round: t.round ?? 1,
          status: lower(t.status),
          note: t.note ?? null,
          createdAt: parseUtc(t.createdAt ?? '') || updated,
          updatedAt: updated,
          items: items.filter(i => (i.ticketID ?? i.ticketId) === id).map(i => ({
            lineKey: `${i.productID}|${String(i.modifiersText ?? '').toLowerCase()}`,
            productId: i.productID,
            name: i.productName,
            qty: Number(i.qty) || 0,
            modifiers: i.modifiersText ? [i.modifiersText] : [],
            note: i.note ?? undefined,
            change: String(i.changeType).toLowerCase() === 'void' ? 'void' : 'add',
            stationId: i.stationID ?? null,
            status: lower(i.status),
          })),
        });
      });
    return tickets.length;
  }
});

/** Overall kitchen state of an order from its tickets, or null if the kitchen never got it. */
export function orderKitchenState(tickets: Record<string, KnownTicket>, invoiceId: number | null | undefined): OrderKitchenState | null {
  if (!invoiceId) return null;
  const list = Object.values(tickets).filter(t => t.invoiceId === invoiceId && t.status !== 'voided');
  if (list.length === 0) return null;
  const active = list.filter(t => t.status !== 'bumped');
  if (active.length === 0) return 'served';
  if (active.some(t => t.status === 'preparing')) return 'preparing';
  if (active.some(t => t.status === 'new')) return 'new';
  return 'ready';
}

/** All tickets of one order, oldest round first. */
export function orderTickets(tickets: Record<string, KnownTicket>, invoiceId: number | null | undefined): KnownTicket[] {
  if (!invoiceId) return [];
  return Object.values(tickets).filter(t => t.invoiceId === invoiceId).sort((a, b) => a.round - b.round || a.createdAt - b.createdAt);
}

export const KITCHEN_STATE_META: Record<OrderKitchenState | KitchenStatus, { label: string; color: string; bg: string }> = {
  new:       { label: 'In kitchen', color: '#1D4ED8', bg: '#DBEAFE' },
  preparing: { label: 'Preparing',  color: '#B45309', bg: '#FEF3C7' },
  ready:     { label: 'Ready',      color: '#047857', bg: '#D1FAE5' },
  served:    { label: 'Served',     color: '#4B5563', bg: '#F3F4F6' },
  bumped:    { label: 'Served',     color: '#4B5563', bg: '#F3F4F6' },
  voided:    { label: 'Voided',     color: '#B91C1C', bg: '#FEE2E2' },
};
