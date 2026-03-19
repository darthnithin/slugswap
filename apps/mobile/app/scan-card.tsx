import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PDF417Barcode } from '../components/PDF417Barcode';
import { supabase } from '../../../lib/supabase';
import {
  checkRedemption,
  generateClaimCode,
  getRequesterAllowance,
  refreshClaimCode,
  type CheckoutRail,
  type ClaimGenerationFailureReason,
} from '../../../lib/api';
import { cardShadow, monoFontFamily, stealthTheme, typeScale } from '../lib/stealth-theme';

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

const DEFAULT_CLAIM_AMOUNT = 10;
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
  const [userId, setUserId] = useState<string | null>(null);
  const [currentCode, setCurrentCode] = useState<ClaimCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [refreshingCode, setRefreshingCode] = useState(false);
  const [redemptionMessage, setRedemptionMessage] = useState<string | null>(null);
  const refreshingCodeRef = useRef(false);

  useEffect(() => {
    void loadAndGenerateCode();
  }, []);

  useEffect(() => {
    if (!currentCode) return;

    const interval = setInterval(async () => {
      const now = new Date();
      const expiresAt = new Date(currentCode.expiresAt);
      const diff = expiresAt.getTime() - now.getTime();

      if (diff <= 0) {
        if (userId) {
          try {
            const result = await checkRedemption(userId, currentCode.id);
            if (result.redeemed) {
              setCurrentCode(null);
              setTimeRemaining('');
              setRedemptionMessage('Redeemed successfully');
              return;
            }
          } catch (error) {
            console.warn('Final redemption check failed:', error);
          }
        }

        setCurrentCode(null);
        setTimeRemaining('');
        setMessage('This code expired. Close and tap Scan Card again for a new one.');
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
        const result = await refreshClaimCode(userId, currentCode.id);
        if (result.claimCode.status === 'redeemed') {
          setCurrentCode(null);
          setTimeRemaining('');
          setRedemptionMessage('Redeemed successfully');
          return;
        }

        setCurrentCode({
          ...result.claimCode,
          recommendedRail:
            result.claimCode.recommendedRail ?? currentCode.recommendedRail ?? 'points-or-bucks',
          donorDisplayName: result.claimCode.donorDisplayName ?? currentCode.donorDisplayName ?? null,
        });
      } catch (error: any) {
        const errorMessage = error?.message || 'Failed to refresh claim code';
        console.warn('Claim code refresh failed:', errorMessage);

        if (
          typeof errorMessage === 'string' &&
          (errorMessage.includes('expired') || errorMessage.includes('not active'))
        ) {
          setCurrentCode(null);
          setTimeRemaining('');
          setMessage('This code expired. Close and tap Scan Card again for a new one.');
        }
      } finally {
        refreshingCodeRef.current = false;
        setRefreshingCode(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [currentCode, userId]);

  async function loadAndGenerateCode() {
    setLoading(true);
    setMessage(null);
    setRedemptionMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert('Error', 'Please sign in first');
        return;
      }

      setUserId(user.id);
      setDisplayName(
        formatDisplayName(
          user.email ?? null,
          typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null
        )
      );

      const allowance = await getRequesterAllowance(user.id);
      if (allowance.remainingAmount < DEFAULT_CLAIM_AMOUNT) {
        setMessage(`You need at least ${DEFAULT_CLAIM_AMOUNT} points remaining to generate a code.`);
        return;
      }

      const result = await generateClaimCode(user.id, DEFAULT_CLAIM_AMOUNT);
      setCurrentCode({
        ...result.claimCode,
        recommendedRail: result.claimCode.recommendedRail ?? 'points-or-bucks',
        donorDisplayName: result.claimCode.donorDisplayName ?? null,
      });
    } catch (error: any) {
      const reason = getClaimFailureReason(error);
      if (reason === 'pool_exhausted') {
        setMessage('The shared donor pool is empty right now. Check back later.');
      } else {
        console.error('Error generating scan card:', error);
        setMessage(error?.message || 'Unable to generate a scan card right now.');
      }
    } finally {
      setLoading(false);
    }
  }

  const activeRail = currentCode?.recommendedRail ?? inferCheckoutRail(undefined);
  const checkoutLabel =
    activeRail === 'flexi-dollars' ? 'Flexi Dollars' : 'Slug Points / Banana Bucks';

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <SymbolView name="chevron.left" tintColor={colors.text} size={18} />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
        <Text style={styles.topBarTitle}>Scan Card</Text>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="never"
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>UCSC Dining Services</Text>
          <View style={styles.cardNotch} />
          <View style={styles.cardBand} />

          <View style={styles.profilePanel}>
            <SymbolView
              name="person.crop.circle.badge.questionmark"
              tintColor="rgba(255,255,255,0.92)"
              size={118}
            />
            <View style={styles.profileNameBar}>
              <Text style={styles.profileName}>{displayName}</Text>
            </View>
          </View>

          <View style={styles.barcodeDock}>
            {loading ? (
              <View style={styles.barcodePlaceholder}>
                <ActivityIndicator size="large" color={colors.brand} />
              </View>
            ) : currentCode ? (
              <PDF417Barcode value={currentCode.code} width={300} height={100} />
            ) : (
              <View style={styles.barcodePlaceholder}>
                <Text style={styles.placeholderText}>{message ?? redemptionMessage ?? 'No active scan card'}</Text>
              </View>
            )}
          </View>
        </View>

        {currentCode ? (
          <View style={styles.metaPanel}>
            <Text selectable style={styles.codeLabel}>
              {currentCode.code}
            </Text>
            <Text style={styles.metaText}>Using {checkoutLabel}</Text>
            <Text style={styles.metaText}>
              {currentCode.donorDisplayName
                ? `Courtesy of ${currentCode.donorDisplayName}`
                : 'Courtesy of a SlugSwap donor'}
            </Text>
            <Text style={styles.metaText}>
              Expires in {timeRemaining || '0:00'}{refreshingCode ? ' · refreshing' : ''}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const colors = stealthTheme.colors;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#d4d4d4',
  },
  topBar: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    minWidth: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backLabel: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 18,
  },
  topBarTitle: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
  },
  topBarSpacer: {
    width: 68,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 22,
    paddingBottom: 36,
  },
  card: {
    borderRadius: 22,
    backgroundColor: colors.brand,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.brandDark,
    ...cardShadow('hero'),
  },
  cardTitle: {
    paddingTop: 18,
    paddingBottom: 14,
    textAlign: 'center',
    color: '#ffffff',
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '500',
  },
  cardNotch: {
    position: 'absolute',
    top: 58,
    alignSelf: 'center',
    width: 82,
    height: 82,
    backgroundColor: colors.brandDark,
  },
  cardBand: {
    height: 118,
    backgroundColor: colors.brandDark,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.brandDeeper,
  },
  profilePanel: {
    marginHorizontal: 18,
    marginTop: 14,
    height: 360,
    borderRadius: 24,
    backgroundColor: '#d7d7d7',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  profileNameBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(135, 135, 135, 0.78)',
    paddingHorizontal: 22,
    paddingVertical: 16,
  },
  profileName: {
    color: '#ffffff',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '400',
  },
  barcodeDock: {
    marginHorizontal: 22,
    marginTop: 16,
    marginBottom: 20,
    minHeight: 126,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
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
  metaPanel: {
    marginTop: 12,
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  codeLabel: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 1.8,
    fontFamily: monoFontFamily,
    fontWeight: '700',
    marginBottom: 8,
  },
  metaText: {
    ...typeScale.caption,
    color: colors.textMuted,
    marginBottom: 4,
  },
});
