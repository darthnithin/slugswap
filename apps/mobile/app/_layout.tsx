import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../lib/auth-context';
import { useEffect } from 'react';
import { Text, View } from 'react-native';

export default function RootLayout() {
  // Debug: Check if env vars are loaded
  useEffect(() => {
    console.log('Environment check:');
    console.log('SUPABASE_URL:', process.env.EXPO_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING');
    console.log('SUPABASE_KEY:', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'MISSING');
  }, []);

  // Error boundary for debugging
  try {
    return (
      <AuthProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="auth/sign-in" />
          <Stack.Screen name="auth/callback" />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </AuthProvider>
    );
  } catch (error) {
    console.error('Error in RootLayout:', error);
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ color: 'red', marginBottom: 10 }}>Error loading app:</Text>
        <Text>{String(error)}</Text>
      </View>
    );
  }
}
