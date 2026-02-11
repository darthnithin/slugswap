import { Tabs } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useAuth } from '../../../../lib/auth-context';
import { useState } from 'react';

export default function TabsLayout() {
  const { signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <Tabs screenOptions={{
      headerShown: true,
      tabBarActiveTintColor: '#007AFF',
      headerRight: () => (
        <Pressable
          onPress={handleSignOut}
          style={{ paddingHorizontal: 12, paddingVertical: 6, opacity: isSigningOut ? 0.6 : 1 }}
          disabled={isSigningOut}
        >
          <Text style={{ color: '#007AFF', fontWeight: '600' }}>
            {isSigningOut ? 'Logging out...' : 'Log out'}
          </Text>
        </Pressable>
      ),
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
