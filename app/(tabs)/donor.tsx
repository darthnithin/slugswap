import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';

export default function DonorScreen() {
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [isActive, setIsActive] = useState(false);

  const handleSetContribution = () => {
    // TODO: Save monthly contribution to backend
    console.log('Set contribution:', monthlyAmount);
    setIsActive(true);
  };

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

            <TouchableOpacity style={styles.button} onPress={handleSetContribution}>
              <Text style={styles.buttonText}>Start Sharing</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.impactCard}>
            <Text style={styles.cardTitle}>Your Impact</Text>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>0</Text>
                <Text style={styles.statLabel}>People Helped</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{monthlyAmount}</Text>
                <Text style={styles.statLabel}>Points/Month</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.pauseButton}>
              <Text style={styles.pauseButtonText}>Pause Sharing</Text>
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
});
