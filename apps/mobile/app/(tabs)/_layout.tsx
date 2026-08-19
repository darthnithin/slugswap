import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TabCacheProvider } from '@/lib/tab-cache-context';
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
            tabBarLabel: 'Menu',
            tabBarIcon: ({ focused, color, size }) => (
              <TabIcon
                focused={focused}
                color={color}
                size={size}
                name="fast-food-outline"
                activeName="fast-food"
              />
            ),
          }}
        />
        <Tabs.Screen
          name="(wallet)"
          options={{
            tabBarLabel: 'My GET',
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
          name="explore"
          options={{
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
            tabBarLabel: 'More',
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
