import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { TextInput, StyleSheet, Keyboard } from 'react-native';
import { BarcodeScannerService } from '../services/barcode/BarcodeScannerService';
import { BarcodeRouter } from '../services/barcode/BarcodeRouter';

interface BarcodeScannerContextValue {
  // Any screen with a real TextInput (product search, customer search, note
  // field, discount keypad, login form, ...) calls pauseCapture() on focus
  // and resumeCapture() on blur, so the hidden capture field never steals
  // keystrokes meant for that field. This is the mechanism that makes "the
  // cashier never has to focus anything to scan" true: the hidden field is
  // the default focus holder everywhere else.
  pauseCapture: () => void;
  resumeCapture: () => void;
}

const BarcodeScannerContext = createContext<BarcodeScannerContextValue>({
  pauseCapture: () => {},
  resumeCapture: () => {},
});

export const useBarcodeScannerCapture = () => useContext(BarcodeScannerContext);

export function BarcodeScannerProvider({ children }: { children: React.ReactNode }) {
  const inputRef = useRef<TextInput>(null);
  const pausedRef = useRef(false);

  // Deliberately not mirrored into a ref that's only updated by the
  // subscribe() callback below: React runs child effects before parent
  // effects on mount, so a screen deep in the tree can register a handler
  // (and fire notify()) before this provider's own effect has even
  // subscribed — that notification is then lost forever. Reading
  // BarcodeRouter.hasActiveHandler() fresh every time sidesteps the whole
  // ordering problem; subscribe() is only used as a fast-path nudge.
  // True while a real TextInput (search, note, ...) holds focus. Checked in
  // addition to pausedRef because a field's onFocus (which pauses capture)
  // can arrive a frame or two after our own onBlur — reclaiming focus in that
  // gap made the soft keyboard pop open and immediately close again.
  const otherInputFocused = useCallback(() => {
    const current = TextInput.State.currentlyFocusedInput();
    return current != null && current !== inputRef.current;
  }, []);

  const refocus = useCallback(() => {
    if (pausedRef.current || !BarcodeRouter.hasActiveHandler()) return;
    // Give the platform time to finish whatever focus transition is in flight
    // (and deliver the new field's onFocus) before deciding to reclaim focus.
    setTimeout(() => {
      if (!pausedRef.current && BarcodeRouter.hasActiveHandler() && !otherInputFocused()) {
        inputRef.current?.focus();
        // Some OEM ROMs show the soft keyboard (with predictive-text
        // suggestions) despite showSoftInputOnFocus={false} — force it away.
        Keyboard.dismiss();
      }
    }, 250);
  }, [otherInputFocused]);

  useEffect(() => {
    BarcodeScannerService.attachNativeClear(() => inputRef.current?.clear());
    return BarcodeRouter.subscribe(active => {
      if (active) refocus();
      else inputRef.current?.blur();
    });
  }, [refocus]);

  // Android can silently hand hardware-keyboard focus to whatever
  // TouchableOpacity is next in line (e.g. right after a screen transition,
  // before our focus() call lands) — a stray Enter from the scanner then
  // "clicks" that button instead of completing a scan. A cheap poll while a
  // handler is active is the reliable fix: it reclaims focus the moment it
  // slips, instead of trusting a single one-shot focus() call.
  useEffect(() => {
    const guard = setInterval(() => {
      if (pausedRef.current || !BarcodeRouter.hasActiveHandler()) return;
      if (BarcodeScannerService.isBuffering()) return; // don't interrupt a scan in flight
      if (otherInputFocused()) return;
      if (!inputRef.current?.isFocused()) inputRef.current?.focus();
    }, 200);
    return () => clearInterval(guard);
  }, [otherInputFocused]);

  const pauseCapture = useCallback(() => {
    pausedRef.current = true;
    BarcodeScannerService.reset();
  }, []);

  const resumeCapture = useCallback(() => {
    pausedRef.current = false;
    refocus();
  }, [refocus]);

  return (
    <BarcodeScannerContext.Provider value={{ pauseCapture, resumeCapture }}>
      {children}
      <TextInput
        ref={inputRef}
        style={styles.hidden}
        onChangeText={t => BarcodeScannerService.onTextChanged(t)}
        onSubmitEditing={() => BarcodeScannerService.onEnterKey()}
        onBlur={refocus}
        blurOnSubmit={false}
        showSoftInputOnFocus={false}
        keyboardType="visible-password"
        caretHidden
        autoCorrect={false}
        autoCapitalize="none"
        importantForAutofill="no"
        contextMenuHidden
        focusable
      />
    </BarcodeScannerContext.Provider>
  );
}

const styles = StyleSheet.create({
  hidden: {
    // On-screen (not off-canvas at a negative offset) — some OEM ROMs
    // (e.g. EMUI) are reluctant to grant real programmatic focus to a view
    // positioned entirely outside the viewport.
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    opacity: 0,
  },
});
