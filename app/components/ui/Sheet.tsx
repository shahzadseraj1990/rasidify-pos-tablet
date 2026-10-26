import React from 'react';
import { View, Modal, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, StyleProp, ViewStyle } from 'react-native';
import { C, H, R, S } from '../../theme/tokens';
import Txt from './Txt';
import Glyph from './Glyph';
import { IconButton } from './Button';

/**
 * Centered dialog used by every pop-up (discount, qty, notes, end shift…):
 * dimmed backdrop, white rounded card, title row with close button, body,
 * optional footer. `keyboard` lifts it above the soft keyboard.
 */
export function Dialog({ visible, onClose, title, subtitle, width = 440, children, footer, keyboard, onShow, style }: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: number;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  keyboard?: boolean;
  onShow?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const card = (
    <View style={[styles.card, { width }, style]}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Txt variant="h2">{title}</Txt>
          {subtitle ? <Txt variant="label" weight="regular" color={C.textMuted} numberOfLines={1}>{subtitle}</Txt> : null}
        </View>
        <IconButton icon="close" onPress={onClose} variant="tint" />
      </View>
      {children}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onShow={onShow}>
      {keyboard ? (
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={-120}>
          {card}
        </KeyboardAvoidingView>
      ) : <View style={styles.overlay}>{card}</View>}
    </Modal>
  );
}

/** Big read-out above a numpad (amount / qty being typed). */
export function NumDisplay({ value, caption }: { value: string; caption?: React.ReactNode }) {
  return (
    <View style={styles.display}>
      <Txt variant="display" size={36}>{value}</Txt>
      {caption}
    </View>
  );
}

/**
 * 3×4 keypad. Bottom-left holds `extraKey` ('.' by default), or a Clear
 * button when `onClear` is given. `outline` = white keys with a border
 * (sign-in screens); default = soft grey keys (dialogs).
 */
export function Numpad({ onDigit, onBackspace, onClear, extraKey = '.', outline, keyHeight = H.lg }: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onClear?: () => void;
  extraKey?: string | null;
  outline?: boolean;
  keyHeight?: number;
}) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', onClear ? 'clear' : extraKey ?? '', '0', 'back'];
  const keyStyle = [styles.key, { height: keyHeight }, outline && styles.keyOutline];
  return (
    <View style={styles.pad}>
      {keys.map((k, i) => {
        if (k === '') return <View key={`s${i}`} style={keyStyle} />;
        const plain = k === 'clear' || k === 'back';
        return (
          <TouchableOpacity
            key={k}
            style={[keyStyle, plain && outline && styles.keyPlain]}
            activeOpacity={0.7}
            onPress={() => k === 'back' ? onBackspace() : k === 'clear' ? onClear?.() : onDigit(k)}
          >
            {k === 'back' ? <Glyph name="backspace" size={26} color={C.text} />
              : k === 'clear' ? <Txt variant="body" weight="semibold" color={C.textMuted}>Clear</Txt>
              : <Txt variant="h2" size={24} weight="semibold">{k}</Txt>}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: C.overlay, alignItems: 'center', justifyContent: 'center' },
  card: { maxWidth: '92%', maxHeight: '92%', backgroundColor: C.surface, borderRadius: R.sheet, padding: S.xxl, gap: S.lg },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: S.lg },
  headText: { flex: 1, minWidth: 0 },
  footer: { flexDirection: 'row', gap: S.md, marginTop: S.xs },
  display: { alignItems: 'center', justifyContent: 'center', minHeight: 84, borderRadius: R.xl, backgroundColor: C.bg, paddingVertical: S.md },
  pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: S.sm },
  key: { width: '32%', borderRadius: R.lg, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  keyOutline: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderSoft, borderRadius: R.xl },
  keyPlain: { backgroundColor: 'transparent', borderWidth: 0 },
});

