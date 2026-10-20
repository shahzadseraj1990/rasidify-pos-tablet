// Connection to the customer display (CDS app, com.rasidify.cds) and what it
// shows. The CDS runs a kds-link hub on CDS_PORT; this device sends the whole
// screen state (`cds.state`) on every cart change, so the display is a mirror
// of the cart: welcome → items + totals → "please pay" → "thank you".
//
// Call init() once (PosShellScreen). SellScreen calls setPaying() when the
// payment dialog opens/closes and showPaid() after a successful checkout.
//
// Card payments: requestCard() asks the display to take a card amount (tap to
// pay). The request is repeated every 2 s until the display answers with a
// final pay.status (approved / declined / cancelled / error), so a lost
// message never leaves a payment stuck; the display answers repeats, never
// charges twice (same requestId).
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KdsClient, LinkStatus } from '../kds-link/KdsClient';
import {
  CDS_PORT, CdsMode, CdsState, WelcomePayload, newId,
  PayRequest, PayStatus, PayStatusPayload, PAY_FINAL,
} from '../kds-link/protocol';
import { useCartStore } from './cartStore';
import { useAuthStore } from './authStore';
import { useTaxStore } from './taxStore';
import { useShiftStore } from './shiftStore';
import { useSessionStore } from './sessionStore';

const HOST_KEY = 'cds_host';
const DEVICE_ID_KEY = 'kds_device_id'; // same device id the kitchen link uses
const RESEND_MS = 10000;
const PAY_REPEAT_MS = 2000;
/** No pay.status at all for this long while connected → the display can't take cards (e.g. an old CDS version). */
const PAY_NO_ANSWER_MS = 10000;

/** Payment methods that go to the customer display as tap to pay. */
export function isCardMethod(name: string): boolean {
  return /card|credit|debit|mada|visa|master|amex|apple\s*pay|بطاقة|مدى/i.test(name);
}

export interface CardPayment {
  requestId: string;
  method: string;
  amount: number;
  status: PayStatus | 'sending';
  /** The cashier pressed Cancel; waiting for the display to confirm. */
  cancelling?: boolean;
  message?: string;
  approvalCode?: string;
  cardScheme?: string;
  cardLast4?: string;
  reference?: string;
  simulated?: boolean;
}

type PaidInfo = Pick<CdsState, 'paid' | 'change' | 'orderNo' | 'zatcaQr' | 'cashPaid'> & { total: number };

/** Cash methods (Paid / Change cards on the display are for cash only). */
export const isCashMethod = (name: string) => /cash|نقد/i.test(name);

interface CustomerDisplayState {
  status: LinkStatus;
  host: string | null;
  hub: WelcomePayload | null;
  log: string[];
  init: (deviceName: string) => Promise<void>;
  connectTo: (host: string) => Promise<void>;
  disconnect: () => Promise<void>;
  /** The payment dialog opened / closed. */
  setPaying: (paying: boolean) => void;
  /** Checkout done: show "thank you" (with change and the e-invoice QR). */
  showPaid: (info: PaidInfo) => void;
  /** Card payments by requestId (current checkout). */
  cards: Record<string, CardPayment>;
  /** Ask the display to take `amount` by card. Null when no display is connected. */
  requestCard: (method: string, amount: number, orderRef?: string) => string | null;
  /** Cancel a card payment. `force` drops it locally even if the display can't confirm (offline). */
  cancelCard: (requestId: string, force?: boolean) => void;
  /** Forget finished card payments (new checkout). */
  clearCards: () => void;
}

let client: KdsClient | null = null;
let deviceName = 'Cashier';
let seq = 0;
let paying = false;
let last: CdsState | null = null;
let resendTimer: ReturnType<typeof setInterval> | null = null;
let unsubCart: (() => void) | null = null;
const payRequests = new Map<string, PayRequest>();
/** When each open request was last sent while connected without any answer yet. */
const payUnanswered = new Map<string, number>();
let payTimer: ReturnType<typeof setInterval> | null = null;

async function getDeviceId() {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) { id = newId(); await AsyncStorage.setItem(DEVICE_ID_KEY, id); }
  return id;
}

// The display shows its address as "192.168.1.60:8766"; accept that or a bare IP.
function parseAddress(input: string): { host: string; port: number } {
  const t = input.trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '');
  const m = t.match(/^(.+):(\d{2,5})$/);
  return m ? { host: m[1], port: Number(m[2]) } : { host: t, port: CDS_PORT };
}

// Grows across app restarts too (the display ignores a seq it has passed).
const nextSeq = () => (seq = Math.max(Date.now(), seq + 1));

function brand() {
  const user = useAuthStore.getState().user;
  const branch = useShiftStore.getState().activeShift?.branchName;
  return {
    storeName: user?.companyName || undefined,
    storeSub: branch || undefined,
    logoUrl: user?.companyLogoUrl || undefined,
    currency: user?.currency ?? 'SAR',
  };
}

function cartState(mode: CdsMode): CdsState {
  const cart = useCartStore.getState();
  const boot = useSessionStore.getState().bootstrap;
  return {
    seq: nextSeq(),
    mode,
    ...brand(),
    orderType: boot?.orderTypes.find(t => t.orderTypeID === cart.orderTypeID)?.name,
    table: cart.tableNo,
    orderNo: cart.checkoutShiftOrderNo ? String(cart.checkoutShiftOrderNo).padStart(4, '0') : undefined,
    taxRate: useTaxStore.getState().taxPercent || undefined,
    methods: boot?.paymentMethods.map(m => m.name).filter(Boolean),
    lines: cart.items.map(i => ({
      name: i.name, nameAr: i.nameAr, qty: i.qty, price: i.price, total: i.total,
      selections: i.selectionSummary,
    })),
    subtotal: cart.subtotal(),
    discount: cart.totalDiscount(),
    tax: cart.totalTax(),
    taxLabel: useTaxStore.getState().taxName,
    total: cart.grandTotal(),
  };
}

function send(state: CdsState) {
  last = state;
  if (client?.currentStatus === 'connected') client.send('cds.state', state);
}

function sendCart() {
  const empty = useCartStore.getState().items.length === 0;
  send(cartState(empty ? 'idle' : paying ? 'payment' : 'cart'));
}

export const useCustomerDisplayStore = create<CustomerDisplayState>((set, get) => {
  const addLog = (line: string) =>
    set(s => ({ log: [`${new Date().toLocaleTimeString()}  ${line}`, ...s.log].slice(0, 40) }));

  const makeClient = async () => {
    client?.disconnect();
    client = new KdsClient({
      deviceId: await getDeviceId(),
      deviceType: 'cashier',
      name: deviceName,
      branchId: null,
      outboxKey: 'cds_outbox_v1',
      onLog: addLog,
      onMessage: env => {
        if (env.type !== 'pay.status') return;
        const p = env.payload as PayStatusPayload;
        const cur = get().cards[p?.requestId];
        if (!cur || PAY_FINAL.includes(cur.status as PayStatus)) return;
        const final = PAY_FINAL.includes(p.status);
        set(s => ({
          cards: {
            ...s.cards,
            [p.requestId]: {
              ...cur, status: p.status, cancelling: final ? false : cur.cancelling,
              message: p.message, approvalCode: p.approvalCode, cardScheme: p.cardScheme,
              cardLast4: p.cardLast4, reference: p.reference, simulated: p.simulated,
            },
          },
        }));
        payUnanswered.delete(p.requestId);
        if (final) payRequests.delete(p.requestId);
        if (cur.status !== p.status) addLog(`card ${cur.amount.toFixed(2)} → ${p.status}`);
      },
      onStatus: (status, info) => {
        set({ status, hub: info?.hub ?? get().hub });
        addLog(`display ${status}${info?.reason ? ` (${info.reason})` : ''}`);
        // A fresh connection gets the current screen at once.
        if (status === 'connected') send(last ? { ...last, seq: nextSeq() } : cartState('idle'));
      },
    });
    return client;
  };

  // Repeat open card requests / cancels until the display gives a final answer.
  const ensurePayTimer = () => {
    if (payTimer) return;
    payTimer = setInterval(() => {
      if (payRequests.size === 0) { clearInterval(payTimer!); payTimer = null; return; }
      if (client?.currentStatus !== 'connected') return;
      for (const req of [...payRequests.values()]) {
        const c = get().cards[req.requestId];
        if (c?.status === 'sending') {
          const since = payUnanswered.get(req.requestId) ?? Date.now();
          payUnanswered.set(req.requestId, since);
          if (Date.now() - since > PAY_NO_ANSWER_MS) {
            payRequests.delete(req.requestId);
            payUnanswered.delete(req.requestId);
            set(s => ({ cards: { ...s.cards, [req.requestId]: { ...c, status: 'error', cancelling: false, message: 'No answer from display (update the CDS app?)' } } }));
            addLog('card: no answer from display');
            continue;
          }
        }
        client.send(c?.cancelling ? 'pay.cancel' : 'pay.request', c?.cancelling ? { requestId: req.requestId } : req);
      }
    }, PAY_REPEAT_MS);
  };

  const watch = () => {
    unsubCart?.();
    unsubCart = useCartStore.subscribe((s, prev) => {
      if (s.items !== prev.items || s.discount !== prev.discount || s.orderTypeID !== prev.orderTypeID || s.tableNo !== prev.tableNo) sendCart();
    });
    if (!resendTimer) {
      // Latest-wins messages have no ack: repeat now and then in case one was lost.
      resendTimer = setInterval(() => {
        if (last && client?.currentStatus === 'connected') client.send('cds.state', { ...last, seq: nextSeq() });
      }, RESEND_MS);
    }
  };

  return {
    status: 'idle',
    host: null,
    hub: null,
    log: [],

    init: async name => {
      deviceName = name;
      watch();
      const host = await AsyncStorage.getItem(HOST_KEY);
      set({ host });
      if (host && !client) {
        const a = parseAddress(host);
        await (await makeClient()).connect(a.host, a.port);
      }
      sendCart();
    },

    connectTo: async input => {
      const a = parseAddress(input);
      const host = a.port === CDS_PORT ? a.host : `${a.host}:${a.port}`;
      await AsyncStorage.setItem(HOST_KEY, host);
      set({ host, hub: null });
      watch();
      last = null;
      await (await makeClient()).connect(a.host, a.port);
    },

    disconnect: async () => {
      if (client?.currentStatus === 'connected') client.send('cds.state', cartState('idle'));
      const c = client;
      client = null;
      setTimeout(() => c?.disconnect(), 300); // let the "idle" go out first
      await AsyncStorage.removeItem(HOST_KEY);
      set({ host: null, hub: null, status: 'idle' });
    },

    setPaying: p => {
      if (paying === p) return;
      paying = p;
      sendCart();
    },

    cards: {},

    requestCard: (method, amount, orderRef) => {
      if (!client || client.currentStatus !== 'connected' || !(amount > 0)) return null;
      const req: PayRequest = {
        requestId: newId(), amount: Math.round(amount * 100) / 100,
        currency: brand().currency, method, orderRef, createdAt: Date.now(),
      };
      payRequests.set(req.requestId, req);
      set(s => ({ cards: { ...s.cards, [req.requestId]: { requestId: req.requestId, method, amount: req.amount, status: 'sending' } } }));
      client.send('pay.request', req);
      ensurePayTimer();
      addLog(`card ${req.amount.toFixed(2)} sent to display`);
      return req.requestId;
    },

    cancelCard: (requestId, force) => {
      const cur = get().cards[requestId];
      if (!cur || PAY_FINAL.includes(cur.status as PayStatus)) return;
      if (force) {
        payRequests.delete(requestId);
        set(s => ({ cards: { ...s.cards, [requestId]: { ...cur, status: 'cancelled', cancelling: false, message: 'Cancelled on POS' } } }));
        return;
      }
      set(s => ({ cards: { ...s.cards, [requestId]: { ...cur, cancelling: true } } }));
      if (client?.currentStatus === 'connected') client.send('pay.cancel', { requestId });
      ensurePayTimer();
    },

    clearCards: () => {
      // Open requests are cancelled on the display too.
      for (const id of payRequests.keys()) get().cancelCard(id);
      set(s => ({ cards: Object.fromEntries(Object.entries(s.cards).filter(([, c]) => !PAY_FINAL.includes(c.status as PayStatus))) }));
    },

    showPaid: info => {
      paying = false;
      const b = brand();
      send({
        seq: nextSeq(), mode: 'paid', ...b, lines: [],
        subtotal: 0, discount: 0, tax: 0, total: info.total,
        paid: info.paid, change: info.change, orderNo: info.orderNo, zatcaQr: info.zatcaQr ?? null, cashPaid: info.cashPaid,
      });
    },
  };
});
