import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CampusArtwork } from '@/components/campus/CampusArtwork';
import { getSafePostAuthRoute } from '@/lib/auth-navigation';
import { supabase } from '@/lib/supabase';
import { buttonOpacity, campusFonts, stealthTheme } from '@/lib/stealth-theme';

WebBrowser.maybeCompleteAuthSession();

const colors = stealthTheme.colors;

export default function SignIn() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string | string[] }>();
  const [loading, setLoading] = useState(false);
  const postAuthRoute = getSafePostAuthRoute(params.next);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const redirectUrl = (() => {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const url = new URL('/app/auth/callback', window.location.origin);
          url.searchParams.set('next', postAuthRoute);
          return url.toString();
        }

        return Linking.createURL('auth/callback', {
          queryParams: { next: postAuthRoute },
        });
      })();

      if (Platform.OS === 'web') {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            queryParams: { prompt: 'select_account' },
          },
        });

        if (error) Alert.alert('Error', error.message);
        return;
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' },
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
        const urlParams = new URLSearchParams(result.url.split('#')[1] || result.url.split('?')[1]);
        const accessToken = urlParams.get('access_token');
        const refreshToken = urlParams.get('refresh_token');

        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
          router.replace(postAuthRoute);
        } else {
          Alert.alert('Sign in incomplete', 'Google did not return a usable session. Please try again.');
        }
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        Alert.alert('Sign in cancelled', 'No changes were made.');
      } else {
        Alert.alert('Sign in incomplete', 'Unable to finish sign in. Please try again.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.brandBlock}>
            <Image
              accessibilityLabel="SlugSwap"
              source={require('../../assets/src/brand/slug-swap-lockup-1600.png')}
              resizeMode="contain"
              style={styles.lockup}
            />
            <Text style={styles.heroTitle}>Campus life,{`\n`}less scattered.</Text>
            <Text style={styles.heroCopy}>
              Dining, rooms, maps, GET, and more—made easier.
            </Text>
          </View>

          <View style={styles.artworkWrap}>
            <CampusArtwork height={188} />
          </View>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
              disabled={loading}
              onPress={handleGoogleSignIn}
              style={({ pressed }) => [
                styles.googleButton,
                { opacity: buttonOpacity(pressed, loading) },
              ]}
            >
              {loading ? (
                <ActivityIndicator color={colors.forest} />
              ) : (
                <>
                  <View style={styles.googleIcon}>
                    <Text style={styles.googleLetter}>G</Text>
                  </View>
                  <Text style={styles.googleLabel}>Continue with Google</Text>
                  <Ionicons name="arrow-forward" size={19} color={colors.ink} />
                </>
              )}
            </Pressable>

            <Link href="/(tabs)/home" asChild>
              <Pressable
                accessibilityLabel="Continue without signing in"
                accessibilityRole="link"
                style={({ pressed }) => [styles.guestLink, pressed && styles.pressedLink]}
              >
                <Text numberOfLines={1} style={styles.guestLabel}>
                  Continue without signing in
                </Text>
                <Ionicons name="arrow-forward" size={16} color={colors.ink} />
              </Pressable>
            </Link>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  brandBlock: {
    alignItems: 'center',
  },
  lockup: {
    width: 214,
    height: 48,
    marginBottom: 20,
  },
  heroTitle: {
    color: colors.ink,
    fontFamily: campusFonts.serifSemibold,
    fontSize: 43,
    lineHeight: 45,
    letterSpacing: -1.1,
    textAlign: 'center',
  },
  heroCopy: {
    maxWidth: 330,
    marginTop: 15,
    color: colors.textMuted,
    fontFamily: campusFonts.sans,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  artworkWrap: {
    height: 180,
    justifyContent: 'center',
    marginTop: 2,
    marginHorizontal: -4,
    overflow: 'hidden',
  },
  actions: {
    gap: 10,
    alignItems: 'center',
    marginTop: 5,
  },
  googleButton: {
    width: '100%',
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 17,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.softWhite,
  },
  googleIcon: {
    width: 25,
    height: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
  },
  googleLetter: {
    color: '#4285F4',
    fontFamily: campusFonts.sansSemibold,
    fontSize: 18,
    lineHeight: 23,
  },
  googleLabel: {
    flex: 1,
    color: colors.ink,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 16,
    lineHeight: 21,
    textAlign: 'center',
  },
  guestLink: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
  },
  pressedLink: {
    opacity: 0.6,
  },
  guestLabel: {
    color: colors.ink,
    fontFamily: campusFonts.sansMedium,
    fontSize: 15,
    lineHeight: 20,
    textDecorationLine: 'underline',
    textDecorationColor: colors.borderStrong,
  },
});
