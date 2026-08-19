import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { campusFonts, stealthTheme } from '@/lib/stealth-theme';

const colors = stealthTheme.colors;

const VISIBLE_TAB_ROUTES = new Set(['home', 'menu', 'explore', 'more']);

function getTabLabel(label: unknown, title: unknown, fallback: string): string {
  if (typeof label === 'string') return label;
  if (typeof title === 'string') return title;
  return fallback;
}

export function GetMobileTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const bottomInset = Math.max(insets.bottom, 7);
  const focusedRouteKey = state.routes[state.index]?.key;
  const visibleRoutes = state.routes.filter((route) => VISIBLE_TAB_ROUTES.has(route.name));

  return (
    <View style={styles.shell}>
      <View style={[styles.bar, { paddingBottom: bottomInset }]}>
        {visibleRoutes.map((route) => {
          const { options } = descriptors[route.key];
          const isFocused = focusedRouteKey === route.key;
          const color = isFocused ? colors.forest : colors.textMuted;
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

          return (
            <Pressable
              key={route.key}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              onPress={onPress}
              testID={options.tabBarButtonTestID}
              style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
            >
              <View style={styles.item}>
                <View style={styles.iconWrap}>
                  {options.tabBarIcon?.({ focused: isFocused, color, size: 24 })}
                </View>
                <Text style={[styles.label, isFocused && styles.labelActive]}>{label}</Text>
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
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    backgroundColor: colors.softWhite,
  },
  bar: {
    width: '100%',
    maxWidth: 620,
    minHeight: 65,
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  pressable: {
    flex: 1,
    minHeight: 58,
  },
  pressed: {
    opacity: 0.58,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  iconWrap: {
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: colors.textMuted,
    fontFamily: campusFonts.sansMedium,
    fontSize: 11,
    lineHeight: 14,
  },
  labelActive: {
    color: colors.forest,
    fontFamily: campusFonts.sansSemibold,
  },
});
