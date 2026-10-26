// Legacy colour names, kept so screens not yet moved to the redesign's
// components still compile — every value now comes from the 2026 design
// tokens (app/theme/tokens.ts). New code should import `C` from there.
import { C, palette } from '../theme/tokens';

export const Colors = {
  // Brand
  primary: C.brand,
  primaryDark: palette.ink,
  primaryLight: C.brandTint,

  // Accent used for active/selected states, links, highlights
  accent: C.brand,

  // Surfaces
  background: C.bg,
  surface: C.surface,
  surfaceAlt: palette.canvas,

  // Text
  text: C.text,
  textLight: C.textMuted,
  textMuted: C.textSubtle,
  textOnDark: palette.white,

  // Borders / dividers
  border: C.border,
  divider: C.divider,

  // Status
  success: C.success,
  successBg: C.successBg,
  danger: C.danger,
  dangerBg: C.dangerBg,
  warning: C.warning,
  warningBg: C.warningBg,

  // Shadow
  shadow: palette.ink,

  // Misc
  overlay: C.overlay,
} as const;

export type ColorToken = keyof typeof Colors;
