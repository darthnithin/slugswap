import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import {
  CAMPUS_MAP_LAYER_META,
  CAMPUS_MAP_LAYER_ORDER,
  type CampusMapLayerId,
} from '@/lib/ucsc-map-data';
import type { CampusMapLayerLoadState } from '@/lib/use-campus-map-data';
import {
  buttonOpacity,
  campusFonts,
  stealthTheme,
} from '@/lib/stealth-theme';

const colors = stealthTheme.colors;
const UCSC_MAPS_URL = 'https://maps.ucsc.edu/';

type CampusMapLayersSheetProps = {
  visible: boolean;
  activeLayerIds: ReadonlySet<CampusMapLayerId>;
  states: Partial<Record<CampusMapLayerId, CampusMapLayerLoadState>>;
  onClose: () => void;
  onToggle: (layerId: CampusMapLayerId, active: boolean) => void;
  onRetry: (layerId: CampusMapLayerId) => void;
};

export default function CampusMapLayersSheet({
  visible,
  activeLayerIds,
  states,
  onClose,
  onToggle,
  onRetry,
}: CampusMapLayersSheetProps) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle={process.env.EXPO_OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      visible={visible}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>MAP OPTIONS</Text>
            <Text style={styles.title}>Campus layers</Text>
          </View>
          <Pressable
            accessibilityLabel="Close campus layers"
            accessibilityRole="button"
            hitSlop={10}
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              { opacity: buttonOpacity(pressed) },
            ]}
          >
            <Ionicons name="close" size={25} color={colors.ink} />
          </Pressable>
        </View>

        <View style={styles.layerList}>
          {CAMPUS_MAP_LAYER_ORDER.map((layerId, index) => {
            const meta = CAMPUS_MAP_LAYER_META[layerId];
            const state = states[layerId];
            const active = activeLayerIds.has(layerId);
            const loading = active && state?.status === 'loading';
            const featureCount = state?.data.features.length ?? 0;

            return (
              <View
                key={layerId}
                style={[styles.layerRow, index > 0 ? styles.layerRowBorder : null]}
              >
                <View style={[styles.layerIcon, { backgroundColor: meta.color }]}>
                  <Ionicons
                    name={layerIconName(layerId)}
                    size={22}
                    color={colors.softWhite}
                  />
                </View>
                <View style={styles.layerCopy}>
                  <View style={styles.layerTitleRow}>
                    <Text style={styles.layerTitle}>{meta.title}</Text>
                    {loading ? (
                      <ActivityIndicator color={meta.color} size="small" />
                    ) : active && featureCount > 0 ? (
                      <Text style={styles.layerCount}>{featureCount}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.layerDescription}>{meta.description}</Text>
                  {active && state?.status === 'error' ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => onRetry(layerId)}
                      style={({ pressed }) => [
                        styles.retryButton,
                        { opacity: buttonOpacity(pressed) },
                      ]}
                    >
                      <Text style={styles.retryText}>Couldn’t load · Try again</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Switch
                  accessibilityLabel={`${meta.title} map layer`}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: active }}
                  ios_backgroundColor={colors.sage}
                  onValueChange={(nextValue) => onToggle(layerId, nextValue)}
                  trackColor={{ false: colors.sage, true: meta.color }}
                  value={active}
                />
              </View>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(UCSC_MAPS_URL)}
          style={({ pressed }) => [
            styles.sourceLink,
            { opacity: buttonOpacity(pressed) },
          ]}
        >
          <Text style={styles.sourceText}>Campus data from UCSC Maps</Text>
          <Ionicons name="open-outline" size={17} color={colors.ink} />
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

function layerIconName(
  layerId: CampusMapLayerId,
): keyof typeof Ionicons.glyphMap {
  if (layerId === 'transit') return 'bus';
  if (layerId === 'parking') return 'car';
  if (layerId === 'amenities') return 'location';
  if (layerId === 'construction') return 'hammer';
  return 'leaf';
}

const styles = StyleSheet.create({
  content: {
    minHeight: '100%',
    gap: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 36,
    backgroundColor: colors.cream,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  headingCopy: {
    flex: 1,
  },
  eyebrow: {
    color: colors.textMuted,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.1,
  },
  title: {
    color: colors.ink,
    fontFamily: campusFonts.serifSemibold,
    fontSize: 42,
    lineHeight: 46,
    letterSpacing: -0.7,
  },
  closeButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.softWhite,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 21,
  },
  layerList: {
    overflow: 'hidden',
    backgroundColor: colors.softWhite,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
  },
  layerRow: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  layerRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  layerIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  layerCopy: {
    flex: 1,
    gap: 2,
  },
  layerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  layerTitle: {
    color: colors.ink,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 17,
    lineHeight: 22,
  },
  layerCount: {
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 2,
    color: colors.textMuted,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    backgroundColor: colors.sage,
    borderRadius: 999,
    fontVariant: ['tabular-nums'],
  },
  layerDescription: {
    color: colors.textMuted,
    fontFamily: campusFonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  retryButton: {
    alignSelf: 'flex-start',
    paddingTop: 3,
  },
  retryText: {
    color: colors.coral,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 12,
    lineHeight: 16,
  },
  sourceLink: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sourceText: {
    color: colors.ink,
    fontFamily: campusFonts.sansMedium,
    fontSize: 14,
    lineHeight: 19,
    textDecorationLine: 'underline',
  },
});
