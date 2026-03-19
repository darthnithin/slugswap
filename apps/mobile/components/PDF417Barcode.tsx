import { View, StyleSheet } from 'react-native';
import RNPDF417 from 'expo-barcode-pdf417';
import { cardShadow, stealthTheme } from '../lib/stealth-theme';

interface PDF417BarcodeProps {
  value: string;
  width?: number;
  height?: number;
}

/**
 * PDF417 barcode renderer for claim codes.
 * Uses expo-barcode-pdf417 (backed by pkoretic/pdf417-generator encoding + react-native-svg)
 * for GET Tools scanner compatibility.
 */
export function PDF417Barcode({ value, width = 280, height = 100 }: PDF417BarcodeProps) {
  return (
    <View style={styles.container}>
      <RNPDF417 text={value} width={width} height={height} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: stealthTheme.colors.barcode,
    borderRadius: stealthTheme.radii.sm,
    borderWidth: 1,
    borderColor: stealthTheme.colors.borderStrong,
    paddingHorizontal: 10,
    paddingVertical: 10,
    overflow: 'hidden',
    ...cardShadow(),
  },
});
