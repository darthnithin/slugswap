import { Ionicons } from '@expo/vector-icons';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { Platform, type ColorValue } from 'react-native';

export type CrossPlatformSymbolName = SymbolViewProps['name'];
type IoniconName = ComponentProps<typeof Ionicons>['name'];

const IONICON_FALLBACKS: Record<string, IoniconName> = {
  'arrow.clockwise': 'refresh',
  'arrow.left': 'arrow-back',
  'arrow.up.right': 'open-outline',
  'barcode.viewfinder': 'barcode-outline',
  'chart.pie': 'pie-chart-outline',
  chevron: 'chevron-back',
  'chevron.left': 'chevron-back',
  creditcard: 'card-outline',
  'exclamationmark.triangle': 'warning-outline',
  'heart.text.square': 'heart-outline',
  lock: 'lock-closed',
  'pause.fill': 'pause',
  'person.crop.circle': 'person-circle-outline',
  'person.crop.circle.badge.checkmark': 'checkmark-circle-outline',
  'person.crop.circle.badge.questionmark': 'help-circle-outline',
  'play.fill': 'play',
  'wallet.pass': 'wallet-outline',
};

function getIosName(name: CrossPlatformSymbolName): string | null {
  if (typeof name === 'string') return name;
  return name.ios ?? null;
}

export function CrossPlatformSymbol({
  name,
  fallbackName,
  size = 24,
  tintColor,
}: {
  name: CrossPlatformSymbolName;
  fallbackName?: IoniconName;
  size?: number;
  tintColor?: ColorValue;
}) {
  if (Platform.OS === 'ios') {
    return <SymbolView name={name} size={size} tintColor={tintColor} />;
  }

  const iosName = getIosName(name);
  const ioniconName = fallbackName ?? (iosName ? IONICON_FALLBACKS[iosName] : undefined);

  return (
    <Ionicons
      name={ioniconName ?? 'ellipse-outline'}
      size={size}
      color={tintColor ?? undefined}
    />
  );
}
