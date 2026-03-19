import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TabCacheProvider } from '../../../../lib/tab-cache-context';
import { stealthTheme } from '../../lib/stealth-theme';

function TabIcon({
  focused,
  color,
  name,
  activeName,
}: {
  focused: boolean;
  color: string;
  name: keyof typeof Ionicons.glyphMap;
  activeName: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Ionicons
      name={focused ? activeName : name}
      size={24}
      color={color}
      style={{ marginTop: 6 }}
    />
  );
}

export default function TabLayout() {
  const colors = stealthTheme.colors;

  return (
    <TabCacheProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            display: 'none',
            backgroundColor: colors.surface,
          },
        }}
      >
        <Tabs.Screen
          name="(share)"
          options={{
            title: 'Share',
            tabBarIcon: ({ focused, color }) => (
              <TabIcon focused={focused} color={color} name="heart-outline" activeName="heart" />
            ),
          }}
        />
        <Tabs.Screen
          name="(request)"
          options={{
            title: 'Request',
            tabBarIcon: ({ focused, color }) => (
              <TabIcon focused={focused} color={color} name="qr-code-outline" activeName="qr-code" />
            ),
          }}
        />
      </Tabs>
    </TabCacheProvider>
  );
}
