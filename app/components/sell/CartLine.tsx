import React, { memo, useEffect, useRef } from 'react';
import { View, TouchableOpacity, Animated, PanResponder, StyleSheet } from 'react-native';
import { C, F, R, S, T, palette } from '../../theme/tokens';
import { Txt, Glyph } from '../ui';
import Money from '../Money';
import { CartItem } from '../../types';

const ACTION_W = 72;
const SWIPE_W = ACTION_W * 3;

/**
 * One order line (redesign): name, options and the item note (only when
 * set), then − qty + and the line total. Swipe left reveals Edit (qty
 * numpad), Note and Remove when enabled in POS Settings; long-press the name
 * also opens the note, tapping the qty opens the numpad, − at qty 1 removes.
 */
export interface CartLineHandlers {
  onDec: (item: CartItem) => void;
  onInc: (item: CartItem) => void;
  onEditQty: (item: CartItem) => void;
  onRemove: (item: CartItem) => void;
  onEditNote: (item: CartItem) => void;
}

// Handlers take the item (and should be stable) so memo skips unchanged rows.
function CartLine({ item, currency, on, swipeEnabled }: {
  item: CartItem; currency: string; on: CartLineHandlers; swipeEnabled: boolean;
}) {
  const onDec = () => on.onDec(item);
  const onInc = () => on.onInc(item);
  const onEditQty = () => on.onEditQty(item);
  const onRemove = () => on.onRemove(item);
  const onEditNote = () => on.onEditNote(item);
  const translateX = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);
  // The PanResponder is created once per row, so it reads the setting
  // through a ref — rows already on screen follow a toggle change.
  const swipeRef = useRef(swipeEnabled);
  swipeRef.current = swipeEnabled;
  useEffect(() => {
    if (!swipeEnabled && openRef.current) {
      openRef.current = false;
      translateX.setValue(0);
    }
  }, [swipeEnabled, translateX]);

  // Slide the row back shut, then run the action (Edit / Note / Remove).
  const close = () => {
    openRef.current = false;
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
  };
  const act = (fn: () => void) => () => { close(); fn(); };

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => swipeRef.current && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => {
      const base = openRef.current ? -SWIPE_W : 0;
      translateX.setValue(Math.max(-SWIPE_W, Math.min(0, base + g.dx)));
    },
    onPanResponderRelease: (_, g) => {
      const open = (openRef.current ? -SWIPE_W : 0) + g.dx < -SWIPE_W / 2;
      openRef.current = open;
      Animated.spring(translateX, { toValue: open ? -SWIPE_W : 0, useNativeDriver: true, bounciness: 0 }).start();
    },
  })).current;

  const content = (
    <>
      <TouchableOpacity style={styles.main} activeOpacity={1} onPress={() => { if (openRef.current) close(); }} onLongPress={onEditNote} delayLongPress={400}>
        <Txt variant="title" weight="semibold" numberOfLines={2}>{item.name}</Txt>
        {item.selectionSummary ? <Txt variant="small" weight="regular" color={C.textMuted} numberOfLines={2}>{item.selectionSummary}</Txt> : null}
        {item.kitchenNote ? (
          <View style={styles.note}>
            <Glyph name="pencil" size={13} color={palette.amberInkStrong} strokeWidth={2} />
            <Txt variant="small" weight="medium" color={palette.amberInkStrong} numberOfLines={1} style={styles.noteText}>{item.kitchenNote}</Txt>
          </View>
        ) : null}
      </TouchableOpacity>
      <View style={styles.stepper}>
        <TouchableOpacity onPress={onDec} style={[styles.step, styles.stepDec]} activeOpacity={0.7}>
          <Glyph name="minus" size={20} color={C.text} strokeWidth={2.4} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onEditQty} hitSlop={HIT} style={styles.qty}>
          <Txt variant="h3" weight="bold" align="center">{item.qty}</Txt>
        </TouchableOpacity>
        <TouchableOpacity onPress={onInc} style={[styles.step, styles.stepInc]} activeOpacity={0.7}>
          <Glyph name="plus" size={20} color={C.brand} strokeWidth={2.4} />
        </TouchableOpacity>
      </View>
      <Money amount={item.total} currency={currency} style={styles.total} />
    </>
  );

  if (!swipeEnabled) return <View style={styles.row}>{content}</View>;
  return (
    <View style={styles.wrap}>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.action, { backgroundColor: C.brand }]} onPress={act(onEditQty)}>
          <Glyph name="pencil" size={18} color={palette.white} />
          <Txt variant="small" weight="semibold" color={palette.white}>Edit</Txt>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.action, { backgroundColor: palette.amber }]} onPress={act(onEditNote)}>
          <Glyph name="orders" size={18} color={palette.ink} />
          <Txt variant="small" weight="semibold" color={palette.ink}>Note</Txt>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.action, { backgroundColor: C.danger }]} onPress={act(onRemove)}>
          <Glyph name="trash" size={18} color={palette.white} />
          <Txt variant="small" weight="semibold" color={palette.white}>Remove</Txt>
        </TouchableOpacity>
      </View>
      <Animated.View style={[styles.row, { transform: [{ translateX }] }]} {...pan.panHandlers}>{content}</Animated.View>
    </View>
  );
}

export default memo(CartLine);

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.divider },
  main: { flex: 1, minWidth: 0, gap: 1 },
  note: { flexDirection: 'row', alignItems: 'center', gap: S.xs, marginTop: 2 },
  noteText: { flexShrink: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  step: { width: 48, height: 48, borderRadius: R.md, alignItems: 'center', justifyContent: 'center' },
  stepDec: { borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  stepInc: { backgroundColor: C.brandTint },
  qty: { minWidth: 36, paddingHorizontal: 2 },
  total: { minWidth: 80, textAlign: 'right', fontSize: T.title, fontFamily: F.bold, color: C.text },
  actions: { position: 'absolute', right: 0, top: 0, bottom: 0, flexDirection: 'row' },
  action: { width: ACTION_W, alignItems: 'center', justifyContent: 'center', gap: S.xs },
});
