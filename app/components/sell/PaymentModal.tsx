import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Modal, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { C, R, S, palette } from '../../theme/tokens';
import { Txt, Glyph, Button, IconButton, CountBadge, paymentGlyph } from '../ui';
import { useSessionStore } from '../../store/sessionStore';
import { useCustomerDisplayStore, isCardMethod, isCashMethod, CardPayment } from '../../store/customerDisplayStore';
import { PAY_FINAL } from '../../kds-link/protocol';
import { appAlert } from '../../utils/appAlert';
import { roundMoney } from '../../utils/format';

// Used only if the session bootstrap has no payment methods. The real list
// comes from the server so each payment is saved with the right method ID
// (orderService matches the method by its exact name).
const FALLBACK_PAYMENT_METHODS = ['Cash', 'Card'];

// Split-payment entry: at most one entry per method, editable/removable — the
// cashier can type an exact amount for each method instead of a tap always
// consuming the full remaining balance, matching the web POS's keypad flow.
//
// Card methods with a customer display connected: the amount goes to the
// display as tap to pay (cardRequestId); the row waits there until the
// customer's card is approved, and Complete stays off until then. Cash + card
// splits work the same way (each method is one row).
interface PaymentEntry { method: string; amount: number; cardRequestId?: string; }

type CardRowState = 'pending' | 'approved' | 'failed';
function cardRowState(c: CardPayment | undefined): CardRowState | null {
  if (!c) return null;
  if (c.status === 'approved') return 'approved';
  return PAY_FINAL.includes(c.status as any) ? 'failed' : 'pending';
}

const QUICK_NOTES = [50, 100, 200, 500];
// Keypad grid: 3 digit columns; the 4th column holds ⌫ and C (2 rows each).
const DIGIT_ROWS = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['00', '0', '.']];
// Half-up from the decimal value (see roundMoney): Math.round(n * 100) / 100
// turned 5.175 into 5.17.
const round2 = roundMoney;
const ceil2 = (n: number) => Math.ceil(round2(n) * 100) / 100;

/**
 * Checkout (redesign): one pop-up. The left pane shows the payment methods;
 * tapping one swaps it for that method's amount keypad (back arrow returns).
 * The right pane — summary, payments added, totals, Complete — never moves.
 */
export default function PaymentModal({
  visible, onClose, onComplete, total, subtotal, discount, tax, taxLabel, currency, kicker,
  completed, printing, onPrintReceipt, onNewOrder,
}: {
  visible: boolean;
  onClose: () => void;
  onComplete: (rows: { paymentMethod: string; paymentAmount: number }[]) => void;
  total: number; subtotal: number; discount: number; tax: number; taxLabel?: string; currency: string;
  /** Small line above the title, e.g. "Table T02 · Dine in". */
  kicker?: string;
  /** Set once the order is saved (auto-print off): shows "Payment complete". */
  completed?: { payments: number } | null;
  printing?: boolean;
  onPrintReceipt?: () => void;
  onNewOrder?: () => void;
}) {
  const bootMethods = useSessionStore(s => s.bootstrap?.paymentMethods);
  const methods = useMemo(() => {
    const names = (bootMethods ?? []).map(m => (m.name ?? '').trim()).filter(Boolean);
    return names.length > 0 ? names : FALLBACK_PAYMENT_METHODS;
  }, [bootMethods]);
  const [entries, setEntries] = useState<PaymentEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // Method whose keypad is open (null = the method list).
  const [keypadMethod, setKeypadMethod] = useState<string | null>(null);
  const [keypadValue, setKeypadValue] = useState('0');
  // True while the amount was filled in for the cashier (due amount or a
  // quick button): the next key starts a new number instead of appending.
  const prefilled = useRef(true);
  const cds = useCustomerDisplayStore();
  const cdsConnected = cds.status === 'connected';

  useEffect(() => {
    if (visible) { setEntries([]); setKeypadMethod(null); useCustomerDisplayStore.getState().clearCards(); }
  }, [visible]);

  const rowState = (e: PaymentEntry) => (e.cardRequestId ? cardRowState(cds.cards[e.cardRequestId]) : null);
  // A declined / cancelled card pays nothing; a pending one counts so the
  // cashier sees what is left for cash.
  const counted = entries.filter(e => rowState(e) !== 'failed');
  const totalPaid = counted.reduce((s, e) => s + e.amount, 0);
  const remaining = Math.max(0, total - totalPaid);
  const change = Math.max(0, totalPaid - total);
  const anyPending = entries.some(e => rowState(e) === 'pending');
  const anyFailed = entries.some(e => rowState(e) === 'failed');
  const canComplete = counted.length > 0 && !anyPending && !anyFailed && totalPaid >= total - 0.001;
  /** What is still due if `method`'s own row is left out (a card is charged at most this). */
  const dueWithout = (method: string) =>
    Math.max(0, round2(total - counted.filter(e => e.method !== method).reduce((s, e) => s + e.amount, 0)));

  const approvedCards = entries.filter(e => rowState(e) === 'approved');
  const closeModal = () => {
    if (approvedCards.length > 0) {
      appAlert(
        'Card Payment Approved',
        `${approvedCards.map(e => `${e.method} ${e.amount.toFixed(2)}`).join(', ')} was already charged. Complete the payment so the order is saved.`,
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Close anyway', style: 'destructive', onPress: () => { cds.clearCards(); onClose(); } },
        ],
      );
      return;
    }
    cds.clearCards(); // cancels any card still waiting on the display
    onClose();
  };

  const startCard = (method: string, amount: number) => {
    const id = cds.requestCard(method, amount);
    if (!id) {
      appAlert('Customer Display Offline', 'The card payment could not be sent to the customer display.');
      return;
    }
    setEntries(prev => [...prev.filter(e => e.method !== method), { method, amount, cardRequestId: id }]);
  };

  const getEntryAmount = (method: string): number | null =>
    entries.find(e => e.method === method)?.amount ?? null;

  const openKeypad = (method: string) => {
    const entry = entries.find(e => e.method === method);
    const st = entry ? rowState(entry) : null;
    if (st === 'approved') {
      appAlert('Card Already Charged', `${method} ${entry!.amount.toFixed(2)} was approved and can't be changed.`);
      return;
    }
    if (st === 'pending') {
      appAlert('Waiting for Card', `The customer is paying ${method} ${entry!.amount.toFixed(2)} on the display. Cancel it first to change the amount.`);
      return;
    }
    const existing = st === 'failed' ? null : getEntryAmount(method);
    const due = dueWithout(method);
    setKeypadValue((existing ?? (due > 0 ? due : total)).toFixed(2));
    prefilled.current = true;
    setKeypadMethod(method);
  };

  // Non-cash methods can't go over what is still due (no change on a card).
  const capFor = (method: string | null) =>
    method && !isCashMethod(method) ? dueWithout(method) || total : Infinity;
  const clampText = (text: string) => {
    const cap = capFor(keypadMethod);
    return (parseFloat(text) || 0) > cap ? cap.toFixed(2) : text;
  };

  const keypadPress = (key: string) => {
    const fresh = prefilled.current;
    prefilled.current = false;
    setKeypadValue(current => {
      const prev = fresh ? '0' : current;
      if (key === 'backspace') return fresh ? '0' : prev.length > 1 ? prev.slice(0, -1) : '0';
      if (key === 'clear') return '0';
      if (key === '.') return prev.includes('.') ? prev : prev + '.';
      const next = prev === '0' ? (key === '00' ? '0' : key) : prev + key;
      const parts = next.split('.');
      if (parts[1] && parts[1].length > 2) return prev;
      if (parts[0].length > 7) return prev;
      return clampText(next);
    });
  };
  const setAmount = (n: number) => { setKeypadValue(clampText(round2(n).toFixed(2))); prefilled.current = true; };

  const confirmKeypad = () => {
    const amount = parseFloat(keypadValue) || 0;
    if (!keypadMethod || amount <= 0) return;
    if (isCardMethod(keypadMethod) && cdsConnected) {
      if (entries.some(e => e.method !== keypadMethod && rowState(e) === 'pending')) {
        appAlert('Card Payment in Progress', 'Wait for the current card payment to finish first.');
        return;
      }
      // No change on a card: charge at most what is still due.
      const charge = Math.min(amount, dueWithout(keypadMethod));
      if (charge <= 0) {
        appAlert('Nothing Due', 'The order is already fully paid.');
        return;
      }
      setKeypadMethod(null);
      startCard(keypadMethod, charge);
      return;
    }
    // Only cash can be more than what is due (that's where change comes
    // from); any other method is capped at the remaining balance.
    const recorded = isCashMethod(keypadMethod) ? amount : Math.min(amount, dueWithout(keypadMethod));
    if (recorded <= 0) {
      appAlert('Nothing Due', 'The order is already fully paid.');
      return;
    }
    setEntries(prev => [...prev.filter(e => e.method !== keypadMethod), { method: keypadMethod, amount: recorded }]);
    setKeypadMethod(null);
  };

  const removeEntry = (method: string) => {
    const entry = entries.find(e => e.method === method);
    const st = entry ? rowState(entry) : null;
    if (st === 'approved') {
      appAlert('Card Already Charged', `${method} ${entry!.amount.toFixed(2)} was approved and can't be removed.`);
      return;
    }
    if (st === 'pending' && entry?.cardRequestId) {
      const id = entry.cardRequestId;
      if (!cdsConnected) {
        appAlert(
          'Customer Display Offline',
          "The display can't confirm the cancel. Only remove this payment if the customer was NOT charged.",
          [
            { text: 'Keep waiting', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => { cds.cancelCard(id, true); setEntries(prev => prev.filter(e => e.method !== method)); } },
          ],
        );
        return;
      }
      cds.cancelCard(id); // the row turns "Cancelled" when the display confirms
      return;
    }
    setEntries(prev => prev.filter(e => e.method !== method));
  };

  const settled = entries.length > 0 && remaining < 0.01;
  const status = entries.length === 0
    ? { label: 'Awaiting payment', bg: C.brandTint, fg: C.brand }
    : settled
      ? { label: change > 0 ? `Change ${currency} ${change.toFixed(2)}` : 'Fully paid', bg: C.infoBg, fg: C.text }
      : { label: `${currency} ${remaining.toFixed(2)} remaining`, bg: C.brandTint, fg: C.brand };
  const keypadDue = keypadMethod ? dueWithout(keypadMethod) || total : 0;
  const typedAmount = parseFloat(keypadValue) || 0;
  // What the Add button will record: non-cash methods never exceed the amount due.
  const keypadAmount = keypadMethod && !isCashMethod(keypadMethod) ? Math.min(typedAmount, keypadDue) : typedAmount;
  const cashKeypad = keypadMethod != null && isCashMethod(keypadMethod);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={completed ? onNewOrder : keypadMethod ? () => setKeypadMethod(null) : closeModal}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            {keypadMethod && !completed ? (
              <>
                <IconButton icon="chevronLeft" variant="outline" size={52} onPress={() => setKeypadMethod(null)} />
                <View style={styles.flex}>
                  <Txt variant="h1">{keypadMethod}</Txt>
                  <Txt variant="caption" color={C.textMuted}>{cashKeypad ? 'Enter amount received' : 'Enter amount to charge'}</Txt>
                </View>
              </>
            ) : (
              <View style={styles.flex}>
                {kicker ? <Txt variant="caption" weight="semibold" color={C.brand}>{kicker}</Txt> : null}
                <Txt variant="h1">Checkout</Txt>
              </View>
            )}
            <IconButton icon="close" variant="outline" size={52} onPress={completed ? onNewOrder : closeModal} />
          </View>

          <View style={styles.body}>
            {completed ? (
              /* ── Left: payment complete (auto-print off) ── */
              <View style={styles.done}>
                <View style={styles.doneIcon}><Glyph name="check" size={44} color={palette.white} strokeWidth={2.6} /></View>
                <Txt size={30} weight="bold">Payment complete</Txt>
                <Txt variant="body" color={C.textMuted}>
                  {currency} {total.toFixed(2)} paid in {completed.payments} payment{completed.payments === 1 ? '' : 's'}
                  {change > 0 ? ` · Change ${currency} ${change.toFixed(2)}` : ''}
                </Txt>
                <View style={styles.doneActions}>
                  <Button variant="outline" size="lg" icon="printer" label="Print receipt" loading={printing} onPress={onPrintReceipt} />
                  <Button size="lg" label="New order" onPress={onNewOrder} />
                </View>
              </View>
            ) : keypadMethod ? (
              /* ── Left: amount keypad for one method ── */
              <View style={styles.left}>
                <View style={styles.display}>
                  <View>
                    <Txt variant="caption" color={C.textMuted}>Remaining</Txt>
                    <Txt variant="label" weight="bold">{currency} {keypadDue.toFixed(2)}</Txt>
                  </View>
                  <View style={styles.displayValue}>
                    <Txt variant="h3" weight="semibold" color={C.textMuted}>{currency}</Txt>
                    <Txt size={52} weight="bold" numberOfLines={1} adjustsFontSizeToFit style={styles.displayNumber}>{keypadValue}</Txt>
                  </View>
                </View>
                <View style={styles.quickRow}>
                  <QuickButton label="Exact" value={keypadDue} onPress={setAmount} />
                  <QuickButton label="Round up" value={Math.floor(keypadDue) + 1} onPress={setAmount} />
                  <QuickButton label="Half" value={ceil2(keypadDue / 2)} onPress={setAmount} />
                  <QuickButton label="Third" value={ceil2(keypadDue / 3)} onPress={setAmount} />
                </View>
                <View style={styles.quickRow}>
                  {QUICK_NOTES.map(v => (
                    <TouchableOpacity key={v} style={styles.quick} activeOpacity={0.75} onPress={() => setAmount(v)}>
                      <Txt variant="label" weight="bold">{v}</Txt>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.pad}>
                  <View style={styles.padDigits}>
                    {DIGIT_ROWS.map((row, r) => (
                      <View key={r} style={[styles.padRow, r > 0 && styles.padRowSep]}>
                        {row.map((k, c) => (
                          <TouchableOpacity key={k} style={[styles.padKey, c > 0 && styles.padKeySep]} activeOpacity={0.6} onPress={() => keypadPress(k)}>
                            <Txt size={24} weight="medium">{k}</Txt>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ))}
                  </View>
                  <View style={styles.padSide}>
                    <TouchableOpacity style={styles.padSideKey} activeOpacity={0.6} onPress={() => keypadPress('backspace')}>
                      <Glyph name="backspace" size={28} color={C.text} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.padSideKey, styles.padClear]} activeOpacity={0.6} onPress={() => keypadPress('clear')}>
                      <Txt variant="h3" color={C.dangerText}>C</Txt>
                    </TouchableOpacity>
                  </View>
                </View>
                <Button size="xl" icon="check" label={`Add ${keypadMethod} · ${currency} ${keypadAmount.toFixed(2)}`} disabled={keypadAmount <= 0} onPress={confirmKeypad} />
              </View>
            ) : (
              /* ── Left: order total + payment methods ── */
              <ScrollView style={styles.flex} contentContainerStyle={styles.leftScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.totalBlock}>
                  <Txt variant="micro" color={C.textMuted} style={styles.caps}>ORDER TOTAL</Txt>
                  <Txt size={48} weight="bold" style={styles.bigTotal}>{currency} {total.toFixed(2)}</Txt>
                  <View style={[styles.status, { backgroundColor: status.bg }]}>
                    <Txt variant="caption" weight="semibold" color={status.fg}>{status.label}</Txt>
                  </View>
                </View>
                <View style={styles.methodHead}>
                  <Txt variant="micro" color={C.textMuted} style={styles.caps}>PAYMENT METHOD</Txt>
                  <Txt variant="caption" color={C.textMuted}>Tap a method to add a payment. Repeat to split.</Txt>
                </View>
                <View style={styles.methodGrid}>
                  {methods.map(m => {
                    const amt = getEntryAmount(m);
                    const on = amt != null;
                    // Nothing left to pay: unused methods are off; used ones stay tappable to edit.
                    const off = !on && remaining < 0.01;
                    return (
                      <TouchableOpacity key={m} activeOpacity={0.8} onPress={(off) ? undefined : () => openKeypad(m)} style={[styles.method, on && styles.methodOn, off && styles.methodOff]}>
                        <View style={[styles.methodIcon, on && styles.methodIconOn]}>
                          <Glyph name={paymentGlyph(m)} size={22} color={on ? palette.white : C.text} />
                        </View>
                        <Txt variant="title" weight="semibold" numberOfLines={1} style={styles.flex}>{m}</Txt>
                        {on ? <Txt variant="caption" weight="bold" color={C.brand}>{currency} {amt.toFixed(2)}</Txt> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {methods.some(m => isCardMethod(m)) ? (
                  <View style={styles.cdsNote}>
                    <Glyph name={cdsConnected ? 'phonePay' : 'display'} size={18} color={cdsConnected ? C.successText : C.textMuted} />
                    <Txt variant="caption" color={C.textMuted} style={styles.flex}>
                      {cdsConnected
                        ? 'Card payments go to the customer display (tap to pay).'
                        : 'Customer display not connected: card payments are recorded manually.'}
                    </Txt>
                  </View>
                ) : null}
              </ScrollView>
            )}

            {/* ── Right: summary, payments, totals (same in both views) ── */}
            <View style={styles.right}>
              <Txt variant="micro" color={C.textMuted} style={styles.caps}>ORDER SUMMARY</Txt>
              <View style={styles.box}>
                <SumLine label="Subtotal" value={subtotal} currency={currency} />
                {discount > 0 ? <SumLine label="Discount" value={discount} currency={currency} prefix="− " /> : null}
                <SumLine label={taxLabel || 'VAT'} value={tax} currency={currency} />
                <View style={styles.rule} />
                <SumLine label="Total" value={total} currency={currency} strong />
              </View>

              <View style={styles.paysHead}>
                <Txt variant="micro" color={C.textMuted} style={styles.caps}>PAYMENTS ADDED</Txt>
                <CountBadge value={entries.length} size={22} />
              </View>
              <ScrollView style={[styles.box, styles.paysBox]} contentContainerStyle={entries.length === 0 && styles.paysEmpty}>
                {entries.length === 0
                  ? <Txt variant="caption" color={C.textMuted} align="center">No payments yet.{'\n'}Pick a method to start.</Txt>
                  : entries.map((e, i) => (
                    <PaymentLine
                      key={e.method}
                      entry={e}
                      first={i === 0}
                      state={rowState(e)}
                      card={e.cardRequestId ? cds.cards[e.cardRequestId] : undefined}
                      currency={currency}
                      locked={!!completed}
                      onEdit={() => openKeypad(e.method)}
                      onRemove={() => removeEntry(e.method)}
                      onRetry={() => startCard(e.method, Math.min(e.amount, dueWithout(e.method)))}
                    />
                  ))}
              </ScrollView>

              <View style={[styles.paidBox, settled && styles.paidBoxDone]}>
                <SumLine label="Total paid" value={totalPaid} currency={currency} bold />
                <View style={styles.sumLine}>
                  <Txt variant="title" weight="bold" color={settled ? C.text : C.brand}>{settled ? (change > 0 ? 'Change' : 'Balance') : 'Remaining'}</Txt>
                  <Txt size={22} weight="bold" color={settled ? C.text : C.brand}>{currency} {(settled ? change : remaining).toFixed(2)}</Txt>
                </View>
              </View>

              {completed ? (
                <Button size="xl" icon="check" label="Paid" disabled />
              ) : (
                <Button
                  size="xl"
                  icon="check"
                  label="Complete payment"
                  disabled={!canComplete}
                  loading={submitting}
                  onPress={async () => {
                    setSubmitting(true);
                    await onComplete(entries.map(e => ({ paymentMethod: e.method, paymentAmount: e.amount })));
                    setSubmitting(false);
                  }}
                />
              )}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function QuickButton({ label, value, onPress }: { label: string; value: number; onPress: (v: number) => void }) {
  return (
    <TouchableOpacity style={styles.quick} activeOpacity={0.75} onPress={() => onPress(value)}>
      <Txt variant="small" weight="regular" color={C.textMuted}>{label}</Txt>
      <Txt variant="caption" weight="bold">{value.toFixed(2)}</Txt>
    </TouchableOpacity>
  );
}

function SumLine({ label, value, currency, prefix, strong, bold }: {
  label: string; value: number; currency: string; prefix?: string; strong?: boolean; bold?: boolean;
}) {
  return (
    <View style={styles.sumLine}>
      <Txt variant={strong ? 'title' : 'label'} weight={strong ? 'bold' : 'regular'} color={strong ? C.text : C.textMuted}>{label}</Txt>
      <Txt variant={strong ? 'title' : 'label'} weight={strong || bold ? 'bold' : 'medium'}>{prefix}{currency} {value.toFixed(2)}</Txt>
    </View>
  );
}

function PaymentLine({ entry, first, state, card, currency, locked, onEdit, onRemove, onRetry }: {
  entry: PaymentEntry; first: boolean; state: CardRowState | null; card?: CardPayment; currency: string; locked?: boolean;
  onEdit: () => void; onRemove: () => void; onRetry: () => void;
}) {
  let sub: string | null = null;
  if (state === 'pending') {
    sub = card?.cancelling ? 'Cancelling…' : card?.status === 'processing' ? 'Processing card…' : 'Waiting for customer to tap…';
  } else if (state === 'approved') {
    sub = 'Approved'
      + (card?.cardLast4 ? ` · ${(card.cardScheme ?? 'card').toUpperCase()} ••${card.cardLast4}` : '')
      + (card?.approvalCode ? ` · Auth ${card.approvalCode}` : '')
      + (card?.simulated ? ' · TEST' : '');
  } else if (state === 'failed') {
    sub = (card?.status === 'cancelled' ? 'Cancelled' : 'Declined') + (card?.message ? ` · ${card.message}` : '');
  }
  const failed = state === 'failed';
  const editable = !locked && (state === null || failed);
  return (
    <View style={[styles.payLine, !first && styles.payLineSep]}>
      {state === 'pending'
        ? <ActivityIndicator size="small" color={palette.amberInkStrong} style={styles.payMark} />
        : (
          <View style={[styles.payMark, styles.payCheck, failed && styles.payFail]}>
            <Glyph name={failed ? 'close' : 'check'} size={14} color={failed ? palette.white : palette.ink} strokeWidth={2.8} />
          </View>
        )}
      <View style={styles.flex}>
        <Txt variant="body" weight="semibold" style={failed && styles.strike}>{entry.method}</Txt>
        {sub ? <Txt variant="small" weight="regular" numberOfLines={1} color={failed ? C.dangerText : state === 'approved' ? C.successText : C.textMuted}>{sub}</Txt> : null}
      </View>
      <Txt variant="label" weight="bold">{currency} {entry.amount.toFixed(2)}</Txt>
      {failed ? <Button variant="soft" size="sm" label="Retry" onPress={onRetry} /> : null}
      {state === 'pending' && !card?.cancelling && card?.status !== 'processing'
        ? <Button variant="dangerSoft" size="sm" label="Cancel" onPress={onRemove} /> : null}
      {editable ? <IconButton icon="pencil" variant="tint" size={40} iconSize={16} onPress={onEdit} /> : null}
      {editable ? <IconButton icon="close" variant="tint" size={40} iconSize={16} onPress={onRemove} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  caps: { letterSpacing: 1 },
  overlay: { flex: 1, backgroundColor: C.overlay, alignItems: 'center', justifyContent: 'center' },
  sheet: { width: '82%', maxWidth: 1100, height: '92%', maxHeight: 780, borderRadius: R.sheet, backgroundColor: C.surface, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: S.lg, paddingHorizontal: 28, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  body: { flex: 1, flexDirection: 'row' },

  leftScroll: { padding: 32, gap: 18 },
  totalBlock: { alignItems: 'center', gap: 8, paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: C.border },
  bigTotal: { letterSpacing: -1.5 },
  status: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: R.pill },
  methodHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.md },
  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: S.md },
  method: { width: '49%', height: 84, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, borderRadius: R.xxl, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  methodOn: { borderColor: C.brand, backgroundColor: C.brandTint },
  methodIcon: { width: 48, height: 48, borderRadius: R.md, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  methodIconOn: { backgroundColor: C.brand },
  methodOff: { opacity: 0.4 },
  cdsNote: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: R.md, backgroundColor: C.bg },

  left: { flex: 1, padding: 28, gap: 12 },
  display: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.lg, paddingHorizontal: 24, paddingVertical: 16, borderRadius: R.xxl, backgroundColor: C.bg },
  displayValue: { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end', gap: S.sm },
  displayNumber: { letterSpacing: -1.5, flexShrink: 1 },
  quickRow: { flexDirection: 'row', gap: S.md },
  quick: { flex: 1, height: 52, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  pad: { flex: 1, flexDirection: 'row', borderRadius: R.xl, borderWidth: 1, borderColor: C.border, overflow: 'hidden', backgroundColor: C.surface },
  padDigits: { flex: 3 },
  padRow: { flex: 1, flexDirection: 'row' },
  padRowSep: { borderTopWidth: 1, borderTopColor: C.border },
  padKey: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  padKeySep: { borderLeftWidth: 1, borderLeftColor: C.border },
  padSide: { flex: 1, borderLeftWidth: 1, borderLeftColor: C.border },
  padSideKey: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  padClear: { backgroundColor: C.dangerBg, borderTopWidth: 1, borderTopColor: C.border },

  right: { width: 380, padding: 24, gap: 12, backgroundColor: C.brandSoft, borderLeftWidth: 1, borderLeftColor: C.border },
  box: { borderRadius: R.xxl, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, paddingHorizontal: 18, paddingVertical: 12 },
  rule: { height: 1, backgroundColor: C.border, marginVertical: 6 },
  sumLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 3 },
  paysHead: { flexDirection: 'row', alignItems: 'center', gap: S.sm, marginTop: 4 },
  paysBox: { flex: 1, paddingVertical: 0 },
  paysEmpty: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  payLine: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  payLineSep: { borderTopWidth: 1, borderTopColor: C.divider },
  payMark: { width: 26, height: 26 },
  payCheck: { borderRadius: 13, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  payFail: { backgroundColor: C.danger },
  strike: { textDecorationLine: 'line-through' },
  paidBox: { borderRadius: R.xxl, borderWidth: 1, borderColor: C.brandLine, backgroundColor: C.brandTint, paddingHorizontal: 18, paddingVertical: 12, gap: 2 },
  paidBoxDone: { borderColor: palette.tealLine, backgroundColor: C.infoBg },

  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  doneIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  doneActions: { flexDirection: 'row', gap: 12, marginTop: 18 },
});
