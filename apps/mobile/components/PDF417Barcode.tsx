import { useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
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
  const [availableWidth, setAvailableWidth] = useState(0);
  const renderedWidth = availableWidth > 0
    ? Math.max(1, Math.floor(Math.min(width, availableWidth - 20)))
    : 0;

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setAvailableWidth((currentWidth) =>
      Math.abs(currentWidth - nextWidth) < 1 ? currentWidth : nextWidth
    );
  };

  return (
    <View
      accessible
      accessibilityLabel="PDF417 checkout barcode"
      accessibilityRole="image"
      onLayout={handleLayout}
      style={[styles.container, { maxWidth: width + 20, minHeight: height + 20 }]}
    >
      {renderedWidth > 0 ? <RNPDF417 text={value} width={renderedWidth} height={height} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
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
