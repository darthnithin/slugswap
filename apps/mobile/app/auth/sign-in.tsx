import { View, Text, Pressable, Alert, PlatformColor, ActivityIndicator } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { supabase } from '../../../../lib/supabase';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useState } from 'react';

WebBrowser.maybeCompleteAuthSession();

export default function SignIn() {
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const redirectUrl = Linking.createURL('auth/callback');
      console.log('Redirect URL:', redirectUrl);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      if (!data?.url) {
        Alert.alert('Error', 'Failed to start sign-in. Please try again.');
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

      if (result.type === 'success') {
        const { url } = result;
        const urlParams = new URLSearchParams(url.split('#')[1] || url.split('?')[1]);
        const accessToken = urlParams.get('access_token');
        const refreshToken = urlParams.get('refresh_token');

        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
      backgroundColor: PlatformColor('systemGroupedBackground'),
    }}>
      <View style={{ alignItems: 'center', marginBottom: 48 }}>
        <SymbolView
          name="fork.knife.circle.fill"
          tintColor={PlatformColor('systemBlue')}
          size={64}
          weight="light"
        />
        <Text style={{
          fontSize: 42,
          fontWeight: 'bold',
          color: PlatformColor('label'),
          marginTop: 16,
        }}>
          SlugSwap
        </Text>
        <Text style={{
          fontSize: 17,
          color: PlatformColor('secondaryLabel'),
          marginTop: 8,
        }}>
          Share dining points with fellow students
        </Text>
      </View>

      {isLiquidGlassAvailable() ? (
        <GlassView isInteractive style={{ borderRadius: 14, width: '100%' }}>
          <Pressable
            onPress={handleGoogleSignIn}
            disabled={loading}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 16,
              paddingHorizontal: 32,
              opacity: pressed ? 0.7 : loading ? 0.6 : 1,
            })}
          >
            {loading ? (
              <ActivityIndicator color={PlatformColor('label')} />
            ) : (
              <>
                <SymbolView name="person.crop.circle" tintColor={PlatformColor('label')} size={20} />
                <Text style={{ color: PlatformColor('label'), fontSize: 17, fontWeight: '600' }}>
                  Sign in with Google
                </Text>
              </>
            )}
          </Pressable>
        </GlassView>
      ) : (
        <Pressable
          onPress={handleGoogleSignIn}
          disabled={loading}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 16,
            paddingHorizontal: 32,
            borderRadius: 14,
            borderCurve: 'continuous',
            backgroundColor: PlatformColor('systemBlue'),
            opacity: pressed ? 0.7 : loading ? 0.6 : 1,
            width: '100%',
          })}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <SymbolView name="person.crop.circle" tintColor="#fff" size={20} />
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>
                Sign in with Google
              </Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}
