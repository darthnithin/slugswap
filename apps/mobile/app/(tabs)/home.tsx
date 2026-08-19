import { Ionicons } from '@expo/vector-icons';
import { type Href, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CampusArtwork } from '@/components/campus/CampusArtwork';
import { useAuth } from '@/lib/auth-context';
import type { ProtectedPostAuthRoute } from '@/lib/auth-navigation';
import { buttonOpacity, campusFonts, cardShadow, stealthTheme } from '@/lib/stealth-theme';

const colors = stealthTheme.colors;

type QuickTool = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: Href;
  personal?: boolean;
  tone: 'gold' | 'forest' | 'coral' | 'sage';
};

const quickTools: QuickTool[] = [
  { label: 'Rooms', icon: 'business', route: '/rooms' as Href, tone: 'gold' },
  { label: 'Map', icon: 'location', route: '/(tabs)/explore', tone: 'coral' },
  { label: 'My GET', icon: 'wallet', route: '/my-get' as Href, personal: true, tone: 'forest' },
  {
    label: 'Point sharing',
    icon: 'people',
    route: '/point-sharing' as Href,
    personal: true,
    tone: 'sage',
  },
];

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function displayFirstName(user: ReturnType<typeof useAuth>['user']): string | null {
  if (!user) return null;
  const metadataName = user.user_metadata?.full_name;
  if (typeof metadataName === 'string' && metadataName.trim()) {
    return metadataName.trim().split(/\s+/)[0] ?? null;
  }

  const emailName = user.email?.split('@')[0]?.split(/[._-]/)[0];
  if (!emailName) return null;
  return emailName.charAt(0).toUpperCase() + emailName.slice(1);
}

function ToolTile({
  tool,
  locked,
  onPress,
}: {
  tool: QuickTool;
  locked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityHint={locked ? 'Sign in is required for this tool' : undefined}
      accessibilityLabel={tool.label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.toolTile, { opacity: buttonOpacity(pressed) }]}
    >
      <View style={[styles.toolIcon, styles[`toolIcon_${tool.tone}`]]}>
        <Ionicons
          name={tool.icon}
          size={26}
          color={tool.tone === 'gold' || tool.tone === 'coral' ? colors.ink : colors.softWhite}
        />
        {locked ? (
          <View style={styles.lockBadge}>
            <Ionicons name="lock-closed" size={8} color={colors.softWhite} />
          </View>
        ) : null}
      </View>
      <Text numberOfLines={2} style={styles.toolLabel}>{tool.label}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const now = new Date();
  const firstName = displayFirstName(user);
  const greeting = greetingForHour(now.getHours());
  const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(now);

  const openTool = (tool: QuickTool) => {
    if (tool.personal && !user) {
      router.push({
        pathname: '/auth/sign-in',
        params: { next: tool.route as ProtectedPostAuthRoute },
      });
      return;
    }
    router.push(tool.route);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.heading}>
            {greeting}{firstName ? `,\n${firstName}` : '.'}
          </Text>
          <Text style={styles.dateLabel}>{dayLabel} at UCSC</Text>
        </View>

        {!user ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/auth/sign-in')}
            style={({ pressed }) => [styles.guestBanner, { opacity: buttonOpacity(pressed) }]}
          >
            <View style={styles.guestBadge}>
              <Ionicons name="person" size={20} color={colors.forest} />
            </View>
            <View style={styles.guestText}>
              <Text style={styles.guestTitle}>Make these tools yours</Text>
              <Text style={styles.guestCopy}>Sign in for GET and point sharing.</Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color={colors.forest} />
          </Pressable>
        ) : null}

        <View style={styles.diningCard}>
          <View style={styles.diningCopy}>
            <Text style={styles.cardEyebrow}>DINING TODAY</Text>
            <Text style={styles.cardTitle}>Find your next meal</Text>
            <Text style={styles.cardBody}>See menus and what’s open across campus.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(tabs)/menu')}
              style={({ pressed }) => [styles.primaryButton, { opacity: buttonOpacity(pressed) }]}
            >
              <Text style={styles.primaryButtonLabel}>View dining</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.softWhite} />
            </Pressable>
          </View>
          <View style={styles.diningArtwork}>
            <View style={styles.sun} />
            <View style={styles.treeBack} />
            <Ionicons name="business" size={68} color={colors.forest} />
            <View style={styles.path} />
          </View>
        </View>

        <View style={styles.toolsRow}>
          {quickTools.map((tool) => (
            <ToolTile
              key={tool.label}
              tool={tool}
              locked={Boolean(tool.personal && !user)}
              onPress={() => openTool(tool)}
            />
          ))}
        </View>

        <View style={styles.studyCard}>
          <View style={styles.studyCopy}>
            <Text style={styles.cardEyebrow}>STUDY ROOMS</Text>
            <Text style={styles.cardTitle}>Settle in and focus</Text>
            <Text style={styles.cardBody}>Browse available library spaces by time and location.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/rooms' as Href)}
              style={({ pressed }) => [styles.secondaryButton, { opacity: buttonOpacity(pressed) }]}
            >
              <Text style={styles.secondaryButtonLabel}>Find a room</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.forest} />
            </Pressable>
          </View>
          <View style={styles.studyArtwork}>
            <CampusArtwork compact height={132} width={250} />
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
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    gap: 16,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
  },
  header: {
    marginBottom: 2,
  },
  heading: {
    color: colors.ink,
    fontFamily: campusFonts.serifSemibold,
    fontSize: 43,
    lineHeight: 43,
    letterSpacing: -1,
  },
  dateLabel: {
    marginTop: 8,
    color: colors.textMuted,
    fontFamily: campusFonts.sansMedium,
    fontSize: 15,
    lineHeight: 20,
  },
  guestBanner: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D5C98B',
    backgroundColor: '#FFF3BF',
  },
  guestBadge: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: colors.gold,
  },
  guestText: {
    flex: 1,
  },
  guestTitle: {
    color: colors.ink,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 15,
    lineHeight: 20,
  },
  guestCopy: {
    marginTop: 1,
    color: colors.textMuted,
    fontFamily: campusFonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  diningCard: {
    minHeight: 198,
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D7D9C9',
    backgroundColor: colors.sage,
    ...cardShadow(),
  },
  diningCopy: {
    zIndex: 2,
    width: '68%',
    padding: 20,
  },
  cardEyebrow: {
    color: colors.textMuted,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.9,
  },
  cardTitle: {
    marginTop: 4,
    color: colors.ink,
    fontFamily: campusFonts.serifSemibold,
    fontSize: 28,
    lineHeight: 31,
    letterSpacing: -0.4,
  },
  cardBody: {
    marginTop: 5,
    color: colors.textMuted,
    fontFamily: campusFonts.sans,
    fontSize: 14,
    lineHeight: 19,
  },
  primaryButton: {
    alignSelf: 'flex-start',
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.forest,
  },
  primaryButtonLabel: {
    color: colors.softWhite,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 14,
    lineHeight: 19,
  },
  diningArtwork: {
    position: 'absolute',
    right: -5,
    bottom: 16,
    width: 126,
    height: 125,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  sun: {
    position: 'absolute',
    top: 0,
    right: 22,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.gold,
  },
  treeBack: {
    position: 'absolute',
    left: 12,
    bottom: 9,
    width: 41,
    height: 90,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    backgroundColor: '#76927A',
    transform: [{ rotate: '-8deg' }],
  },
  path: {
    position: 'absolute',
    right: -24,
    bottom: -25,
    width: 118,
    height: 38,
    borderRadius: 25,
    backgroundColor: '#E7DDCB',
    transform: [{ rotate: '-8deg' }],
  },
  toolsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toolTile: {
    flex: 1,
    minWidth: 0,
    minHeight: 105,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  toolIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
  },
  toolIcon_gold: { backgroundColor: colors.gold },
  toolIcon_forest: { backgroundColor: colors.forest },
  toolIcon_coral: { backgroundColor: colors.coral },
  toolIcon_sage: { backgroundColor: '#50745E' },
  lockBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 17,
    height: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.surfaceMuted,
    backgroundColor: colors.coral,
  },
  toolLabel: {
    minHeight: 31,
    color: colors.ink,
    fontFamily: campusFonts.sansMedium,
    fontSize: 12,
    lineHeight: 15,
    textAlign: 'center',
  },
  studyCard: {
    minHeight: 176,
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  studyCopy: {
    zIndex: 2,
    width: '71%',
    padding: 20,
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    minHeight: 41,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 12,
    paddingHorizontal: 14,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.softWhite,
  },
  secondaryButtonLabel: {
    color: colors.forest,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 14,
    lineHeight: 19,
  },
  studyArtwork: {
    position: 'absolute',
    right: -99,
    bottom: -13,
    opacity: 0.92,
  },
});
