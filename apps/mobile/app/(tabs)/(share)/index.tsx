import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect } from 'expo-router';

import { useAuth } from '../../../../../lib/auth-context';
import {
  getDonorImpact,
  getGetAccounts,
  getGetLinkStatus,
  getGetLoginUrl,
  linkGetAccount,
  pauseDonation,
  setDonation,
  unlinkGetAccount,
  type DonorImpact,
} from '../../../../../lib/api';
import { supabase } from '../../../../../lib/supabase';
import {
  useTabCache,
  type GetAccountBalance,
  type ShareTabSnapshot,
} from '../../../../../lib/tab-cache-context';
import {
  buttonOpacity,
  cardShadow,
  stealthTheme,
  typeScale,
} from '../../../lib/stealth-theme';
import { useRouter } from 'expo-router';
import { GetMobileTabBar } from '../../../components/GetMobileTabBar';

const UCSC_TRACKED_BALANCE_ACCOUNTS = new Set(['flexi dollars', 'banana bucks', 'slug points']);

const EMPTY_IMPACT: DonorImpact = {
  isActive: false,
  weeklyAmount: 0,
  status: 'paused',
  peopleHelped: 0,
  pointsContributed: 0,
  capAmount: 0,
  redeemedThisWeek: 0,
  reservedThisWeek: 0,
  remainingThisWeek: 0,
  capReached: false,
  weekStart: new Date().toISOString(),
  weekEnd: new Date().toISOString(),
  timezone: 'America/Los_Angeles',
};

function toSafeNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDonorImpact(raw: Partial<DonorImpact> | null | undefined): DonorImpact {
  if (!raw) return EMPTY_IMPACT;
  return {
    isActive: !!raw.isActive,
    weeklyAmount: toSafeNumber(raw.weeklyAmount),
    status: typeof raw.status === 'string' ? raw.status : EMPTY_IMPACT.status,
    peopleHelped: toSafeNumber(raw.peopleHelped),
    pointsContributed: toSafeNumber(raw.pointsContributed),
    capAmount: toSafeNumber(raw.capAmount),
    redeemedThisWeek: toSafeNumber(raw.redeemedThisWeek),
    reservedThisWeek: toSafeNumber(raw.reservedThisWeek),
    remainingThisWeek: toSafeNumber(raw.remainingThisWeek),
    capReached: !!raw.capReached,
    weekStart: typeof raw.weekStart === 'string' ? raw.weekStart : EMPTY_IMPACT.weekStart,
    weekEnd: typeof raw.weekEnd === 'string' ? raw.weekEnd : EMPTY_IMPACT.weekEnd,
    timezone: typeof raw.timezone === 'string' ? raw.timezone : EMPTY_IMPACT.timezone,
  };
}

function formatNameFromEmail(email: string | null): string {
  if (!email) return 'SlugSwap Donor';

  return email
    .split('@')[0]
    .split(/[._-]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function SectionCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.sectionCard, style]}>{children}</View>;
}

function SectionHeader({
  icon,
  title,
  detail,
}: {
  icon: SymbolViewProps['name'];
  title: string;
  detail?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        <View style={styles.sectionIcon}>
          <SymbolView name={icon} tintColor={colors.textSoft} size={18} />
        </View>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
        </View>
      </View>
    </View>
  );
}

function MetricTile({
  label,
  value,
  emphasized = false,
  style,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.metricTile, emphasized ? styles.metricTileAccent : null, style]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, emphasized ? styles.metricValueAccent : null]}>{value}</Text>
    </View>
  );
}

function SecondaryButton({
  label,
  onPress,
  icon,
  destructive = false,
  disabled = false,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  icon?: SymbolViewProps['name'];
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  const tintColor = destructive ? colors.danger : colors.brand;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.secondaryButton,
        { opacity: buttonOpacity(pressed, disabled || loading) },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tintColor} />
      ) : (
        <>
          {icon ? <SymbolView name={icon} tintColor={tintColor} size={14} /> : null}
          <Text style={[styles.secondaryButtonLabel, destructive ? styles.destructiveLabel : null]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.primaryButton,
        { opacity: buttonOpacity(pressed, disabled || loading) },
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.primaryButtonLabel}>{label}</Text>
      )}
    </Pressable>
  );
}

export default function DonorScreen() {
  const { signOut } = useAuth();
  const router = useRouter();
  const { hasLoadedShare, markShareLoaded, shareSnapshot, setShareSnapshot } = useTabCache();
  const hasShareSnapshot = !!shareSnapshot;

  const [weeklyAmount, setWeeklyAmount] = useState(shareSnapshot?.weeklyAmount ?? '');
  const [isActive, setIsActive] = useState(shareSnapshot?.isActive ?? false);
  const [loading, setLoading] = useState(!shareSnapshot);
  const [saving, setSaving] = useState(false);
  const [impact, setImpact] = useState<DonorImpact>(shareSnapshot?.impact ?? EMPTY_IMPACT);
  const [userId, setUserId] = useState<string | null>(shareSnapshot?.userId ?? null);
  const [userEmail, setUserEmail] = useState<string | null>(shareSnapshot?.userEmail ?? null);
  const [userDisplayName, setUserDisplayName] = useState(
    formatNameFromEmail(shareSnapshot?.userEmail ?? null)
  );
  const [isGetLinked, setIsGetLinked] = useState(shareSnapshot?.isGetLinked ?? false);
  const [getLinkedAt, setGetLinkedAt] = useState<string | null>(shareSnapshot?.getLinkedAt ?? null);
  const [getLoginUrlInput, setGetLoginUrlInput] = useState('');
  const [linkingGet, setLinkingGet] = useState(false);
  const [unlinkingGet, setUnlinkingGet] = useState(false);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  const [getAccounts, setGetAccounts] = useState<GetAccountBalance[]>(shareSnapshot?.getAccounts ?? []);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadUserAndImpact = useCallback(async (options?: { showBlockingLoader?: boolean }) => {
    const showBlockingLoader = options?.showBlockingLoader ?? false;
    if (showBlockingLoader) setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert('Error', 'Please sign in first');
        return;
      }

      const linkState = await getGetLinkStatus(user.id);
      let nextGetAccounts: GetAccountBalance[] = [];

      if (linkState.linked) {
        try {
          const accounts = await getGetAccounts(user.id);
          nextGetAccounts = accounts.accounts || [];
        } catch {
          nextGetAccounts = [];
        }
      }

      const impactData = await getDonorImpact(user.id);
      const normalizedImpact = normalizeDonorImpact(impactData);
      const normalizedWeeklyAmount =
        impactData.weeklyAmount > 0 ? impactData.weeklyAmount.toString() : '';

      const nextSnapshot: ShareTabSnapshot = {
        userId: user.id,
        userEmail: user.email ?? null,
        weeklyAmount: normalizedWeeklyAmount,
        isActive: impactData.isActive,
        impact: normalizedImpact,
        isGetLinked: linkState.linked,
        getLinkedAt: linkState.linkedAt,
        getAccounts: nextGetAccounts,
      };

      setUserId(nextSnapshot.userId);
      setUserEmail(nextSnapshot.userEmail);
      setUserDisplayName(
        typeof user.user_metadata?.full_name === 'string'
          ? user.user_metadata.full_name
          : formatNameFromEmail(user.email ?? null)
      );
      setWeeklyAmount(nextSnapshot.weeklyAmount);
      setIsActive(nextSnapshot.isActive);
      setImpact(nextSnapshot.impact);
      setIsGetLinked(nextSnapshot.isGetLinked);
      setGetLinkedAt(nextSnapshot.getLinkedAt);
      setGetAccounts(nextSnapshot.getAccounts);
      setShareSnapshot(nextSnapshot);
      markShareLoaded();
    } catch (error) {
      console.error('Error loading impact:', error);
      Alert.alert('Error', 'Failed to load your donation data');
    } finally {
      if (showBlockingLoader) setLoading(false);
    }
  }, [markShareLoaded, setShareSnapshot]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadUserAndImpact({ showBlockingLoader: false });
    setRefreshing(false);
  }, [loadUserAndImpact]);

  const cacheShareSnapshot = useCallback((overrides: Partial<ShareTabSnapshot> = {}) => {
    setShareSnapshot({
      userId,
      userEmail,
      weeklyAmount,
      isActive,
      impact,
      isGetLinked,
      getLinkedAt,
      getAccounts,
      ...overrides,
    });
  }, [
    getAccounts,
    getLinkedAt,
    impact,
    isActive,
    isGetLinked,
    setShareSnapshot,
    userEmail,
    userId,
    weeklyAmount,
  ]);

  const ucscTrackedAccounts = getAccounts.filter((account) =>
    UCSC_TRACKED_BALANCE_ACCOUNTS.has(account.accountDisplayName.trim().toLowerCase())
  );
  const totalAvailableBalance = ucscTrackedAccounts.reduce((sum, account) => {
    if (typeof account.balance !== 'number' || Number.isNaN(account.balance)) return sum;
    return sum + account.balance;
  }, 0);

  useEffect(() => {
    if (hasShareSnapshot) return;
    void loadUserAndImpact({ showBlockingLoader: true });
  }, [hasShareSnapshot, loadUserAndImpact]);

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedShare || !hasShareSnapshot) return;
      void loadUserAndImpact({ showBlockingLoader: false });
    }, [hasLoadedShare, hasShareSnapshot, loadUserAndImpact])
  );

  const handleSetContribution = async () => {
    if (!userId) return;

    const amount = parseFloat(weeklyAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount');
      return;
    }

    setSaving(true);
    try {
      await setDonation(userId, amount, userEmail);
      setIsActive(true);
      Alert.alert('Success', 'Your contribution has been set!');
      await loadUserAndImpact({ showBlockingLoader: false });
    } catch (error) {
      console.error('Error setting donation:', error);
      Alert.alert('Error', 'Failed to set contribution. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePause = async () => {
    if (!userId) return;

    const shouldPause = isActive;
    const nextIsActive = !isActive;

    setSaving(true);
    try {
      await pauseDonation(userId, shouldPause);
      setIsActive(nextIsActive);
      cacheShareSnapshot({ isActive: nextIsActive });
      Alert.alert('Success', isActive ? 'Donation paused' : 'Donation resumed');
    } catch (error) {
      console.error('Error pausing donation:', error);
      Alert.alert('Error', 'Failed to update donation status');
    } finally {
      setSaving(false);
    }
  };

  const completeGetLink = async (validatedUrl: string) => {
    if (!userId) return;

    await linkGetAccount({
      userId,
      userEmail,
      validatedUrl: validatedUrl.trim(),
    });

    setGetLoginUrlInput('');
    Alert.alert('Success', 'Your GET account is now linked for sharing.');
    await loadUserAndImpact({ showBlockingLoader: false });
  };

  const handleOpenGetLogin = async () => {
    if (!userId) return;

    try {
      const { loginUrl } = await getGetLoginUrl();
      await WebBrowser.openBrowserAsync(loginUrl);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to open GET login');
    }
  };

  const handleLinkGet = async () => {
    if (!getLoginUrlInput.trim()) {
      Alert.alert('Missing URL', 'Paste the validated GET URL after logging in.');
      return;
    }

    setLinkingGet(true);
    try {
      await completeGetLink(getLoginUrlInput);
    } catch (error: any) {
      Alert.alert('Link Failed', error.message || 'Unable to link GET account');
    } finally {
      setLinkingGet(false);
    }
  };

  const handleUnlinkGet = () => {
    if (!userId) return;

    const runUnlink = async () => {
      setUnlinkingGet(true);
      try {
        await unlinkGetAccount(userId);
        setIsGetLinked(false);
        setGetLinkedAt(null);
        setGetAccounts([]);
        cacheShareSnapshot({
          isGetLinked: false,
          getLinkedAt: null,
          getAccounts: [],
        });
        Alert.alert('Unlinked', 'Your donor GET account has been unlinked.');
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Failed to unlink GET account');
      } finally {
        setUnlinkingGet(false);
      }
    };

    const confirmationMessage =
      'Requesters will not be able to generate claim codes until a donor links again.';

    if (Platform.OS === 'web') {
      const confirmed =
        typeof globalThis.confirm === 'function'
          ? globalThis.confirm(`Unlink GET?\n\n${confirmationMessage}`)
          : true;
      if (!confirmed) return;
      void runUnlink();
      return;
    }

    Alert.alert('Unlink GET?', confirmationMessage, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unlink',
        style: 'destructive',
        onPress: () => {
          void runUnlink();
        },
      },
    ]);
  };

  const handleRefreshBalance = async () => {
    if (!userId || !isGetLinked) return;

    setRefreshingBalance(true);
    try {
      const accounts = await getGetAccounts(userId);
      const nextAccounts = accounts.accounts || [];
      setGetAccounts(nextAccounts);
      cacheShareSnapshot({ getAccounts: nextAccounts });
    } catch (error: any) {
      Alert.alert('Refresh Failed', error.message || 'Failed to refresh GET balance');
    } finally {
      setRefreshingBalance(false);
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;

    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  const donorName = userDisplayName;
  const handleHeroAction = () => {
    if (isGetLinked) {
      router.push({
        pathname: '/scan-card',
        params: {
          userId: userId ?? undefined,
          displayName: donorName,
        },
      });
      return;
    }

    void handleOpenGetLogin();
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
      >
        <View style={styles.passCard}>
          <View style={styles.passNotch} />
          <Text style={styles.passTitle}>UCSC Dining Services</Text>
          <View style={styles.passBand}>
            <View style={styles.passAvatarShell}>
              <SymbolView
                name="person.crop.circle.badge.checkmark"
                tintColor="rgba(255,255,255,0.88)"
                size={112}
              />
            </View>
          </View>
          <View style={styles.passContent}>
            <Text style={styles.passName}>{donorName}</Text>

            <Pressable
              onPress={handleHeroAction}
              style={({ pressed }) => [
                styles.passActionPill,
                { opacity: buttonOpacity(pressed, false) },
              ]}
            >
              <SymbolView
                name={isGetLinked ? 'barcode.viewfinder' : 'link'}
                tintColor="#ffffff"
                size={22}
              />
              <Text style={styles.passActionText}>{isGetLinked ? 'Scan Card' : 'Link GET'}</Text>
            </Pressable>
          </View>
        </View>

        <SectionCard>
          <SectionHeader
            icon="dollarsign.circle"
            title="Accounts"
            detail={isGetLinked ? 'Your live GET balances' : 'Connect GET to sync campus balances'}
          />

          {isGetLinked ? (
            <>
              <View style={styles.balanceHero}>
                <Text style={styles.balanceHeroLabel}>Total available</Text>
                <Text style={styles.balanceHeroValue}>{totalAvailableBalance.toFixed(2)} pts</Text>
                <Text style={styles.balanceHeroMeta}>
                  {getLinkedAt ? `Linked ${new Date(getLinkedAt).toLocaleDateString()}` : 'Linked'}
                </Text>
              </View>

              {ucscTrackedAccounts.length > 0 ? (
                <View style={styles.metricGrid}>
                  {ucscTrackedAccounts.map((account) => (
                    <MetricTile
                      key={account.id}
                      label={account.accountDisplayName}
                      value={`${typeof account.balance === 'number' ? account.balance.toFixed(2) : 'n/a'} pts`}
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyCopy}>
                    Linked successfully, but GET did not return the tracked UCSC account balances yet.
                  </Text>
                </View>
              )}

              <View style={styles.buttonRow}>
                <SecondaryButton
                  label="Refresh Balance"
                  onPress={() => {
                    void handleRefreshBalance();
                  }}
                  icon="arrow.clockwise"
                  loading={refreshingBalance}
                />
                <SecondaryButton
                  label="Unlink GET"
                  onPress={handleUnlinkGet}
                  destructive
                  loading={unlinkingGet}
                />
              </View>
            </>
          ) : (
            <View style={styles.connectBlock}>
              <Text style={styles.connectCopy}>
                Continue to GET, sign in, then paste the validated URL back here to finish linking your donor pass.
              </Text>

              <View style={styles.buttonRow}>
                <SecondaryButton
                  label="Open GET Login"
                  onPress={() => {
                    void handleOpenGetLogin();
                  }}
                  icon="arrow.up.right"
                />
              </View>

              <TextInput
                style={styles.input}
                value={getLoginUrlInput}
                onChangeText={setGetLoginUrlInput}
                placeholder="Paste validated GET URL here"
                placeholderTextColor={colors.textSoft}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <PrimaryButton
                label="Link from Pasted URL"
                onPress={() => {
                  void handleLinkGet();
                }}
                loading={linkingGet}
              />
            </View>
          )}
        </SectionCard>

        {isGetLinked ? (
          <SectionCard>
            <SectionHeader
              icon="heart.text.square"
              title={isActive ? 'Sharing Settings' : 'Start Sharing'}
              detail={
                isActive
                  ? 'Control your weekly contribution and donor status'
                  : 'Set the weekly amount you want to contribute'
              }
            />

            {!isActive ? (
              <>
                <Text style={styles.formLabel}>Weekly amount (points)</Text>
                <TextInput
                  style={styles.input}
                  value={weeklyAmount}
                  onChangeText={setWeeklyAmount}
                  keyboardType="numeric"
                  placeholder="e.g. 100"
                  placeholderTextColor={colors.textSoft}
                />
                <PrimaryButton
                  label="Start Sharing"
                  onPress={() => {
                    void handleSetContribution();
                  }}
                  loading={saving}
                />
              </>
            ) : (
              <>
                <View style={styles.metricGrid}>
                  <MetricTile label="People helped" value={String(impact.peopleHelped)} emphasized />
                  <MetricTile label="Points / week" value={`${weeklyAmount || '0'} pts`} />
                  <MetricTile label="Redeemed" value={`${impact.redeemedThisWeek.toFixed(2)} pts`} />
                  <MetricTile label="Reserved" value={`${impact.reservedThisWeek.toFixed(2)} pts`} />
                </View>

                <View style={styles.capCard}>
                  <View style={styles.capRow}>
                    <Text style={styles.capLabel}>Weekly cap</Text>
                    <Text style={styles.capValue}>{impact.capAmount.toFixed(2)} pts</Text>
                  </View>
                  <View style={styles.capRow}>
                    <Text style={styles.capLabel}>Remaining</Text>
                    <Text style={[styles.capValue, impact.capReached ? styles.negativeValue : styles.positiveValue]}>
                      {impact.remainingThisWeek.toFixed(2)} pts
                    </Text>
                  </View>
                  <Text style={styles.capFootnote}>Tracking week in {impact.timezone}</Text>
                </View>

                <View style={styles.buttonRow}>
                  <SecondaryButton
                    label={isActive ? 'Pause Sharing' : 'Resume Sharing'}
                    onPress={() => {
                      void handlePause();
                    }}
                    icon={isActive ? 'pause.fill' : 'play.fill'}
                    loading={saving}
                  />
                </View>
              </>
            )}
          </SectionCard>
        ) : null}

        <Pressable
          onPress={() => {
            void handleSignOut();
          }}
          disabled={isSigningOut}
          style={({ pressed }) => [{ opacity: buttonOpacity(pressed, isSigningOut) }]}
        >
          <Text style={styles.logoutText}>{isSigningOut ? 'Signing out...' : 'Log out'}</Text>
        </Pressable>
      </ScrollView>

      <GetMobileTabBar active="home" />
    </View>
  );
}

const colors = stealthTheme.colors;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    padding: 18,
    gap: 18,
    paddingBottom: 116,
  },
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.canvas,
  },
  passCard: {
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brandDark,
    ...cardShadow('hero'),
  },
  passNotch: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 92,
    height: 92,
    backgroundColor: colors.brandDark,
  },
  passTitle: {
    paddingTop: 26,
    paddingHorizontal: 20,
    paddingBottom: 18,
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '500',
  },
  passBand: {
    height: 136,
    backgroundColor: colors.brandDark,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.brandDeeper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passAvatarShell: {
    width: 156,
    height: 156,
    borderRadius: 78,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.94)',
    marginTop: 48,
  },
  passContent: {
    paddingHorizontal: 20,
    paddingTop: 94,
    paddingBottom: 20,
    gap: 12,
  },
  passName: {
    color: '#ffffff',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '500',
  },
  passActionPill: {
    marginTop: 2,
    minHeight: 62,
    borderRadius: 18,
    backgroundColor: colors.brandDark,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 16,
  },
  passActionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
  sectionCard: {
    borderRadius: 24,
    paddingTop: 14,
    paddingBottom: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow(),
  },
  sectionHeader: {
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceStrong,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeaderText: {
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '700',
    color: colors.text,
  },
  sectionDetail: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  balanceHero: {
    marginHorizontal: 18,
    marginTop: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  balanceHeroLabel: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  balanceHeroValue: {
    marginTop: 4,
    color: colors.brand,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '700',
  },
  balanceHeroMeta: {
    marginTop: 4,
    ...typeScale.caption,
    color: colors.textSoft,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  metricTile: {
    minWidth: '47%',
    flexGrow: 1,
    borderRadius: 16,
    padding: 14,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  metricTileAccent: {
    backgroundColor: colors.accentMuted,
    borderColor: '#c5d6ff',
  },
  metricLabel: {
    ...typeScale.caption,
    color: colors.textMuted,
    textTransform: 'none',
    letterSpacing: 0,
  },
  metricValue: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
  },
  metricValueAccent: {
    color: colors.brand,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  secondaryButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    flexGrow: 1,
  },
  secondaryButtonLabel: {
    color: colors.brand,
    fontSize: 15,
    fontWeight: '700',
  },
  destructiveLabel: {
    color: colors.danger,
  },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.brand,
    marginHorizontal: 18,
    marginTop: 16,
  },
  primaryButtonLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  connectBlock: {
    paddingTop: 16,
    gap: 12,
  },
  connectCopy: {
    paddingHorizontal: 18,
    ...typeScale.body,
    color: colors.textMuted,
  },
  input: {
    marginHorizontal: 18,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    color: colors.text,
    fontSize: 15,
  },
  formLabel: {
    paddingHorizontal: 18,
    paddingTop: 16,
    ...typeScale.caption,
    color: colors.textMuted,
  },
  emptyState: {
    marginHorizontal: 18,
    marginTop: 16,
    borderRadius: 18,
    padding: 16,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyCopy: {
    ...typeScale.body,
    color: colors.textMuted,
  },
  capCard: {
    marginHorizontal: 18,
    marginTop: 16,
    borderRadius: 18,
    padding: 16,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  capRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  capLabel: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  capValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  positiveValue: {
    color: colors.success,
  },
  negativeValue: {
    color: colors.danger,
  },
  capFootnote: {
    ...typeScale.caption,
    color: colors.textSoft,
  },
  logoutText: {
    textAlign: 'center',
    color: colors.danger,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 6,
  },
});
