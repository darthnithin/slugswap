import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { GetMobileTabBar } from '@/components/GetMobileTabBar';

function TabIcon({
  focused,
  color,
  size,
  name,
  activeName,
}: {
  focused: boolean;
  color: string;
  size: number;
  name: keyof typeof Ionicons.glyphMap;
  activeName: keyof typeof Ionicons.glyphMap;
}) {
  return <Ionicons name={focused ? activeName : name} size={size} color={color} />;
}

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <GetMobileTabBar {...props} />}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon
              focused={focused}
              color={color}
              size={size}
              name="home-outline"
              activeName="home"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          tabBarLabel: 'Dining',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon
              focused={focused}
              color={color}
              size={size}
              name="restaurant-outline"
              activeName="restaurant"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          tabBarLabel: 'Map',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon
              focused={focused}
              color={color}
              size={size}
              name="location-outline"
              activeName="location"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          tabBarLabel: 'More',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon
              focused={focused}
              color={color}
              size={size}
              name="ellipsis-horizontal-outline"
              activeName="ellipsis-horizontal"
            />
          ),
        }}
      />
    </Tabs>
  );
}
