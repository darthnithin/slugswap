import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { PDF417Barcode } from '../../../components/PDF417Barcode';
import { supabase } from '../../../../../lib/supabase';
import {
  checkRedemption,
  generateClaimCode,
  getClaimHistory,
  getRequesterAllowance,
  refreshClaimCode,
  type CheckoutRail,
  type ClaimGenerationFailureReason,
} from '../../../../../lib/api';
import { useTabCache } from '../../../../../lib/tab-cache-context';
import { buttonOpacity, cardShadow, monoFontFamily, stealthTheme, typeScale } from '../../../lib/stealth-theme';

interface ClaimCode {
  id: string;
  code: string;
  amount: number;
  expiresAt: string;
  status?: string;
  redemptionAmount?: number;
  redemptionAccount?: string;
  recommendedRail?: CheckoutRail;
  donorDisplayName?: string | null;
}

const FLEXI_ACCOUNT_NAME = 'flexi dollars';
const POINTS_OR_BUCKS_ACCOUNT_NAMES = new Set(['banana bucks', 'slug points']);
const DEFAULT_CLAIM_AMOUNT = 10;
const POOL_EXHAUSTED_TITLE = "We're all out of points right now";
const POOL_EXHAUSTED_MESSAGE =
  'Your personal allowance is still there, but the shared pool is empty. Check back later.';
const LEGACY_POOL_EXHAUSTED_MESSAGES = [
  'No eligible donors available under weekly cap limits.',
  'No eligible donors available.',
];

function getClaimFailureReason(error: unknown): ClaimGenerationFailureReason | null {
  if (!error || typeof error !== 'object') return null;

  if ('reason' in error) {
    const reason = (error as { reason?: unknown }).reason;
    if (typeof reason === 'string') {
      return reason as ClaimGenerationFailureReason;
    }
  }

  const message = 'message' in error ? (error as { message?: unknown }).message : undefined;
  if (
    typeof message === 'string' &&
    LEGACY_POOL_EXHAUSTED_MESSAGES.some((legacyMessage) => message.includes(legacyMessage))
  ) {
    return 'pool_exhausted';
  }

  return null;
}

function inferCheckoutRail(accountName?: string): CheckoutRail | null {
  if (!accountName) return null;
  const normalized = accountName.trim().toLowerCase();
  if (normalized === FLEXI_ACCOUNT_NAME) return 'flexi-dollars';
  if (POINTS_OR_BUCKS_ACCOUNT_NAMES.has(normalized)) return 'points-or-bucks';
  return null;
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
      <View style={styles.sectionIcon}>
        <SymbolView name={icon} tintColor={colors.textSoft} size={18} />
      </View>
      <View style={styles.sectionHeaderText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

function PrimaryAction({
  label,
  onPress,
  disabled = false,
  loading = false,
  icon,
  subtle = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: SymbolViewProps['name'];
  subtle?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        subtle ? styles.subtleButton : styles.primaryButton,
        { opacity: buttonOpacity(pressed, disabled || loading) },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={subtle ? colors.brand : '#fff'} />
      ) : (
        <>
          {icon ? <SymbolView name={icon} tintColor={subtle ? colors.brand : '#fff'} size={16} /> : null}
          <Text style={subtle ? styles.subtleButtonLabel : styles.primaryButtonLabel}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

function HistoryStatus({ status }: { status: string }) {
  const redeemed = status === 'redeemed';

  return (
    <View style={styles.statusPill}>
      <SymbolView
        name={redeemed ? 'checkmark.circle.fill' : 'xmark.circle.fill'}
        tintColor={redeemed ? colors.success : colors.danger}
        size={14}
      />
      <Text style={[styles.statusText, redeemed ? styles.positiveText : styles.negativeText]}>
        {status.toUpperCase()}
      </Text>
    </View>
  );
}

export default function RequesterScreen() {
  const { hasLoadedRequest, markRequestLoaded } = useTabCache();
  const router = useRouter();
  const params = useLocalSearchParams<{ autoGenerate?: string }>();

  const [weeklyAllowance, setWeeklyAllowance] = useState(0);
  const [remainingAllowance, setRemainingAllowance] = useState(0);
  const [daysUntilReset, setDaysUntilReset] = useState(0);
  const [currentCode, setCurrentCode] = useState<ClaimCode | null>(null);
  const [claimHistory, setClaimHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(!hasLoadedRequest);
  const [generating, setGenerating] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [refreshingCode, setRefreshingCode] = useState(false);
  const refreshingCodeRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [redemptionInfo, setRedemptionInfo] = useState<{
    amount: number;
    accountName?: string;
  } | null>(null);
  const [poolExhaustedMessage, setPoolExhaustedMessage] = useState<string | null>(null);

  const redeemedRail = inferCheckoutRail(redemptionInfo?.accountName);
  const activeCheckoutRail: CheckoutRail = currentCode?.recommendedRail ?? 'points-or-bucks';
  const checkoutInstruction =
    activeCheckoutRail === 'flexi-dollars' ? 'Use Flexi Dollars' : 'Use Points or Bucks';
  const checkoutDetail =
    activeCheckoutRail === 'flexi-dollars'
      ? 'This claim is currently pulling from the donor Flexi balance.'
      : 'This claim is currently pulling from donor Slug Points or Banana Bucks.';
  const donorCourtesyLabel = currentCode?.donorDisplayName
    ? `Courtesy of ${currentCode.donorDisplayName}`
    : 'Courtesy of a SlugSwap donor';

  useEffect(() => {
    if (hasLoadedRequest) return;
    void loadUserAndAllowance();
  }, [hasLoadedRequest]);

  useEffect(() => {
    if (params.autoGenerate !== '1') return;
    if (loading || generating || !userId || currentCode) return;

    void handleGenerateCode().finally(() => {
      router.replace('/(tabs)/(request)');
    });
  }, [currentCode, generating, loading, params.autoGenerate, router, userId]);

  useEffect(() => {
    if (!currentCode) return;

    const interval = setInterval(async () => {
      const now = new Date();
      const expiresAt = new Date(currentCode.expiresAt);
      const diff = expiresAt.getTime() - now.getTime();

      if (diff <= 0) {
        if (userId) {
          try {
            const result = await checkRedemption(currentCode.id);
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
        void loadUserAndAllowance();
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [currentCode, userId]);

  useEffect(() => {
    if (!currentCode || !userId) return;

    const interval = setInterval(async () => {
      if (refreshingCodeRef.current) return;

      refreshingCodeRef.current = true;
      setRefreshingCode(true);

      try {
        const result = await refreshClaimCode(currentCode.id);
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
          recommendedRail:
            result.claimCode.recommendedRail ?? currentCode.recommendedRail ?? 'points-or-bucks',
          donorDisplayName: result.claimCode.donorDisplayName ?? currentCode.donorDisplayName ?? null,
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
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert('Error', 'Please sign in first');
        return;
      }

      setUserId(user.id);

      const allowanceData = await getRequesterAllowance(user.id);
      setWeeklyAllowance(allowanceData.weeklyLimit);
      setRemainingAllowance(allowanceData.remainingAmount);
      setDaysUntilReset(allowanceData.daysUntilReset);
      if (allowanceData.remainingAmount < DEFAULT_CLAIM_AMOUNT) {
        setPoolExhaustedMessage(null);
      }

      const historyData = await getClaimHistory();
      setClaimHistory(historyData.claims);
    } catch (error) {
      console.error('Error loading allowance:', error);
      Alert.alert('Error', 'Failed to load your allowance data');
    } finally {
      setLoading(false);
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

    if (remainingAllowance < DEFAULT_CLAIM_AMOUNT) {
      setPoolExhaustedMessage(null);
      Alert.alert('Insufficient Allowance', `You need at least ${DEFAULT_CLAIM_AMOUNT} points remaining`);
      return;
    }

    setGenerating(true);
    try {
      const result = await generateClaimCode(DEFAULT_CLAIM_AMOUNT);
      setPoolExhaustedMessage(null);
      setCurrentCode({
        ...result.claimCode,
        recommendedRail: result.claimCode.recommendedRail ?? 'points-or-bucks',
        donorDisplayName: result.claimCode.donorDisplayName ?? null,
      });
      await loadUserAndAllowance();
    } catch (error: any) {
      const reason = getClaimFailureReason(error);
      if (reason === 'pool_exhausted') {
        console.log('Claim generation blocked: shared pool exhausted.');
        setPoolExhaustedMessage(POOL_EXHAUSTED_MESSAGE);
        return;
      }

      console.error('Error generating code:', error);
      setPoolExhaustedMessage(null);
      Alert.alert('Error', error.message || 'Failed to generate claim code');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
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
        <View style={styles.passBand} />

        <View style={styles.passInner}>
          <View style={styles.passPortrait}>
            <SymbolView name="person.crop.circle.badge.questionmark" tintColor="rgba(255,255,255,0.85)" size={120} />
          </View>
          <View style={styles.passNameBand}>
            <Text style={styles.passName}>{currentCode ? 'Scan Card' : 'Requester Pass'}</Text>
          </View>

          {currentCode ? (
            <>
              <View style={styles.barcodeWrap}>
                <PDF417Barcode value={currentCode.code} width={280} height={100} />
              </View>
              <Text selectable style={styles.codeText}>
                {currentCode.code}
              </Text>
              <View style={styles.inlineHeroMeta}>
                <View style={styles.inlineHeroPill}>
                  <SymbolView name="checkmark.circle.fill" tintColor="#fff" size={13} />
                  <Text style={styles.inlineHeroPillLabel}>{checkoutInstruction}</Text>
                </View>
                <Text style={styles.heroHint}>{donorCourtesyLabel}</Text>
                <Text style={styles.heroHint}>{checkoutDetail}</Text>
              </View>
              <View style={styles.expirationRow}>
                <SymbolView name="clock.badge.exclamationmark" tintColor="#fff" size={14} />
                <Text style={styles.expirationText}>Expires in {timeRemaining}</Text>
              </View>
              <Text style={styles.refreshText}>Refreshing every 5s{refreshingCode ? ' ...' : ''}</Text>
            </>
          ) : (
            <View style={styles.heroSummary}>
              <Text style={styles.heroMetric}>{remainingAllowance}</Text>
              <Text style={styles.heroMetricLabel}>points remaining this week</Text>
              <Text style={styles.heroHint}>Every claim generates a short-lived scan code.</Text>

              {poolExhaustedMessage && remainingAllowance >= DEFAULT_CLAIM_AMOUNT ? (
                <View style={styles.poolNote}>
                  <SymbolView name="exclamationmark.circle.fill" tintColor="#fff" size={16} />
                  <Text style={styles.poolNoteText}>{POOL_EXHAUSTED_MESSAGE}</Text>
                </View>
              ) : null}

              <PrimaryAction
                label={poolExhaustedMessage ? 'Try Again' : 'Generate Claim Code'}
                onPress={() => {
                  void handleGenerateCode();
                }}
                loading={generating}
                disabled={remainingAllowance === 0}
                icon="qrcode"
                subtle
              />
            </View>
          )}
        </View>
      </View>

      <SectionCard>
        <SectionHeader
          icon="banknote"
          title="Allowance"
          detail="Your weekly requester balance and reset timing"
        />

        <View style={styles.allowanceRow}>
          <View>
            <Text style={styles.allowanceValue}>{remainingAllowance}</Text>
            <Text style={styles.allowanceLabel}>points remaining</Text>
          </View>
          <View style={styles.allowanceRight}>
            <Text style={styles.allowanceContext}>of {weeklyAllowance}</Text>
            <Text style={styles.allowanceReset}>
              Resets in {daysUntilReset} {daysUntilReset === 1 ? 'day' : 'days'}
            </Text>
          </View>
        </View>

        {redemptionInfo ? (
          <View style={styles.redeemedCard}>
            <View style={styles.redeemedHeader}>
              <SymbolView name="checkmark.circle.fill" tintColor={colors.success} size={28} />
              <Text style={styles.redeemedTitle}>Redeemed</Text>
            </View>
            <Text style={styles.redeemedAmount}>{redemptionInfo.amount} points used</Text>
            {redemptionInfo.accountName ? (
              <Text style={styles.redeemedMeta}>from {redemptionInfo.accountName}</Text>
            ) : null}
            {redeemedRail ? (
              <Text style={styles.redeemedMeta}>
                Cashier selection: {redeemedRail === 'flexi-dollars' ? 'Flexi Dollars' : 'Points or Bucks'}
              </Text>
            ) : null}
            <PrimaryAction
              label="Done"
              onPress={() => setRedemptionInfo(null)}
              subtle
            />
          </View>
        ) : null}
      </SectionCard>

      <SectionCard>
        <SectionHeader
          icon="clock.arrow.circlepath"
          title="Recent Claims"
          detail="Your latest scan attempts and outcomes"
        />

        {claimHistory.length === 0 ? (
          <View style={styles.emptyState}>
            <SymbolView name="tray" tintColor={colors.textSoft} size={30} />
            <Text style={styles.emptyStateTitle}>No claims yet</Text>
            <Text style={styles.emptyStateCopy}>When you generate a claim, it will show up here.</Text>
          </View>
        ) : (
          <View style={styles.historyList}>
            {claimHistory.map((claim) => (
              <View key={claim.id} style={styles.historyRow}>
                <View style={styles.historyLeft}>
                  <Text selectable style={styles.historyCode}>
                    {claim.code}
                  </Text>
                  <Text style={styles.historyMeta}>{new Date(claim.createdAt).toLocaleDateString()}</Text>
                </View>
                <View style={styles.historyRight}>
                  <HistoryStatus status={claim.status} />
                  <Text style={styles.historyAmount}>{claim.amount} pts</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </SectionCard>
    </ScrollView>
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
    paddingBottom: 36,
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
    left: '40%',
    width: 80,
    height: 80,
    backgroundColor: colors.brandDark,
  },
  passTitle: {
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 18,
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '500',
  },
  passBand: {
    height: 100,
    backgroundColor: colors.brandDark,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.brandDeeper,
  },
  passInner: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 20,
    alignItems: 'center',
  },
  passPortrait: {
    width: '100%',
    minHeight: 300,
    borderRadius: 24,
    backgroundColor: '#d8d8d8',
    marginTop: -84,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  passNameBand: {
    width: '100%',
    backgroundColor: 'rgba(97, 105, 112, 0.6)',
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginTop: -80,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  passName: {
    color: '#ffffff',
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '500',
  },
  barcodeWrap: {
    width: '100%',
    marginTop: 22,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  codeText: {
    marginTop: 14,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 2,
    fontFamily: monoFontFamily,
    fontWeight: '700',
  },
  inlineHeroMeta: {
    marginTop: 14,
    alignItems: 'center',
    gap: 8,
  },
  inlineHeroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.brandDark,
  },
  inlineHeroPillLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  expirationRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  expirationText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  refreshText: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.76)',
    fontSize: 12,
    lineHeight: 16,
  },
  heroSummary: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
    paddingTop: 22,
  },
  heroMetric: {
    color: '#ffffff',
    fontSize: 50,
    lineHeight: 54,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  heroMetricLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    fontWeight: '600',
  },
  heroHint: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.76)',
    fontSize: 13,
    lineHeight: 18,
  },
  poolNote: {
    width: '100%',
    marginTop: 8,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(8, 34, 54, 0.22)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  poolNoteText: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 18,
  },
  sectionCard: {
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 14,
    paddingBottom: 16,
    ...cardShadow(),
  },
  sectionHeader: {
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceStrong,
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
  allowanceRow: {
    paddingHorizontal: 18,
    paddingTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  allowanceValue: {
    color: colors.brand,
    fontSize: 44,
    lineHeight: 48,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  allowanceLabel: {
    marginTop: 2,
    ...typeScale.caption,
    color: colors.textMuted,
  },
  allowanceRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  allowanceContext: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.textSoft,
    fontVariant: ['tabular-nums'],
  },
  allowanceReset: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  redeemedCard: {
    marginHorizontal: 18,
    marginTop: 16,
    borderRadius: 18,
    padding: 16,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  redeemedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  redeemedTitle: {
    color: colors.success,
    fontSize: 18,
    fontWeight: '700',
  },
  redeemedAmount: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  redeemedMeta: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  primaryButton: {
    width: '100%',
    minHeight: 52,
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: colors.brand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  subtleButton: {
    width: '100%',
    minHeight: 52,
    marginTop: 10,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1dbed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  subtleButtonLabel: {
    color: colors.brand,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 28,
    gap: 10,
  },
  emptyStateTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  emptyStateCopy: {
    textAlign: 'center',
    ...typeScale.body,
    color: colors.textMuted,
  },
  historyList: {
    paddingTop: 10,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceStrong,
  },
  historyLeft: {
    flex: 1,
    gap: 4,
  },
  historyCode: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: monoFontFamily,
  },
  historyMeta: {
    ...typeScale.caption,
    color: colors.textSoft,
  },
  historyRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  positiveText: {
    color: colors.success,
  },
  negativeText: {
    color: colors.danger,
  },
  historyAmount: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
