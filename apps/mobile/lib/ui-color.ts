import { Platform, PlatformColor } from 'react-native';
import type { ColorValue } from 'react-native';

const IOS_COLOR_FALLBACKS: Record<string, string> = {
  systemBackground: '#ffffff',
  systemGroupedBackground: '#f2f2f7',
  secondarySystemGroupedBackground: '#ffffff',
  tertiarySystemFill: 'rgba(118, 118, 128, 0.12)',
  label: '#111827',
  secondaryLabel: '#6b7280',
  tertiaryLabel: '#9ca3af',
  placeholderText: '#9ca3af',
  separator: '#d1d5db',
  systemBlue: '#2563eb',
  systemGreen: '#16a34a',
  systemRed: '#dc2626',
};

export function uiColor(name: string, fallback?: string): ColorValue {
  if (Platform.OS === 'ios') {
    return PlatformColor(name);
  }

  return fallback ?? IOS_COLOR_FALLBACKS[name] ?? '#111827';
}
