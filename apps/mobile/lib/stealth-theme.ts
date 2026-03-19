import { Platform } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

const palette = {
  canvas: '#eef2f5',
  canvasAlt: '#e6edf2',
  surface: '#ffffff',
  surfaceMuted: '#f4f6f8',
  surfaceStrong: '#e9eef2',
  brand: '#0f73af',
  brandDark: '#0a5e93',
  brandDeeper: '#0a4d7c',
  brandInk: '#084a78',
  accent: '#2f70f4',
  accentMuted: '#dfe9ff',
  success: '#1f8f64',
  warning: '#d4831f',
  danger: '#c95151',
  text: '#121821',
  textMuted: '#5e6a76',
  textSoft: '#86919c',
  border: '#d6dfe6',
  borderStrong: '#c4d1db',
  barcode: '#ffffff',
  shadow: '#082236',
  overlay: 'rgba(8, 34, 54, 0.16)',
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
      elevation: level === 'hero' ? 8 : 4,
      shadowColor: palette.shadow,
    };
  }

  return level === 'hero' ? iosShadow(0.22, 18, 10) : iosShadow(0.12, 12, 6);
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
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  headline: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  metric: {
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
};
