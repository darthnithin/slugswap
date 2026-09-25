import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  FOOD_VENDORS_SOURCE_URL,
  foodVendorHours,
  type FoodVendor,
  type FoodVendorStop,
} from '@/lib/food-vendors';
import type { useFoodVendors } from '@/lib/use-food-vendors';
import { buttonOpacity, campusFonts, stealthTheme } from '@/lib/stealth-theme';

const colors = stealthTheme.colors;
type FeedState = ReturnType<typeof useFoodVendors>;

export function FoodVendorStatus({ feed }: { feed: FeedState }) {
  if (feed.data && !feed.error && !feed.stale) return null;

  return (
    <View style={styles.status}>
      {feed.loading ? (
        <ActivityIndicator size="small" color={colors.forest} />
      ) : null}
      <Text style={styles.caption}>
        {feed.error
          ? `${feed.data ? 'Showing saved schedule. ' : ''}${feed.error}`
          : feed.stale && feed.data
            ? 'Showing saved schedule. Check UCSC for updates.'
            : 'Loading food vendors…'}
      </Text>
      {!feed.loading && (feed.error || feed.stale) ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void feed.refresh()}
          style={styles.retry}
        >
          <Text style={styles.linkText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function FoodVendorPreview({
  feed,
  onPress,
}: {
  feed: FeedState;
  onPress: () => void;
}) {
  const checkedIn = feed.data?.vendors.filter((vendor) =>
    vendor.stops.some((stop) => stop.kind === 'check-in'),
  );
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.preview,
        { opacity: buttonOpacity(pressed) },
      ]}
    >
      <Ionicons name="storefront-outline" size={24} color={colors.forest} />
      <View style={styles.copy}>
        <Text style={styles.vendorName}>Food around campus</Text>
        <Text style={styles.caption}>
          {feed.error || feed.stale
            ? 'Browse vendors · Updates may be delayed'
            : checkedIn
              ? `${checkedIn.length} vendors checked in today · Cafes & food trucks`
              : 'Browse cafes, food trucks & stands'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.forest} />
    </Pressable>
  );
}

function VendorCard({
  vendor,
  stops,
  onMap,
}: {
  vendor: FoodVendor;
  stops: FoodVendorStop[];
  onMap: (stop: FoodVendorStop) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.nameRow}>
        <Text selectable style={styles.vendorName}>
          {vendor.name}
        </Text>
        {vendor.acceptsFlexi ? (
          <Text style={styles.flexi}>Accepts Flexi</Text>
        ) : null}
      </View>
      {vendor.cuisine ? (
        <Text selectable numberOfLines={2} style={styles.caption}>
          {vendor.cuisine}
        </Text>
      ) : null}
      {stops.map((stop) => (
        <View key={stop.id} style={styles.stop}>
          <View style={styles.copy}>
            <Text selectable style={styles.location}>
              {stop.locationName}
            </Text>
            <Text selectable style={styles.hours}>
              {foodVendorHours(stop)} · Pacific
            </Text>
            {stop.kind === 'recurring' ? (
              <Text style={styles.caption}>
                Regular schedule · Check-in not confirmed
              </Text>
            ) : null}
          </View>
          {stop.coordinates ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Show ${vendor.name} at ${stop.locationName} on map`}
              onPress={() => onMap(stop)}
              style={({ pressed }) => [
                styles.mapButton,
                { opacity: buttonOpacity(pressed) },
              ]}
            >
              <Ionicons name="map-outline" size={19} color={colors.forest} />
              <Text style={styles.linkText}>Map</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      {!stops.length ? (
        <Text style={styles.caption}>No location posted today</Text>
      ) : null}
    </View>
  );
}

export default function FoodVendors({ feed }: { feed: FeedState }) {
  const router = useRouter();
  const [showDirectory, setShowDirectory] = useState(false);
  const vendors = feed.data?.vendors ?? [];
  const checkedIn = vendors.filter((vendor) =>
    vendor.stops.some((stop) => stop.kind === 'check-in'),
  );
  const recurring = vendors.filter((vendor) =>
    vendor.stops.some((stop) => stop.kind === 'recurring'),
  );
  const unlisted = vendors.filter((vendor) => !vendor.stops.length);
  const onMap = (stop: FoodVendorStop) =>
    router.push({
      pathname: '/(tabs)/explore',
      params: { foodVendorStopId: stop.id },
    });
  const renderVendor = (vendor: FoodVendor, kind?: FoodVendorStop['kind']) => (
    <VendorCard
      key={vendor.id}
      vendor={vendor}
      stops={vendor.stops.filter((stop) => !kind || stop.kind === kind)}
      onMap={onMap}
    />
  );

  return (
    <View style={styles.stack}>
      <View>
        <Text style={styles.eyebrow}>
          TODAY ·{' '}
          {new Date(`${feed.date}T12:00:00`)
            .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            .toUpperCase()}
        </Text>
        <Text style={styles.title}>Food vendors</Text>
      </View>
      <FoodVendorStatus feed={feed} />
      {feed.data ? (
        <>
          <Text style={styles.heading}>
            Checked in today{' '}
            <Text style={styles.count}>{checkedIn.length}</Text>
          </Text>
          {checkedIn.length ? (
            checkedIn.map((vendor) => renderVendor(vendor, 'check-in'))
          ) : (
            <Text style={styles.caption}>
              No vendors have posted a check-in for today yet.
            </Text>
          )}
          {recurring.length ? (
            <>
              <Text style={styles.heading}>Regular spots</Text>
              {recurring.map((vendor) => renderVendor(vendor, 'recurring'))}
            </>
          ) : null}
          {unlisted.length ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showDirectory }}
                onPress={() => setShowDirectory((value) => !value)}
                style={styles.directoryButton}
              >
                <Text style={styles.linkText}>
                  {showDirectory ? 'Hide' : 'Show'} other vendors (
                  {unlisted.length})
                </Text>
                <Ionicons
                  name={showDirectory ? 'chevron-up' : 'chevron-down'}
                  size={17}
                  color={colors.forest}
                />
              </Pressable>
              {showDirectory
                ? unlisted.map((vendor) => renderVendor(vendor))
                : null}
            </>
          ) : null}
        </>
      ) : null}
      <Text style={styles.caption}>
        Locations and hours are reported by vendors and may change. A check-in
        is not a guarantee a vendor is still open.
      </Text>
      <Pressable
        accessibilityRole="link"
        onPress={() =>
          void Linking.openURL(FOOD_VENDORS_SOURCE_URL).catch(() => undefined)
        }
        style={styles.source}
      >
        <Text style={styles.linkText}>UCSC Food Finder</Text>
        <Ionicons name="open-outline" size={16} color={colors.forest} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  title: {
    fontFamily: campusFonts.serifSemibold,
    fontSize: 32,
    lineHeight: 38,
    color: colors.ink,
  },
  eyebrow: {
    fontFamily: campusFonts.sansSemibold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textMuted,
    marginBottom: 5,
  },
  heading: {
    fontFamily: campusFonts.serifSemibold,
    fontSize: 24,
    lineHeight: 29,
    color: colors.ink,
    marginTop: 8,
  },
  count: {
    fontFamily: campusFonts.sans,
    fontSize: 16,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 9,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    flexWrap: 'wrap',
  },
  vendorName: {
    fontFamily: campusFonts.sansSemibold,
    fontSize: 17,
    lineHeight: 22,
    color: colors.ink,
    flexShrink: 1,
  },
  flexi: {
    backgroundColor: colors.sage,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 11,
    color: colors.forest,
  },
  caption: {
    fontFamily: campusFonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    flexShrink: 1,
  },
  location: {
    fontFamily: campusFonts.sansMedium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
  hours: {
    fontFamily: campusFonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },
  stop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  copy: { flex: 1, gap: 3 },
  mapButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
  },
  linkText: {
    fontFamily: campusFonts.sansSemibold,
    fontSize: 13,
    color: colors.forest,
  },
  status: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  source: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
  },
  directoryButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  preview: {
    backgroundColor: colors.sage,
    borderRadius: 15,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
