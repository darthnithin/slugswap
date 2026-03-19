import { View, Text, Pressable, Alert, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { supabase } from '../../../../lib/supabase';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { buttonOpacity, cardShadow, stealthTheme, typeScale } from '../../lib/stealth-theme';

WebBrowser.maybeCompleteAuthSession();

export default function SignIn() {
  const [loading, setLoading] = useState(false);
  const colors = stealthTheme.colors;

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const redirectUrl =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? new URL('/app/auth/callback', window.location.origin).toString()
          : Linking.createURL('auth/callback');
      console.log('Redirect URL:', redirectUrl);

      if (Platform.OS === 'web') {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            queryParams: {
              prompt: 'select_account',
            },
          },
        });

        if (error) {
          Alert.alert('Error', error.message);
          return;
        }

        return;
      }

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
    <View style={styles.screen}>
      <View style={styles.heroCard}>
        <View style={styles.heroNotch} />
        <Text style={styles.heroTitle}>UCSC Dining Services</Text>
        <View style={styles.heroBand} />
        <View style={styles.heroBody}>
          <View style={styles.avatarShell}>
            <SymbolView name="person.crop.circle" tintColor="rgba(255, 255, 255, 0.92)" size={90} />
          </View>
          <Text style={styles.appName}>SlugSwap</Text>
          <Text style={styles.appSubtitle}>
            A quieter, familiar pass-style experience for sharing dining points.
          </Text>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Sign in to continue</Text>
        <Text style={styles.panelCopy}>
          Use your Google account to open your donor or requester pass and keep your data synced.
        </Text>

        <Pressable
          onPress={handleGoogleSignIn}
          disabled={loading}
          style={({ pressed }) => [styles.signInButton, { opacity: buttonOpacity(pressed, loading) }]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <SymbolView name="person.crop.circle" tintColor="#fff" size={20} />
              <Text style={styles.signInLabel}>Sign in with Google</Text>
            </>
          )}
        </Pressable>

        <View style={styles.inlineMeta}>
          <View style={[styles.metaDot, { backgroundColor: colors.brand }]} />
          <Text style={styles.metaText}>Styled to echo the official GET Mobile pass</Text>
        </View>
      </View>
    </View>
  );
}

const colors = stealthTheme.colors;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    gap: 18,
    backgroundColor: colors.canvas,
  },
  heroCard: {
    borderRadius: stealthTheme.radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brandDark,
    ...cardShadow('hero'),
  },
  heroNotch: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 92,
    height: 90,
    backgroundColor: colors.brandDark,
  },
  heroTitle: {
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 18,
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '500',
  },
  heroBand: {
    height: 112,
    backgroundColor: colors.brandDark,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.brandDeeper,
  },
  heroBody: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 24,
    backgroundColor: colors.brand,
  },
  avatarShell: {
    width: 124,
    height: 124,
    borderRadius: 62,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 6,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    marginTop: -72,
    marginBottom: 14,
  },
  appName: {
    ...typeScale.headline,
    color: '#ffffff',
    fontSize: 28,
    lineHeight: 32,
  },
  appSubtitle: {
    marginTop: 8,
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.84)',
    fontSize: 15,
    lineHeight: 21,
  },
  panel: {
    borderRadius: stealthTheme.radii.lg,
    padding: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
    ...cardShadow(),
  },
  panelTitle: {
    ...typeScale.title,
    color: colors.text,
  },
  panelCopy: {
    ...typeScale.body,
    color: colors.textMuted,
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: stealthTheme.radii.md,
    backgroundColor: colors.brand,
  },
  signInLabel: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  inlineMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  metaText: {
    ...typeScale.caption,
    color: colors.textSoft,
  },
});
