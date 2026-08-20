import { Ionicons } from '@expo/vector-icons';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth-context';
import type { ProtectedPostAuthRoute } from '@/lib/auth-navigation';
import { deleteAccount } from '@/lib/api';
import { buttonOpacity, campusFonts, stealthTheme } from '@/lib/stealth-theme';

const colors = stealthTheme.colors;

type MoreRowProps = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBackground: string;
  iconColor?: string;
  locked?: boolean;
  disabled?: boolean;
  isLast?: boolean;
  labelColor?: string;
  subtitle?: string;
  onPress: () => void;
};

function MoreRow({
  label,
  icon,
  iconBackground,
  iconColor = colors.softWhite,
  locked,
  disabled,
  isLast,
  labelColor,
  subtitle,
  onPress,
}: MoreRowProps) {
  return (
    <Pressable
      accessibilityHint={locked ? 'Sign in is required for this tool' : undefined}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !isLast && styles.rowBorder,
        { opacity: buttonOpacity(pressed, disabled) },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconBackground }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowLabel, labelColor ? { color: labelColor } : null]}>{label}</Text>
        {subtitle ? <Text numberOfLines={1} style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {locked ? (
        <Ionicons name="lock-closed" size={15} color={colors.textSoft} />
      ) : (
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function fullNameFromUser(user: ReturnType<typeof useAuth>['user']): string {
  if (!user) return 'Sign in to SlugSwap';
  const fullName = user.user_metadata?.full_name;
  if (typeof fullName === 'string' && fullName.trim()) return fullName.trim();
  const emailName = user.email?.split('@')[0]?.replace(/[._-]+/g, ' ');
  if (!emailName) return 'SlugSwap student';
  return emailName.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function MoreScreen() {
  const router = useRouter();
  const { user, signOut, completeAccountDeletion } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const name = fullNameFromUser(user);
  const avatarLetter = user ? name.charAt(0).toUpperCase() : null;

  const openPersonalRoute = (route: Href) => {
    if (user) router.push(route);
    else {
      router.push({
        pathname: '/auth/sign-in',
        params: { next: route as ProtectedPostAuthRoute },
      });
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;

    setIsSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      console.warn('Failed to sign out:', error);
      Alert.alert(
        'Could not sign out',
        'SlugSwap could not disconnect this device safely. Check your connection and try again.'
      );
    } finally {
      setIsSigningOut(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out of SlugSwap?', 'You can still use dining, maps, and rooms as a guest.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void handleSignOut() },
    ]);
  };

  const showAbout = () => {
    Alert.alert(
      'About SlugSwap',
      'A student-built collection of useful UCSC tools—dining, rooms, maps, GET, and point sharing in one place.',
    );
  };

  const handleDeleteAccount = async () => {
    if (isDeletingAccount) return;

    setIsDeletingAccount(true);
    try {
      await deleteAccount();
      await completeAccountDeletion();
      Alert.alert('Account deleted', 'Your SlugSwap account and personal data were deleted.');
    } catch (error) {
      console.warn('Failed to delete account:', error);
      Alert.alert(
        'Could not delete account',
        error instanceof Error
          ? error.message
          : 'SlugSwap could not delete your account. Check your connection and try again.'
      );
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const confirmPermanentDeletion = () => {
    Alert.alert(
      'This cannot be undone',
      'Your SlugSwap profile, GET connection, donation settings, claim history, and notification data will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete permanently',
          style: 'destructive',
          onPress: () => void handleDeleteAccount(),
        },
      ]
    );
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete your SlugSwap account?',
      'This deletes your SlugSwap account only. It does not delete your Google or UCSC GET account.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: confirmPermanentDeletion },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>More</Text>

        <Section title="Campus tools">
          <MoreRow
            label="Study rooms"
            icon="business"
            iconBackground={colors.gold}
            iconColor={colors.ink}
            onPress={() => router.push('/rooms' as Href)}
          />
          <MoreRow
            label="Dining locations"
            icon="restaurant"
            iconBackground={colors.forest}
            onPress={() => router.push('/(tabs)/menu')}
          />
          <MoreRow
            label="Campus map"
            icon="map"
            iconBackground={colors.coral}
            isLast
            onPress={() => router.push('/(tabs)/explore')}
          />
        </Section>

        <Section title="Your tools">
          <MoreRow
            label="My GET"
            icon="wallet"
            iconBackground={colors.forest}
            locked={!user}
            onPress={() => openPersonalRoute('/my-get' as Href)}
          />
          <MoreRow
            label="Point sharing"
            icon="people"
            iconBackground="#4E725D"
            locked={!user}
            isLast
            onPress={() => openPersonalRoute('/point-sharing' as Href)}
          />
        </Section>

        <Section title="SlugSwap">
          <MoreRow
            label="About"
            icon="information-circle"
            iconBackground={colors.forest}
            onPress={showAbout}
          />
          <MoreRow
            label="Privacy policy"
            icon="shield-checkmark"
            iconBackground="#4E725D"
            onPress={() => void Linking.openURL('https://slugswap.vercel.app/privacy')}
          />
          <MoreRow
            label="Send feedback"
            icon="chatbubble"
            iconBackground={colors.gold}
            iconColor={colors.ink}
            isLast
            onPress={() => void Linking.openURL('https://github.com/darthnithin/slugswap/issues/new')}
          />
        </Section>

        {user ? (
          <Section title="Account">
            <MoreRow
              label={isDeletingAccount ? 'Deleting account…' : 'Delete account'}
              subtitle="Permanently remove your SlugSwap data"
              icon="trash"
              iconBackground="#A74835"
              labelColor="#A74835"
              disabled={isDeletingAccount}
              isLast
              onPress={confirmDeleteAccount}
            />
          </Section>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={isSigningOut}
          onPress={user ? confirmSignOut : () => router.push('/auth/sign-in')}
          style={({ pressed }) => [
            styles.accountCard,
            { opacity: buttonOpacity(pressed, isSigningOut) },
          ]}
        >
          <View style={styles.avatar}>
            {avatarLetter ? (
              <Text style={styles.avatarLetter}>{avatarLetter}</Text>
            ) : (
              <Ionicons name="person" size={22} color={colors.softWhite} />
            )}
          </View>
          <View style={styles.accountCopy}>
            <Text style={styles.accountName}>{name}</Text>
            <Text numberOfLines={1} style={styles.accountEmail}>
              {user?.email ?? 'Unlock GET and point sharing'}
            </Text>
          </View>
          <Text style={[styles.accountAction, user && styles.signOutAction]}>
            {isSigningOut ? 'Signing out…' : user ? 'Sign out' : 'Sign in'}
          </Text>
        </Pressable>
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
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    gap: 17,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
  },
  heading: {
    marginBottom: 2,
    color: colors.ink,
    fontFamily: campusFonts.serifSemibold,
    fontSize: 45,
    lineHeight: 49,
    letterSpacing: -0.9,
  },
  section: {
    gap: 7,
  },
  sectionTitle: {
    color: colors.ink,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 17,
    lineHeight: 22,
  },
  sectionCard: {
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  row: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
  },
  rowIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    color: colors.ink,
    fontFamily: campusFonts.sansMedium,
    fontSize: 16,
    lineHeight: 21,
  },
  rowSubtitle: {
    marginTop: 1,
    color: colors.textMuted,
    fontFamily: campusFonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  accountCard: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  avatar: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: colors.forest,
  },
  avatarLetter: {
    color: colors.softWhite,
    fontFamily: campusFonts.serifSemibold,
    fontSize: 25,
    lineHeight: 29,
  },
  accountCopy: {
    flex: 1,
    minWidth: 0,
  },
  accountName: {
    color: colors.ink,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 15,
    lineHeight: 20,
  },
  accountEmail: {
    marginTop: 1,
    color: colors.textMuted,
    fontFamily: campusFonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  accountAction: {
    color: colors.forest,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 13,
    lineHeight: 18,
  },
  signOutAction: {
    color: '#A74835',
  },
});
