import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import {
  CrossPlatformSymbol,
  type CrossPlatformSymbolName,
} from '@/components/cross-platform-symbol';
import {
  getGetAccounts,
  getGetLoginUrl,
  getMobileHome,
  linkGetAccount,
  pauseDonation,
  updateDonorSpendNotificationPreference,
  setDonation,
  unlinkGetAccount,
  type DonorImpact,
  type RequesterPoolStatus,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  useTabCache,
  type GetAccountBalance,
  type ShareTabSnapshot,
} from '@/lib/tab-cache-context';
import {
  enablePushNotificationsAsync,
  scheduleNotificationPreviewAsync,
  syncExistingPushRegistrationAsync,
} from '@/lib/notifications';
import {
  buttonOpacity,
  campusFonts,
  cardShadow,
  stealthTheme,
  typeScale,
} from '@/lib/stealth-theme';
import { useFocusEffect, useRouter } from 'expo-router';

const POOL_EMPTY_TITLE = 'No points available';
const POOL_EMPTY_MESSAGE = 'The shared donor pool is empty right now. Check back later.';

const EMPTY_IMPACT: DonorImpact = {
  isActive: false,
  notifyOnSpend: false,
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
    notifyOnSpend: raw.notifyOnSpend === true,
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
  icon: CrossPlatformSymbolName;
  title: string;
  detail?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        <View style={styles.sectionIcon}>
          <CrossPlatformSymbol name={icon} tintColor={colors.textSoft} size={18} />
        </View>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
        </View>
      </View>
    </View>
  );
}

function ImpactMetric({
  icon,
  label,
  value,
}: {
  icon: CrossPlatformSymbolName;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.impactMetric}>
      <View style={styles.impactMetricIcon}>
        <CrossPlatformSymbol name={icon} tintColor={colors.softWhite} size={17} />
      </View>
      <View style={styles.impactMetricCopy}>
        <Text style={styles.impactMetricValue}>{value}</Text>
        <Text style={styles.impactMetricLabel}>{label}</Text>
      </View>
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
  icon?: CrossPlatformSymbolName;
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  const tintColor = destructive ? colors.danger : colors.brand;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
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
          {icon ? <CrossPlatformSymbol name={icon} tintColor={tintColor} size={14} /> : null}
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
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
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
  const router = useRouter();
  const { user } = useAuth();
  const { shareSnapshot: cachedShareSnapshot, setShareSnapshot } = useTabCache();
  const shareSnapshot = cachedShareSnapshot?.userId === user?.id ? cachedShareSnapshot : null;
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
  const [unlinkingGet, setUnlinkingGet] = useState(false);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  const [getAccounts, setGetAccounts] = useState<GetAccountBalance[]>(shareSnapshot?.getAccounts ?? []);
  const [refreshing, setRefreshing] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsSyncing, setNotificationsSyncing] = useState(false);
  const [requesterWeeklyLimit, setRequesterWeeklyLimit] = useState(shareSnapshot?.requesterWeeklyLimit ?? 0);
  const [requesterWeekEnd, setRequesterWeekEnd] = useState<string | null>(shareSnapshot?.requesterWeekEnd ?? null);
  const [requesterDaysUntilReset, setRequesterDaysUntilReset] = useState(shareSnapshot?.requesterDaysUntilReset ?? 0);
  const [requesterPoolStatus, setRequesterPoolStatus] = useState<RequesterPoolStatus>(
    shareSnapshot?.requesterPoolStatus ?? 'unavailable'
  );
  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const shareSnapshotRef = useRef<ShareTabSnapshot | null>(shareSnapshot);
  const getAccountsRequestIdRef = useRef(0);
  const homeRequestIdRef = useRef(0);
  const skipInitialFocusRefreshRef = useRef(!hasShareSnapshot);
  const notificationRegistrationCheckedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    shareSnapshotRef.current = shareSnapshot;
  }, [shareSnapshot]);

  const updateShareSnapshot = useCallback((snapshot: ShareTabSnapshot) => {
    shareSnapshotRef.current = snapshot;
    setShareSnapshot(snapshot);
  }, [setShareSnapshot]);

  const invalidateHomeRequests = useCallback(() => {
    homeRequestIdRef.current += 1;
  }, []);

  const loadGetAccountsInBackground = useCallback(async (options?: { alertOnError?: boolean }) => {
    const requestId = getAccountsRequestIdRef.current + 1;
    getAccountsRequestIdRef.current = requestId;
    setRefreshingBalance(true);

    try {
      const accounts = await getGetAccounts();
      if (getAccountsRequestIdRef.current !== requestId) return;

      const nextAccounts = accounts.accounts || [];
      setGetAccounts(nextAccounts);

      const currentSnapshot = shareSnapshotRef.current;
      if (currentSnapshot?.isGetLinked) {
        updateShareSnapshot({
          ...currentSnapshot,
          getAccounts: nextAccounts,
        });
      }
    } catch (error: any) {
      if (options?.alertOnError) {
        Alert.alert('Refresh Failed', error.message || 'Failed to refresh GET balance');
      }
    } finally {
      if (getAccountsRequestIdRef.current === requestId) {
        setRefreshingBalance(false);
      }
    }
  }, [updateShareSnapshot]);

  const loadUserAndImpact = useCallback(async (options?: { showBlockingLoader?: boolean }) => {
    const requestId = homeRequestIdRef.current + 1;
    homeRequestIdRef.current = requestId;
    const showBlockingLoader = options?.showBlockingLoader ?? false;
    if (showBlockingLoader) setLoading(true);

    try {
      const home = await getMobileHome();
      if (homeRequestIdRef.current !== requestId) return;

      const linkState = home.linkStatus;
      const nextGetAccounts = linkState.linked
        ? (shareSnapshotRef.current?.getAccounts ?? [])
        : [];
      const impactData = home.impact;
      const allowance = home.allowance;

      const normalizedImpact = normalizeDonorImpact(impactData);
      const normalizedWeeklyAmount =
        linkState.linked && impactData.weeklyAmount > 0 ? impactData.weeklyAmount.toString() : '';
      const nextRequesterWeeklyLimit = allowance?.weeklyLimit ?? 0;
      const nextRequesterWeekEnd = allowance?.weekEnd ?? null;
      const nextRequesterDaysUntilReset = allowance?.daysUntilReset ?? 0;
      const nextRequesterPoolStatus: RequesterPoolStatus = allowance?.poolStatus ?? 'unavailable';

      const nextSnapshot: ShareTabSnapshot = {
        userId: home.user.id,
        userEmail: home.user.email,
        weeklyAmount: normalizedWeeklyAmount,
        isActive: impactData.isActive,
        impact: normalizedImpact,
        isGetLinked: linkState.linked,
        getLinkedAt: linkState.linkedAt,
        getAccounts: nextGetAccounts,
        requesterWeeklyLimit: nextRequesterWeeklyLimit,
        requesterWeekEnd: nextRequesterWeekEnd,
        requesterDaysUntilReset: nextRequesterDaysUntilReset,
        requesterPoolStatus: nextRequesterPoolStatus,
      };

      setUserId(nextSnapshot.userId);
      setUserEmail(nextSnapshot.userEmail);
      setWeeklyAmount(nextSnapshot.weeklyAmount);
      setIsActive(nextSnapshot.isActive);
      setImpact(nextSnapshot.impact);
      setIsGetLinked(nextSnapshot.isGetLinked);
      setGetLinkedAt(nextSnapshot.getLinkedAt);
      setGetAccounts(nextSnapshot.getAccounts);
      setRequesterWeeklyLimit(nextSnapshot.requesterWeeklyLimit);
      setRequesterWeekEnd(nextSnapshot.requesterWeekEnd);
      setRequesterDaysUntilReset(nextSnapshot.requesterDaysUntilReset);
      setRequesterPoolStatus(nextSnapshot.requesterPoolStatus);
      updateShareSnapshot(nextSnapshot);
      if (linkState.linked) {
        void loadGetAccountsInBackground();
      } else {
        getAccountsRequestIdRef.current += 1;
        setRefreshingBalance(false);
      }
    } catch (error) {
      if (homeRequestIdRef.current !== requestId) return;
      console.warn('Error loading impact:', error);
      Alert.alert('Error', 'Failed to load your donation data');
    } finally {
      if (showBlockingLoader && homeRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [
    loadGetAccountsInBackground,
    updateShareSnapshot,
  ]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadUserAndImpact({ showBlockingLoader: false });
    setRefreshing(false);
  }, [loadUserAndImpact]);

  const cacheShareSnapshot = useCallback((overrides: Partial<ShareTabSnapshot> = {}) => {
    updateShareSnapshot({
      userId,
      userEmail,
      weeklyAmount,
      isActive,
      impact,
      isGetLinked,
      getLinkedAt,
      getAccounts,
      requesterWeeklyLimit,
      requesterWeekEnd,
      requesterDaysUntilReset,
      requesterPoolStatus,
      ...overrides,
    });
  }, [
    getAccounts,
    getLinkedAt,
    impact,
    isActive,
    isGetLinked,
    requesterWeekEnd,
    requesterWeeklyLimit,
    requesterPoolStatus,
    updateShareSnapshot,
    userEmail,
    userId,
    weeklyAmount,
  ]);

  useEffect(() => {
    if (hasShareSnapshot) return;
    void loadUserAndImpact({ showBlockingLoader: true });
  }, [hasShareSnapshot, loadUserAndImpact]);

  useEffect(
    () => () => {
      invalidateHomeRequests();
      getAccountsRequestIdRef.current += 1;
    },
    [invalidateHomeRequests]
  );

  useFocusEffect(
    useCallback(() => {
      if (skipInitialFocusRefreshRef.current) {
        skipInitialFocusRefreshRef.current = false;
        return undefined;
      }

      void loadUserAndImpact({ showBlockingLoader: false });
      return undefined;
    }, [loadUserAndImpact])
  );

  useEffect(() => {
    if (!userId) {
      notificationRegistrationCheckedForUserRef.current = null;
      setNotificationsEnabled(false);
      return;
    }
    if (!impact.notifyOnSpend) {
      notificationRegistrationCheckedForUserRef.current = null;
      setNotificationsEnabled(false);
      return;
    }
    if (notificationRegistrationCheckedForUserRef.current === userId) return;
    notificationRegistrationCheckedForUserRef.current = userId;

    let active = true;
    void syncExistingPushRegistrationAsync()
      .then((registered) => {
        if (active) setNotificationsEnabled(registered);
      })
      .catch((error) => {
        console.warn('Failed to refresh notification registration:', error);
        if (active) setNotificationsEnabled(false);
      });

    return () => {
      active = false;
    };
  }, [impact.notifyOnSpend, userId]);

  const setLocalNotificationPreference = useCallback(
    (enabled: boolean) => {
      setImpact((currentImpact) => ({ ...currentImpact, notifyOnSpend: enabled }));

      const currentSnapshot = shareSnapshotRef.current;
      if (currentSnapshot) {
        updateShareSnapshot({
          ...currentSnapshot,
          impact: { ...currentSnapshot.impact, notifyOnSpend: enabled },
        });
      }
    },
    [updateShareSnapshot]
  );

  const enableSpendNotifications = useCallback(async (options?: { alertOnFailure?: boolean }) => {
    const alertOnFailure = options?.alertOnFailure ?? true;
    setNotificationsSyncing(true);
    try {
      const result = await enablePushNotificationsAsync();
      if (result.status === 'registered') {
        await updateDonorSpendNotificationPreference(true);
        setNotificationsEnabled(true);
        setLocalNotificationPreference(true);
        return true;
      }

      setNotificationsEnabled(false);
      if (!alertOnFailure) return false;

      if (result.status === 'denied') {
        Alert.alert(
          'Notifications are off',
          'Allow notifications for SlugSwap in Settings, then try again.'
        );
      } else if (result.status === 'unsupported') {
        Alert.alert('Unavailable', 'Push notifications are only available in the native app.');
      } else {
        Alert.alert('Could not enable notifications', result.message);
      }
      return false;
    } catch (error) {
      console.error('Failed to enable spend notifications:', error);
      setNotificationsEnabled(false);
      if (alertOnFailure) {
        Alert.alert('Could not enable notifications', 'Please try again in a moment.');
      }
      return false;
    } finally {
      setNotificationsSyncing(false);
    }
  }, [setLocalNotificationPreference]);

  const handleNotificationToggle = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        await enableSpendNotifications();
        return;
      }

      setNotificationsSyncing(true);
      try {
        await updateDonorSpendNotificationPreference(false);
        setNotificationsEnabled(false);
        setLocalNotificationPreference(false);
      } catch (error) {
        console.error('Failed to disable spend notifications:', error);
        Alert.alert('Could not update notifications', 'Please try again in a moment.');
      } finally {
        setNotificationsSyncing(false);
      }
    },
    [enableSpendNotifications, setLocalNotificationPreference]
  );

  const handleSetContribution = async () => {
    if (!userId) return;

    const amount = parseFloat(weeklyAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount');
      return;
    }

    invalidateHomeRequests();
    setSaving(true);
    const wasActive = isActive;
    try {
      await setDonation(amount);
      invalidateHomeRequests();
      setIsActive(true);
      setIsEditingAmount(false);
      await loadUserAndImpact({ showBlockingLoader: false });
      if (wasActive) {
        Alert.alert('Contribution updated', `You are now sharing up to ${amount} points each week.`);
      } else if (Platform.OS === 'web') {
        Alert.alert('Success', 'Your contribution has been set!');
      } else {
        const notificationsReady = await enableSpendNotifications({ alertOnFailure: false });
        Alert.alert(
          'Sharing started',
          notificationsReady
            ? 'Your contribution is active. Spend notifications are on by default.'
            : 'Your contribution is active. Spend notifications could not be enabled, but you can try again below.'
        );
      }
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

    invalidateHomeRequests();
    setSaving(true);
    try {
      await pauseDonation(shouldPause);
      invalidateHomeRequests();
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

    invalidateHomeRequests();
    await linkGetAccount(validatedUrl.trim());
    invalidateHomeRequests();

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
      invalidateHomeRequests();
      setUnlinkingGet(true);
      try {
        await unlinkGetAccount();
        invalidateHomeRequests();
        const pausedImpact: DonorImpact = {
          ...impact,
          isActive: false,
          status: 'paused',
        };
        setIsActive(false);
        setImpact(pausedImpact);
        setIsGetLinked(false);
        setGetLinkedAt(null);
        setGetAccounts([]);
        getAccountsRequestIdRef.current += 1;
        setRefreshingBalance(false);
        cacheShareSnapshot({
          isActive: false,
          impact: pausedImpact,
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
    await loadGetAccountsInBackground({ alertOnError: true });
  };

  const parsedWeeklyAmount = toSafeNumber(weeklyAmount);
  const savedWeeklyCap =
    impact.capAmount > 0
      ? impact.capAmount
      : impact.weeklyAmount > 0
        ? impact.weeklyAmount
        : 0;
  const weeklyCap = savedWeeklyCap > 0 ? savedWeeklyCap : parsedWeeklyAmount;
  const weeklyUsed = Math.max(
    0,
    Math.min(weeklyCap, impact.redeemedThisWeek + impact.reservedThisWeek)
  );
  const weeklyProgress = weeklyCap > 0 ? Math.min(1, weeklyUsed / weeklyCap) : 0;
  const hasSavedContribution = savedWeeklyCap > 0;
  const formattedWeekEnd = requesterWeekEnd
    ? new Date(requesterWeekEnd).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: impact.timezone,
      })
    : null;

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
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
      >
        <View style={styles.intro}>
          <Text style={styles.pageEyebrow}>Student to student</Text>
          <Text style={styles.pageTitle}>Point sharing</Text>
          <Text style={styles.pageIntro}>
            Set aside a few dining points each week. SlugSwap quietly puts them to work when another student needs a meal.
          </Text>
          <View style={[styles.statusPill, !isActive && styles.statusPillPaused]}>
            <CrossPlatformSymbol
              name={isActive ? 'person.crop.circle.badge.checkmark' : 'pause.fill'}
              tintColor={colors.forest}
              size={17}
            />
            <Text style={styles.statusPillText}>
              {isActive ? 'Sharing is active' : hasSavedContribution ? 'Sharing is paused' : 'Ready when you are'}
            </Text>
          </View>
        </View>

        {!isGetLinked ? (
          <SectionCard style={styles.getRequiredCard}>
            <SectionHeader
              icon="wallet.pass"
              title="Connect GET to share"
              detail="SlugSwap needs a linked campus account before your points can fund a claim."
            />
            <View style={styles.connectBlock}>
              <View style={styles.connectSteps}>
                <Text style={styles.connectStep}>1. Open GET and sign in.</Text>
                <Text style={styles.connectStep}>2. Paste the validated URL below.</Text>
              </View>
              <View style={styles.buttonRow}>
                <SecondaryButton
                  label="Open GET login"
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
                placeholder="Paste validated GET URL"
                placeholderTextColor={colors.textSoft}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <PrimaryButton
                label="Finish connecting"
                onPress={() => {
                  void handleLinkGet();
                }}
                loading={linkingGet}
              />
            </View>
          </SectionCard>
        ) : null}

        <SectionCard style={styles.impactCard}>
          <Text style={styles.cardEyebrow}>Your weekly impact</Text>
          <View style={styles.impactHero}>
            <Text style={styles.impactNumber}>{impact.peopleHelped}</Text>
            <Text style={styles.impactPhrase}>
              {impact.peopleHelped === 1 ? 'person helped' : 'people helped'}
            </Text>
          </View>
          <View style={styles.impactMetrics}>
            <ImpactMetric
              icon="heart.text.square"
              value={`${weeklyCap.toLocaleString('en-US', { maximumFractionDigits: 2 })} pts`}
              label="each week"
            />
            <View style={styles.metricDivider} />
            <ImpactMetric
              icon="person.crop.circle"
              value={`${impact.remainingThisWeek.toLocaleString('en-US', { maximumFractionDigits: 2 })} pts`}
              label="remaining"
            />
          </View>
          <View style={styles.progressBlock}>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLabel}>This week</Text>
              <Text style={styles.progressValue}>
                {weeklyUsed.toLocaleString('en-US', { maximumFractionDigits: 2 })} of{' '}
                {weeklyCap.toLocaleString('en-US', { maximumFractionDigits: 2 })} pts in use
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${weeklyProgress * 100}%` }]} />
            </View>
            <Text style={styles.progressFootnote}>
              Includes redeemed and currently reserved points.
            </Text>
          </View>
        </SectionCard>

        <Pressable
          accessibilityLabel={
            requesterPoolStatus === 'empty' ? POOL_EMPTY_TITLE : 'Request a meal'
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: requesterPoolStatus === 'empty' }}
          disabled={requesterPoolStatus === 'empty'}
          onPress={() => router.push('/scan-card')}
          style={({ pressed }) => [
            styles.requestMealCard,
            requesterPoolStatus === 'empty' && styles.requestMealCardDisabled,
            { opacity: buttonOpacity(pressed, requesterPoolStatus === 'empty') },
          ]}
        >
          <View style={styles.requestMealIcon}>
            <CrossPlatformSymbol name="barcode.viewfinder" tintColor={colors.ink} size={23} />
          </View>
          <View style={styles.requestMealCopy}>
            <Text style={styles.requestMealTitle}>
              {requesterPoolStatus === 'empty' ? POOL_EMPTY_TITLE : 'Request a meal'}
            </Text>
            <Text style={styles.requestMealDetail}>
              {requesterPoolStatus === 'empty'
                ? POOL_EMPTY_MESSAGE
                : requesterWeeklyLimit > 0
                  ? `Claim up to ${requesterWeeklyLimit} points · resets${formattedWeekEnd ? ` ${formattedWeekEnd}` : ` in ${requesterDaysUntilReset} days`}`
                  : 'Generate a short-lived claim code for checkout.'}
            </Text>
          </View>
          {requesterPoolStatus !== 'empty' ? (
            <CrossPlatformSymbol name="arrow.up.right" tintColor={colors.ink} size={18} />
          ) : null}
        </Pressable>

        {isGetLinked ? (
          <SectionCard>
            <SectionHeader
              icon="heart.text.square"
              title="Weekly contribution"
              detail="Choose a limit that feels comfortable. You stay in control."
            />

            {hasSavedContribution ? (
              <View style={styles.currentContribution}>
                <Text style={styles.currentContributionLabel}>Current amount</Text>
                <Text style={styles.currentContributionValue}>
                  {weeklyCap.toLocaleString('en-US', { maximumFractionDigits: 2 })}{' '}
                  <Text style={styles.currentContributionUnit}>pts / week</Text>
                </Text>
              </View>
            ) : null}

            {isEditingAmount || !hasSavedContribution ? (
              <View style={styles.amountEditor}>
                <Text style={styles.formLabel}>Weekly amount</Text>
                <View style={styles.amountInputRow}>
                  <TextInput
                    accessibilityLabel="Weekly contribution amount"
                    style={styles.amountInput}
                    value={weeklyAmount}
                    onChangeText={setWeeklyAmount}
                    keyboardType="decimal-pad"
                    placeholder="100"
                    placeholderTextColor={colors.textSoft}
                    selectTextOnFocus
                  />
                  <Text style={styles.amountSuffix}>points</Text>
                </View>
                <PrimaryButton
                  label={isActive ? 'Save amount' : 'Start sharing'}
                  onPress={() => {
                    void handleSetContribution();
                  }}
                  loading={saving}
                />
                {hasSavedContribution ? (
                  <Pressable
                    accessibilityLabel="Cancel editing weekly amount"
                    accessibilityRole="button"
                    onPress={() => setIsEditingAmount(false)}
                    style={({ pressed }) => [{ opacity: buttonOpacity(pressed) }]}
                  >
                    <Text style={styles.cancelEditText}>Cancel</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={styles.contributionActions}>
                <PrimaryButton
                  label={isActive ? 'Change amount' : 'Resume sharing'}
                  onPress={() => {
                    if (isActive) setIsEditingAmount(true);
                    else void handlePause();
                  }}
                  loading={saving}
                />
                {!isActive ? (
                  <Pressable
                    accessibilityLabel="Change weekly amount before resuming"
                    accessibilityRole="button"
                    onPress={() => setIsEditingAmount(true)}
                    style={({ pressed }) => [{ opacity: buttonOpacity(pressed) }]}
                  >
                    <Text style={styles.editAmountText}>Change amount first</Text>
                  </Pressable>
                ) : null}
              </View>
            )}

            {hasSavedContribution ? (
              <>
                <View style={styles.rule} />

                <View style={styles.notificationRow}>
                  <View style={styles.notificationIcon}>
                    <CrossPlatformSymbol name="bell.fill" tintColor={colors.ink} size={20} />
                  </View>
                  <View style={styles.notificationCopy}>
                    <Text style={styles.notificationTitle}>Spend notifications</Text>
                    <Text style={styles.notificationDetail}>
                      Get a quiet heads-up when your points help someone.
                    </Text>
                  </View>
                  {notificationsSyncing ? (
                    <ActivityIndicator size="small" color={colors.forest} />
                  ) : (
                    <Switch
                      accessibilityLabel="Spend notifications"
                      value={notificationsEnabled}
                      onValueChange={(enabled) => {
                        void handleNotificationToggle(enabled);
                      }}
                      trackColor={{ false: colors.borderStrong, true: colors.forest }}
                      thumbColor={colors.softWhite}
                    />
                  )}
                </View>
              </>
            ) : null}

            {hasSavedContribution ? (
              <View style={styles.buttonRow}>
                <SecondaryButton
                  label={isActive ? 'Pause sharing' : 'Resume sharing'}
                  onPress={() => {
                    void handlePause();
                  }}
                  icon={isActive ? 'pause.fill' : 'play.fill'}
                  destructive={isActive}
                  loading={saving}
                />
              </View>
            ) : null}
          </SectionCard>
        ) : null}

        {isGetLinked ? (
          <SectionCard style={styles.getConnectionCard}>
            <View style={styles.getConnectionRow}>
              <View style={styles.getConnectedIcon}>
                <CrossPlatformSymbol
                  name="person.crop.circle.badge.checkmark"
                  tintColor={colors.softWhite}
                  size={22}
                />
              </View>
              <View style={styles.getConnectionCopy}>
                <Text style={styles.getConnectionTitle}>GET connected</Text>
                <Text style={styles.getConnectionDetail}>
                  {refreshingBalance
                    ? 'Checking your connection…'
                    : getLinkedAt
                      ? `Linked ${new Date(getLinkedAt).toLocaleDateString()}`
                      : 'Ready to fund meal claims'}
                </Text>
              </View>
            </View>
            <View style={styles.buttonRow}>
              <SecondaryButton
                label="Refresh connection"
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
          </SectionCard>
        ) : null}

        {__DEV__ && Platform.OS !== 'web' ? (
          <SectionCard style={styles.devCard}>
            <SectionHeader
              icon="bell.fill"
              title="Notification preview"
              detail="Only shown in development builds"
            />
            <View style={styles.buttonRow}>
              <SecondaryButton
                label="Send test notification"
                icon="bell.fill"
                onPress={() => {
                  void scheduleNotificationPreviewAsync(
                    'Your SlugPoints helped someone',
                    'Someone just spent 10 of your donated SlugPoints. Thank you for sharing!'
                  ).catch((error) => {
                    Alert.alert(
                      'Test notification failed',
                      error instanceof Error ? error.message : 'Please try again.'
                    );
                  });
                }}
              />
            </View>
          </SectionCard>
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
  content: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingTop: 14,
    gap: 16,
    paddingBottom: 40,
  },
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.canvas,
  },
  sectionCard: {
    borderRadius: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow(),
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceStrong,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sage,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeaderText: {
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontFamily: campusFonts.sansSemibold,
    color: colors.ink,
  },
  sectionDetail: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  secondaryButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.softWhite,
    borderWidth: 1,
    borderColor: colors.border,
    flexGrow: 1,
  },
  secondaryButtonLabel: {
    color: colors.forest,
    fontSize: 14,
    fontFamily: campusFonts.sansSemibold,
  },
  destructiveLabel: {
    color: colors.danger,
  },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.forest,
    marginHorizontal: 16,
    marginTop: 14,
  },
  primaryButtonLabel: {
    color: colors.softWhite,
    fontSize: 16,
    fontFamily: campusFonts.sansSemibold,
  },
  connectBlock: {
    paddingTop: 14,
    gap: 10,
  },
  input: {
    marginHorizontal: 16,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.softWhite,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    color: colors.ink,
    fontSize: 15,
    fontFamily: campusFonts.sans,
  },
  formLabel: {
    paddingHorizontal: 16,
    ...typeScale.caption,
    color: colors.textMuted,
  },
  notificationRow: {
    marginHorizontal: 16,
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notificationCopy: {
    flex: 1,
    gap: 3,
  },
  notificationTitle: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: campusFonts.sansSemibold,
  },
  notificationDetail: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  intro: {
    paddingHorizontal: 2,
    paddingTop: 4,
    paddingBottom: 2,
    gap: 7,
  },
  pageEyebrow: {
    color: colors.forest,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  pageTitle: {
    color: colors.ink,
    fontFamily: campusFonts.serifSemibold,
    fontSize: 43,
    lineHeight: 47,
    letterSpacing: -0.8,
  },
  pageIntro: {
    maxWidth: 500,
    color: colors.textMuted,
    fontFamily: campusFonts.sans,
    fontSize: 15,
    lineHeight: 22,
  },
  statusPill: {
    alignSelf: 'flex-start',
    minHeight: 40,
    marginTop: 5,
    paddingHorizontal: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.sage,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusPillPaused: {
    backgroundColor: colors.surfaceMuted,
  },
  statusPillText: {
    color: colors.ink,
    fontFamily: campusFonts.sansMedium,
    fontSize: 14,
    lineHeight: 19,
  },
  getRequiredCard: {
    borderColor: '#DDB32D',
    backgroundColor: '#FFFAE9',
  },
  connectSteps: {
    paddingHorizontal: 16,
    gap: 5,
  },
  connectStep: {
    color: colors.textMuted,
    fontFamily: campusFonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  impactCard: {
    paddingTop: 20,
    paddingBottom: 20,
  },
  cardEyebrow: {
    paddingHorizontal: 20,
    color: colors.textMuted,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 13,
    lineHeight: 18,
  },
  impactHero: {
    paddingHorizontal: 20,
    paddingTop: 5,
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 9,
  },
  impactNumber: {
    color: colors.forest,
    fontFamily: campusFonts.serif,
    fontSize: 62,
    lineHeight: 68,
    letterSpacing: -1.4,
    fontVariant: ['tabular-nums'],
  },
  impactPhrase: {
    color: colors.forest,
    fontFamily: campusFonts.serif,
    fontSize: 29,
    lineHeight: 35,
    letterSpacing: -0.4,
  },
  impactMetrics: {
    paddingHorizontal: 20,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  impactMetric: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  impactMetricIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  impactMetricCopy: {
    flex: 1,
  },
  impactMetricValue: {
    color: colors.ink,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 16,
    lineHeight: 21,
    fontVariant: ['tabular-nums'],
  },
  impactMetricLabel: {
    color: colors.textMuted,
    fontFamily: campusFonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    height: 38,
    marginHorizontal: 14,
    backgroundColor: colors.borderStrong,
  },
  progressBlock: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 8,
  },
  progressLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  progressLabel: {
    color: colors.ink,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 13,
  },
  progressValue: {
    flex: 1,
    textAlign: 'right',
    color: colors.textMuted,
    fontFamily: campusFonts.sans,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 13,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: colors.sage,
  },
  progressFill: {
    height: '100%',
    minWidth: 4,
    borderRadius: 999,
    backgroundColor: colors.forest,
  },
  progressFootnote: {
    color: colors.textSoft,
    fontFamily: campusFonts.sans,
    fontSize: 11,
    lineHeight: 15,
  },
  requestMealCard: {
    minHeight: 92,
    padding: 15,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: colors.gold,
    borderWidth: 1,
    borderColor: '#DDAE16',
    ...cardShadow(),
  },
  requestMealCardDisabled: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.border,
  },
  requestMealIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 253, 247, 0.72)',
  },
  requestMealCopy: {
    flex: 1,
    gap: 2,
  },
  requestMealTitle: {
    color: colors.ink,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 17,
    lineHeight: 22,
  },
  requestMealDetail: {
    color: colors.ink,
    fontFamily: campusFonts.sans,
    fontSize: 12,
    lineHeight: 17,
  },
  currentContribution: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 3,
  },
  currentContributionLabel: {
    color: colors.textMuted,
    fontFamily: campusFonts.sansMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  currentContributionValue: {
    color: colors.forest,
    fontFamily: campusFonts.serifSemibold,
    fontSize: 34,
    lineHeight: 39,
    fontVariant: ['tabular-nums'],
  },
  currentContributionUnit: {
    fontFamily: campusFonts.sansMedium,
    fontSize: 14,
    lineHeight: 19,
  },
  amountEditor: {
    paddingTop: 15,
    paddingBottom: 2,
  },
  amountInputRow: {
    minHeight: 56,
    marginHorizontal: 16,
    marginTop: 7,
    paddingHorizontal: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.softWhite,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 10,
    color: colors.ink,
    fontFamily: campusFonts.serifSemibold,
    fontSize: 27,
    fontVariant: ['tabular-nums'],
  },
  amountSuffix: {
    color: colors.textMuted,
    fontFamily: campusFonts.sansMedium,
    fontSize: 14,
  },
  cancelEditText: {
    paddingTop: 12,
    paddingBottom: 2,
    textAlign: 'center',
    color: colors.textMuted,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 14,
  },
  contributionActions: {
    paddingTop: 2,
  },
  editAmountText: {
    paddingTop: 12,
    textAlign: 'center',
    color: colors.forest,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 14,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginVertical: 16,
    backgroundColor: colors.border,
  },
  notificationIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sage,
    borderWidth: 1,
    borderColor: colors.border,
  },
  getConnectionCard: {
    paddingTop: 16,
  },
  getConnectionRow: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  getConnectedIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.forest,
  },
  getConnectionCopy: {
    flex: 1,
    gap: 2,
  },
  getConnectionTitle: {
    color: colors.ink,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 16,
    lineHeight: 21,
  },
  getConnectionDetail: {
    color: colors.textMuted,
    fontFamily: campusFonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  devCard: {
    opacity: 0.82,
  },
});
