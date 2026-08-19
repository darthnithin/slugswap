import { Ionicons } from '@expo/vector-icons';
import { AppleMaps } from 'expo-maps';
import { AppleMapsMapStyleEmphasis } from 'expo-maps/build/apple/AppleMaps.types';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  Image,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CAMPUS_CATEGORY_META,
  CAMPUS_PLACES,
  DEFAULT_CAMPUS_PLACE_ID,
  filterCampusPlaces,
  findCampusPlace,
  type CampusPlace,
  type CampusPlaceCategory,
} from '@/lib/campus-places';
import {
  buttonOpacity,
  campusFonts,
  cardShadow,
  stealthTheme,
} from '@/lib/stealth-theme';

const colors = stealthTheme.colors;
const CATEGORY_ORDER: readonly CampusPlaceCategory[] = ['dining', 'study', 'essentials'];
const CAMPUS_CAMERA = {
  coordinates: { latitude: 36.9969, longitude: -122.0598 },
  zoom: 14,
};

const CATEGORY_ICONS: Record<CampusPlaceCategory, keyof typeof Ionicons.glyphMap> = {
  dining: 'restaurant-outline',
  study: 'book-outline',
  essentials: 'bag-handle-outline',
};

function placeIconName(category: CampusPlaceCategory): keyof typeof Ionicons.glyphMap {
  if (category === 'dining') return 'restaurant';
  if (category === 'study') return 'book';
  return 'bag-handle';
}

function actionLabel(place: CampusPlace): string {
  if (place.category === 'dining') return 'View menu';
  if (place.category === 'study') return 'Find a room';
  return 'Get directions';
}

type MapHeaderProps = {
  activeCategory: CampusPlaceCategory;
  query: string;
  visiblePlaces: CampusPlace[];
  topInset: number;
  onCategoryChange: (category: CampusPlaceCategory) => void;
  onQueryChange: (value: string) => void;
  onPlacePress: (place: CampusPlace) => void;
  onMorePress: () => void;
};

function MapHeader({
  activeCategory,
  query,
  visiblePlaces,
  topInset,
  onCategoryChange,
  onQueryChange,
  onPlacePress,
  onMorePress,
}: MapHeaderProps) {
  const showResults = query.trim().length > 0;

  return (
    <View style={[styles.header, { paddingTop: Math.max(topInset, 10) + 8 }]}>
      <View style={styles.brandRow}>
        <View style={styles.brandLockup}>
          <Image
            accessibilityIgnoresInvertColors
            source={require('../../assets/src/brand/slug-swap-mark-1024.png')}
            resizeMode="contain"
            style={styles.brandMark}
          />
          <Text style={styles.wordmark}>SlugSwap</Text>
        </View>
        <Pressable
          accessibilityLabel="Open more campus tools"
          accessibilityRole="button"
          hitSlop={10}
          onPress={onMorePress}
          style={({ pressed }) => [styles.moreButton, { opacity: buttonOpacity(pressed) }]}
        >
          <Ionicons name="menu" size={30} color={colors.ink} />
        </Pressable>
      </View>

      <View style={styles.searchField}>
        <Ionicons name="search" size={22} color={colors.ink} />
        <TextInput
          accessibilityLabel="Search campus"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={onQueryChange}
          placeholder="Search campus"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          style={styles.searchInput}
          value={query}
        />
      </View>

      <View accessibilityRole="tablist" style={styles.chipRow}>
        {CATEGORY_ORDER.map((category) => {
          const meta = CAMPUS_CATEGORY_META[category];
          const active = activeCategory === category;
          const activeTextColor = category === 'study' ? colors.ink : colors.softWhite;

          return (
            <Pressable
              key={category}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => onCategoryChange(category)}
              style={({ pressed }) => [
                styles.filterChip,
                { borderColor: meta.tintColor },
                active ? { backgroundColor: meta.tintColor } : styles.filterChipIdle,
                { opacity: buttonOpacity(pressed) },
              ]}
            >
              <Ionicons
                name={CATEGORY_ICONS[category]}
                size={17}
                color={active ? activeTextColor : meta.tintColor}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.filterChipLabel,
                  { color: active ? activeTextColor : colors.ink },
                ]}
              >
                {meta.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {showResults ? (
        <View style={styles.searchResults}>
          {visiblePlaces.length > 0 ? (
            visiblePlaces.slice(0, 4).map((place, index) => (
              <Pressable
                key={place.id}
                accessibilityRole="button"
                onPress={() => onPlacePress(place)}
                style={({ pressed }) => [
                  styles.searchResult,
                  index > 0 ? styles.searchResultBorder : null,
                  { opacity: buttonOpacity(pressed) },
                ]}
              >
                <Ionicons
                  name={placeIconName(place.category)}
                  size={18}
                  color={CAMPUS_CATEGORY_META[place.category].tintColor}
                />
                <Text numberOfLines={1} style={styles.searchResultLabel}>
                  {place.shortName}
                </Text>
                <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
              </Pressable>
            ))
          ) : (
            <Text style={styles.noResults}>
              No {CAMPUS_CATEGORY_META[activeCategory].label.toLowerCase()} matches.
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

function PlaceSheet({
  place,
  onAction,
}: {
  place: CampusPlace;
  onAction: (place: CampusPlace) => void;
}) {
  const category = CAMPUS_CATEGORY_META[place.category];

  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHandle} />
      <View style={styles.sheetContent}>
        <View style={styles.pinWrap}>
          <View style={[styles.placePin, { backgroundColor: category.tintColor }]}>
            <View style={styles.placePinIcon}>
              <Ionicons
                name={placeIconName(place.category)}
                size={24}
                color={place.category === 'study' ? colors.ink : colors.softWhite}
              />
            </View>
          </View>
        </View>
        <View style={styles.placeCopy}>
          <Text style={styles.placeEyebrow}>{category.singularLabel}</Text>
          <Text numberOfLines={2} style={styles.placeTitle}>
            {place.shortName}
          </Text>
          <Text numberOfLines={2} style={styles.placeDescription}>
            {place.description}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => onAction(place)}
        style={({ pressed }) => [styles.sheetAction, { opacity: buttonOpacity(pressed) }]}
      >
        <Text style={styles.sheetActionLabel}>{actionLabel(place)}</Text>
        <Ionicons name="arrow-forward" size={23} color={colors.softWhite} />
      </Pressable>
    </View>
  );
}

function FallbackPlaceList({
  places,
  onPlacePress,
  bottomInset,
}: {
  places: CampusPlace[];
  onPlacePress: (place: CampusPlace) => void;
  bottomInset: number;
}) {
  return (
    <ScrollView
      contentContainerStyle={[styles.fallbackContent, { paddingBottom: bottomInset + 28 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.fallbackTitle}>Places on campus</Text>
      <Text style={styles.fallbackSubtitle}>
        Choose a place for menus, room reservations, or directions.
      </Text>
      {places.length > 0 ? (
        places.map((place) => {
          const category = CAMPUS_CATEGORY_META[place.category];
          return (
            <Pressable
              key={place.id}
              accessibilityRole="button"
              onPress={() => onPlacePress(place)}
              style={({ pressed }) => [
                styles.fallbackCard,
                { opacity: buttonOpacity(pressed) },
              ]}
            >
              <View style={[styles.fallbackIcon, { backgroundColor: category.tintColor }]}>
                <Ionicons
                  name={placeIconName(place.category)}
                  size={23}
                  color={place.category === 'study' ? colors.ink : colors.softWhite}
                />
              </View>
              <View style={styles.fallbackCopy}>
                <Text style={styles.fallbackCardTitle}>{place.shortName}</Text>
                <Text numberOfLines={2} style={styles.fallbackCardDescription}>
                  {place.description}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.ink} />
            </Pressable>
          );
        })
      ) : (
        <View style={styles.fallbackEmpty}>
          <Ionicons name="search" size={26} color={colors.textMuted} />
          <Text style={styles.fallbackEmptyTitle}>No places found</Text>
          <Text style={styles.fallbackEmptyText}>Try a different campus search.</Text>
        </View>
      )}
    </ScrollView>
  );
}

export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<AppleMaps.MapView>(null);
  const [activeCategory, setActiveCategory] = useState<CampusPlaceCategory>('dining');
  const [query, setQuery] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<CampusPlace | null>(() =>
    findCampusPlace(DEFAULT_CAMPUS_PLACE_ID),
  );

  const visiblePlaces = useMemo(
    () => filterCampusPlaces(activeCategory, query),
    [activeCategory, query],
  );

  const markers = useMemo<AppleMaps.Marker[]>(
    () =>
      visiblePlaces.map((place) => ({
        id: place.id,
        title: place.shortName,
        systemImage: place.systemImage,
        tintColor: CAMPUS_CATEGORY_META[place.category].tintColor,
        coordinates: place.coordinates,
      })),
    [visiblePlaces],
  );

  const selectPlace = (place: CampusPlace) => {
    Keyboard.dismiss();
    setSelectedPlace(place);
    setQuery('');
    mapRef.current?.setCameraPosition({ coordinates: place.coordinates, zoom: 16 });
    mapRef.current?.selectMarker(place.id, { moveCamera: false });
  };

  const changeCategory = (category: CampusPlaceCategory) => {
    setActiveCategory(category);
    setQuery('');
    const firstPlace = CAMPUS_PLACES.find((place) => place.category === category) ?? null;
    setSelectedPlace(firstPlace);
    if (firstPlace) {
      mapRef.current?.setCameraPosition({ coordinates: firstPlace.coordinates, zoom: 14.5 });
    }
  };

  const openPlace = (place: CampusPlace) => {
    if (place.category === 'dining' && place.diningLocationId) {
      router.push({
        pathname: '/(tabs)/menu',
        params: { locationId: place.diningLocationId },
      });
      return;
    }

    if (place.category === 'study' && place.libraryId) {
      router.push({
        pathname: '/rooms',
        params: { library: place.libraryId },
      });
      return;
    }

    const { latitude, longitude } = place.coordinates;
    const directionsUrl = Platform.select({
      ios: `https://maps.apple.com/?daddr=${latitude},${longitude}&q=${encodeURIComponent(place.name)}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
    });
    if (directionsUrl) void Linking.openURL(directionsUrl);
  };

  return (
    <View style={styles.screen}>
      <MapHeader
        activeCategory={activeCategory}
        query={query}
        visiblePlaces={visiblePlaces}
        topInset={insets.top}
        onCategoryChange={changeCategory}
        onQueryChange={setQuery}
        onPlacePress={selectPlace}
        onMorePress={() => router.push('/(tabs)/more')}
      />

      {Platform.OS === 'ios' ? (
        <View style={styles.mapShell}>
          <AppleMaps.View
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            cameraPosition={CAMPUS_CAMERA}
            colorScheme={AppleMaps.MapColorScheme.LIGHT}
            markers={markers}
            onMapClick={() => {
              Keyboard.dismiss();
              setQuery('');
            }}
            onMarkerClick={(marker) => {
              const place = findCampusPlace(marker.id);
              if (place) selectPlace(place);
            }}
            properties={{
              elevation: AppleMaps.MapStyleElevation.FLAT,
              emphasis: AppleMapsMapStyleEmphasis.MUTED,
              isTrafficEnabled: false,
              selectionEnabled: false,
            }}
            uiSettings={{
              compassEnabled: true,
              myLocationButtonEnabled: false,
              scaleBarEnabled: false,
              togglePitchEnabled: false,
            }}
          />
          {selectedPlace ? <PlaceSheet place={selectedPlace} onAction={openPlace} /> : null}
        </View>
      ) : (
        <FallbackPlaceList
          places={visiblePlaces}
          onPlacePress={openPlace}
          bottomInset={insets.bottom}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  header: {
    zIndex: 10,
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.softWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  brandRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandMark: {
    width: 38,
    height: 38,
  },
  wordmark: {
    color: colors.ink,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 25,
    lineHeight: 30,
    letterSpacing: -1.15,
  },
  moreButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchField: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    backgroundColor: colors.softWhite,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 10,
  },
  searchInput: {
    flex: 1,
    height: 42,
    paddingVertical: 0,
    color: colors.ink,
    fontFamily: campusFonts.sans,
    fontSize: 17,
    lineHeight: 21,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    minHeight: 38,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 9,
  },
  filterChipIdle: {
    backgroundColor: colors.softWhite,
  },
  filterChipLabel: {
    fontFamily: campusFonts.sansMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  searchResults: {
    overflow: 'hidden',
    backgroundColor: colors.softWhite,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    ...cardShadow('surface'),
  },
  searchResult: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
  },
  searchResultBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  searchResultLabel: {
    flex: 1,
    color: colors.ink,
    fontFamily: campusFonts.sansMedium,
    fontSize: 15,
    lineHeight: 19,
  },
  noResults: {
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: colors.textMuted,
    fontFamily: campusFonts.sans,
    fontSize: 14,
    lineHeight: 19,
  },
  mapShell: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.sage,
  },
  sheet: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    left: 12,
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 9,
    paddingBottom: 15,
    backgroundColor: 'rgba(255, 253, 247, 0.98)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    ...cardShadow('hero'),
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    backgroundColor: colors.borderStrong,
    borderRadius: 999,
  },
  sheetContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pinWrap: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placePin: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 7,
    transform: [{ rotate: '45deg' }],
  },
  placePinIcon: {
    transform: [{ rotate: '-45deg' }],
  },
  placeCopy: {
    flex: 1,
  },
  placeEyebrow: {
    marginBottom: 1,
    color: colors.textMuted,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.65,
    textTransform: 'uppercase',
  },
  placeTitle: {
    color: colors.ink,
    fontFamily: campusFonts.serifSemibold,
    fontSize: 24,
    lineHeight: 27,
    letterSpacing: -0.45,
  },
  placeDescription: {
    marginTop: 1,
    color: colors.textMuted,
    fontFamily: campusFonts.sans,
    fontSize: 14,
    lineHeight: 18,
  },
  sheetAction: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    backgroundColor: colors.forest,
    borderRadius: 10,
  },
  sheetActionLabel: {
    color: colors.softWhite,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 16,
    lineHeight: 21,
  },
  fallbackContent: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 22,
  },
  fallbackTitle: {
    color: colors.ink,
    fontFamily: campusFonts.serifSemibold,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.6,
  },
  fallbackSubtitle: {
    marginBottom: 8,
    color: colors.textMuted,
    fontFamily: campusFonts.sans,
    fontSize: 15,
    lineHeight: 21,
  },
  fallbackCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: colors.softWhite,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
  },
  fallbackIcon: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  fallbackCopy: {
    flex: 1,
  },
  fallbackCardTitle: {
    color: colors.ink,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 16,
    lineHeight: 21,
  },
  fallbackCardDescription: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: campusFonts.sans,
    fontSize: 13,
    lineHeight: 17,
  },
  fallbackEmpty: {
    alignItems: 'center',
    gap: 5,
    paddingVertical: 42,
    paddingHorizontal: 20,
  },
  fallbackEmptyTitle: {
    color: colors.ink,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 17,
    lineHeight: 22,
  },
  fallbackEmptyText: {
    color: colors.textMuted,
    fontFamily: campusFonts.sans,
    fontSize: 14,
    lineHeight: 19,
  },
});
