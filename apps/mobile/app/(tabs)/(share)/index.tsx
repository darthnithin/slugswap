import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, ScrollView, PlatformColor, RefreshControl } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../../lib/auth-context';
import { supabase } from '../../../../../lib/supabase';
import { setDonation, getDonorImpact, pauseDonation, getGetAccounts, getGetLinkStatus, getGetLoginUrl, linkGetAccount, unlinkGetAccount } from '../../../../../lib/api';
import * as WebBrowser from 'expo-web-browser';
import { useTabCache } from '../../../../../lib/tab-cache-context';
import { useFocusEffect } from 'expo-router';

interface GetAccountBalance {
  id: string;
  accountDisplayName: string;
  balance: number | null;
}

const UCSC_TRACKED_BALANCE_ACCOUNTS = new Set([
  'flexi dollars',
  'banana bucks',
  'slug points',
]);

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
  const { hasLoadedShare, markShareLoaded } = useTabCache();
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(!hasLoadedShare);
  const [saving, setSaving] = useState(false);
  const [impact, setImpact] = useState({ peopleHelped: 0, pointsContributed: 0 });
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isGetLinked, setIsGetLinked] = useState(false);
  const [getLinkedAt, setGetLinkedAt] = useState<string | null>(null);
  const [getLoginUrlInput, setGetLoginUrlInput] = useState('');
  const [linkingGet, setLinkingGet] = useState(false);
  const [unlinkingGet, setUnlinkingGet] = useState(false);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  const [getAccounts, setGetAccounts] = useState<GetAccountBalance[]>([]);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadUserAndImpact();
    setRefreshing(false);
  }, []);

  const ucscTrackedAccounts = getAccounts.filter((account) =>
    UCSC_TRACKED_BALANCE_ACCOUNTS.has(account.accountDisplayName.trim().toLowerCase())
  );
  const totalAvailableBalance = ucscTrackedAccounts.reduce((sum, account) => {
    if (typeof account.balance !== 'number' || Number.isNaN(account.balance)) return sum;
    return sum + account.balance;
  }, 0);

  // Load on first mount
  useEffect(() => {
    if (hasLoadedShare) return;
    loadUserAndImpact();
  }, []);

  // Reload GET link status when tab comes back into focus
  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedShare) return; // Don't reload if initial load hasn't happened

      // Only refresh GET link status, not everything
      (async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const linkState = await getGetLinkStatus(user.id);
          setIsGetLinked(linkState.linked);
          setGetLinkedAt(linkState.linkedAt);

          if (linkState.linked) {
            try {
              const accounts = await getGetAccounts(user.id);
              setGetAccounts(accounts.accounts || []);
            } catch {
              setGetAccounts([]);
            }
          } else {
            setGetAccounts([]);
          }
        } catch (error) {
          console.error('Error refreshing GET status:', error);
        }
      })();
    }, [hasLoadedShare])
  );

  async function loadUserAndImpact() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'Please sign in first');
        return;
      }

      setUserId(user.id);
      setUserEmail(user.email ?? null);

      const linkState = await getGetLinkStatus(user.id);
      setIsGetLinked(linkState.linked);
      setGetLinkedAt(linkState.linkedAt);
      if (linkState.linked) {
        try {
          const accounts = await getGetAccounts(user.id);
          setGetAccounts(accounts.accounts || []);
        } catch {
          setGetAccounts([]);
        }
      } else {
        setGetAccounts([]);
      }

      const impactData = await getDonorImpact(user.id);
      setIsActive(impactData.isActive);
      setMonthlyAmount(impactData.monthlyAmount > 0 ? impactData.monthlyAmount.toString() : '');
      setImpact({
        peopleHelped: impactData.peopleHelped,
        pointsContributed: impactData.pointsContributed,
      });
    } catch (error) {
      console.error('Error loading impact:', error);
      Alert.alert('Error', 'Failed to load your donation data');
    } finally {
      setLoading(false);
      markShareLoaded();
    }
  }

  const handleSetContribution = async () => {
    if (!userId) return;

    const amount = parseFloat(monthlyAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount');
      return;
    }

    setSaving(true);
    try {
      await setDonation(userId, amount, userEmail);
      setIsActive(true);
      Alert.alert('Success', 'Your contribution has been set!');
      await loadUserAndImpact();
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

    setSaving(true);
    try {
      await pauseDonation(userId, shouldPause);
      setIsActive(!isActive);
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
    await loadUserAndImpact();
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
    Alert.alert('Unlink GET?', 'Requesters will not be able to generate claim codes until a donor links again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unlink',
        style: 'destructive',
        onPress: async () => {
          setUnlinkingGet(true);
          try {
            await unlinkGetAccount(userId);
            setIsGetLinked(false);
            setGetLinkedAt(null);
            setGetAccounts([]);
            Alert.alert('Unlinked', 'Your donor GET account has been unlinked.');
          } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to unlink GET account');
          } finally {
            setUnlinkingGet(false);
          }
        },
      },
    ]);
  };

  const handleRefreshBalance = async () => {
    if (!userId || !isGetLinked) return;
    setRefreshingBalance(true);
    try {
      const accounts = await getGetAccounts(userId);
      setGetAccounts(accounts.accounts || []);
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
        <ActivityIndicator size="large" color={PlatformColor('systemBlue')} />
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
            <Text style={{ fontSize: 17, fontWeight: '600', color: PlatformColor('label'), marginBottom: 4 }}>
              Set Monthly Contribution
            </Text>
            <Text style={{ fontSize: 14, color: PlatformColor('secondaryLabel'), marginBottom: 20 }}>
              Your contribution goes to a weekly pool that helps fellow students
            </Text>

            <View style={{ gap: 8, marginBottom: 20 }}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: PlatformColor('label') }}>Monthly Amount (points)</Text>
              <TextInput
                style={{
                  borderWidth: 0.5,
                  borderColor: PlatformColor('separator'),
                  borderRadius: 10,
                  borderCurve: 'continuous',
                  padding: 12,
                  fontSize: 16,
                  color: PlatformColor('label'),
                  backgroundColor: PlatformColor('secondarySystemGroupedBackground'),
                }}
                value={monthlyAmount}
                onChangeText={setMonthlyAmount}
                keyboardType="numeric"
                placeholder="e.g., 100"
                placeholderTextColor={PlatformColor('placeholderText')}
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
                backgroundColor: PlatformColor('systemBlue'),
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
            <Text style={{ fontSize: 17, fontWeight: '600', color: PlatformColor('label'), marginBottom: 16 }}>
              Your Impact
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 }}>
              <View style={{ alignItems: 'center' }}>
                <Text selectable style={{ fontSize: 32, fontWeight: 'bold', color: PlatformColor('systemBlue'), fontVariant: ['tabular-nums'] }}>
                  {impact.peopleHelped}
                </Text>
                <Text style={{ fontSize: 13, color: PlatformColor('secondaryLabel'), marginTop: 4 }}>People Helped</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text selectable style={{ fontSize: 32, fontWeight: 'bold', color: PlatformColor('systemBlue'), fontVariant: ['tabular-nums'] }}>
                  {monthlyAmount}
                </Text>
                <Text style={{ fontSize: 13, color: PlatformColor('secondaryLabel'), marginTop: 4 }}>Points/Month</Text>
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
                backgroundColor: PlatformColor('tertiarySystemFill'),
                opacity: pressed ? 0.7 : saving ? 0.5 : 1,
              })}
            >
              {saving ? (
                <ActivityIndicator size="small" color={PlatformColor('systemBlue')} />
              ) : (
                <>
                  <SymbolView
                    name={isActive ? 'pause.fill' : 'play.fill'}
                    tintColor={PlatformColor('systemBlue')}
                    size={14}
                  />
                  <Text style={{ color: PlatformColor('systemBlue'), fontSize: 16, fontWeight: '600' }}>
                    {isActive ? 'Pause' : 'Resume'} Sharing
                  </Text>
                </>
              )}
            </Pressable>
          </Card>
        )}

        {/* GET Account Balance Card */}
        <Card>
          <Text style={{ fontSize: 17, fontWeight: '600', color: PlatformColor('label'), marginBottom: 12 }}>
            Available GET Balance
          </Text>

          {isGetLinked ? (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <SymbolView name="checkmark.circle.fill" tintColor={PlatformColor('systemGreen')} size={16} />
                <Text style={{ fontSize: 14, color: PlatformColor('systemGreen') }}>
                  Linked{getLinkedAt ? ` on ${new Date(getLinkedAt).toLocaleDateString()}` : ''}
                </Text>
              </View>

              <View style={{
                backgroundColor: PlatformColor('tertiarySystemFill'),
                borderRadius: 12,
                padding: 14,
                borderCurve: 'continuous',
              }}>
                <Text style={{ fontSize: 12, color: PlatformColor('secondaryLabel'), marginBottom: 4 }}>
                  Total Available (Flexi + Banana + Slug)
                </Text>
                <Text style={{ fontSize: 28, color: PlatformColor('systemBlue'), fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                  {totalAvailableBalance.toFixed(2)} pts
                </Text>
              </View>

              <Text style={{ fontSize: 13, color: PlatformColor('secondaryLabel') }}>Tracked accounts</Text>
              {ucscTrackedAccounts.length > 0 ? (
                <View style={{ gap: 0 }}>
                  {ucscTrackedAccounts.map((account) => (
                    <View key={account.id} style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: 8,
                      borderBottomWidth: 0.5,
                      borderBottomColor: PlatformColor('separator'),
                    }}>
                      <Text style={{ fontSize: 15, color: PlatformColor('label'), flex: 1, marginRight: 8 }}>
                        {account.accountDisplayName}
                      </Text>
                      <Text selectable style={{ fontSize: 15, color: PlatformColor('systemBlue'), fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                        {account.balance ?? 'n/a'} pts
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ fontSize: 13, color: PlatformColor('tertiaryLabel') }}>
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
                  backgroundColor: PlatformColor('tertiarySystemFill'),
                  opacity: pressed ? 0.7 : refreshingBalance ? 0.5 : 1,
                })}
              >
                {refreshingBalance ? (
                  <ActivityIndicator size="small" color={PlatformColor('systemBlue')} />
                ) : (
                  <>
                    <SymbolView name="arrow.clockwise" tintColor={PlatformColor('systemBlue')} size={14} />
                    <Text style={{ color: PlatformColor('systemBlue'), fontWeight: '600', fontSize: 15 }}>Refresh Balance</Text>
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
                  backgroundColor: PlatformColor('tertiarySystemFill'),
                  opacity: pressed ? 0.7 : unlinkingGet ? 0.5 : 1,
                })}
              >
                <Text style={{ color: PlatformColor('systemRed'), fontWeight: '600', fontSize: 15 }}>
                  {unlinkingGet ? 'Unlinking...' : 'Unlink GET'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 14, color: PlatformColor('secondaryLabel'), lineHeight: 20 }}>
                Continue to GET and sign in. Once it says 'validated', tap the share icon then copy, and paste the URL below to finish linking.
              </Text>

              <Pressable
                onPress={handleOpenGetLogin}
                disabled={linkingGet}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 12,
                  borderRadius: 10,
                  borderCurve: 'continuous',
                  backgroundColor: PlatformColor('tertiarySystemFill'),
                  opacity: pressed ? 0.7 : linkingGet ? 0.5 : 1,
                })}
              >
                {linkingGet ? (
                  <ActivityIndicator size="small" color={PlatformColor('systemBlue')} />
                ) : (
                  <>
                    <SymbolView name="arrow.up.right" tintColor={PlatformColor('systemBlue')} size={14} />
                    <Text style={{ color: PlatformColor('systemBlue'), fontWeight: '600', fontSize: 15 }}>Open GET Login</Text>
                  </>
                )}
              </Pressable>

              <TextInput
                style={{
                  borderWidth: 0.5,
                  borderColor: PlatformColor('separator'),
                  borderRadius: 10,
                  borderCurve: 'continuous',
                  padding: 12,
                  fontSize: 15,
                  color: PlatformColor('label'),
                  backgroundColor: PlatformColor('secondarySystemGroupedBackground'),
                }}
                value={getLoginUrlInput}
                onChangeText={setGetLoginUrlInput}
                placeholder="Paste validated GET URL here"
                placeholderTextColor={PlatformColor('placeholderText')}
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
                  backgroundColor: PlatformColor('systemBlue'),
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
          <Text style={{ color: PlatformColor('systemRed'), fontSize: 15 }}>
            {isSigningOut ? 'Signing out...' : 'Log out'}
          </Text>
        </Pressable>
      </ScrollView>
  );
}
