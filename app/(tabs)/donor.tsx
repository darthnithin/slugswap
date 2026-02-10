import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { setDonation, getDonorImpact, pauseDonation } from '../../lib/api';

export default function DonorScreen() {
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [impact, setImpact] = useState({ peopleHelped: 0, pointsContributed: 0 });
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

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
      <View style={styles.content}>
        <Text style={styles.header}>Share Dining Points</Text>

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
      </View>
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
