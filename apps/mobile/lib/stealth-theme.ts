import { Platform } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

const palette = {
  canvas: '#F6F1E5',
  canvasAlt: '#EEE7D8',
  surface: '#FFFDF7',
  surfaceMuted: '#F2EDDF',
  surfaceStrong: '#DDE2D1',
  brand: '#183D32',
  brandDark: '#102E27',
  brandDeeper: '#0B241E',
  brandInk: '#102E27',
  accent: '#183D32',
  accentMuted: '#F9E8A5',
  success: '#34745A',
  warning: '#A96518',
  danger: '#F06A4F',
  text: '#102E27',
  textMuted: '#52665F',
  textSoft: '#7B8A84',
  border: '#D2D4C6',
  borderStrong: '#AEB9AA',
  barcode: '#FFFFFF',
  shadow: '#183D32',
  overlay: 'rgba(16, 46, 39, 0.28)',
  forest: '#183D32',
  gold: '#F4C332',
  cream: '#F6F1E5',
  softWhite: '#FFFDF7',
  coral: '#F06A4F',
  sage: '#DDE2D1',
  ink: '#102E27',
};

const radii = {
  xs: 10,
  sm: 14,
  md: 18,
  lg: 24,
  pill: 999,
};

export const stealthTheme = {
  colors: palette,
  radii,
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
  },
};

export const monoFontFamily = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export const campusFonts = {
  sans: 'Figtree_400Regular',
  sansMedium: 'Figtree_500Medium',
  sansSemibold: 'Figtree_600SemiBold',
  serif: 'Newsreader_400Regular',
  serifSemibold: 'Newsreader_600SemiBold',
};

function iosShadow(opacity: number, radius: number, height: number): ViewStyle {
  return {
    shadowColor: palette.shadow,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: { width: 0, height },
  };
}

export function cardShadow(level: 'surface' | 'hero' = 'surface'): ViewStyle {
  if (Platform.OS === 'android') {
    return {
      elevation: level === 'hero' ? 3 : 1,
      shadowColor: palette.shadow,
    };
  }

  return level === 'hero' ? iosShadow(0.1, 16, 8) : iosShadow(0.06, 10, 4);
}

export function buttonOpacity(pressed: boolean, disabled = false): number {
  if (disabled) return 0.55;
  return pressed ? 0.82 : 1;
}

export const typeScale: Record<
  'eyebrow' | 'title' | 'headline' | 'body' | 'caption' | 'metric',
  TextStyle
> = {
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: campusFonts.sansSemibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: campusFonts.sansSemibold,
  },
  headline: {
    fontSize: 34,
    lineHeight: 40,
    fontFamily: campusFonts.serifSemibold,
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: campusFonts.sans,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: campusFonts.sansMedium,
  },
  metric: {
    fontSize: 36,
    lineHeight: 40,
    fontFamily: campusFonts.serifSemibold,
    fontVariant: ['tabular-nums'],
  },
};
