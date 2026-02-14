import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert, PlatformColor, RefreshControl } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../../../../lib/supabase';
import { getRequesterAllowance, generateClaimCode, getClaimHistory, refreshClaimCode } from '../../../../../lib/api';
import { PDF417Barcode } from '../../../components/PDF417Barcode';

interface ClaimCode {
  id: string;
  code: string;
  amount: number;
  expiresAt: string;
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

let hasLoadedOnce = false;

export default function RequesterScreen() {
  const [weeklyAllowance, setWeeklyAllowance] = useState(0);
  const [remainingAllowance, setRemainingAllowance] = useState(0);
  const [daysUntilReset, setDaysUntilReset] = useState(0);
  const [currentCode, setCurrentCode] = useState<ClaimCode | null>(null);
  const [claimHistory, setClaimHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(!hasLoadedOnce);
  const [generating, setGenerating] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [refreshingCode, setRefreshingCode] = useState(false);
  const refreshingCodeRef = useRef(false);
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (hasLoadedOnce) return;
    loadUserAndAllowance();
  }, []);

  useEffect(() => {
    if (currentCode) {
      const interval = setInterval(() => {
        const now = new Date();
        const expiresAt = new Date(currentCode.expiresAt);
        const diff = expiresAt.getTime() - now.getTime();

        if (diff <= 0) {
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
        setCurrentCode(result.claimCode);
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
    } catch (error) {
      console.error('Error loading allowance:', error);
      Alert.alert('Error', 'Failed to load your allowance data');
    } finally {
      setLoading(false);
      setIsRefreshingData(false);
      hasLoadedOnce = true;
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
      setCurrentCode(result.claimCode);
      await loadUserAndAllowance();
    } catch (error: any) {
      console.error('Error generating code:', error);
      Alert.alert('Error', error.message || 'Failed to generate claim code');
    } finally {
      setGenerating(false);
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

        {/* Active Code or Generate Button */}
        {currentCode ? (
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
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 12 }}>
              <SymbolView name="clock.badge.exclamationmark" tintColor={PlatformColor('systemRed')} size={14} />
              <Text style={{ fontSize: 14, color: PlatformColor('systemRed'), fontVariant: ['tabular-nums'] }}>
                Expires in {timeRemaining}
              </Text>
            </View>
            <Text style={{ textAlign: 'center', fontSize: 13, color: PlatformColor('secondaryLabel') }}>
              Show this code at the dining hall to redeem your points
            </Text>
            <Text style={{ marginTop: 8, textAlign: 'center', fontSize: 12, color: PlatformColor('tertiaryLabel') }}>
              Refreshing every 5s{refreshingCode ? ' ...' : ''}
            </Text>
          </Card>
        ) : (
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
        )}

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
      </ScrollView>
  );
}
