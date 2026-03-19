import { View, ActivityIndicator, Text } from 'react-native';
import { useAuth } from '../../../lib/auth-context';
import { stealthTheme } from '../lib/stealth-theme';

export default function Index() {
  const { isLoading } = useAuth();
  const colors = stealthTheme.colors;

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.canvas,
      }}
    >
      <ActivityIndicator size="large" color={colors.brand} />
      <Text style={{ marginTop: 16, color: colors.textMuted, fontWeight: '600' }}>
        {isLoading ? 'Loading...' : 'Redirecting...'}
      </Text>
    </View>
  );
}
