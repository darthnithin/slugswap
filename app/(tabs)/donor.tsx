import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { setDonation, getDonorImpact, pauseDonation, getGetAccounts, getGetLinkStatus, getGetLoginUrl, linkGetAccount, unlinkGetAccount } from '../../lib/api';
import * as WebBrowser from 'expo-web-browser';

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

export default function DonorScreen() {
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);
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

  const ucscTrackedAccounts = getAccounts.filter((account) =>
    UCSC_TRACKED_BALANCE_ACCOUNTS.has(account.accountDisplayName.trim().toLowerCase())
  );
  const totalAvailableBalance = ucscTrackedAccounts.reduce((sum, account) => {
    if (typeof account.balance !== 'number' || Number.isNaN(account.balance)) return sum;
    return sum + account.balance;
  }, 0);

  useEffect(() => {
    loadUserAndImpact();
  }, []);

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

      // Fetch donor impact data
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

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.content, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        <Text style={styles.header}>Share Dining Points</Text>

        <View style={styles.getCard}>
          <Text style={styles.cardTitle}>Available GET Balance</Text>
          {isGetLinked ? (
            <>
              <Text style={styles.getStatusText}>Linked{getLinkedAt ? ` on ${new Date(getLinkedAt).toLocaleDateString()}` : ''}</Text>
              <View style={styles.totalBalanceCard}>
                <Text style={styles.totalBalanceLabel}>Total Available (Flexi + Banana + Slug)</Text>
                <Text style={styles.totalBalanceValue}>{totalAvailableBalance.toFixed(2)} pts</Text>
              </View>
              <Text style={styles.getDetailText}>Tracked accounts</Text>
              {ucscTrackedAccounts.length > 0 ? (
                <View style={styles.balanceList}>
                  {ucscTrackedAccounts.map((account) => (
                    <View key={account.id} style={styles.balanceRow}>
                      <Text style={styles.balanceName}>{account.accountDisplayName}</Text>
                      <Text style={styles.balanceValue}>{account.balance ?? 'n/a'} pts</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.getDetailText}>Linked, but no tracked UCSC balance accounts were returned.</Text>
              )}
              <TouchableOpacity
                style={[styles.secondaryButton, refreshingBalance && styles.buttonDisabled]}
                onPress={handleRefreshBalance}
                disabled={refreshingBalance}
              >
                {refreshingBalance ? (
                  <ActivityIndicator color="#007AFF" />
                ) : (
                  <Text style={styles.secondaryButtonText}>Refresh Balance</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, unlinkingGet && styles.buttonDisabled]}
                onPress={handleUnlinkGet}
                disabled={unlinkingGet}
              >
                <Text style={styles.secondaryButtonText}>{unlinkingGet ? 'Unlinking...' : 'Unlink GET'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.getDetailText}>
                Continue to GET and sign in. Once it says 'validated', tap{' '}
                <Ionicons name="share-outline" size={13} color="#666" style={{ marginHorizontal: 2 }} />
                {' '}then{' '}
                <Ionicons name="copy-outline" size={13} color="#666" style={{ marginHorizontal: 2 }} />
                {' '}to copy the URL, then paste it below to finish linking.
              </Text>
              <TouchableOpacity
                style={[styles.secondaryButton, linkingGet && styles.buttonDisabled]}
                onPress={handleOpenGetLogin}
                disabled={linkingGet}
              >
                {linkingGet ? (
                  <ActivityIndicator color="#007AFF" />
                ) : (
                  <Text style={styles.secondaryButtonText}>Open GET Login</Text>
                )}
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                value={getLoginUrlInput}
                onChangeText={setGetLoginUrlInput}
                placeholder="Paste validated GET URL here"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.button, linkingGet && styles.buttonDisabled]}
                onPress={handleLinkGet}
                disabled={linkingGet}
              >
                {linkingGet ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Link from Pasted URL</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {!isActive ? (
          <View style={styles.setupCard}>
            <Text style={styles.cardTitle}>Set Monthly Contribution</Text>
            <Text style={styles.cardSubtitle}>
              Your contribution goes to a weekly pool that helps fellow students
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Monthly Amount (points)</Text>
              <TextInput
                style={styles.input}
                value={monthlyAmount}
                onChangeText={setMonthlyAmount}
                keyboardType="numeric"
                placeholder="e.g., 100"
              />
            </View>

            <TouchableOpacity
              style={[styles.button, saving && styles.buttonDisabled]}
              onPress={handleSetContribution}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Start Sharing</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.impactCard}>
            <Text style={styles.cardTitle}>Your Impact</Text>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{impact.peopleHelped}</Text>
                <Text style={styles.statLabel}>People Helped</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{monthlyAmount}</Text>
                <Text style={styles.statLabel}>Points/Month</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.pauseButton, saving && styles.buttonDisabled]}
              onPress={handlePause}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#007AFF" />
              ) : (
                <Text style={styles.pauseButtonText}>{isActive ? 'Pause' : 'Resume'} Sharing</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  getCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  getStatusText: {
    fontSize: 14,
    color: '#34C759',
    marginBottom: 8,
  },
  getDetailText: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
    lineHeight: 20,
  },
  balanceList: {
    marginBottom: 12,
    gap: 8,
  },
  totalBalanceCard: {
    backgroundColor: '#f3f8ff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  totalBalanceLabel: {
    fontSize: 12,
    color: '#1e3a8a',
    marginBottom: 4,
  },
  totalBalanceValue: {
    fontSize: 28,
    color: '#007AFF',
    fontWeight: '700',
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  balanceName: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
    flex: 1,
    marginRight: 8,
  },
  balanceValue: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  setupCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  impactCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  pauseButton: {
    borderWidth: 1,
    borderColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  pauseButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
