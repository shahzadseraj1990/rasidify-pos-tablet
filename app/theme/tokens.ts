// Rasidify Tablet POS design tokens (2026 redesign: Rasidify-Tablet-POS-v2
// hand-off). Every colour, size and font the redesigned UI uses lives here —
// screens and components reference these names, never raw hex values, so a
// brand or spacing change is a one-line edit.
//
// Fonts: Poppins TTFs ship in android/app/src/main/assets/fonts. Android
// ignores fontWeight for custom fonts, so the weight is part of the family
// name (use the <Txt> component, which picks the family from `weight`).

export const palette = {
  // Brand
  indigo: '#2815C2',
  indigoTint: '#EFEDFB',
  indigoSoft: '#F7F6FE',
  indigoLine: '#D9D2FD',
  indigoLineStrong: '#C9C2F7',
  indigoMid: '#4A3FA0',
  cyan: '#4DEFEA',

  // Neutrals
  ink: '#0B0B0B',
  muted: '#515B6D',
  subtle: '#8E8BA3',
  line: '#DEDCEA',
  lineSoft: '#E6E3F3',
  lineFaint: '#EFEDFB',
  lineDashed: '#B9B5CC',
  canvas: '#F5F4FA',
  white: '#FFFFFF',
  disabledBg: '#E2E0EE',
  disabledInk: '#8E8BA3',

  // Header (dark top bar)
  header: '#0B0B0B',
  headerRaised: '#17171A',
  headerInk: '#C9C6DC',

  // Status
  green: '#12B76A', greenBg: '#DCFAE6', greenInk: '#067647',
  amber: '#FDB022', amberBg: '#FEF0C7', amberLine: '#FDE3A4', amberInk: '#93370D', amberInkStrong: '#B54708',
  red: '#D92D20', redBg: '#FEF3F2', redLine: '#FECDCA', redInk: '#B42318',
  teal: '#0A5F5C', tealBg: '#D7F8F6', tealLine: '#A6EDE9',
  violet: '#7A5AF8', violetBg: '#F4F2FE',
  grey: '#98A2B3', greyBg: '#F2F2F5', greyInk: '#344054',
  noteBg: '#FFFAEB',
} as const;

/** Semantic colours — what screens should use. */
export const C = {
  bg: palette.canvas,
  surface: palette.white,
  surfaceSunken: palette.canvas,
  text: palette.ink,
  textMuted: palette.muted,
  textSubtle: palette.subtle,
  textOnBrand: palette.white,
  border: palette.line,
  borderSoft: palette.lineSoft,
  divider: palette.lineFaint,

  brand: palette.indigo,
  brandTint: palette.indigoTint,
  brandSoft: palette.indigoSoft,
  brandLine: palette.indigoLine,
  accent: palette.cyan,

  header: palette.header,
  headerRaised: palette.headerRaised,
  headerText: palette.headerInk,

  success: palette.green, successBg: palette.greenBg, successText: palette.greenInk,
  warning: palette.amber, warningBg: palette.amberBg, warningText: palette.amberInk,
  danger: palette.red, dangerBg: palette.redBg, dangerText: palette.redInk,
  info: palette.teal, infoBg: palette.tealBg,

  disabledBg: palette.disabledBg,
  disabledText: palette.disabledInk,
  overlay: 'rgba(11,11,11,0.55)',
  scrim: 'rgba(11,11,11,0.35)',
} as const;

export const F = {
  regular: 'Poppins-Regular',
  medium: 'Poppins-Medium',
  semibold: 'Poppins-SemiBold',
  bold: 'Poppins-Bold',
} as const;

export type FontWeight = keyof typeof F;

/** Type scale (px) from the hand-off. */
export const T = {
  display: 28,
  h1: 22,
  h2: 20,
  h3: 18,
  title: 16,
  body: 15,
  label: 14,
  caption: 13,
  small: 12,
  micro: 11,
} as const;

export const S = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const R = { xs: 8, sm: 10, md: 12, lg: 14, xl: 16, xxl: 18, sheet: 24, pill: 999 } as const;

/** Control heights — touch targets stay ≥ 44 for fast, error-free tapping. */
export const H = { sm: 44, md: 48, lg: 56, xl: 64, header: 72 } as const;

/** Tones shared by badges, pills, action tiles and avatars. */
export type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' | 'violet';

export const tones: Record<Tone, { bg: string; fg: string; line: string; solid: string }> = {
  brand: { bg: palette.indigoTint, fg: palette.indigo, line: palette.indigoLine, solid: palette.indigo },
  success: { bg: palette.greenBg, fg: palette.greenInk, line: palette.greenBg, solid: palette.green },
  warning: { bg: palette.amberBg, fg: palette.amberInk, line: palette.amberLine, solid: palette.amber },
  danger: { bg: palette.redBg, fg: palette.redInk, line: palette.redLine, solid: palette.red },
  info: { bg: palette.tealBg, fg: palette.teal, line: palette.tealLine, solid: palette.teal },
  neutral: { bg: palette.greyBg, fg: palette.muted, line: palette.line, solid: palette.grey },
  accent: { bg: palette.cyan, fg: palette.ink, line: palette.cyan, solid: palette.cyan },
  violet: { bg: palette.violetBg, fg: palette.violet, line: palette.indigoLine, solid: palette.violet },
};

/** Stable avatar tone for a name (same person → same colour every render). */
export function toneForName(name: string | null | undefined): Tone {
  const list: Tone[] = ['brand', 'info', 'warning', 'violet'];
  let h = 0;
  for (const ch of name ?? '') h = (h * 31 + ch.charCodeAt(0)) | 0;
  return list[Math.abs(h) % list.length];
}

export const initials = (name: string | null | undefined) =>
  (name ?? '').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?';
