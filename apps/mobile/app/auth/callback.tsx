import { View, ActivityIndicator, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';

export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{ error?: string | string[]; error_description?: string | string[] }>();
  const [message, setMessage] = useState('Completing sign in...');
  const [showRetry, setShowRetry] = useState(false);
  const redirectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let hardStopTimer: ReturnType<typeof setTimeout> | null = null;
    const maxCallbackMs = 7000;
    const sessionCheckTimeoutMs = 1500;

    const redirectToSignIn = (nextMessage: string, delayMs = 900) => {
      if (cancelled) return;
      setMessage(nextMessage);
      setShowRetry(true);
      if (redirectedRef.current) return;

      fallbackTimer = setTimeout(() => {
        if (cancelled || redirectedRef.current) return;
        redirectedRef.current = true;
        router.replace('/auth/sign-in');
      }, delayMs);
    };

    const asString = (value: string | string[] | undefined) =>
      Array.isArray(value) ? value[0] : value;

    const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T | null> => {
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), timeoutMs);
      });
      return Promise.race([promise, timeoutPromise]);
    };

    const checkSession = async () => {
      const result = await withTimeout(supabase.auth.getSession(), sessionCheckTimeoutMs);
      if (!result) return null;
      return result.data.session;
    };

    const completeAuth = async () => {
      try {
        const paramError = asString(params.error_description) || asString(params.error);
        if (paramError) {
          redirectToSignIn('Sign in was cancelled. Returning to sign in...');
          return;
        }

        hardStopTimer = setTimeout(() => {
          if (cancelled || redirectedRef.current) return;
          redirectedRef.current = true;
          router.replace('/auth/sign-in');
        }, maxCallbackMs);

        if (typeof window !== 'undefined') {
          const searchParams = new URLSearchParams(window.location.search);
          const hashParams = new URLSearchParams(
            window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
          );

          const oauthError =
            searchParams.get('error_description') ||
            hashParams.get('error_description') ||
            searchParams.get('error') ||
            hashParams.get('error');

          if (oauthError) {
            redirectToSignIn('Sign in was cancelled. Returning to sign in...');
            return;
          }

          const code = searchParams.get('code');
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) {
              redirectToSignIn(error.message || 'Sign in failed. Please try again.');
              return;
            }
          }
        }

        // Give Supabase a short window to hydrate session from URL/hash on web.
        for (let i = 0; i < 6; i += 1) {
          if (cancelled) return;
          const session = await checkSession();
          if (session) {
            if (redirectedRef.current) return;
            redirectedRef.current = true;
            if (hardStopTimer) clearTimeout(hardStopTimer);
            router.replace('/(tabs)/(share)');
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }

        redirectToSignIn('Sign in did not complete. Please try again.');
      } catch (error: any) {
        redirectToSignIn(error?.message || 'Unable to complete sign in.');
      }
    };

    void completeAuth();

    return () => {
      cancelled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (hardStopTimer) clearTimeout(hardStopTimer);
    };
  }, [params.error, params.error_description, router]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.text}>{message}</Text>
        {showRetry ? (
          <Pressable onPress={() => router.replace('/auth/sign-in')} style={styles.retryButton}>
            <Text style={styles.retryText}>Back to Sign In</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  text: {
    fontSize: 16,
    color: '#666',
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#007AFF',
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
