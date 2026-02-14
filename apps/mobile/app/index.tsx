import { View, ActivityIndicator, Text, PlatformColor } from 'react-native';
import { useAuth } from '../../../lib/auth-context';

export default function Index() {
  const { isLoading } = useAuth();

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PlatformColor('systemGroupedBackground') }}>
      <ActivityIndicator size="large" color={PlatformColor('systemBlue')} />
      <Text style={{ marginTop: 16, color: PlatformColor('secondaryLabel') }}>
        {isLoading ? 'Loading...' : 'Redirecting...'}
      </Text>
    </View>
  );
}
