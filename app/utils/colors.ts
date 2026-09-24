// Tablet POS design tokens — derived from the Rasidify web/tablet UI reference
// (Tablet POS UI/*.png) and the brand logo materials. Distinct from the mobile
// app's palette by design: this is a denser, light "desktop POS" look.
export const Colors = {
  // Brand
  primary: '#3D74F3',
  primaryDark: '#0D0D29',
  primaryLight: '#E6ECFE',

  // Accent used for active/selected states, links, highlights
  accent: '#2052DF',

  // Surfaces
  background: '#F5F6F8',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F1F4',

  // Text
  text: '#101828',
  textLight: '#475467',
  textMuted: '#94989E',
  textOnDark: '#FFFFFF',

  // Borders / dividers
  border: '#E4E6EB',
  divider: '#EEEFF2',

  // Status
  success: '#12B76A',
  successBg: '#ECFDF3',
  danger: '#F04438',
  dangerBg: '#FEF3F2',
  warning: '#F79009',
  warningBg: '#FFFAEB',

  // Shadow
  shadow: '#0D0D29',

  // Misc
  overlay: 'rgba(13,13,41,0.6)',
} as const;

export type ColorToken = keyof typeof Colors;
