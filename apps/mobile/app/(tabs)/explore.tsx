import { Ionicons } from '@expo/vector-icons';
import { AppleMaps } from 'expo-maps';
import {
  AppleMapsMapStyleEmphasis,
  type AppleMapsPolygon,
  type AppleMapsPolyline,
} from 'expo-maps/build/apple/AppleMaps.types';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CampusMapLayersSheet from '@/components/campus/campus-map-layers-sheet';
import {
  CAMPUS_CATEGORY_META,
  CAMPUS_PLACES,
  DEFAULT_CAMPUS_PLACE_ID,
  filterCampusPlaces,
  findCampusPlace,
  searchCampusPlaces,
  type CampusPlace,
  type CampusPlaceCategory,
} from '@/lib/campus-places';
import {
  buildAppleMapsPlaceUrl,
  buildGoogleMapsDirectionsUrl,
} from '@/lib/campus-directions';
import {
  CAMPUS_MAP_LAYER_META,
  CAMPUS_MAP_LAYER_ORDER,
  type CampusMapFeature,
  type CampusMapLayerId,
} from '@/lib/ucsc-map-data';
import {
  useCampusBuildingSearch,
  useCampusMapLayers,
} from '@/lib/use-campus-map-data';
import {
  buttonOpacity,
  campusFonts,
  cardShadow,
  stealthTheme,
} from '@/lib/stealth-theme';
import CampusMaps from '@/modules/campus-maps';

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
  if (process.env.EXPO_OS === 'ios' && !CampusMaps) return 'Open in Maps';
  return 'Get directions';
}

type MapSelection = CampusPlace | CampusMapFeature;

function isCampusPlace(selection: MapSelection): selection is CampusPlace {
  return 'category' in selection;
}

function selectionTint(selection: MapSelection): string {
  if (isCampusPlace(selection)) {
    return CAMPUS_CATEGORY_META[selection.category].tintColor;
  }
  if (selection.layerId) return CAMPUS_MAP_LAYER_META[selection.layerId].color;
  return colors.forest;
}

function selectionLabel(selection: MapSelection): string {
  if (isCampusPlace(selection)) {
    return CAMPUS_CATEGORY_META[selection.category].singularLabel;
  }
  if (selection.kind === 'building') return 'Campus building';
  if (selection.kind === 'transit-stop') return 'Transit stop';
  if (selection.kind === 'parking-lot') return 'Parking';
  if (selection.kind === 'restroom') return 'All-gender restroom';
  if (selection.kind === 'lactation') return 'Lactation space';
  if (selection.kind === 'bike-repair') return 'Bike repair';
  if (selection.kind === 'emergency-phone') return 'Emergency phone';
  if (selection.kind === 'construction') return 'Construction impact';
  if (selection.kind === 'garden') return 'Campus garden';
  if (selection.kind === 'recreation') return 'Recreation';
  return 'Point of interest';
}

function searchIconName(
  selection: MapSelection,
): keyof typeof Ionicons.glyphMap {
  if (isCampusPlace(selection)) return placeIconName(selection.category);
  if (selection.kind === 'building') return 'business';
  if (selection.kind === 'transit-stop') return 'bus';
  if (selection.kind === 'parking-lot') return 'car';
  if (selection.kind === 'construction') return 'hammer';
  if (selection.kind === 'garden' || selection.kind === 'recreation') return 'leaf';
  return 'location';
}

function featureActionLabel(feature: CampusMapFeature): string {
  if (process.env.EXPO_OS === 'ios' && !CampusMaps) return 'Open in Maps';
  return 'Get directions';
}

type MapHeaderProps = {
  activeCategory: CampusPlaceCategory;
  query: string;
  searchResults: MapSelection[];
  searchStatus: 'idle' | 'loading' | 'ready' | 'error';
  searchError: string | null;
  activeLayerCount: number;
  topInset: number;
  onCategoryChange: (category: CampusPlaceCategory) => void;
  onQueryChange: (value: string) => void;
  onSelectionPress: (selection: MapSelection) => void;
  onLayersPress: () => void;
  onMorePress: () => void;
};

function MapHeader({
  activeCategory,
  query,
  searchResults,
  searchStatus,
  searchError,
  activeLayerCount,
  topInset,
  onCategoryChange,
  onQueryChange,
  onSelectionPress,
  onLayersPress,
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
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="Choose campus map layers"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onLayersPress}
            style={({ pressed }) => [
              styles.headerActionButton,
              activeLayerCount > 0 ? styles.headerActionButtonActive : null,
              { opacity: buttonOpacity(pressed) },
            ]}
          >
            <Ionicons
              name="layers-outline"
              size={23}
              color={activeLayerCount > 0 ? colors.softWhite : colors.ink}
            />
            {activeLayerCount > 0 ? (
              <Text style={styles.activeLayerCount}>{activeLayerCount}</Text>
            ) : null}
          </Pressable>
          <Pressable
            accessibilityLabel="Open more campus tools"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onMorePress}
            style={({ pressed }) => [
              styles.headerActionButton,
              { opacity: buttonOpacity(pressed) },
            ]}
          >
            <Ionicons name="menu" size={28} color={colors.ink} />
          </Pressable>
        </View>
      </View>

      <View style={styles.searchField}>
        <Ionicons name="search" size={22} color={colors.ink} />
        <TextInput
          accessibilityLabel="Search campus"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={onQueryChange}
          placeholder="Search buildings and places"
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
          {searchResults.length > 0 ? (
            searchResults.slice(0, 8).map((selection, index) => (
              <Pressable
                key={selection.id}
                accessibilityRole="button"
                onPress={() => onSelectionPress(selection)}
                style={({ pressed }) => [
                  styles.searchResult,
                  index > 0 ? styles.searchResultBorder : null,
                  { opacity: buttonOpacity(pressed) },
                ]}
              >
                <Ionicons
                  name={searchIconName(selection)}
                  size={18}
                  color={selectionTint(selection)}
                />
                <View style={styles.searchResultCopy}>
                  <Text numberOfLines={1} style={styles.searchResultLabel}>
                    {selection.shortName}
                  </Text>
                  <Text numberOfLines={1} style={styles.searchResultDescription}>
                    {selection.description}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
              </Pressable>
            ))
          ) : searchStatus === 'loading' ? (
            <View style={styles.searchStatusRow}>
              <ActivityIndicator color={colors.forest} size="small" />
              <Text style={styles.noResults}>Searching UCSC buildings…</Text>
            </View>
          ) : searchError ? (
            <Text style={styles.noResults}>{searchError}</Text>
          ) : query.trim().length < 2 ? (
            <Text style={styles.noResults}>Keep typing to search campus buildings.</Text>
          ) : (
            <Text style={styles.noResults}>No campus buildings or places match.</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

function PlaceSheet({
  selection,
  onAction,
}: {
  selection: MapSelection;
  onAction: (selection: MapSelection) => void;
}) {
  const tintColor = selectionTint(selection);
  const useDarkIcon = isCampusPlace(selection) && selection.category === 'study';

  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHandle} />
      <View style={styles.sheetContent}>
        <View style={styles.pinWrap}>
          <View style={[styles.placePin, { backgroundColor: tintColor }]}>
            <View style={styles.placePinIcon}>
              <Ionicons
                name={searchIconName(selection)}
                size={24}
                color={useDarkIcon ? colors.ink : colors.softWhite}
              />
            </View>
          </View>
        </View>
        <View style={styles.placeCopy}>
          <Text style={styles.placeEyebrow}>{selectionLabel(selection)}</Text>
          <Text numberOfLines={2} style={styles.placeTitle}>
            {selection.shortName}
          </Text>
          <Text numberOfLines={2} style={styles.placeDescription}>
            {selection.description}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => onAction(selection)}
        style={({ pressed }) => [styles.sheetAction, { opacity: buttonOpacity(pressed) }]}
      >
        <Text style={styles.sheetActionLabel}>
          {isCampusPlace(selection) ? actionLabel(selection) : featureActionLabel(selection)}
        </Text>
        <Ionicons name="arrow-forward" size={23} color={colors.softWhite} />
      </Pressable>
    </View>
  );
}

function FallbackPlaceList({
  selections,
  onSelectionPress,
  bottomInset,
}: {
  selections: MapSelection[];
  onSelectionPress: (selection: MapSelection) => void;
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
        Choose a place for campus tools or directions.
      </Text>
      {selections.length > 0 ? (
        selections.map((selection) => {
          const tintColor = selectionTint(selection);
          const useDarkIcon = isCampusPlace(selection) && selection.category === 'study';
          return (
            <Pressable
              key={selection.id}
              accessibilityRole="button"
              onPress={() => onSelectionPress(selection)}
              style={({ pressed }) => [
                styles.fallbackCard,
                { opacity: buttonOpacity(pressed) },
              ]}
            >
              <View style={[styles.fallbackIcon, { backgroundColor: tintColor }]}>
                <Ionicons
                  name={searchIconName(selection)}
                  size={23}
                  color={useDarkIcon ? colors.ink : colors.softWhite}
                />
              </View>
              <View style={styles.fallbackCopy}>
                <Text style={styles.fallbackCardTitle}>{selection.shortName}</Text>
                <Text numberOfLines={2} style={styles.fallbackCardDescription}>
                  {selection.description}
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
  const [selectedSelection, setSelectedSelection] = useState<MapSelection | null>(() =>
    findCampusPlace(DEFAULT_CAMPUS_PLACE_ID),
  );
  const [activeLayerIds, setActiveLayerIds] = useState<Set<CampusMapLayerId>>(
    () => new Set(),
  );
  const [layersVisible, setLayersVisible] = useState(false);
  const { states: layerStates, loadLayer, retryLayer } = useCampusMapLayers();
  const buildingSearch = useCampusBuildingSearch(query);

  const browsePlaces = useMemo(
    () => filterCampusPlaces(activeCategory, ''),
    [activeCategory],
  );

  const localSearchResults = useMemo(() => searchCampusPlaces(query), [query]);
  const searchResults = useMemo<MapSelection[]>(() => {
    const curatedNames = new Set(
      localSearchResults.flatMap((place) => [place.name, place.shortName]).map((name) =>
        name.toLocaleLowerCase(),
      ),
    );
    const buildings = buildingSearch.results.filter(
      (building) => !curatedNames.has(building.name.toLocaleLowerCase()),
    );
    return [...localSearchResults, ...buildings].slice(0, 8);
  }, [buildingSearch.results, localSearchResults]);

  const activeLayerFeatures = useMemo(
    () =>
      CAMPUS_MAP_LAYER_ORDER.filter((layerId) => activeLayerIds.has(layerId)).flatMap(
        (layerId) => layerStates[layerId]?.data.features ?? [],
      ),
    [activeLayerIds, layerStates],
  );

  const markerSelections = useMemo<MapSelection[]>(() => {
    const selections = new Map<string, MapSelection>();
    browsePlaces.forEach((place) => selections.set(place.id, place));
    activeLayerFeatures.forEach((feature) => selections.set(feature.id, feature));
    if (selectedSelection) {
      selections.set(selectedSelection.id, selectedSelection);
    }
    return [...selections.values()];
  }, [activeLayerFeatures, browsePlaces, selectedSelection]);

  const selectionsById = useMemo(
    () => new Map(markerSelections.map((selection) => [selection.id, selection])),
    [markerSelections],
  );

  const markers = useMemo<AppleMaps.Marker[]>(
    () =>
      markerSelections.map((selection) => ({
        id: selection.id,
        title: selection.shortName,
        systemImage: selection.systemImage,
        tintColor: selectionTint(selection),
        coordinates: selection.coordinates,
      })),
    [markerSelections],
  );

  const polylines = useMemo<AppleMapsPolyline[]>(
    () =>
      CAMPUS_MAP_LAYER_ORDER.filter((layerId) => activeLayerIds.has(layerId)).flatMap(
        (layerId) =>
          (layerStates[layerId]?.data.polylines ?? []).map((polyline) => ({
            id: polyline.id,
            coordinates: polyline.coordinates,
            color: CAMPUS_MAP_LAYER_META[layerId].color,
            width: 3,
          })),
      ),
    [activeLayerIds, layerStates],
  );

  const polygons = useMemo<AppleMapsPolygon[]>(
    () =>
      CAMPUS_MAP_LAYER_ORDER.filter((layerId) => activeLayerIds.has(layerId)).flatMap(
        (layerId) =>
          (layerStates[layerId]?.data.polygons ?? []).map((polygon) => ({
            id: polygon.id,
            coordinates: polygon.coordinates,
            color: `${CAMPUS_MAP_LAYER_META[layerId].color}26`,
            lineColor: CAMPUS_MAP_LAYER_META[layerId].color,
            lineWidth: 2,
          })),
      ),
    [activeLayerIds, layerStates],
  );

  const selectSelection = (selection: MapSelection) => {
    Keyboard.dismiss();
    setSelectedSelection(selection);
    setQuery('');
    mapRef.current?.setCameraPosition({ coordinates: selection.coordinates, zoom: 16 });
    requestAnimationFrame(() => {
      mapRef.current?.selectMarker(selection.id, { moveCamera: false });
    });
  };

  const changeCategory = (category: CampusPlaceCategory) => {
    setActiveCategory(category);
    setQuery('');
    const firstPlace = CAMPUS_PLACES.find((place) => place.category === category) ?? null;
    setSelectedSelection(firstPlace);
    if (firstPlace) {
      mapRef.current?.setCameraPosition({ coordinates: firstPlace.coordinates, zoom: 14.5 });
    }
  };

  const openSelection = async (selection: MapSelection) => {
    if (isCampusPlace(selection) && selection.category === 'dining' && selection.diningLocationId) {
      router.push({
        pathname: '/(tabs)/menu',
        params: { locationId: selection.diningLocationId },
      });
      return;
    }

    if (isCampusPlace(selection) && selection.category === 'study' && selection.libraryId) {
      router.push({
        pathname: '/rooms',
        params: { library: selection.libraryId },
      });
      return;
    }

    const { latitude, longitude } = selection.coordinates;
    if (process.env.EXPO_OS === 'ios' && CampusMaps) {
      try {
        const didOpen = await CampusMaps.openDirectionsAsync(
          selection.name,
          latitude,
          longitude,
        );
        if (didOpen) return;
      } catch (error) {
        console.warn('Failed to open native Apple Maps directions:', error);
      }
    }

    const directionsUrl =
      process.env.EXPO_OS === 'ios'
        ? buildAppleMapsPlaceUrl(selection)
        : buildGoogleMapsDirectionsUrl(selection);

    try {
      await Linking.openURL(directionsUrl);
    } catch (error) {
      console.warn('Failed to open map directions:', error);
    }
  };

  const toggleLayer = (layerId: CampusMapLayerId, active: boolean) => {
    setActiveLayerIds((current) => {
      const next = new Set(current);
      if (active) next.add(layerId);
      else next.delete(layerId);
      return next;
    });

    if (active) {
      void loadLayer(layerId);
      return;
    }

    if (
      selectedSelection &&
      !isCampusPlace(selectedSelection) &&
      selectedSelection.layerId === layerId
    ) {
      setSelectedSelection(findCampusPlace(DEFAULT_CAMPUS_PLACE_ID));
    }
  };

  const fallbackSelections = query.trim()
    ? searchResults
    : [...browsePlaces, ...activeLayerFeatures].slice(0, 100);

  return (
    <View style={styles.screen}>
      <MapHeader
        activeCategory={activeCategory}
        query={query}
        searchResults={searchResults}
        searchStatus={buildingSearch.status}
        searchError={buildingSearch.error}
        activeLayerCount={activeLayerIds.size}
        topInset={insets.top}
        onCategoryChange={changeCategory}
        onQueryChange={setQuery}
        onSelectionPress={(selection) => {
          if (process.env.EXPO_OS === 'ios') selectSelection(selection);
          else void openSelection(selection);
        }}
        onLayersPress={() => setLayersVisible(true)}
        onMorePress={() => router.push('/(tabs)/more')}
      />

      {process.env.EXPO_OS === 'ios' ? (
        <View style={styles.mapShell}>
          <AppleMaps.View
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            cameraPosition={CAMPUS_CAMERA}
            colorScheme={AppleMaps.MapColorScheme.LIGHT}
            markers={markers}
            polygons={polygons}
            polylines={polylines}
            onMapClick={() => {
              Keyboard.dismiss();
              setQuery('');
            }}
            onMarkerClick={(marker) => {
              if (!marker.id) return;
              const selection = selectionsById.get(marker.id);
              if (selection) selectSelection(selection);
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
          {selectedSelection ? (
            <PlaceSheet selection={selectedSelection} onAction={openSelection} />
          ) : null}
        </View>
      ) : (
        <FallbackPlaceList
          selections={fallbackSelections}
          onSelectionPress={openSelection}
          bottomInset={insets.bottom}
        />
      )}

      <CampusMapLayersSheet
        visible={layersVisible}
        activeLayerIds={activeLayerIds}
        states={layerStates}
        onClose={() => setLayersVisible(false)}
        onToggle={toggleLayer}
        onRetry={retryLayer}
      />
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerActionButton: {
    width: 42,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 21,
  },
  headerActionButtonActive: {
    width: 52,
    paddingHorizontal: 8,
    backgroundColor: colors.forest,
  },
  activeLayerCount: {
    color: colors.softWhite,
    fontFamily: campusFonts.sansSemibold,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
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
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  searchResultBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  searchResultCopy: {
    flex: 1,
  },
  searchResultLabel: {
    color: colors.ink,
    fontFamily: campusFonts.sansMedium,
    fontSize: 15,
    lineHeight: 19,
  },
  searchResultDescription: {
    color: colors.textMuted,
    fontFamily: campusFonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  searchStatusRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 13,
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
