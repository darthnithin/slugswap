import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';

export default function RequesterScreen() {
  const [weeklyAllowance] = useState(50); // TODO: Fetch from backend
  const [remainingAllowance, setRemainingAllowance] = useState(50);
  const [currentCode, setCurrentCode] = useState<string | null>(null);
  const [claimHistory, setClaimHistory] = useState<any[]>([]);

  const handleGenerateCode = () => {
    // TODO: Call API to generate code via GET Tools
    const code = `SLUG${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    setCurrentCode(code);

    // Simulate countdown/expiry (5 minutes)
    setTimeout(() => {
      setCurrentCode(null);
    }, 5 * 60 * 1000);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        <Text style={styles.header}>Request Points</Text>

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
          <Text style={styles.resetText}>Resets in 3 days</Text>
        </View>

        {currentCode ? (
          <View style={styles.codeCard}>
            <Text style={styles.cardTitle}>Your Claim Code</Text>
            <View style={styles.codeContainer}>
              <Text style={styles.codeText}>{currentCode}</Text>
            </View>
            <Text style={styles.expiryText}>Expires in 4:32</Text>
            <Text style={styles.instructionsText}>
              Show this code at the dining hall to redeem your points
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.generateButton}
            onPress={handleGenerateCode}
            disabled={remainingAllowance === 0}
          >
            <Text style={styles.generateButtonText}>Generate Claim Code</Text>
          </TouchableOpacity>
        )}

        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Recent Claims</Text>
          {claimHistory.length === 0 ? (
            <Text style={styles.emptyText}>No claims yet</Text>
          ) : (
            claimHistory.map((claim, index) => (
              <View key={index} style={styles.historyItem}>
                <Text>{claim.code}</Text>
                <Text>{claim.status}</Text>
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
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 24,
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
  codeContainer: {
    backgroundColor: '#f5f5f5',
    padding: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  codeText: {
    fontSize: 32,
    fontWeight: 'bold',
    letterSpacing: 4,
    color: '#007AFF',
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
  },
});
