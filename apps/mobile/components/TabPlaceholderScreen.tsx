import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { cardShadow, stealthTheme, typeScale } from '../lib/stealth-theme';

const colors = stealthTheme.colors;

export function TabPlaceholderScreen({
  title,
  icon,
  description,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
}) {
  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={28} color={colors.brand} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.canvas,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...cardShadow('surface'),
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentMuted,
  },
  title: {
    ...typeScale.title,
    color: colors.text,
    textAlign: 'center',
  },
  description: {
    ...typeScale.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
