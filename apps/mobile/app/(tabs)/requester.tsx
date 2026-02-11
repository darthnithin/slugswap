import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../../lib/supabase';
import { getRequesterAllowance, generateClaimCode, getClaimHistory, refreshClaimCode } from '../../../../lib/api';
import { PDF417Barcode } from '../../components/PDF417Barcode';

interface ClaimCode {
  id: string;
  code: string;
  amount: number;
  expiresAt: string;
}

export default function RequesterScreen() {
  const [weeklyAllowance, setWeeklyAllowance] = useState(0);
  const [remainingAllowance, setRemainingAllowance] = useState(0);
  const [daysUntilReset, setDaysUntilReset] = useState(0);
  const [currentCode, setCurrentCode] = useState<ClaimCode | null>(null);
  const [claimHistory, setClaimHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [refreshingCode, setRefreshingCode] = useState(false);
  const refreshingCodeRef = useRef(false);
  const [isRefreshingData, setIsRefreshingData] = useState(false);

  useEffect(() => {
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
          loadUserAndAllowance(); // Refresh data
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

      // Fetch allowance
      const allowanceData = await getRequesterAllowance(user.id);
      setWeeklyAllowance(allowanceData.weeklyLimit);
      setRemainingAllowance(allowanceData.remainingAmount);
      setDaysUntilReset(allowanceData.daysUntilReset);

      // Fetch history
      const historyData = await getClaimHistory(user.id);
      setClaimHistory(historyData.claims);
    } catch (error) {
      console.error('Error loading allowance:', error);
      Alert.alert('Error', 'Failed to load your allowance data');
    } finally {
      setLoading(false);
      setIsRefreshingData(false);
    }
  }

  const handleRefresh = async () => {
    setIsRefreshingData(true);
    await loadUserAndAllowance();
  };

  const handleGenerateCode = async () => {
    if (!userId) return;

    const DEFAULT_CLAIM_AMOUNT = 10; // Points per claim

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
        <View style={styles.headerRow}>
          <Text style={styles.header}>Request Points</Text>
          <TouchableOpacity
            onPress={handleRefresh}
            disabled={isRefreshingData}
            style={styles.refreshButton}
          >
            {isRefreshingData ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <Text style={styles.refreshIcon}>↻</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.allowanceCard}>
          <Text style={styles.cardTitle}>Weekly Allowance</Text>
          <View style={styles.allowanceRow}>
            <View>
              <Text style={styles.allowanceValue}>{remainingAllowance}</Text>
              <Text style={styles.allowanceLabel}>points remaining</Text>
            </View>
            <View style={styles.allowanceTotal}>
              <Text style={styles.totalText}>of {weeklyAllowance}</Text>
            </View>
          </View>
          <Text style={styles.resetText}>Resets in {daysUntilReset} {daysUntilReset === 1 ? 'day' : 'days'}</Text>
        </View>

        {currentCode ? (
          <View style={styles.codeCard}>
            <Text style={styles.cardTitle}>Your Claim Code</Text>
            <View style={styles.barcodeContainer}>
              <PDF417Barcode value={currentCode.code} width={280} height={100} />
            </View>
            <Text style={styles.codeValueText}>{currentCode.code}</Text>
            <Text style={styles.expiryText}>Expires in {timeRemaining}</Text>
            <Text style={styles.instructionsText}>
              Show this code at the dining hall to redeem your points
            </Text>
            <Text style={styles.refreshText}>
              Refreshing every 5s{refreshingCode ? ' ...' : ''}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.generateButton, (remainingAllowance === 0 || generating) && styles.generateButtonDisabled]}
            onPress={handleGenerateCode}
            disabled={remainingAllowance === 0 || generating}
          >
            {generating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.generateButtonText}>Generate Claim Code</Text>
            )}
          </TouchableOpacity>
        )}

        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Recent Claims</Text>
          {claimHistory.length === 0 ? (
            <Text style={styles.emptyText}>No claims yet</Text>
          ) : (
            claimHistory.map((claim) => (
              <View key={claim.id} style={styles.historyItem}>
                <View>
                  <Text style={styles.historyCode}>{claim.code}</Text>
                  <Text style={styles.historyDate}>
                    {new Date(claim.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <View style={styles.historyStatus}>
                  <Text style={[
                    styles.statusBadge,
                    claim.status === 'redeemed' && styles.statusRedeemed,
                    claim.status === 'expired' && styles.statusExpired,
                  ]}>
                    {claim.status.toUpperCase()}
                  </Text>
                  <Text style={styles.historyAmount}>{claim.amount} pts</Text>
                </View>
              </View>
            ))
          )}
        </View>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshIcon: {
    fontSize: 24,
    color: '#007AFF',
  },
  allowanceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  allowanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  allowanceValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  allowanceLabel: {
    fontSize: 14,
    color: '#666',
  },
  allowanceTotal: {
    alignItems: 'flex-end',
  },
  totalText: {
    fontSize: 18,
    color: '#999',
  },
  resetText: {
    fontSize: 12,
    color: '#666',
  },
  codeCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  barcodeContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  codeValueText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 2,
    color: '#666',
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  expiryText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#FF3B30',
    marginBottom: 12,
  },
  instructionsText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#666',
  },
  refreshText: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 11,
    color: '#666',
  },
  generateButton: {
    backgroundColor: '#007AFF',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  historySection: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    padding: 24,
  },
  historyItem: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  generateButtonDisabled: {
    opacity: 0.5,
  },
  historyCode: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  historyDate: {
    fontSize: 12,
    color: '#999',
  },
  historyStatus: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  statusRedeemed: {
    color: '#34C759',
  },
  statusExpired: {
    color: '#FF3B30',
  },
  historyAmount: {
    fontSize: 12,
    color: '#666',
  },
});
