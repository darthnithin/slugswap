import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { stealthTheme } from '../lib/stealth-theme';

type NavKey = 'home' | 'accounts' | 'order' | 'explore' | 'more';

type NavItem = {
  key: NavKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon?: keyof typeof Ionicons.glyphMap;
};

const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { key: 'accounts', label: 'Accounts', icon: 'wallet-outline', activeIcon: 'wallet' },
  { key: 'order', label: 'Order', icon: 'bag-outline', activeIcon: 'bag' },
  { key: 'explore', label: 'Explore', icon: 'map-outline', activeIcon: 'map' },
  { key: 'more', label: 'more', icon: 'menu-outline', activeIcon: 'menu' },
];

const colors = stealthTheme.colors;

export function GetMobileTabBar({
  active = 'home',
  onHomePress,
}: {
  active?: NavKey;
  onHomePress?: () => void;
}) {
  return (
    <View style={styles.shell}>
      <View style={styles.bar}>
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          const iconName = isActive ? item.activeIcon ?? item.icon : item.icon;
          const content = (
            <View style={[styles.item, isActive ? styles.itemActive : null]}>
              <Ionicons
                name={iconName}
                size={26}
                color={isActive ? colors.accent : colors.textMuted}
              />
              <Text style={[styles.label, isActive ? styles.labelActive : null]}>{item.label}</Text>
            </View>
          );

          if (item.key === 'home' && onHomePress) {
            return (
              <Pressable key={item.key} onPress={onHomePress} style={styles.pressable}>
                {content}
              </Pressable>
            );
          }

          return (
            <View key={item.key} style={styles.pressable}>
              {content}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    minHeight: 78,
  },
  pressable: {
    flex: 1,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 8,
    paddingBottom: 9,
  },
  itemActive: {
    backgroundColor: colors.accentMuted,
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.textMuted,
    fontWeight: '500',
  },
  labelActive: {
    color: colors.accent,
  },
});
