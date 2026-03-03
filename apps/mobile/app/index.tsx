import { View, ActivityIndicator, Text } from 'react-native';
import { useAuth } from '../../../lib/auth-context';
import { uiColor } from '../lib/ui-color';

export default function Index() {
  const { isLoading } = useAuth();

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: uiColor('systemGroupedBackground') }}>
      <ActivityIndicator size="large" color={uiColor('systemBlue')} />
      <Text style={{ marginTop: 16, color: uiColor('secondaryLabel') }}>
        {isLoading ? 'Loading...' : 'Redirecting...'}
      </Text>
    </View>
  );
}
