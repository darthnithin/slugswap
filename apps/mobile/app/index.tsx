import { View, ActivityIndicator, Text } from 'react-native';
import { useAuth } from '../../../lib/auth-context';

export default function Index() {
  const { isLoading } = useAuth();

  // Show loading while checking auth
  // Navigation is handled by AuthProvider
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={{ marginTop: 16, color: '#666' }}>
        {isLoading ? 'Loading...' : 'Redirecting...'}
      </Text>
    </View>
  );
}
