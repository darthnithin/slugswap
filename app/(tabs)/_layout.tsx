import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: true,
      tabBarActiveTintColor: '#007AFF',
    }}>
      <Tabs.Screen
        name="donor"
        options={{
          title: 'Share',
          tabBarIcon: () => null, // TODO: Add icons
        }}
      />
      <Tabs.Screen
        name="requester"
        options={{
          title: 'Request',
          tabBarIcon: () => null,
        }}
      />
    </Tabs>
  );
}
