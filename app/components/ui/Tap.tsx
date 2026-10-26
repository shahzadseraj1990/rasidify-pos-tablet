import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';

/**
 * The pressable base for every tappable in the redesign.
 *
 * Why not `disabled` on Pressable/TouchableOpacity: RN maps it to
 * accessibilityState.disabled → Android `view.setEnabled(false)`, and on this
 * RN/Fabric build turning it back on doesn't send `disabled: false` down, so
 * the view stays natively disabled. Android then skips it in hit-testing
 * (only its children, e.g. the label text, stay tappable) — Sell's Pay button
 * only worked when tapping the word "Pay". Here `disabled` just ignores
 * presses and the pressed look; the native view is never disabled.
 */
export default function Tap({ disabled, onPress, onLongPress, style, pressedOpacity = 0.75, children, ...rest }: Omit<PressableProps, 'style' | 'children'> & {
  disabled?: boolean | null;
  style?: StyleProp<ViewStyle>;
  pressedOpacity?: number;
  children?: React.ReactNode;
}) {
  return (
    <Pressable
      {...rest}
      onPress={disabled ? undefined : onPress}
      onLongPress={disabled ? undefined : onLongPress}
      style={({ pressed }) => [style, pressed && !disabled && { opacity: pressedOpacity }]}
    >
      {children}
    </Pressable>
  );
}
