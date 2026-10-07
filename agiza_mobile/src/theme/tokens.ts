import { Appearance, StyleSheet } from 'react-native';

export type Scheme = 'light' | 'dark';

// Warm, premium neutrals around the AGIZA brand yellow (#FCB800, as on agizastore.com): near-black ink,
// soft paper background, crisp white surfaces, hairline borders. Yellow fills carry black text.
const light = {
  ink: '#121212',
  text: '#26231F',
  textMuted: '#6F6A63',
  textSubtle: '#A39E96',
  /** Accent text and icons on light surfaces (AGIZA yellow is too light for text). */
  primary: '#8A6100',
  primaryPressed: '#E5A700',
  /** The AGIZA brand yellow (agizastore.com, logo flame): fills with black text on them. */
  brand: '#FCB800',
  brandPressed: '#E5A700',
  amber: '#FCB800',
  primarySoft: '#FFF6D6',
  background: '#F7F5F2',
  surface: '#FFFFFF',
  surfaceMuted: '#F2EFEA',
  border: '#ECE8E2',
  borderStrong: '#DCD7CF',
  success: '#167A45',
  successSoft: '#E9F6EF',
  warning: '#A85A00',
  warningSoft: '#FFF5E6',
  danger: '#C2261D',
  dangerSoft: '#FDEEEC',
  // Neutral notes (no blue in the AGIZA palette): warm grey text on a warm tint.
  info: '#4A4640',
  infoSoft: '#EFECE6',
  overlay: 'rgba(18, 18, 18, 0.5)',
  /** Text and icons on a brand-yellow fill. */
  onPrimary: '#121212',
  /** Dark hero surfaces (feature cards, banners) and the text on them. */
  hero: '#161412',
  onHero: '#FFFFFF',
};

/** Same roles on warm dark neutrals; accents lightened so text on them stays readable. */
const dark: typeof light = {
  ink: '#F5F2EE',
  text: '#E6E1DA',
  textMuted: '#A8A198',
  textSubtle: '#726C64',
  primary: '#FFC933',
  primaryPressed: '#E5A700',
  brand: '#FCB800',
  brandPressed: '#E5A700',
  amber: '#FCB800',
  primarySoft: 'rgba(252, 184, 0, 0.14)',
  background: '#0E0D0C',
  surface: '#181715',
  surfaceMuted: '#22201D',
  border: '#2B2926',
  borderStrong: '#3A3733',
  success: '#5CD69A',
  successSoft: 'rgba(92, 214, 154, 0.14)',
  warning: '#FFC266',
  warningSoft: 'rgba(255, 194, 102, 0.14)',
  danger: '#FF7B72',
  dangerSoft: 'rgba(255, 123, 114, 0.14)',
  info: '#D9D3CA',
  infoSoft: 'rgba(255, 255, 255, 0.06)',
  overlay: 'rgba(0, 0, 0, 0.62)',
  onPrimary: '#121212',
  hero: '#24211E',
  onHero: '#FFFFFF',
};

let current: Scheme = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';

/**
 * AGIZA design tokens. Colours come from the AGIZA logo and agizastore.com: ink wordmark and the brand
 * yellow `brand` (#FCB800) for fills with `onPrimary` (black) text; `primary` is a dark gold for accent text.
 * The object is updated in place when the phone switches between light and dark mode, so code that
 * reads `colors.x` while rendering always gets the active scheme.
 */
export const colors: typeof light = { ...(current === 'dark' ? dark : light) };

export const scheme = () => current;

/** Switches the palette; returns true when it changed (the root layout then re-renders the app). */
export function applyScheme(next: string | null | undefined): boolean {
  const target: Scheme = next === 'dark' ? 'dark' : 'light';
  if (target === current) return false;
  current = target;
  Object.assign(colors, target === 'dark' ? dark : light);
  return true;
}

/**
 * StyleSheet that follows the active scheme: `themed(() => ({ box: { backgroundColor: colors.surface } }))`.
 * Styles are built on first use per scheme, so module-level style objects pick up dark mode too.
 */
export function themed<T extends StyleSheet.NamedStyles<T>>(build: () => T): T {
  const cache: Partial<Record<Scheme, T>> = {};
  const get = () => (cache[current] ??= StyleSheet.create(build()));
  return new Proxy({} as T, {
    get: (_, key) => get()[key as keyof T],
    has: (_, key) => key in get(),
    ownKeys: () => Reflect.ownKeys(get()),
    getOwnPropertyDescriptor: (_, key) => Object.getOwnPropertyDescriptor(get(), key),
  });
}

export const fonts = {
  regular: 'Outfit_400Regular',
  medium: 'Outfit_500Medium',
  semibold: 'Outfit_600SemiBold',
  bold: 'Outfit_700Bold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const type = {
  display: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.semibold, fontSize: 19, lineHeight: 25, letterSpacing: -0.2 },
  subheading: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, letterSpacing: -0.1 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  smallMedium: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14 },
  overline: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.2, textTransform: 'uppercase' },
} as const;

export const shadow = {
  /** Resting cards: a soft, wide shadow rather than a hard edge. */
  card: {
    shadowColor: '#2B1A0C',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  /** Floating elements: bottom bars, buttons over images. */
  float: {
    shadowColor: '#2B1A0C',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
} as const;
