import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  getDiningLocations,
  getDiningMenu,
  type DiningLocation,
  type DiningMenu,
} from '../../../../lib/api';
import {
  buttonOpacity,
  cardShadow,
  stealthTheme,
  typeScale,
} from '../../lib/stealth-theme';

const colors = stealthTheme.colors;
const DEFAULT_LOCATION_ID = '40';
const LAST_LOCATION_KEY = 'slugswap:menus:last-location';

type CachedMenuPayload = {
  menu: DiningMenu;
  savedAt: string;
};

function menuCacheKey(locationId: string, date: string): string {
  return `slugswap:menus:${locationId}:${date}`;
}

function todayInPacific(): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) return new Date().toISOString().slice(0, 10);
  return `${year}-${month}-${day}`;
}

function currentMealPreference(): string {
  const hourLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    hour12: false,
  }).format(new Date());
  const hour = Number(hourLabel);

  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'late-night';
}

function chooseDefaultMeal(menu: DiningMenu): string | null {
  const preferred = currentMealPreference();
  return menu.meals.find((meal) => meal.id === preferred)?.id ?? menu.meals[0]?.id ?? null;
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Updated recently';

  return `Updated ${date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function formatDateLabel(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;

  return parsed.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={selected ? { selected: true } : undefined}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : null,
        { opacity: buttonOpacity(pressed) },
      ]}
    >
      <Text style={[styles.chipLabel, selected ? styles.chipLabelSelected : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name="restaurant-outline" size={24} color={colors.textMuted} />
      <Text selectable style={styles.emptyText}>
        {message}
      </Text>
    </View>
  );
}

export default function MenuScreen() {
  const [locations, setLocations] = useState<DiningLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState(DEFAULT_LOCATION_ID);
  const [selectedDate, setSelectedDate] = useState(todayInPacific);
  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);
  const [menu, setMenu] = useState<DiningMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [staleSavedAt, setStaleSavedAt] = useState<string | null>(null);

  const selectedLocation = useMemo(
    () =>
      locations.find((location) => location.id === selectedLocationId) ??
      menu?.location ??
      null,
    [locations, menu, selectedLocationId]
  );

  const selectedMeal = useMemo(
    () => menu?.meals.find((meal) => meal.id === selectedMealId) ?? null,
    [menu, selectedMealId]
  );

  const saveMenuCache = useCallback(async (nextMenu: DiningMenu) => {
    const payload: CachedMenuPayload = {
      menu: nextMenu,
      savedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(
      menuCacheKey(nextMenu.location.id, nextMenu.date),
      JSON.stringify(payload)
    );
  }, []);

  const readMenuCache = useCallback(async (locationId: string, date: string) => {
    const raw = await AsyncStorage.getItem(menuCacheKey(locationId, date));
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as CachedMenuPayload;
      if (!parsed?.menu?.location?.id || !parsed.savedAt) return null;
      return parsed;
    } catch {
      return null;
    }
  }, []);

  const loadLocations = useCallback(async () => {
    const result = await getDiningLocations();
    setLocations(result.locations);
  }, []);

  const applyMenu = useCallback((nextMenu: DiningMenu, staleAt: string | null = null) => {
    setMenu(nextMenu);
    setSelectedDate(nextMenu.date);
    setSelectedMealId(chooseDefaultMeal(nextMenu));
    setStaleSavedAt(staleAt);
  }, []);

  const loadMenu = useCallback(
    async (
      locationId: string,
      date: string,
      options?: { showBlockingLoader?: boolean; showRefreshing?: boolean }
    ) => {
      if (options?.showBlockingLoader) setLoading(true);
      if (options?.showRefreshing) setRefreshing(true);
      setErrorMessage(null);

      try {
        const nextMenu = await getDiningMenu({ locationId, date });
        applyMenu(nextMenu);
        await saveMenuCache(nextMenu);
      } catch (error: any) {
        const cached = await readMenuCache(locationId, date);
        if (cached) {
          applyMenu(cached.menu, cached.savedAt);
          setErrorMessage(error?.message || 'Showing the last loaded menu');
        } else {
          setErrorMessage(error?.message || 'Failed to load dining menu');
        }
      } finally {
        if (options?.showBlockingLoader) setLoading(false);
        if (options?.showRefreshing) setRefreshing(false);
      }
    },
    [applyMenu, readMenuCache, saveMenuCache]
  );

  useEffect(() => {
    let active = true;

    async function loadInitialState() {
      setLoading(true);
      const storedLocationId = await AsyncStorage.getItem(LAST_LOCATION_KEY);
      const initialLocationId = storedLocationId || DEFAULT_LOCATION_ID;
      const initialDate = todayInPacific();

      if (!active) return;
      setSelectedLocationId(initialLocationId);
      setSelectedDate(initialDate);

      await Promise.allSettled([loadLocations(), loadMenu(initialLocationId, initialDate)]);

      if (active) setLoading(false);
    }

    void loadInitialState();

    return () => {
      active = false;
    };
  }, [loadLocations, loadMenu]);

  const handleLocationPress = useCallback(
    async (locationId: string) => {
      setSelectedLocationId(locationId);
      await AsyncStorage.setItem(LAST_LOCATION_KEY, locationId);
      await loadMenu(locationId, selectedDate, { showBlockingLoader: true });
    },
    [loadMenu, selectedDate]
  );

  const handleDatePress = useCallback(
    async (date: string) => {
      setSelectedDate(date);
      await loadMenu(selectedLocationId, date, { showBlockingLoader: true });
    },
    [loadMenu, selectedLocationId]
  );

  const onRefresh = useCallback(async () => {
    await Promise.allSettled([
      loadLocations(),
      loadMenu(selectedLocationId, selectedDate, { showRefreshing: true }),
    ]);
  }, [loadLocations, loadMenu, selectedDate, selectedLocationId]);

  const availableDates =
    menu?.availableDates.length
      ? menu.availableDates
      : [{ date: selectedDate, label: formatDateLabel(selectedDate) }];

  if (loading && !menu) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={styles.loadingText}>Loading menus</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.brand}
        />
      }
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="fast-food" size={24} color={colors.brand} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>UCSC Dining</Text>
          <Text selectable style={styles.title}>
            {selectedLocation?.name ?? 'Dining Menu'}
          </Text>
          <Text selectable style={styles.subtitle}>
            {menu?.sourceDateLabel ?? formatDateLabel(selectedDate)}
          </Text>
        </View>
      </View>

      {staleSavedAt ? (
        <View style={styles.notice}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
          <Text selectable style={styles.noticeText}>
            Showing saved data from {formatUpdatedAt(staleSavedAt).replace('Updated ', '')}
          </Text>
        </View>
      ) : null}

      {errorMessage ? (
        <View style={styles.notice}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
          <Text selectable style={styles.noticeText}>
            {errorMessage}
          </Text>
        </View>
      ) : null}

      <View style={styles.controlGroup}>
        <Text style={styles.controlLabel}>Location</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {locations.length > 0 ? (
            locations.map((location) => (
              <Chip
                key={location.id}
                label={location.name}
                selected={location.id === selectedLocationId}
                onPress={() => void handleLocationPress(location.id)}
              />
            ))
          ) : selectedLocation ? (
            <Chip label={selectedLocation.name} selected onPress={() => undefined} />
          ) : null}
        </ScrollView>
      </View>

      <View style={styles.controlGroup}>
        <Text style={styles.controlLabel}>Date</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {availableDates.map((dateOption) => (
            <Chip
              key={dateOption.date}
              label={dateOption.label}
              selected={dateOption.date === selectedDate}
              onPress={() => void handleDatePress(dateOption.date)}
            />
          ))}
        </ScrollView>
      </View>

      {menu?.meals.length ? (
        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>Meal</Text>
          <View style={styles.segmented}>
            {menu.meals.map((meal) => {
              const selected = meal.id === selectedMealId;
              return (
                <Pressable
                  key={meal.id}
                  onPress={() => setSelectedMealId(meal.id)}
                  accessibilityRole="button"
                  accessibilityState={selected ? { selected: true } : undefined}
                  style={({ pressed }) => [
                    styles.segment,
                    selected ? styles.segmentSelected : null,
                    { opacity: buttonOpacity(pressed) },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentLabel,
                      selected ? styles.segmentLabelSelected : null,
                    ]}
                  >
                    {meal.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {selectedMeal ? (
        <View style={styles.menuStack}>
          {selectedMeal.sections.map((section) => (
            <View key={section.name} style={styles.sectionCard}>
              <Text selectable style={styles.sectionTitle}>
                {section.name}
              </Text>
              <View style={styles.itemList}>
                {section.items.map((item) => (
                  <View key={`${section.name}:${item.name}`} style={styles.itemRow}>
                    <View style={styles.itemDot} />
                    <Text selectable style={styles.itemText}>
                      {item.name}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <EmptyState
          message={
            menu
              ? 'No menu items are listed for this meal.'
              : 'No menu data is available yet.'
          }
        />
      )}

      {menu ? (
        <Text selectable style={styles.footerText}>
          {formatUpdatedAt(menu.fetchedAt)}. Menus can change without notice.
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    gap: 18,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.canvas,
  },
  loadingText: {
    ...typeScale.body,
    color: colors.textMuted,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: stealthTheme.radii.lg,
    backgroundColor: colors.surface,
    ...cardShadow('surface'),
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentMuted,
  },
  headerText: {
    flex: 1,
    gap: 3,
  },
  eyebrow: {
    ...typeScale.eyebrow,
    color: colors.brand,
  },
  title: {
    ...typeScale.title,
    color: colors.text,
  },
  subtitle: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: stealthTheme.radii.sm,
    backgroundColor: colors.surfaceMuted,
  },
  noticeText: {
    flex: 1,
    ...typeScale.caption,
    color: colors.textMuted,
  },
  controlGroup: {
    gap: 8,
  },
  controlLabel: {
    ...typeScale.eyebrow,
    color: colors.textMuted,
  },
  rail: {
    gap: 8,
    paddingRight: 18,
  },
  chip: {
    minHeight: 38,
    maxWidth: 260,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: stealthTheme.radii.pill,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.accentMuted,
  },
  chipLabel: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  chipLabelSelected: {
    color: colors.brandInk,
  },
  segmented: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: stealthTheme.radii.md,
    backgroundColor: colors.surfaceStrong,
  },
  segment: {
    minHeight: 38,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: stealthTheme.radii.sm,
  },
  segmentSelected: {
    backgroundColor: colors.surface,
    ...cardShadow('surface'),
  },
  segmentLabel: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  segmentLabelSelected: {
    color: colors.text,
  },
  menuStack: {
    gap: 12,
  },
  sectionCard: {
    gap: 11,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: stealthTheme.radii.md,
    backgroundColor: colors.surface,
  },
  sectionTitle: {
    ...typeScale.title,
    color: colors.text,
  },
  itemList: {
    gap: 10,
  },
  itemRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  itemDot: {
    width: 7,
    height: 7,
    marginTop: 7,
    borderRadius: 4,
    backgroundColor: colors.brand,
  },
  itemText: {
    flex: 1,
    ...typeScale.body,
    color: colors.text,
  },
  emptyState: {
    alignItems: 'center',
    gap: 10,
    padding: 28,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: stealthTheme.radii.md,
    backgroundColor: colors.surface,
  },
  emptyText: {
    ...typeScale.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  footerText: {
    ...typeScale.caption,
    color: colors.textSoft,
    textAlign: 'center',
  },
});
