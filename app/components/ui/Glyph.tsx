import React, { memo } from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { C } from '../../theme/tokens';

// The redesign's line icons (24×24, round caps), copied from the hand-off so
// the app matches the design exactly. Add new icons to GLYPHS; use <Glyph>.
type Spec = { d?: string; circles?: [number, number, number][]; rects?: [number, number, number, number, number][] };

const GLYPHS = {
  sell: { rects: [[3, 4, 18, 12, 2.5]], d: 'M8 20h8M12 16v4M7.5 8.5h4M7.5 11.5h7' },
  orders: { rects: [[5, 4, 14, 17, 2.5]], d: 'M9 4V3h6v1M9 10h6M9 14h6' },
  bag: { d: 'M5 8h14l-1 12H6L5 8zM9 8V6.5a3 3 0 0 1 6 0V8' },
  tables: { d: 'M3 9h18M6 9v10M18 9v10M9.5 9v6h5V9' },
  reports: { d: 'M4 20V4M4 20h16M9 16v-5M13 16V8M17 16v-7' },
  menu: { d: 'M5 7h14M5 12h14M5 17h9' },
  clock: { circles: [[12, 12, 8.5]], d: 'M12 7.5V12l3 2' },
  search: { circles: [[11, 11, 6.5]], d: 'M16 16l4.5 4.5' },
  scan: { d: 'M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M8 8.5v7M11 8.5v7M14 8.5v7M16.5 8.5v7' },
  openOrders: { rects: [[5, 4, 14, 17, 2.5]], d: 'M9 4V3h6v1M9 10h6M9 14h4' },
  addUser: { circles: [[10, 8, 3.5]], d: 'M3.5 20c.6-3.4 3.2-5.5 6.5-5.5 1.3 0 2.5.3 3.5.9M18 14v6M15 17h6' },
  user: { circles: [[12, 8, 3.5]], d: 'M5 20c.8-3.6 3.6-6 7-6s6.2 2.4 7 6' },
  pencil: { d: 'M5 19l1-4L16.5 4.5l3 3L9 18l-4 1z' },
  percent: { circles: [[7.5, 7.5, 2.2], [16.5, 16.5, 2.2]], d: 'M18 6L6 18' },
  pause: { d: 'M9 6v12M15 6v12' },
  printer: { d: 'M7 9V4h10v5M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2M7 14h10v6H7z' },
  card: { rects: [[3, 5, 18, 14, 2.5]], d: 'M3 10h18M7 15h4' },
  cash: { d: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 10.5v3M18 10.5v3' },
  wallet: { d: 'M4 7.5A1.5 1.5 0 0 1 5.5 6H18v3M4 7.5v10A1.5 1.5 0 0 0 5.5 19h13a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 18.5 9h-13A1.5 1.5 0 0 1 4 7.5zM16 14h.01' },
  chevronRight: { d: 'M9 6l6 6-6 6' },
  chevronLeft: { d: 'M15 6l-6 6 6 6' },
  chevronDown: { d: 'M6 9l6 6 6-6' },
  close: { d: 'M6 6l12 12M18 6L6 18' },
  check: { d: 'M5 12.5l4.5 4.5L19 7.5' },
  minus: { d: 'M6 12h12' },
  plus: { d: 'M6 12h12M12 6v12' },
  arrowRight: { d: 'M5 12h14M13 6l6 6-6 6' },
  signOut: { d: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10' },
  filter: { d: 'M4 6h16M7 12h10M10 18h4' },
  calendar: { rects: [[4, 5, 16, 15, 2.5]], d: 'M4 10h16M9 3v4M15 3v4' },
  store: { d: 'M4 9l1.5-5h13L20 9M4 9h16v11H4zM4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9M10 20v-5h4v5' },
  branch: { d: 'M4 9l1.5-5h13L20 9M4 9h16v11H4zM10 20v-5h4v5' },
  info: { circles: [[12, 12, 9]], d: 'M12 11v5M12 8h.01' },
  backspace: { d: 'M9 5h10.5A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5H9l-6-7 6-7zM12 9.5l5 5M17 9.5l-5 5' },
  sliders: { d: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4' },
  receipt: { d: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6' },
  gear: { circles: [[12, 12, 3.5]], d: 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' },
  floorPlan: { d: 'M3 5h18v14H3zM3 12h8M11 5v14M15 9h3' },
  grid: { d: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
  trash: { d: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3' },
  refresh: { d: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v4.5h-4.5' },
  kitchen: { d: 'M7 14.5V20h10v-5.5M7 14.5a4 4 0 0 1-.5-7.9 5 5 0 0 1 9.9-.6A4 4 0 0 1 17 14.5zM7 17h10' },
  display: { rects: [[3, 4, 18, 12, 2.5]], d: 'M8 20h8M12 16v4' },
  globe: { circles: [[12, 12, 9]], d: 'M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z' },
  phonePay: { d: 'M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3zM10.5 18h3M9.5 11a3.5 3.5 0 0 1 5 0M8.5 8.5a6 6 0 0 1 7 0' },
  phoneBill: { d: 'M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3zM10.5 18h3M9.5 8h5M9.5 11.5h5' },
  bank: { d: 'M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18' },
  // Order types
  dineIn: { d: 'M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-1.7 0-3 2.2-3 5.5S15.3 13 17 13' },
  pickup: { d: 'M5 8h14l-1 12H6L5 8zM9 8V6.5a3 3 0 0 1 6 0V8' },
  walkIn: { d: 'M13 4.5a1.5 1.5 0 1 0 0 .01M9.5 21l2-6 2.5 2.5V21M7.5 12.5l2.5-4h3.5l2 3.5 2.5 1M11.5 8.5l-1 5' },
  delivery: { d: 'M3 6h11v10H3zM14 9.5h3.5L21 13v3h-7M5 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0' },
} satisfies Record<string, Spec>;

export type GlyphName = keyof typeof GLYPHS;

/** Icon for a payment method name as the API sends it. */
export function paymentGlyph(name: string | null | undefined): GlyphName {
  const n = (name ?? '').toLowerCase();
  if (/cash|نقد/.test(n)) return 'cash';
  if (/card|mada|visa|master|debit|credit/.test(n)) return 'card';
  if (/bank|transfer|iban/.test(n)) return 'bank';
  if (/apple|google|samsung|nfc/.test(n)) return 'phonePay';
  if (/stc|urpay|tabby|tamara|pay/.test(n)) return 'phoneBill';
  if (/wallet|account|loyal/.test(n)) return 'wallet';
  return 'card';
}

/** Icon for an order type name as the API sends it (Dine In, Take Away, …). */
export function orderTypeGlyph(name: string | null | undefined): GlyphName {
  const t = (name ?? '').toLowerCase();
  if (/dine/.test(t)) return 'dineIn';
  if (/deliver/.test(t)) return 'delivery';
  if (/walk/.test(t)) return 'walkIn';
  if (/online|web/.test(t)) return 'globe';
  return 'pickup';
}

function Glyph({ name, size = 20, color = C.text, strokeWidth = 1.9 }: {
  name: GlyphName; size?: number; color?: string; strokeWidth?: number;
}) {
  const g: Spec = GLYPHS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {g.rects?.map(([x, y, w, h, rx], i) => <Rect key={`r${i}`} x={x} y={y} width={w} height={h} rx={rx} />)}
      {g.circles?.map(([cx, cy, r], i) => <Circle key={`c${i}`} cx={cx} cy={cy} r={r} />)}
      {g.d ? <Path d={g.d} /> : null}
    </Svg>
  );
}

export default memo(Glyph);
