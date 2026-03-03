import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, ScrollView, RefreshControl, Platform } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../../lib/auth-context';
import { supabase } from '../../../../../lib/supabase';
import { setDonation, getDonorImpact, pauseDonation, getGetAccounts, getGetLinkStatus, getGetLoginUrl, linkGetAccount, unlinkGetAccount, type DonorImpact } from '../../../../../lib/api';
import * as WebBrowser from 'expo-web-browser';
import { useTabCache, type GetAccountBalance, type ShareTabSnapshot } from '../../../../../lib/tab-cache-context';
import { useFocusEffect } from 'expo-router';
import { uiColor } from '../../../lib/ui-color';

const UCSC_TRACKED_BALANCE_ACCOUNTS = new Set([
  'flexi dollars',
  'banana bucks',
  'slug points',
]);

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

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  if (isLiquidGlassAvailable()) {
    return (
      <GlassView style={[{ borderRadius: 16, padding: 20 }, style]}>
        {children}
      </GlassView>
    );
  }
  return (
    <BlurView
      tint="systemMaterial"
      intensity={80}
      style={[{
        borderRadius: 16,
        padding: 20,
        overflow: 'hidden',
      }, style]}
    >
      {children}
    </BlurView>
  );
}

export default function DonorScreen() {
  const { signOut } = useAuth();
  const { hasLoadedShare, markShareLoaded, shareSnapshot, setShareSnapshot } = useTabCache();
  const hasShareSnapshot = !!shareSnapshot;
  const [weeklyAmount, setWeeklyAmount] = useState(shareSnapshot?.weeklyAmount ?? '');
  const [isActive, setIsActive] = useState(shareSnapshot?.isActive ?? false);
  const [loading, setLoading] = useState(!shareSnapshot);
  const [saving, setSaving] = useState(false);
  const [impact, setImpact] = useState<DonorImpact>(shareSnapshot?.impact ?? EMPTY_IMPACT);
  const [userId, setUserId] = useState<string | null>(shareSnapshot?.userId ?? null);
  const [userEmail, setUserEmail] = useState<string | null>(shareSnapshot?.userEmail ?? null);
  const [isGetLinked, setIsGetLinked] = useState(shareSnapshot?.isGetLinked ?? false);
  const [getLinkedAt, setGetLinkedAt] = useState<string | null>(shareSnapshot?.getLinkedAt ?? null);
  const [getLoginUrlInput, setGetLoginUrlInput] = useState('');
  const [linkingGet, setLinkingGet] = useState(false);
  const [openingGetLogin, setOpeningGetLogin] = useState(false);
  const [unlinkingGet, setUnlinkingGet] = useState(false);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  const [getAccounts, setGetAccounts] = useState<GetAccountBalance[]>(shareSnapshot?.getAccounts ?? []);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadUserAndImpact = useCallback(async (options?: { showBlockingLoader?: boolean }) => {
    const showBlockingLoader = options?.showBlockingLoader ?? false;
    if (showBlockingLoader) {
      setLoading(true);
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
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
      if (showBlockingLoader) {
        setLoading(false);
      }
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
  }, [getAccounts, getLinkedAt, impact, isActive, isGetLinked, setShareSnapshot, userEmail, userId, weeklyAmount]);

  const ucscTrackedAccounts = getAccounts.filter((account) =>
    UCSC_TRACKED_BALANCE_ACCOUNTS.has(account.accountDisplayName.trim().toLowerCase())
  );
  const totalAvailableBalance = ucscTrackedAccounts.reduce((sum, account) => {
    if (typeof account.balance !== 'number' || Number.isNaN(account.balance)) return sum;
    return sum + account.balance;
  }, 0);

  // Load on first mount if we don't already have cached share data.
  useEffect(() => {
    if (hasShareSnapshot) return;
    void loadUserAndImpact({ showBlockingLoader: true });
  }, [hasShareSnapshot, loadUserAndImpact]);

  // Refresh in the background when tab regains focus.
  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedShare || !hasShareSnapshot) return;
      void loadUserAndImpact({ showBlockingLoader: false });
    }, [hasLoadedShare, hasShareSnapshot, loadUserAndImpact])
  );

  const handleSetContribution = async () => {
    if (!userId) return;

    const amount = parseFloat(weeklyAmount);
    if (isNaN(amount) || amount <= 0) {
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
    if (openingGetLogin) return;

    let popup: any = null;
    try {
      setOpeningGetLogin(true);

      if (Platform.OS === 'web') {
        const webWindow = (globalThis as any).window;
        if (webWindow?.open) {
          // Open synchronously in direct click handler to avoid Safari popup blocking.
          popup = webWindow.open('', '_blank', 'noopener,noreferrer');
        }
      }

      const { loginUrl } = await getGetLoginUrl();

      if (Platform.OS === 'web') {
        const webWindow = (globalThis as any).window;
        if (popup && !popup.closed) {
          popup.location.href = loginUrl;
          if (popup.focus) popup.focus();
        } else if (webWindow?.location?.assign) {
          // Fallback for strict popup blockers: navigate current tab.
          webWindow.location.assign(loginUrl);
        }
        return;
      }

      await WebBrowser.openBrowserAsync(loginUrl);
    } catch (error: any) {
      if (popup && !popup.closed && popup.close) {
        popup.close();
      }
      Alert.alert('Error', error.message || 'Failed to open GET login');
    } finally {
      setOpeningGetLogin(false);
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
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={uiColor('systemBlue')} />
      </View>
    );
  }

  return (
    <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Show Contribution/Impact first if GET is already linked */}
        {isGetLinked && !isActive && (
          <Card>
            <Text style={{ fontSize: 17, fontWeight: '600', color: uiColor('label'), marginBottom: 4 }}>
              Set Weekly Contribution
            </Text>
            <Text style={{ fontSize: 14, color: uiColor('secondaryLabel'), marginBottom: 20 }}>
              Your contribution goes to a weekly pool that helps fellow students
            </Text>

            <View style={{ gap: 8, marginBottom: 20 }}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: uiColor('label') }}>Weekly Amount (points)</Text>
              <TextInput
                style={{
                  borderWidth: 0.5,
                  borderColor: uiColor('separator'),
                  borderRadius: 10,
                  borderCurve: 'continuous',
                  padding: 12,
                  fontSize: 16,
                  color: uiColor('label'),
                  backgroundColor: uiColor('secondarySystemGroupedBackground'),
                }}
                value={weeklyAmount}
                onChangeText={setWeeklyAmount}
                keyboardType="numeric"
                placeholder="e.g., 100"
                placeholderTextColor={uiColor('placeholderText')}
              />
            </View>

            <Pressable
              onPress={handleSetContribution}
              disabled={saving}
              style={({ pressed }) => ({
                alignItems: 'center',
                paddingVertical: 14,
                borderRadius: 10,
                borderCurve: 'continuous',
                backgroundColor: uiColor('systemBlue'),
                opacity: pressed ? 0.7 : saving ? 0.5 : 1,
              })}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Start Sharing</Text>
              )}
            </Pressable>
          </Card>
        )}

        {isGetLinked && isActive && (
          <Card>
            <Text style={{ fontSize: 17, fontWeight: '600', color: uiColor('label'), marginBottom: 16 }}>
              Your Impact
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 }}>
              <View style={{ alignItems: 'center' }}>
                <Text selectable style={{ fontSize: 32, fontWeight: 'bold', color: uiColor('systemBlue'), fontVariant: ['tabular-nums'] }}>
                  {impact.peopleHelped}
                </Text>
                <Text style={{ fontSize: 13, color: uiColor('secondaryLabel'), marginTop: 4 }}>People Helped</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text selectable style={{ fontSize: 32, fontWeight: 'bold', color: uiColor('systemBlue'), fontVariant: ['tabular-nums'] }}>
                  {weeklyAmount}
                </Text>
                <Text style={{ fontSize: 13, color: uiColor('secondaryLabel'), marginTop: 4 }}>Points/Week</Text>
              </View>
            </View>

            <Pressable
              onPress={handlePause}
              disabled={saving}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 14,
                borderRadius: 10,
                borderCurve: 'continuous',
                backgroundColor: uiColor('tertiarySystemFill'),
                opacity: pressed ? 0.7 : saving ? 0.5 : 1,
              })}
            >
              {saving ? (
                <ActivityIndicator size="small" color={uiColor('systemBlue')} />
              ) : (
                <>
                  <SymbolView
                    name={isActive ? 'pause.fill' : 'play.fill'}
                    tintColor={uiColor('systemBlue')}
                    size={14}
                  />
                  <Text style={{ color: uiColor('systemBlue'), fontSize: 16, fontWeight: '600' }}>
                    {isActive ? 'Pause' : 'Resume'} Sharing
                  </Text>
                </>
              )}
            </Pressable>
          </Card>
        )}

        {isGetLinked && isActive && (
          <Card>
            <Text style={{ fontSize: 17, fontWeight: '600', color: uiColor('label'), marginBottom: 16 }}>
              Weekly Cap
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 13, color: uiColor('secondaryLabel') }}>Cap</Text>
              <Text selectable style={{ fontSize: 13, color: uiColor('label'), fontVariant: ['tabular-nums'] }}>
                {impact.capAmount.toFixed(2)} pts
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 13, color: uiColor('secondaryLabel') }}>Redeemed</Text>
              <Text selectable style={{ fontSize: 13, color: uiColor('label'), fontVariant: ['tabular-nums'] }}>
                {impact.redeemedThisWeek.toFixed(2)} pts
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 13, color: uiColor('secondaryLabel') }}>Reserved</Text>
              <Text selectable style={{ fontSize: 13, color: uiColor('label'), fontVariant: ['tabular-nums'] }}>
                {impact.reservedThisWeek.toFixed(2)} pts
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 13, color: uiColor('secondaryLabel') }}>Remaining</Text>
              <Text selectable style={{ fontSize: 13, color: impact.capReached ? uiColor('systemRed') : uiColor('systemGreen'), fontVariant: ['tabular-nums'] }}>
                {impact.remainingThisWeek.toFixed(2)} pts
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: uiColor('tertiaryLabel'), marginTop: 8 }}>
              Tracking week in {impact.timezone}
            </Text>
          </Card>
        )}

        {/* GET Account Balance Card */}
        <Card>
          <Text style={{ fontSize: 17, fontWeight: '600', color: uiColor('label'), marginBottom: 12 }}>
            Available GET Balance
          </Text>

          {isGetLinked ? (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <SymbolView name="checkmark.circle.fill" tintColor={uiColor('systemGreen')} size={16} />
                <Text style={{ fontSize: 14, color: uiColor('systemGreen') }}>
                  Linked{getLinkedAt ? ` on ${new Date(getLinkedAt).toLocaleDateString()}` : ''}
                </Text>
              </View>

              <View style={{
                backgroundColor: uiColor('tertiarySystemFill'),
                borderRadius: 12,
                padding: 14,
                borderCurve: 'continuous',
              }}>
                <Text style={{ fontSize: 12, color: uiColor('secondaryLabel'), marginBottom: 4 }}>
                  Total Available (Flexi + Banana + Slug)
                </Text>
                <Text style={{ fontSize: 28, color: uiColor('systemBlue'), fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                  {totalAvailableBalance.toFixed(2)} pts
                </Text>
              </View>

              <Text style={{ fontSize: 13, color: uiColor('secondaryLabel') }}>Tracked accounts</Text>
              {ucscTrackedAccounts.length > 0 ? (
                <View style={{ gap: 0 }}>
                  {ucscTrackedAccounts.map((account) => (
                    <View key={account.id} style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: 8,
                      borderBottomWidth: 0.5,
                      borderBottomColor: uiColor('separator'),
                    }}>
                      <Text style={{ fontSize: 15, color: uiColor('label'), flex: 1, marginRight: 8 }}>
                        {account.accountDisplayName}
                      </Text>
                      <Text selectable style={{ fontSize: 15, color: uiColor('systemBlue'), fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                        {account.balance ?? 'n/a'} pts
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ fontSize: 13, color: uiColor('tertiaryLabel') }}>
                  Linked, but no tracked UCSC balance accounts were returned.
                </Text>
              )}

              <Pressable
                onPress={handleRefreshBalance}
                disabled={refreshingBalance}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 12,
                  borderRadius: 10,
                  borderCurve: 'continuous',
                  backgroundColor: uiColor('tertiarySystemFill'),
                  opacity: pressed ? 0.7 : refreshingBalance ? 0.5 : 1,
                })}
              >
                {refreshingBalance ? (
                  <ActivityIndicator size="small" color={uiColor('systemBlue')} />
                ) : (
                  <>
                    <SymbolView name="arrow.clockwise" tintColor={uiColor('systemBlue')} size={14} />
                    <Text style={{ color: uiColor('systemBlue'), fontWeight: '600', fontSize: 15 }}>Refresh Balance</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={handleUnlinkGet}
                disabled={unlinkingGet}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  paddingVertical: 12,
                  borderRadius: 10,
                  borderCurve: 'continuous',
                  backgroundColor: uiColor('tertiarySystemFill'),
                  opacity: pressed ? 0.7 : unlinkingGet ? 0.5 : 1,
                })}
              >
                <Text style={{ color: uiColor('systemRed'), fontWeight: '600', fontSize: 15 }}>
                  {unlinkingGet ? 'Unlinking...' : 'Unlink GET'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 14, color: uiColor('secondaryLabel'), lineHeight: 20 }}>
                Continue to GET and sign in. Once it says 'validated', tap the share icon then copy, and paste the URL below to finish linking.
              </Text>

              <Pressable
                onPress={handleOpenGetLogin}
                disabled={linkingGet || openingGetLogin}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 12,
                  borderRadius: 10,
                  borderCurve: 'continuous',
                  backgroundColor: uiColor('tertiarySystemFill'),
                  opacity: pressed ? 0.7 : linkingGet || openingGetLogin ? 0.5 : 1,
                })}
              >
                {openingGetLogin ? (
                  <ActivityIndicator size="small" color={uiColor('systemBlue')} />
                ) : (
                  <>
                    <SymbolView name="arrow.up.right" tintColor={uiColor('systemBlue')} size={14} />
                    <Text style={{ color: uiColor('systemBlue'), fontWeight: '600', fontSize: 15 }}>Open GET Login</Text>
                  </>
                )}
              </Pressable>

              <TextInput
                style={{
                  borderWidth: 0.5,
                  borderColor: uiColor('separator'),
                  borderRadius: 10,
                  borderCurve: 'continuous',
                  padding: 12,
                  fontSize: 15,
                  color: uiColor('label'),
                  backgroundColor: uiColor('secondarySystemGroupedBackground'),
                }}
                value={getLoginUrlInput}
                onChangeText={setGetLoginUrlInput}
                placeholder="Paste validated GET URL here"
                placeholderTextColor={uiColor('placeholderText')}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Pressable
                onPress={handleLinkGet}
                disabled={linkingGet}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  paddingVertical: 14,
                  borderRadius: 10,
                  borderCurve: 'continuous',
                  backgroundColor: uiColor('systemBlue'),
                  opacity: pressed ? 0.7 : linkingGet ? 0.5 : 1,
                })}
              >
                {linkingGet ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Link from Pasted URL</Text>
                )}
              </Pressable>
            </View>
          )}
        </Card>

        {/* Log Out */}
        <Pressable
          onPress={handleSignOut}
          disabled={isSigningOut}
          style={({ pressed }) => ({
            alignItems: 'center',
            paddingVertical: 10,
            opacity: pressed ? 0.5 : isSigningOut ? 0.5 : 1,
          })}
        >
          <Text style={{ color: uiColor('systemRed'), fontSize: 15 }}>
            {isSigningOut ? 'Signing out...' : 'Log out'}
          </Text>
        </Pressable>
      </ScrollView>
  );
}
