import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TabCacheProvider } from '../../../../lib/tab-cache-context';
import { GetMobileTabBar } from '../../components/GetMobileTabBar';

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
    <TabCacheProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
        }}
        tabBar={(props) => <GetMobileTabBar {...props} />}
      >
        <Tabs.Screen
          name="(share)"
          options={{
            title: 'Home',
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
            title: 'Menu',
            tabBarLabel: 'Menu',
            tabBarIcon: ({ focused, color, size }) => (
              <TabIcon
                focused={focused}
                color={color}
                size={size}
                name="wallet-outline"
                activeName="wallet"
              />
            ),
          }}
        />
        <Tabs.Screen
          name="(request)"
          options={{
            title: 'Order',
            tabBarLabel: 'Order',
            tabBarIcon: ({ focused, color, size }) => (
              <TabIcon
                focused={focused}
                color={color}
                size={size}
                name="bag-outline"
                activeName="bag"
              />
            ),
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: 'Explore',
            tabBarLabel: 'Explore',
            tabBarIcon: ({ focused, color, size }) => (
              <TabIcon
                focused={focused}
                color={color}
                size={size}
                name="map-outline"
                activeName="map"
              />
            ),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarLabel: 'more',
            tabBarIcon: ({ focused, color, size }) => (
              <TabIcon
                focused={focused}
                color={color}
                size={size}
                name="menu-outline"
                activeName="menu"
              />
            ),
          }}
        />
      </Tabs>
    </TabCacheProvider>
  );
}
