import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  CrossPlatformSymbol,
  type CrossPlatformSymbolName,
} from '@/components/cross-platform-symbol';

import { PDF417Barcode } from '@/components/PDF417Barcode';
import {
  getGetBarcode,
  getGetLinkStatus,
  getGetWallet,
} from '@/lib/api';
import { supabase } from '@/lib/supabase';
import {
  buttonOpacity,
  campusFonts,
  cardShadow,
  stealthTheme,
  typeScale,
} from '@/lib/stealth-theme';

type GetAccountBalance = {
  id: string;
  accountDisplayName: string;
  balance: number | null;
};

const BARCODE_REFRESH_MS = 5_000;
const UCSC_TRACKED_BALANCE_ACCOUNTS = new Set(['flexi dollars', 'banana bucks', 'slug points']);

function formatNameFromEmail(email: string | null): string {
  if (!email) return 'SlugSwap User';

  return email
    .split('@')[0]
    .split(/[._-]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatBalance(value: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a';
  return `${value.toFixed(2)} pts`;
}

function SecondaryButton({
  label,
  onPress,
  icon,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  icon: CrossPlatformSymbolName;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.secondaryButton,
        { opacity: buttonOpacity(pressed, loading) },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.brand} />
      ) : (
        <>
          <CrossPlatformSymbol name={icon} tintColor={colors.brand} size={15} />
          <Text style={styles.secondaryButtonLabel}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text selectable style={styles.metricValue}>
        {value}
      </Text>
    </View>
  );
}

export default function WalletScreen() {
  const router = useRouter();
  const barcodeRefreshInFlightRef = useRef(false);
  const barcodeWriteIdRef = useRef(0);
  const skipInitialFocusRefreshRef = useRef(true);
  const walletRefreshInFlightRef = useRef(false);
  const walletRequestIdRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [barcodeRefreshing, setBarcodeRefreshing] = useState(false);
  const [isGetLinked, setIsGetLinked] = useState(false);
  const [linkedAt, setLinkedAt] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('My GET');
  const [accounts, setAccounts] = useState<GetAccountBalance[]>([]);
  const [barcodeCode, setBarcodeCode] = useState<string | null>(null);
  const [barcodeFetchedAt, setBarcodeFetchedAt] = useState<string | null>(null);
  const [barcodeRefreshError, setBarcodeRefreshError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trackedAccounts = useMemo(
    () =>
      accounts.filter((account) =>
        UCSC_TRACKED_BALANCE_ACCOUNTS.has(account.accountDisplayName.trim().toLowerCase())
      ),
    [accounts]
  );

  const totalAvailableBalance = useMemo(() => {
    const numericBalances = trackedAccounts
      .map((account) => account.balance)
      .filter(
        (balance): balance is number =>
          typeof balance === 'number' && !Number.isNaN(balance)
      );

    if (numericBalances.length === 0) return null;
    return numericBalances.reduce((sum, balance) => sum + balance, 0);
  }, [trackedAccounts]);

  const loadBarcode = useCallback(async (options?: { silent?: boolean }) => {
    if (barcodeRefreshInFlightRef.current) return;

    barcodeRefreshInFlightRef.current = true;
    const writeId = barcodeWriteIdRef.current + 1;
    barcodeWriteIdRef.current = writeId;
    if (!options?.silent) setBarcodeRefreshing(true);

    try {
      const barcode = await getGetBarcode();
      if (barcodeWriteIdRef.current !== writeId) return;
      setBarcodeCode(barcode.code);
      setBarcodeFetchedAt(barcode.fetchedAt);
      setBarcodeRefreshError(null);
    } catch (error: any) {
      if (barcodeWriteIdRef.current !== writeId) return;
      const message = error?.message || 'Failed to refresh your GET code';
      setBarcodeRefreshError(message);
      if (!options?.silent) {
        Alert.alert('Refresh Failed', message);
      }
    } finally {
      barcodeRefreshInFlightRef.current = false;
      if (!options?.silent) setBarcodeRefreshing(false);
    }
  }, []);

  const loadWallet = useCallback(async (options?: { showBlockingLoader?: boolean }) => {
    const requestId = walletRequestIdRef.current + 1;
    walletRequestIdRef.current = requestId;
    const barcodeWriteId = barcodeWriteIdRef.current + 1;
    barcodeWriteIdRef.current = barcodeWriteId;
    const showBlockingLoader = options?.showBlockingLoader ?? false;
    if (showBlockingLoader) setLoading(true);
    setErrorMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (walletRequestIdRef.current !== requestId) return;
      if (!user) {
        Alert.alert('Error', 'Please sign in first');
        return;
      }

      const nextDisplayName =
        typeof user.user_metadata?.full_name === 'string'
          ? user.user_metadata.full_name
          : formatNameFromEmail(user.email ?? null);

      const linkState = await getGetLinkStatus();
      if (walletRequestIdRef.current !== requestId) return;

      setDisplayName(nextDisplayName);
      setIsGetLinked(linkState.linked);
      setLinkedAt(linkState.linkedAt);

      if (!linkState.linked) {
        barcodeWriteIdRef.current += 1;
        setAccounts([]);
        setBarcodeCode(null);
        setBarcodeFetchedAt(null);
        setBarcodeRefreshError(null);
        return;
      }

      const wallet = await getGetWallet();
      if (walletRequestIdRef.current !== requestId) return;

      setAccounts(wallet.accounts || []);
      if (barcodeWriteIdRef.current === barcodeWriteId) {
        setBarcodeCode(wallet.barcode.code);
        setBarcodeFetchedAt(wallet.barcode.fetchedAt);
        setBarcodeRefreshError(null);
      }
    } catch (error: any) {
      if (walletRequestIdRef.current !== requestId) return;
      setErrorMessage(error?.message || 'Failed to load your GET wallet');
    } finally {
      if (showBlockingLoader && walletRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadWallet({ showBlockingLoader: true });

    return () => {
      walletRequestIdRef.current += 1;
      barcodeWriteIdRef.current += 1;
    };
  }, [loadWallet]);

  useFocusEffect(
    useCallback(() => {
      if (skipInitialFocusRefreshRef.current) {
        skipInitialFocusRefreshRef.current = false;
        return undefined;
      }

      void loadWallet();
      return undefined;
    }, [loadWallet])
  );

  useFocusEffect(
    useCallback(() => {
      if (!isGetLinked) return undefined;

      const intervalId = setInterval(() => {
        void loadBarcode({ silent: true });
      }, BARCODE_REFRESH_MS);

      return () => clearInterval(intervalId);
    }, [isGetLinked, loadBarcode])
  );

  const refreshWallet = useCallback(async () => {
    if (walletRefreshInFlightRef.current) return;

    walletRefreshInFlightRef.current = true;
    setRefreshing(true);
    try {
      await loadWallet();
    } finally {
      walletRefreshInFlightRef.current = false;
      setRefreshing(false);
    }
  }, [loadWallet]);

  const linkedDateLabel = linkedAt
    ? `Linked ${new Date(linkedAt).toLocaleDateString()}`
    : 'GET linked';
  const barcodeUpdatedLabel = barcodeFetchedAt
    ? `Updated ${new Date(barcodeFetchedAt).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })}`
    : 'Waiting for first refresh';

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshWallet}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
      >
        <View style={styles.passCard}>
          <View style={styles.passHeader}>
            <View style={styles.passIdentity}>
              <Text style={styles.passTitle}>UCSC · GET</Text>
              <Text style={styles.passName}>{displayName}</Text>
            </View>
            <View style={styles.passIcon}>
              <CrossPlatformSymbol
                name={isGetLinked ? 'person.crop.circle.badge.checkmark' : 'wallet.pass'}
                tintColor={colors.gold}
                size={28}
              />
            </View>
          </View>
          <View style={styles.passContent}>
            <View style={styles.barcodeDock}>
              {isGetLinked && barcodeCode ? (
                <PDF417Barcode value={barcodeCode} width={300} height={100} />
              ) : isGetLinked ? (
                <View style={styles.barcodePlaceholder}>
                  <ActivityIndicator color={colors.brand} />
                  <Text style={styles.placeholderText}>Loading scan code</Text>
                </View>
              ) : (
                <View style={styles.barcodePlaceholder}>
                  <CrossPlatformSymbol name="lock" tintColor={colors.textSoft} size={24} />
                  <Text style={styles.placeholderText}>Link GET to show your campus scan code.</Text>
                </View>
              )}
            </View>
            {isGetLinked ? (
              <View style={styles.codeMetaPanel}>
                <View style={styles.codeMetaStatus}>
                  <View style={[styles.liveDot, barcodeRefreshError && styles.warningDot]} />
                  <Text style={styles.codeMeta}>
                    {barcodeRefreshError ? 'Scan code refresh delayed' : `Ready to scan · ${barcodeUpdatedLabel}`}
                  </Text>
                </View>
                {barcodeRefreshError ? (
                  <Text accessibilityLiveRegion="polite" style={styles.codeRefreshWarning}>
                    Check your connection before scanning.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {errorMessage ? (
          <View style={styles.errorBanner}>
            <CrossPlatformSymbol
              name="exclamationmark.triangle"
              tintColor={colors.warning}
              size={18}
            />
            <Text selectable style={styles.errorText}>
              {errorMessage}
            </Text>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}>
              <CrossPlatformSymbol name="creditcard" tintColor={colors.textSoft} size={18} />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>Balance</Text>
              <Text style={styles.sectionDetail}>
                {isGetLinked ? 'Live GET account balances' : 'Connect GET from Point sharing to sync balances'}
              </Text>
            </View>
          </View>

          {isGetLinked ? (
            <>
              <View style={styles.balanceHero}>
                <Text style={styles.balanceHeroLabel}>Total available</Text>
                <Text selectable style={styles.balanceHeroValue}>
                  {totalAvailableBalance === null ? 'n/a' : `${totalAvailableBalance.toFixed(2)} pts`}
                </Text>
                <Text style={styles.balanceHeroMeta}>{linkedDateLabel}</Text>
              </View>

              {trackedAccounts.length > 0 ? (
                <View style={styles.metricGrid}>
                  {trackedAccounts.map((account) => (
                    <MetricTile
                      key={account.id}
                      label={account.accountDisplayName}
                      value={formatBalance(account.balance)}
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyCopy}>
                    GET is linked, but UCSC balance accounts were not returned yet.
                  </Text>
                </View>
              )}

              <View style={styles.buttonRow}>
                <SecondaryButton
                  label="Refresh Balance"
                  icon="arrow.clockwise"
                  onPress={() => {
                    void refreshWallet();
                  }}
                  loading={refreshing}
                />
                <SecondaryButton
                  label="Refresh Code"
                  icon="barcode.viewfinder"
                  onPress={() => {
                    void loadBarcode();
                  }}
                  loading={barcodeRefreshing}
                />
              </View>
            </>
          ) : (
            <View style={styles.connectBlock}>
              <Text style={styles.connectCopy}>
                Link your GET account from Point sharing, then come back here to see your balance and scan your own code.
              </Text>
              <Pressable
                onPress={() => router.push('/point-sharing')}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { opacity: buttonOpacity(pressed) },
                ]}
              >
                <CrossPlatformSymbol name="arrow.up.right" tintColor="#ffffff" size={16} />
                <Text style={styles.primaryButtonLabel}>Open Point sharing</Text>
              </Pressable>
            </View>
          )}
        </View>
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
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
  content: {
    gap: 18,
    padding: 18,
    paddingBottom: 36,
  },
  passCard: {
    borderRadius: 22,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brandDark,
    ...cardShadow('hero'),
  },
  passHeader: {
    minHeight: 94,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  passIdentity: { flex: 1, gap: 3 },
  passTitle: {
    color: 'rgba(255,253,247,0.7)',
    fontFamily: campusFonts.sansSemibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.7,
  },
  passIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,253,247,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,253,247,0.16)',
  },
  passContent: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 20,
    gap: 10,
  },
  passName: {
    color: colors.softWhite,
    fontFamily: campusFonts.serifSemibold,
    fontSize: 28,
    lineHeight: 31,
  },
  barcodeDock: {
    minHeight: 126,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barcodePlaceholder: {
    minHeight: 110,
    width: '100%',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    backgroundColor: '#ffffff',
  },
  placeholderText: {
    ...typeScale.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  codeMetaPanel: {
    minHeight: 34,
    gap: 4,
    paddingHorizontal: 4,
  },
  codeMetaStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.gold },
  warningDot: { backgroundColor: colors.coral },
  codeMeta: {
    flex: 1,
    ...typeScale.caption,
    color: 'rgba(255,253,247,0.76)',
  },
  codeRefreshWarning: {
    paddingLeft: 14,
    ...typeScale.caption,
    color: '#ffe0b2',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#fff7e8',
    borderWidth: 1,
    borderColor: '#f3d5a5',
  },
  errorText: {
    flex: 1,
    ...typeScale.body,
    color: colors.text,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceStrong,
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
    fontVariant: ['tabular-nums'],
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
  metricLabel: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  metricValue: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
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
  connectBlock: {
    padding: 18,
    gap: 14,
  },
  connectCopy: {
    ...typeScale.body,
    color: colors.textMuted,
  },
  primaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    backgroundColor: colors.brand,
    paddingHorizontal: 16,
  },
  primaryButtonLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
