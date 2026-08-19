import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { PDF417Barcode } from '../components/PDF417Barcode';
import { supabase } from '@/lib/supabase';
import {
  checkRedemption,
  generateClaimCode,
  refreshClaimCode,
  type CheckoutRail,
  type ClaimGenerationFailureReason,
} from '@/lib/api';
import { campusFonts, monoFontFamily, stealthTheme, typeScale } from '../lib/stealth-theme';

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

const BARCODE_STALE_AFTER_MS = 15_000;
const FLEXI_ACCOUNT_NAME = 'flexi dollars';
const POINTS_OR_BUCKS_ACCOUNT_NAMES = new Set(['banana bucks', 'slug points']);
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

function formatDisplayName(email: string | null, fullName?: string | null) {
  if (fullName?.trim()) return fullName;
  if (!email) return 'SlugSwap User';

  return email
    .split('@')[0]
    .split(/[._-]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export default function ScanCardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [displayName, setDisplayName] = useState('Loading...');
  const [currentCode, setCurrentCode] = useState<ClaimCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [refreshingCode, setRefreshingCode] = useState(false);
  const [redemptionMessage, setRedemptionMessage] = useState<string | null>(null);
  const [lastCodeRefreshAt, setLastCodeRefreshAt] = useState<number | null>(null);
  const [barcodeRefreshError, setBarcodeRefreshError] = useState<string | null>(null);
  const activeClaimIdRef = useRef<string | null>(null);
  const claimLifecycleIdRef = useRef(0);
  const finalRedemptionClaimIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const refreshingCodeRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    void loadAndGenerateCode();

    return () => {
      mountedRef.current = false;
      claimLifecycleIdRef.current += 1;
      activeClaimIdRef.current = null;
      refreshingCodeRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!currentCode) return;

    const claimId = currentCode.id;
    const lifecycleId = claimLifecycleIdRef.current;
    let expiryHandled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const handleExpiry = async () => {
      if (
        expiryHandled ||
        finalRedemptionClaimIdRef.current === claimId ||
        activeClaimIdRef.current !== claimId ||
        claimLifecycleIdRef.current !== lifecycleId
      ) {
        return;
      }

      expiryHandled = true;
      finalRedemptionClaimIdRef.current = claimId;
      if (interval) clearInterval(interval);

      const expiryLifecycleId = claimLifecycleIdRef.current + 1;
      claimLifecycleIdRef.current = expiryLifecycleId;
      activeClaimIdRef.current = null;
      setCurrentCode((existing) => (existing?.id === claimId ? null : existing));
      setTimeRemaining('');
      setLastCodeRefreshAt(null);
      setBarcodeRefreshError(null);
      setMessage('Checking final redemption status...');

      try {
        const result = await checkRedemption(claimId);
        if (!mountedRef.current || claimLifecycleIdRef.current !== expiryLifecycleId) return;

        if (result.redeemed) {
          setMessage(null);
          setRedemptionMessage('Redeemed successfully');
        } else {
          setMessage('This code expired. Close and tap Scan Card again for a new one.');
        }
      } catch (error) {
        if (!mountedRef.current || claimLifecycleIdRef.current !== expiryLifecycleId) return;
        console.warn('Final redemption check failed:', error);
        setMessage('This code expired. Close and tap Scan Card again for a new one.');
      }
    };

    const updateCountdown = () => {
      const expiresAtMs = new Date(currentCode.expiresAt).getTime();
      const diff = expiresAtMs - Date.now();

      if (!Number.isFinite(expiresAtMs) || diff <= 0) {
        void handleExpiry();
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    interval = setInterval(updateCountdown, 1000);
    updateCountdown();

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentCode]);

  useEffect(() => {
    if (!currentCode) return;

    const claimId = currentCode.id;
    const lifecycleId = claimLifecycleIdRef.current;
    let effectActive = true;

    const interval = setInterval(async () => {
      if (refreshingCodeRef.current) return;

      refreshingCodeRef.current = true;
      setRefreshingCode(true);

      try {
        const redemption = await checkRedemption(claimId);
        if (
          !effectActive ||
          !mountedRef.current ||
          activeClaimIdRef.current !== claimId ||
          claimLifecycleIdRef.current !== lifecycleId
        ) {
          return;
        }

        if (redemption.redeemed) {
          claimLifecycleIdRef.current += 1;
          activeClaimIdRef.current = null;
          setCurrentCode(null);
          setTimeRemaining('');
          setLastCodeRefreshAt(null);
          setBarcodeRefreshError(null);
          setMessage(null);
          setRedemptionMessage('Redeemed successfully');
          return;
        }

        const result = await refreshClaimCode(claimId);
        if (
          !effectActive ||
          !mountedRef.current ||
          activeClaimIdRef.current !== claimId ||
          claimLifecycleIdRef.current !== lifecycleId
        ) {
          return;
        }

        if (result.claimCode.status === 'redeemed') {
          claimLifecycleIdRef.current += 1;
          activeClaimIdRef.current = null;
          setCurrentCode(null);
          setTimeRemaining('');
          setLastCodeRefreshAt(null);
          setMessage(null);
          setRedemptionMessage('Redeemed successfully');
          return;
        }

        const refreshedExpiryMs = new Date(result.claimCode.expiresAt).getTime();
        if (!Number.isFinite(refreshedExpiryMs) || refreshedExpiryMs <= Date.now()) {
          claimLifecycleIdRef.current += 1;
          activeClaimIdRef.current = null;
          setCurrentCode(null);
          setTimeRemaining('');
          setLastCodeRefreshAt(null);
          setBarcodeRefreshError(null);
          setMessage('This code expired. Close and tap Scan Card again for a new one.');
          return;
        }

        setCurrentCode({
          ...result.claimCode,
          recommendedRail:
            result.claimCode.recommendedRail ?? currentCode.recommendedRail ?? 'points-or-bucks',
          donorDisplayName: result.claimCode.donorDisplayName ?? currentCode.donorDisplayName ?? null,
        });
        setLastCodeRefreshAt(Date.now());
        setBarcodeRefreshError(null);
      } catch (error: any) {
        if (
          !effectActive ||
          !mountedRef.current ||
          activeClaimIdRef.current !== claimId ||
          claimLifecycleIdRef.current !== lifecycleId
        ) {
          return;
        }

        const errorMessage = error?.message || 'Failed to refresh claim code';
        console.warn('Claim code refresh failed:', errorMessage);
        setBarcodeRefreshError(errorMessage);

        if (
          typeof errorMessage === 'string' &&
          (errorMessage.includes('expired') || errorMessage.includes('not active'))
        ) {
          claimLifecycleIdRef.current += 1;
          activeClaimIdRef.current = null;
          setCurrentCode(null);
          setTimeRemaining('');
          setLastCodeRefreshAt(null);
          setMessage('This code expired. Close and tap Scan Card again for a new one.');
        }
      } finally {
        refreshingCodeRef.current = false;
        if (effectActive && mountedRef.current) {
          setRefreshingCode(false);
        }
      }
    }, 5000);

    return () => {
      effectActive = false;
      clearInterval(interval);
    };
  }, [currentCode]);

  async function loadAndGenerateCode() {
    const lifecycleId = claimLifecycleIdRef.current + 1;
    claimLifecycleIdRef.current = lifecycleId;
    activeClaimIdRef.current = null;
    finalRedemptionClaimIdRef.current = null;
    setLoading(true);
    setMessage(null);
    setRedemptionMessage(null);
    setBarcodeRefreshError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mountedRef.current || claimLifecycleIdRef.current !== lifecycleId) return;
      if (!user) {
        Alert.alert('Error', 'Please sign in first');
        return;
      }

      setDisplayName(
        formatDisplayName(
          user.email ?? null,
          typeof user.user_metadata?.full_name === 'string'
            ? user.user_metadata.full_name
            : null
        )
      );

      const result = await generateClaimCode();
      if (!mountedRef.current || claimLifecycleIdRef.current !== lifecycleId) return;

      activeClaimIdRef.current = result.claimCode.id;
      setCurrentCode({
        ...result.claimCode,
        recommendedRail: result.claimCode.recommendedRail ?? 'points-or-bucks',
        donorDisplayName: result.claimCode.donorDisplayName ?? null,
      });
      setLastCodeRefreshAt(Date.now());
    } catch (error: any) {
      if (!mountedRef.current || claimLifecycleIdRef.current !== lifecycleId) return;
      const reason = getClaimFailureReason(error);
      if (reason === 'pool_exhausted') {
        setMessage('The shared donor pool is empty right now. Check back later.');
      } else {
        console.error('Error generating scan card:', error);
        setMessage(error?.message || 'Unable to generate a scan card right now.');
      }
    } finally {
      if (mountedRef.current && claimLifecycleIdRef.current === lifecycleId) {
        setLoading(false);
      }
    }
  }

  const activeRail = currentCode?.recommendedRail ?? inferCheckoutRail(undefined);
  const checkoutLabel =
    activeRail === 'flexi-dollars' ? 'Flexi Dollars' : 'Slug Points / Banana Bucks';
  const codeRefreshAgeMs = lastCodeRefreshAt === null ? null : Date.now() - lastCodeRefreshAt;
  const isBarcodeStale =
    !!currentCode &&
    (barcodeRefreshError !== null || codeRefreshAgeMs === null || codeRefreshAgeMs > BARCODE_STALE_AFTER_MS);
  const claimAmountLabel = currentCode
    ? `${Number.isInteger(currentCode.amount) ? currentCode.amount : currentCode.amount.toFixed(2)} points`
    : null;
  const claimHeading = loading
    ? 'Preparing claim'
    : currentCode
      ? claimAmountLabel
      : redemptionMessage
        ? 'Claim complete'
        : 'Claim unavailable';
  const claimEyebrow = loading
    ? 'Getting things ready'
    : currentCode
      ? 'Your meal is ready'
      : redemptionMessage
        ? 'All set'
        : 'Try again in a moment';
  const claimInstructions = loading
    ? 'Creating a secure, short-lived checkout code.'
    : currentCode
      ? 'Show this barcode at checkout.'
      : redemptionMessage
        ? redemptionMessage
        : 'We could not create a checkout code just yet.';

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityLabel="Close meal claim"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)/home');
          }}
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="close" color={colors.text} size={20} />
          <Text style={styles.backLabel}>Close</Text>
        </Pressable>
        <Text style={styles.topBarTitle}>Meal claim</Text>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="never"
      >
        <Text style={styles.eyebrow}>{claimEyebrow}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.amount}>{claimHeading}</Text>
        <Text style={styles.instructions}>{claimInstructions}</Text>

        <View style={styles.barcodeCard}>
          <View style={styles.barcodeDock}>
            {loading ? (
              <View style={styles.barcodePlaceholder}>
                <ActivityIndicator size="large" color={colors.brand} />
              </View>
            ) : currentCode ? (
              <PDF417Barcode value={currentCode.code} width={300} height={100} />
            ) : (
              <View style={styles.barcodePlaceholder}>
                <Text accessibilityLiveRegion="polite" style={styles.placeholderText}>
                  {message ?? redemptionMessage ?? 'No active scan card'}
                </Text>
              </View>
            )}
          </View>
          {currentCode ? <Text style={styles.codeLabel}>{currentCode.code}</Text> : null}
        </View>

        {!loading && !currentCode && message ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try generating a meal claim again"
            onPress={() => void loadAndGenerateCode()}
            style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
          >
            <Ionicons name="refresh" size={18} color={colors.softWhite} />
            <Text style={styles.retryButtonLabel}>Try again</Text>
          </Pressable>
        ) : null}

        {currentCode ? (
          <>
            <View style={styles.railCard}>
              <View style={styles.railIcon}>
                <Ionicons name="card-outline" size={22} color={colors.ink} />
              </View>
              <View style={styles.railCopy}>
                <Text style={styles.railLabel}>At checkout, choose</Text>
                <Text style={styles.railValue}>{checkoutLabel}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={24} color={colors.gold} />
            </View>

            <View style={styles.countdownCard}>
              <View>
                <Text style={styles.countdownLabel}>Expires in</Text>
                <Text style={styles.countdownValue}>
                  {timeRemaining || '0:00'}{refreshingCode ? ' · refreshing' : ''}
                </Text>
              </View>
              <Ionicons name="time-outline" size={26} color={colors.brand} />
            </View>

            <View style={styles.donorNote}>
              <Ionicons name="heart" size={18} color={colors.coral} />
              <Text style={styles.donorText}>
                {currentCode.donorDisplayName
                  ? `Courtesy of ${currentCode.donorDisplayName}`
                  : `Courtesy of a SlugSwap donor for ${displayName}`}
              </Text>
            </View>
            {isBarcodeStale ? (
              <Text accessibilityLiveRegion="polite" style={styles.refreshWarning}>
                Scan code refresh delayed. Check your connection before scanning.
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const colors = stealthTheme.colors;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  topBar: {
    backgroundColor: colors.canvas,
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backButton: {
    minWidth: 76,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  backLabel: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: campusFonts.sansMedium,
  },
  topBarTitle: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 24,
    fontFamily: campusFonts.sansSemibold,
  },
  topBarSpacer: {
    width: 76,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 44,
  },
  eyebrow: {
    color: colors.brand,
    textAlign: 'center',
    fontFamily: campusFonts.sansSemibold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  amount: {
    marginTop: 6,
    textAlign: 'center',
    color: colors.ink,
    fontFamily: campusFonts.serifSemibold,
    fontSize: 48,
    lineHeight: 54,
  },
  instructions: {
    marginTop: 4,
    textAlign: 'center',
    color: colors.textMuted,
    fontFamily: campusFonts.sans,
    fontSize: 15,
    lineHeight: 21,
  },
  barcodeCard: {
    marginTop: 28,
    padding: 14,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  retryButton: {
    minHeight: 52,
    marginTop: 16,
    borderRadius: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.brand,
  },
  retryButtonPressed: {
    opacity: 0.82,
  },
  retryButtonLabel: {
    color: colors.softWhite,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: campusFonts.sansSemibold,
  },
  barcodeDock: {
    minHeight: 138,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 14,
  },
  barcodePlaceholder: {
    minHeight: 110,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  placeholderText: {
    ...typeScale.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  codeLabel: {
    marginTop: 10,
    color: colors.textSoft,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 1.2,
    fontFamily: monoFontFamily,
  },
  railCard: {
    marginTop: 16,
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: colors.brand,
  },
  railIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: colors.gold,
  },
  railCopy: {
    flex: 1,
    gap: 1,
  },
  railLabel: {
    color: 'rgba(255,253,247,0.72)',
    fontFamily: campusFonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  railValue: {
    color: colors.softWhite,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 16,
    lineHeight: 21,
  },
  countdownCard: {
    marginTop: 12,
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  countdownLabel: {
    color: colors.textMuted,
    fontFamily: campusFonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  countdownValue: {
    color: colors.ink,
    fontFamily: campusFonts.serifSemibold,
    fontSize: 30,
    lineHeight: 34,
  },
  donorNote: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  donorText: {
    flexShrink: 1,
    color: colors.textMuted,
    textAlign: 'center',
    fontFamily: campusFonts.sansMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  refreshWarning: {
    ...typeScale.caption,
    color: colors.danger,
    marginTop: 12,
    textAlign: 'center',
  },
});
