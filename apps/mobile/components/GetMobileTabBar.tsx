import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { stealthTheme } from '../lib/stealth-theme';

const colors = stealthTheme.colors;

function getTabLabel(label: unknown, title: unknown, fallback: string): string {
  if (typeof label === 'string') return label;
  if (typeof title === 'string') return title;
  return fallback;
}

export function GetMobileTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const bottomInset = Math.min(insets.bottom, 8); // max 8px bottom inset
  const barHeight = 78 + bottomInset;

  return (
    <View style={styles.shell}>
      <View style={[styles.bar, { minHeight: barHeight }]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const color = isFocused ? colors.accent : colors.textMuted;
          const label = getTabLabel(options.tabBarLabel, options.title, route.name);

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.pressable}
            >
              <View style={[styles.item, isFocused ? styles.itemActive : null]}>
                {options.tabBarIcon?.({
                  focused: isFocused,
                  color,
                  size: 26,
                })}
                <Text style={[styles.label, isFocused ? styles.labelActive : null]}>{label}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
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
