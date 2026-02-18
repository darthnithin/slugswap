import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert, PlatformColor, RefreshControl, Share, TextInput } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../../../../lib/supabase';
import { getRequesterAllowance, generateClaimCode, getClaimHistory, refreshClaimCode, checkRedemption, getReferralInfo, applyReferralCode, matchReferralFingerprint, type CheckoutRail, type ReferralInfo } from '../../../../../lib/api';
import { PDF417Barcode } from '../../../components/PDF417Barcode';
import { useTabCache } from '../../../../../lib/tab-cache-context';

interface ClaimCode {
  id: string;
  code: string;
  amount: number;
  expiresAt: string;
  status?: string;
  redemptionAmount?: number;
  redemptionAccount?: string;
  recommendedRail?: CheckoutRail;
}

const FLEXI_ACCOUNT_NAME = 'flexi dollars';
const POINTS_OR_BUCKS_ACCOUNT_NAMES = new Set(['banana bucks', 'slug points']);

function inferCheckoutRail(accountName?: string): CheckoutRail | null {
  if (!accountName) return null;
  const normalized = accountName.trim().toLowerCase();
  if (normalized === FLEXI_ACCOUNT_NAME) return 'flexi-dollars';
  if (POINTS_OR_BUCKS_ACCOUNT_NAMES.has(normalized)) return 'points-or-bucks';
  return null;
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

export default function RequesterScreen() {
  const { hasLoadedRequest, markRequestLoaded } = useTabCache();
  const [weeklyAllowance, setWeeklyAllowance] = useState(0);
  const [remainingAllowance, setRemainingAllowance] = useState(0);
  const [daysUntilReset, setDaysUntilReset] = useState(0);
  const [currentCode, setCurrentCode] = useState<ClaimCode | null>(null);
  const [claimHistory, setClaimHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(!hasLoadedRequest);
  const [generating, setGenerating] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [refreshingCode, setRefreshingCode] = useState(false);
  const refreshingCodeRef = useRef(false);
  const fingerprintChecked = useRef(false);
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [redemptionInfo, setRedemptionInfo] = useState<{
    amount: number;
    accountName?: string;
  } | null>(null);
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [applyingReferral, setApplyingReferral] = useState(false);
  const redeemedRail = inferCheckoutRail(redemptionInfo?.accountName);
  const activeCheckoutRail: CheckoutRail = currentCode?.recommendedRail ?? 'points-or-bucks';
  const checkoutInstruction =
    activeCheckoutRail === 'flexi-dollars' ? 'Use Flexi Dollars' : 'Using Slugpoints';
  const checkoutDetail =
    activeCheckoutRail === 'flexi-dollars'
      ? 'This claim is currently pulling from the donor Flexi balance.'
      : 'This claim is currently pulling from donor Slug Points / Banana Bucks.';

  useEffect(() => {
    if (hasLoadedRequest) return;
    loadUserAndAllowance();
  }, []);

  useEffect(() => {
    if (currentCode) {
      const interval = setInterval(async () => {
        const now = new Date();
        const expiresAt = new Date(currentCode.expiresAt);
        const diff = expiresAt.getTime() - now.getTime();

        if (diff <= 0) {
          // One final redemption check before marking as expired
          if (userId) {
            try {
              const result = await checkRedemption(userId, currentCode.id);
              if (result.redeemed) {
                setCurrentCode(null);
                setTimeRemaining('');
                setRedemptionInfo({
                  amount: result.amount ?? parseFloat(String(currentCode.amount)),
                  accountName: result.accountName,
                });
                void loadUserAndAllowance();
                return;
              }
            } catch (error) {
              console.warn('Final redemption check failed:', error);
            }
          }
          setCurrentCode(null);
          setTimeRemaining('');
          loadUserAndAllowance();
        } else {
          const minutes = Math.floor(diff / 60000);
          const seconds = Math.floor((diff % 60000) / 1000);
          setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [currentCode]);

  useEffect(() => {
    if (!currentCode || !userId) return;

    const interval = setInterval(async () => {
      if (refreshingCodeRef.current) return;
      refreshingCodeRef.current = true;
      setRefreshingCode(true);
      try {
        const result = await refreshClaimCode(userId, currentCode.id);
        if (result.claimCode.status === 'redeemed') {
          setCurrentCode(null);
          setTimeRemaining('');
          setRedemptionInfo({
            amount: (result.claimCode as any).redemptionAmount ?? result.claimCode.amount,
            accountName: (result.claimCode as any).redemptionAccount,
          });
          void loadUserAndAllowance();
          return;
        }
        setCurrentCode({
          ...result.claimCode,
          recommendedRail: result.claimCode.recommendedRail ?? currentCode.recommendedRail ?? 'points-or-bucks',
        });
      } catch (error: any) {
        const message = error?.message || 'Failed to refresh claim code';
        console.warn('Claim code refresh failed:', message);
        if (typeof message === 'string' && (message.includes('expired') || message.includes('not active'))) {
          setCurrentCode(null);
          setTimeRemaining('');
          void loadUserAndAllowance();
        }
      } finally {
        refreshingCodeRef.current = false;
        setRefreshingCode(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [currentCode, userId]);

  async function loadUserAndAllowance() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'Please sign in first');
        return;
      }

      setUserId(user.id);

      const allowanceData = await getRequesterAllowance(user.id);
      setWeeklyAllowance(allowanceData.weeklyLimit);
      setRemainingAllowance(allowanceData.remainingAmount);
      setDaysUntilReset(allowanceData.daysUntilReset);

      const historyData = await getClaimHistory(user.id);
      setClaimHistory(historyData.claims);

      const referral = await getReferralInfo();
      setReferralInfo(referral);

      if (!referral.hasAppliedReferralCode && !fingerprintChecked.current) {
        fingerprintChecked.current = true;
        try {
          const match = await matchReferralFingerprint();
          if (match.referralCode) {
            setReferralCodeInput(match.referralCode);
          }
        } catch {
          // Best-effort — silently ignore if match fails
        }
      }
    } catch (error) {
      console.error('Error loading allowance:', error);
      Alert.alert('Error', 'Failed to load your allowance data');
    } finally {
      setLoading(false);
      setIsRefreshingData(false);
      markRequestLoaded();
    }
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadUserAndAllowance();
    setRefreshing(false);
  }, []);

  const handleGenerateCode = async () => {
    if (!userId) return;

    const DEFAULT_CLAIM_AMOUNT = 10;

    if (remainingAllowance < DEFAULT_CLAIM_AMOUNT) {
      Alert.alert('Insufficient Allowance', `You need at least ${DEFAULT_CLAIM_AMOUNT} points remaining`);
      return;
    }

    setGenerating(true);
    try {
      const result = await generateClaimCode(userId, DEFAULT_CLAIM_AMOUNT);
      setCurrentCode({
        ...result.claimCode,
        recommendedRail: result.claimCode.recommendedRail ?? 'points-or-bucks',
      });
      await loadUserAndAllowance();
    } catch (error: any) {
      console.error('Error generating code:', error);
      Alert.alert('Error', error.message || 'Failed to generate claim code');
    } finally {
      setGenerating(false);
    }
  };

  const handleShareReferral = async () => {
    if (!referralInfo) return;
    try {
      const apiBase = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
      const referralUrl = `${apiBase}/r/${referralInfo.referralCode}`;
      await Share.share({
        message: `Join SlugSwap and get free dining points! ${referralUrl}`,
        url: referralUrl,
      });
    } catch (error: any) {
      console.warn('Share failed:', error?.message);
    }
  };

  const handleApplyReferral = async () => {
    const code = referralCodeInput.trim().toUpperCase();
    if (!code) {
      Alert.alert('Enter a code', 'Please enter a referral code first.');
      return;
    }
    setApplyingReferral(true);
    try {
      const result = await applyReferralCode(code);
      setReferralCodeInput('');
      Alert.alert('Code Applied!', result.message);
      const updated = await getReferralInfo();
      setReferralInfo(updated);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to apply referral code');
    } finally {
      setApplyingReferral(false);
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
        {/* Weekly Allowance Card */}
        <Card>
          <Text style={{ fontSize: 17, fontWeight: '600', color: PlatformColor('label'), marginBottom: 16 }}>
            Weekly Allowance
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <View>
              <Text selectable style={{ fontSize: 48, fontWeight: 'bold', color: PlatformColor('systemBlue'), fontVariant: ['tabular-nums'] }}>
                {remainingAllowance}
              </Text>
              <Text style={{ fontSize: 14, color: PlatformColor('secondaryLabel') }}>points remaining</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 18, color: PlatformColor('tertiaryLabel'), fontVariant: ['tabular-nums'] }}>
                of {weeklyAllowance}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <SymbolView name="clock" tintColor={PlatformColor('tertiaryLabel')} size={12} />
            <Text style={{ fontSize: 13, color: PlatformColor('tertiaryLabel') }}>
              Resets in {daysUntilReset} {daysUntilReset === 1 ? 'day' : 'days'}
            </Text>
          </View>
        </Card>

        {/* Redemption Success */}
        {redemptionInfo && (
          <Card>
            <View style={{ alignItems: 'center', gap: 12 }}>
              <SymbolView name="checkmark.circle.fill" tintColor={PlatformColor('systemGreen')} size={48} />
              <Text style={{ fontSize: 22, fontWeight: '700', color: PlatformColor('systemGreen') }}>
                Redeemed!
              </Text>
              <Text style={{ fontSize: 17, color: PlatformColor('label'), fontVariant: ['tabular-nums'] }}>
                {redemptionInfo.amount} points used
              </Text>
              {redemptionInfo.accountName && (
                <Text style={{ fontSize: 14, color: PlatformColor('secondaryLabel') }}>
                  from {redemptionInfo.accountName}
                </Text>
              )}
              {redeemedRail && (
                <View style={{
                  marginTop: 4,
                  backgroundColor: PlatformColor('tertiarySystemFill'),
                  borderRadius: 10,
                  borderCurve: 'continuous',
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                }}>
                  <Text style={{ fontSize: 13, color: PlatformColor('label'), fontWeight: '600' }}>
                    Cashier selection: {redeemedRail === 'flexi-dollars' ? 'Flexi Dollars' : 'Points or Bucks'}
                  </Text>
                </View>
              )}
              <Pressable
                onPress={() => setRedemptionInfo(null)}
                style={({ pressed }) => ({
                  marginTop: 8,
                  paddingVertical: 10,
                  paddingHorizontal: 24,
                  borderRadius: 10,
                  borderCurve: 'continuous',
                  backgroundColor: PlatformColor('systemGreen'),
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Done</Text>
              </Pressable>
            </View>
          </Card>
        )}

        {/* Active Code or Generate Button */}
        {!redemptionInfo && currentCode ? (
          <Card>
            <Text style={{ fontSize: 17, fontWeight: '600', color: PlatformColor('label'), marginBottom: 16 }}>
              Your Claim Code
            </Text>
            <View style={{
              backgroundColor: PlatformColor('systemBackground'),
              padding: 16,
              borderRadius: 12,
              borderCurve: 'continuous',
              alignItems: 'center',
              marginBottom: 12,
              borderWidth: 0.5,
              borderColor: PlatformColor('separator'),
            }}>
              <PDF417Barcode value={currentCode.code} width={280} height={100} />
            </View>
            <Text selectable style={{
              fontSize: 14,
              fontWeight: '600',
              letterSpacing: 2,
              color: PlatformColor('secondaryLabel'),
              marginBottom: 12,
              fontFamily: 'Menlo',
            }}>
              {currentCode.code}
            </Text>
            <View style={{
              width: '100%',
              gap: 8,
              marginBottom: 14,
              padding: 14,
              borderRadius: 12,
              borderCurve: 'continuous',
              backgroundColor: PlatformColor('tertiarySystemFill'),
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <SymbolView name="megaphone.fill" tintColor={PlatformColor('systemBlue')} size={14} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: PlatformColor('secondaryLabel') }}>
                  At checkout, say:
                </Text>
              </View>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                gap: 6,
                paddingVertical: 9,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderCurve: 'continuous',
                backgroundColor: PlatformColor('systemBlue'),
              }}>
                <SymbolView name="checkmark.circle.fill" tintColor="#fff" size={13} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                  {checkoutInstruction}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: PlatformColor('secondaryLabel') }}>
                {checkoutDetail}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 12 }}>
              <SymbolView name="clock.badge.exclamationmark" tintColor={PlatformColor('systemRed')} size={14} />
              <Text style={{ fontSize: 14, color: PlatformColor('systemRed'), fontVariant: ['tabular-nums'] }}>
                Expires in {timeRemaining}
              </Text>
            </View>
            <Text style={{ textAlign: 'center', fontSize: 13, color: PlatformColor('secondaryLabel') }}>
              Show this code at the dining hall.
            </Text>
            <Text style={{ marginTop: 8, textAlign: 'center', fontSize: 12, color: PlatformColor('tertiaryLabel') }}>
              Refreshing every 5s{refreshingCode ? ' ...' : ''}
            </Text>
          </Card>
        ) : !redemptionInfo ? (
          <Pressable
            onPress={handleGenerateCode}
            disabled={remainingAllowance === 0 || generating}
            style={({ pressed }) => ({
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
              paddingVertical: 18,
              borderRadius: 14,
              borderCurve: 'continuous',
              backgroundColor: PlatformColor('systemBlue'),
              opacity: pressed ? 0.7 : (remainingAllowance === 0 || generating) ? 0.5 : 1,
            })}
          >
            {generating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <SymbolView name="qrcode" tintColor="#fff" size={20} />
                <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>Generate Claim Code</Text>
              </>
            )}
          </Pressable>
        ) : null}

        {/* Recent Claims */}
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: '600', color: PlatformColor('label') }}>
            Recent Claims
          </Text>
          {claimHistory.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <SymbolView name="tray" tintColor={PlatformColor('tertiaryLabel')} size={32} />
              <Text style={{ color: PlatformColor('tertiaryLabel'), marginTop: 8, fontSize: 15 }}>No claims yet</Text>
            </View>
          ) : (
            claimHistory.map((claim) => (
              <Card key={claim.id} style={{ padding: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text selectable style={{ fontSize: 14, fontWeight: '600', color: PlatformColor('label'), marginBottom: 4, fontFamily: 'Menlo' }}>
                      {claim.code}
                    </Text>
                    <Text style={{ fontSize: 13, color: PlatformColor('tertiaryLabel') }}>
                      {new Date(claim.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <SymbolView
                        name={claim.status === 'redeemed' ? 'checkmark.circle.fill' : 'xmark.circle.fill'}
                        tintColor={claim.status === 'redeemed' ? PlatformColor('systemGreen') : PlatformColor('systemRed')}
                        size={14}
                      />
                      <Text style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: claim.status === 'redeemed' ? PlatformColor('systemGreen') : PlatformColor('systemRed'),
                      }}>
                        {claim.status.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 13, color: PlatformColor('secondaryLabel'), fontVariant: ['tabular-nums'] }}>
                      {claim.amount} pts
                    </Text>
                  </View>
                </View>
              </Card>
            ))
          )}
        </View>

        {/* Referral Card */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <SymbolView name="person.2.fill" tintColor={PlatformColor('systemPurple')} size={18} />
            <Text style={{ fontSize: 17, fontWeight: '600', color: PlatformColor('label') }}>
              Refer Friends
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: PlatformColor('secondaryLabel'), marginBottom: 16 }}>
            {referralInfo
              ? `Earn ${referralInfo.bonusPointsPerReferral} bonus points for every friend who joins.`
              : 'Earn bonus points for every friend who joins.'}
          </Text>

          {referralInfo ? (
            <>
              <Text style={{ fontSize: 12, color: PlatformColor('tertiaryLabel'), marginBottom: 6 }}>
                YOUR CODE
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                <View style={{
                  flex: 1,
                  backgroundColor: PlatformColor('tertiarySystemFill'),
                  borderRadius: 10,
                  borderCurve: 'continuous',
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                }}>
                  <Text selectable style={{
                    fontSize: 20,
                    fontWeight: '700',
                    letterSpacing: 4,
                    color: PlatformColor('systemPurple'),
                    fontFamily: 'Menlo',
                  }}>
                    {referralInfo.referralCode}
                  </Text>
                </View>
                <Pressable
                  onPress={handleShareReferral}
                  style={({ pressed }) => ({
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 10,
                    borderCurve: 'continuous',
                    backgroundColor: PlatformColor('systemPurple'),
                    opacity: pressed ? 0.7 : 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  })}
                >
                  <SymbolView name="square.and.arrow.up" tintColor="#fff" size={14} />
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Share</Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                <SymbolView name="person.badge.plus" tintColor={PlatformColor('secondaryLabel')} size={14} />
                <Text style={{ fontSize: 14, color: PlatformColor('secondaryLabel') }}>
                  {referralInfo.referralCount === 0
                    ? 'No friends referred yet'
                    : `${referralInfo.referralCount} ${referralInfo.referralCount === 1 ? 'friend' : 'friends'} referred · ${referralInfo.referralCount * referralInfo.bonusPointsPerReferral} pts earned`}
                </Text>
              </View>

              {!referralInfo.hasAppliedReferralCode && (
                <>
                  <View style={{ height: 1, backgroundColor: PlatformColor('separator'), marginBottom: 16 }} />
                  <Text style={{ fontSize: 12, color: PlatformColor('tertiaryLabel'), marginBottom: 8 }}>
                    HAVE A CODE? ENTER IT BELOW
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    <TextInput
                      value={referralCodeInput}
                      onChangeText={(t) => setReferralCodeInput(t.toUpperCase())}
                      placeholder="e.g. ABC123"
                      placeholderTextColor={PlatformColor('placeholderText')}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={8}
                      style={{
                        flex: 1,
                        backgroundColor: PlatformColor('tertiarySystemFill'),
                        borderRadius: 10,
                        borderCurve: 'continuous',
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        fontSize: 16,
                        fontWeight: '600',
                        letterSpacing: 2,
                        color: PlatformColor('label'),
                        fontFamily: 'Menlo',
                      }}
                    />
                    <Pressable
                      onPress={handleApplyReferral}
                      disabled={applyingReferral || referralCodeInput.trim().length === 0}
                      style={({ pressed }) => ({
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        borderRadius: 10,
                        borderCurve: 'continuous',
                        backgroundColor: PlatformColor('systemGreen'),
                        opacity: pressed ? 0.7 : (applyingReferral || referralCodeInput.trim().length === 0) ? 0.4 : 1,
                      })}
                    >
                      {applyingReferral ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Apply</Text>
                      )}
                    </Pressable>
                  </View>
                </>
              )}
            </>
          ) : (
            <ActivityIndicator color={PlatformColor('systemPurple')} />
          )}
        </Card>
      </ScrollView>
  );
}
