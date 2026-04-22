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
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { PDF417Barcode } from '../../../components/PDF417Barcode';
import {
  getGetBarcode,
  getGetLinkStatus,
  getGetWallet,
} from '../../../../../lib/api';
import { supabase } from '../../../../../lib/supabase';
import {
  buttonOpacity,
  cardShadow,
  monoFontFamily,
  stealthTheme,
  typeScale,
} from '../../../lib/stealth-theme';

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
  icon: SymbolViewProps['name'];
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
          <SymbolView name={icon} tintColor={colors.brand} size={15} />
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [barcodeRefreshing, setBarcodeRefreshing] = useState(false);
  const [isGetLinked, setIsGetLinked] = useState(false);
  const [linkedAt, setLinkedAt] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('My GET');
  const [accounts, setAccounts] = useState<GetAccountBalance[]>([]);
  const [barcodeCode, setBarcodeCode] = useState<string | null>(null);
  const [barcodeFetchedAt, setBarcodeFetchedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trackedAccounts = useMemo(
    () =>
      accounts.filter((account) =>
        UCSC_TRACKED_BALANCE_ACCOUNTS.has(account.accountDisplayName.trim().toLowerCase())
      ),
    [accounts]
  );

  const totalAvailableBalance = useMemo(
    () =>
      trackedAccounts.reduce((sum, account) => {
        if (typeof account.balance !== 'number' || Number.isNaN(account.balance)) return sum;
        return sum + account.balance;
      }, 0),
    [trackedAccounts]
  );

  const loadBarcode = useCallback(async (options?: { silent?: boolean }) => {
    if (barcodeRefreshInFlightRef.current) return;

    barcodeRefreshInFlightRef.current = true;
    if (!options?.silent) setBarcodeRefreshing(true);

    try {
      const barcode = await getGetBarcode();
      setBarcodeCode(barcode.code);
      setBarcodeFetchedAt(barcode.fetchedAt);
    } catch (error: any) {
      if (!options?.silent) {
        Alert.alert('Refresh Failed', error?.message || 'Failed to refresh your GET code');
      }
    } finally {
      barcodeRefreshInFlightRef.current = false;
      if (!options?.silent) setBarcodeRefreshing(false);
    }
  }, []);

  const loadWallet = useCallback(async (options?: { showBlockingLoader?: boolean }) => {
    const showBlockingLoader = options?.showBlockingLoader ?? false;
    if (showBlockingLoader) setLoading(true);
    setErrorMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert('Error', 'Please sign in first');
        return;
      }

      setDisplayName(
        typeof user.user_metadata?.full_name === 'string'
          ? user.user_metadata.full_name
          : formatNameFromEmail(user.email ?? null)
      );

      const linkState = await getGetLinkStatus();
      setIsGetLinked(linkState.linked);
      setLinkedAt(linkState.linkedAt);

      if (!linkState.linked) {
        setAccounts([]);
        setBarcodeCode(null);
        setBarcodeFetchedAt(null);
        return;
      }

      const wallet = await getGetWallet();
      setAccounts(wallet.accounts || []);
      setBarcodeCode(wallet.barcode.code);
      setBarcodeFetchedAt(wallet.barcode.fetchedAt);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to load your GET wallet');
    } finally {
      if (showBlockingLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWallet({ showBlockingLoader: true });
  }, [loadWallet]);

  useFocusEffect(
    useCallback(() => {
      if (!isGetLinked) return undefined;

      void loadBarcode({ silent: true });
      const intervalId = setInterval(() => {
        void loadBarcode({ silent: true });
      }, BARCODE_REFRESH_MS);

      return () => clearInterval(intervalId);
    }, [isGetLinked, loadBarcode])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadWallet();
    setRefreshing(false);
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
                name={isGetLinked ? 'person.crop.circle.badge.checkmark' : 'wallet.pass'}
                tintColor="rgba(255,255,255,0.88)"
                size={112}
              />
            </View>
          </View>
          <View style={styles.passContent}>
            <Text style={styles.passName}>{displayName}</Text>

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
                  <SymbolView name="lock" tintColor={colors.textSoft} size={24} />
                  <Text style={styles.placeholderText}>Link GET to show your campus scan code.</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {errorMessage ? (
          <View style={styles.errorBanner}>
            <SymbolView name="exclamationmark.triangle" tintColor={colors.warning} size={18} />
            <Text selectable style={styles.errorText}>
              {errorMessage}
            </Text>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}>
              <SymbolView name="creditcard" tintColor={colors.textSoft} size={18} />
            </View>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>Balance</Text>
              <Text style={styles.sectionDetail}>
                {isGetLinked ? 'Live GET account balances' : 'Connect GET from Home to sync balances'}
              </Text>
            </View>
          </View>

          {isGetLinked ? (
            <>
              <View style={styles.balanceHero}>
                <Text style={styles.balanceHeroLabel}>Total available</Text>
                <Text selectable style={styles.balanceHeroValue}>
                  {totalAvailableBalance.toFixed(2)} pts
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
                    void loadWallet();
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
                Link your GET account from the Home tab, then come back here to see your balance and scan your own code.
              </Text>
              <Pressable
                onPress={() => router.push('/(tabs)/(share)')}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { opacity: buttonOpacity(pressed) },
                ]}
              >
                <SymbolView name="arrow.left" tintColor="#ffffff" size={16} />
                <Text style={styles.primaryButtonLabel}>Go to Home</Text>
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
    paddingTop: 92,
    paddingBottom: 20,
    gap: 10,
  },
  passName: {
    color: '#ffffff',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
  },
  passMeta: {
    ...typeScale.caption,
    color: 'rgba(255,255,255,0.78)',
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
    borderRadius: 16,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  codeLabel: {
    color: '#ffffff',
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 1.2,
    fontFamily: monoFontFamily,
    fontWeight: '700',
  },
  codeMeta: {
    marginTop: 6,
    ...typeScale.caption,
    color: 'rgba(255,255,255,0.72)',
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
