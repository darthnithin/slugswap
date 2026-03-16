import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { useRouter, useSegments, usePathname } from 'expo-router';
import { unregisterNotificationInstallation } from './api';
import { getStoredNotificationInstallationId } from './notification-installation';
import { unsubscribeCurrentWebPush } from './web-notifications';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  isLoading: true,
  signOut: async () => {},
});

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('Initial session:', session ? 'Logged in' : 'Not logged in');
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      setInitialized(true);
    }).catch(error => {
      console.error('Error getting session:', error);
      setIsLoading(false);
      setInitialized(true);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('Auth state changed:', _event, session ? 'Logged in' : 'Not logged in');
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Handle navigation based on auth state
  useEffect(() => {
    if (!initialized || isLoading) return;

    const inAuthGroup = segments[0] === 'auth';

    console.log('Navigation check:', {
      hasSession: !!session,
      inAuthGroup,
      pathname,
      segments
    });

    const isRootRoute = pathname === '/' && segments.join('/') === '';

    // Prevent redirect loops
    if (!session && !inAuthGroup && pathname !== '/auth/sign-in') {
      console.log('Redirecting to sign-in');
      router.replace('/auth/sign-in');
    } else if (session && (inAuthGroup || isRootRoute)) {
      console.log('Redirecting to share tab');
      router.replace('/(tabs)/(share)');
    }
  }, [session, segments, isLoading, initialized, pathname]);

  const signOut = async () => {
    try {
      const installationId = await getStoredNotificationInstallationId();
      if (installationId) {
        try {
          await unregisterNotificationInstallation(installationId);
        } catch (error) {
          console.warn('Failed to unregister notifications during sign-out:', error);
        }
      }

      try {
        await unsubscribeCurrentWebPush();
      } catch (error) {
        console.warn('Failed to unsubscribe web push during sign-out:', error);
      }
    } finally {
      await supabase.auth.signOut();
    }
    router.replace('/auth/sign-in');
  };

  return (
    <AuthContext.Provider value={{ session, user, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
