/**
 * AGIZA design tokens. Colours come from the AGIZA logo (ink wordmark, amber → orange flame);
 * `primary` is the flame orange darkened just enough for white text to pass WCAG AA (4.9:1).
 */
export const colors = {
  ink: '#181818',
  text: '#1F2937',
  textMuted: '#6B7280',
  textSubtle: '#9CA3AF',
  primary: '#C24A04',
  primaryPressed: '#A63F03',
  brand: '#E25805',
  amber: '#FBBD15',
  primarySoft: '#FFF4EC',
  background: '#F6F7F9',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',
  success: '#15803D',
  successSoft: '#ECFDF3',
  warning: '#B45309',
  warningSoft: '#FFFBEB',
  danger: '#B91C1C',
  dangerSoft: '#FEF2F2',
  info: '#1D4ED8',
  infoSoft: '#EFF6FF',
  overlay: 'rgba(17, 24, 39, 0.45)',
} as const;

export const fonts = {
  regular: 'Outfit_400Regular',
  medium: 'Outfit_500Medium',
  semibold: 'Outfit_600SemiBold',
  bold: 'Outfit_700Bold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const type = {
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30 },
  heading: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24 },
  subheading: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  smallMedium: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14 },
} as const;

export const shadow = {
  card: {
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
} as const;
