import React, { useEffect, useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Rect, Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { C, R, S, palette } from '../../theme/tokens';
import { Txt, Glyph } from '../ui';
import RasidifyLogo from '../RasidifyLogo';
import Config from '../../config';

export type AuthStep = 1 | 2 | 3;
const STEPS = ['Device', 'Staff PIN', 'Open shift'];

export interface AuthFact { label: string; value: string; tone?: 'ok' | 'warn' | 'muted' }

/**
 * Sign-in frame (redesign): dark brand panel with a live clock and device
 * facts on the left; step tracker, the step's content and a footer on the
 * right. Used by Device link → PIN → Open shift.
 */
export default function AuthLayout({ step, facts, footerRight, children }: {
  step: AuthStep;
  facts: AuthFact[];
  footerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const now = useMinuteClock();
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.aside}>
        <AsideArt />
        <RasidifyLogo width={170} variant="onDark" />
        <View style={styles.asideBottom}>
          <Txt size={64} weight="bold" color={palette.white} style={styles.clock}>
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
          </Txt>
          <Txt variant="title" weight="regular" color={C.headerText}>
            {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </Txt>
          <View style={styles.rule} />
          <View style={styles.facts}>
            {facts.map(f => (
              <View key={f.label} style={styles.fact}>
                <View style={[styles.factDot, { backgroundColor: f.tone === 'ok' ? C.accent : f.tone === 'warn' ? palette.amber : palette.muted }]} />
                <Txt variant="label" weight="regular" color={palette.subtle} style={styles.factLabel}>{f.label}</Txt>
                <Txt variant="label" weight="semibold" color={palette.white} numberOfLines={1} style={styles.flex}>{f.value}</Txt>
              </View>
            ))}
          </View>
        </View>
      </View>

      <KeyboardAvoidingView style={styles.main} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.steps}>
          {STEPS.map((name, i) => {
            const n = (i + 1) as AuthStep;
            const done = n < step;
            const on = n === step;
            return (
              <View key={name} style={styles.step}>
                <View style={[styles.stepNum, on && styles.stepNumOn, done && styles.stepNumDone]}>
                  {done ? <Glyph name="check" size={14} color={palette.white} strokeWidth={2.8} />
                    : <Txt variant="small" weight="bold" color={on ? palette.white : C.textMuted}>{n}</Txt>}
                </View>
                <Txt variant="caption" weight="semibold" color={on || done ? C.text : C.textSubtle}>{name}</Txt>
                {i < STEPS.length - 1 ? <View style={styles.stepLine} /> : null}
              </View>
            );
          })}
        </View>

        <ScrollView contentContainerStyle={styles.center} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.content}>{children}</View>
        </ScrollView>

        <View style={styles.footer}>
          <Txt variant="caption" color={C.textSubtle}>Rasidify POS · {Config.API_URL.includes('localhost') ? 'Dev' : 'Secure connection'}</Txt>
          {footerRight}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Title + subtitle block at the top of each step. */
export function AuthHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.heading}>
      <Txt size={30} weight="bold" style={styles.title}>{title}</Txt>
      {subtitle ? <Txt variant="body" color={C.textMuted} style={styles.sub}>{subtitle}</Txt> : null}
    </View>
  );
}

/** Red inline error under the heading. */
export function AuthError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <View style={styles.error}>
      <Glyph name="info" size={18} color={C.dangerText} strokeWidth={2} />
      <Txt variant="caption" weight="semibold" color={C.dangerText} style={styles.flex}>{message}</Txt>
    </View>
  );
}

// Re-renders on the minute boundary only — no per-second work on the login screen.
function useMinuteClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60000);
    }, (60 - new Date().getSeconds()) * 1000);
    return () => { clearTimeout(first); if (interval) clearInterval(interval); };
  }, []);
  return now;
}

// Soft indigo glow + oversized faint logo mark, bottom-right of the panel.
// Two separate Svgs: react-native-svg ignores opacity on a nested <Svg>, so
// the mark sits in its own View with opacity instead.
function AsideArt() {
  return (
    <>
      <Svg width={560} height={560} style={styles.glow} pointerEvents="none">
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={palette.indigo} stopOpacity={0.55} />
            <Stop offset="0.7" stopColor={palette.indigo} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={280} cy={280} r={280} fill="url(#glow)" />
      </Svg>
      <View style={styles.mark} pointerEvents="none">
        <Svg width={360} height={360} viewBox="6 10 48 48">
          <Path d="M28.5 11.55A22.5 22.5 0 1 0 52.45 35.5L45.43 35.5A15.5 15.5 0 1 1 28.5 18.57Z" fill={palette.white} />
          <Rect x={36} y={10} width={18} height={18} rx={4} fill={palette.cyan} />
        </Svg>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: C.surface },
  flex: { flex: 1 },
  aside: { width: 500, paddingHorizontal: 44, paddingVertical: 40, backgroundColor: palette.ink, overflow: 'hidden' },
  glow: { position: 'absolute', right: -220, bottom: -200 },
  mark: { position: 'absolute', right: -70, bottom: -40, opacity: 0.1 },
  asideBottom: { marginTop: 'auto', gap: 18 },
  clock: { lineHeight: 70, letterSpacing: -1.5 },
  rule: { height: 1, backgroundColor: '#24242A' },
  facts: { gap: 10 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  factDot: { width: 8, height: 8, borderRadius: 4 },
  factLabel: { width: 120 },
  main: { flex: 1, minWidth: 0, paddingHorizontal: 40, paddingVertical: 28 },
  steps: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  step: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: palette.greyBg, alignItems: 'center', justifyContent: 'center' },
  stepNumOn: { backgroundColor: palette.ink },
  stepNumDone: { backgroundColor: C.brand },
  stepLine: { width: 24, height: 1, backgroundColor: C.border },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: S.xxl },
  content: { width: 440, gap: S.xl },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { gap: 6 },
  title: { letterSpacing: -0.5, lineHeight: 36 },
  sub: { lineHeight: 22 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: R.md, backgroundColor: C.dangerBg },
});
