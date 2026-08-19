import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { useGlobalSearchParams, usePathname, useRouter, useSegments } from 'expo-router';
import { getSafePostAuthRoute } from './auth-navigation';
import { unregisterStoredPushTokenAsync } from './notifications';
import { supabase } from './supabase';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

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
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const searchParams = useGlobalSearchParams<{ next?: string | string[] }>();

  useEffect(() => {
    let active = true;

    // Get initial session
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!active) return;
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
      })
      .catch((error) => {
        if (!active) return;
        console.error('Error getting session:', error);
        setIsLoading(false);
      });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Handle navigation based on auth state
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'auth';
    const isRootRoute = pathname === '/' && segments.join('/') === '';
    const isPublicTab = ['/home', '/menu', '/explore', '/more'].includes(pathname);
    const isPublicUtilityRoute = pathname === '/rooms' || segments[0] === 'rooms';
    const isPublicRoute = inAuthGroup || isPublicTab || isPublicUtilityRoute;

    if (!session && !isPublicRoute && !isRootRoute) {
      router.replace({ pathname: '/auth/sign-in', params: { next: pathname } });
    } else if (session && (inAuthGroup || isRootRoute)) {
      router.replace(getSafePostAuthRoute(searchParams.next));
    } else if (!session && isRootRoute) {
      router.replace('/auth/sign-in');
    }
  }, [session, segments, isLoading, pathname, router, searchParams.next]);

  const signOut = async () => {
    await unregisterStoredPushTokenAsync();
    await supabase.auth.signOut();
    router.replace('/auth/sign-in');
  };

  return (
    <AuthContext.Provider value={{ session, user, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
