import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from '@/lib/api';
import {
  chooseAvailableLocationId,
  sortDiningLocations,
} from '@/lib/dining-locations';
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

function isTodayOrFuture(date: string): boolean {
  return date >= todayInPacific();
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function chooseDefaultMeal(menu: DiningMenu): string | null {
  return (
    menu.recommendedPublishedMealId ??
    menu.meals.find((meal) => meal.id === menu.serviceSchedule.activePeriodId)?.id ??
    menu.meals[0]?.id ??
    null
  );
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

function formatSpecialHoursRange(hours: { opensAt: string | null; closesAt: string | null } | null) {
  if (!hours?.opensAt || !hours?.closesAt) return 'Closed';

  function formatTime(value: string): string {
    const [hoursRaw, minutesRaw] = value.split(':');
    const hours24 = Number(hoursRaw);
    const minutes = Number(minutesRaw ?? '0');
    const meridiem = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 || 12;
    if (minutes === 0) return `${hours12} ${meridiem}`;
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${meridiem}`;
  }

  return `${formatTime(hours.opensAt)} - ${formatTime(hours.closesAt)}`;
}

function Chip({
  label,
  selected,
  disabled = false,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : null,
        disabled ? styles.chipDisabled : null,
        { opacity: buttonOpacity(pressed, disabled) },
      ]}
    >
      <Text
        style={[
          styles.chipLabel,
          selected ? styles.chipLabelSelected : null,
          disabled ? styles.chipLabelDisabled : null,
        ]}
      >
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
  const params = useLocalSearchParams<{ locationId?: string | string[] }>();
  const requestedLocationId = firstParam(params.locationId);
  const [locations, setLocations] = useState<DiningLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState(DEFAULT_LOCATION_ID);
  const [selectedDate, setSelectedDate] = useState(todayInPacific);
  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);
  const [menu, setMenu] = useState<DiningMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [staleSavedAt, setStaleSavedAt] = useState<string | null>(null);
  const menuRequestControllerRef = useRef<AbortController | null>(null);
  const handledRequestedLocationRef = useRef<string | null>(null);

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

  const loadLocations = useCallback(async (date: string) => {
    const result = await getDiningLocations(date);
    const sortedLocations = sortDiningLocations(result.locations);
    setLocations(sortedLocations);
    return sortedLocations;
  }, []);

  const applyMenu = useCallback((nextMenu: DiningMenu, staleAt: string | null = null) => {
    setMenu(nextMenu);
    setSelectedDate(nextMenu.date);
    setSelectedMealId(chooseDefaultMeal(nextMenu));
    setStaleSavedAt(staleAt);
  }, []);

  const clearDisplayedMenu = useCallback(() => {
    setMenu(null);
    setSelectedMealId(null);
    setStaleSavedAt(null);
  }, []);

  const loadMenu = useCallback(
    async (
      locationId: string,
      date: string,
      options?: { showBlockingLoader?: boolean; showRefreshing?: boolean }
    ) => {
      menuRequestControllerRef.current?.abort();
      const requestController = new AbortController();
      menuRequestControllerRef.current = requestController;
      const isCurrentRequest = () =>
        menuRequestControllerRef.current === requestController && !requestController.signal.aborted;

      if (options?.showBlockingLoader) setLoading(true);
      if (options?.showRefreshing) setRefreshing(true);
      setErrorMessage(null);

      if (!isTodayOrFuture(date)) {
        if (isCurrentRequest()) {
          setErrorMessage('Past dining menus are not available.');
          menuRequestControllerRef.current = null;
          if (options?.showBlockingLoader) setLoading(false);
          if (options?.showRefreshing) setRefreshing(false);
        }
        return;
      }

      try {
        const nextMenu = await getDiningMenu(
          { locationId, date },
          { signal: requestController.signal }
        );
        if (!isCurrentRequest()) return;

        applyMenu(nextMenu);
        void saveMenuCache(nextMenu).catch((error) => {
          console.warn('Failed to cache dining menu:', error);
        });
      } catch (error: any) {
        if (!isCurrentRequest()) return;

        const cached = await readMenuCache(locationId, date);
        if (!isCurrentRequest()) return;

        if (cached && isTodayOrFuture(cached.menu.date)) {
          applyMenu(cached.menu, cached.savedAt);
          setErrorMessage(error?.message || 'Showing the last loaded menu');
        } else {
          setErrorMessage(error?.message || 'Failed to load dining menu');
        }
      } finally {
        if (menuRequestControllerRef.current === requestController) {
          menuRequestControllerRef.current = null;
          if (options?.showBlockingLoader) setLoading(false);
          if (options?.showRefreshing) setRefreshing(false);
        }
      }
    },
    [applyMenu, readMenuCache, saveMenuCache]
  );

  useEffect(() => {
    let active = true;

    async function loadInitialState() {
      setLoading(true);
      const storedLocationId = await AsyncStorage.getItem(LAST_LOCATION_KEY).catch(() => null);
      const preferredLocationId = requestedLocationId || storedLocationId || DEFAULT_LOCATION_ID;
      const initialDate = todayInPacific();

      if (!active) return;
      if (requestedLocationId) {
        handledRequestedLocationRef.current = requestedLocationId;
      }
      let initialLocations: DiningLocation[] = [];
      try {
        initialLocations = await loadLocations(initialDate);
      } catch (error) {
        console.warn('Failed to load dining location availability:', error);
      }
      if (!active) return;

      const initialLocationId =
        chooseAvailableLocationId(initialLocations, [preferredLocationId]) ??
        preferredLocationId;
      setSelectedLocationId(initialLocationId);
      setSelectedDate(initialDate);

      await loadMenu(initialLocationId, initialDate);

      if (active) setLoading(false);
    }

    void loadInitialState();

    return () => {
      active = false;
      const activeRequest = menuRequestControllerRef.current;
      menuRequestControllerRef.current = null;
      activeRequest?.abort();
    };
  }, [loadLocations, loadMenu]);

  useEffect(() => {
    if (
      !requestedLocationId ||
      handledRequestedLocationRef.current === requestedLocationId
    ) {
      return;
    }
    if (loading && !menu) return;

    const locationId =
      chooseAvailableLocationId(locations, [requestedLocationId]) ??
      requestedLocationId;
    handledRequestedLocationRef.current = locationId;

    async function loadRequestedLocation() {
      setSelectedLocationId(locationId);
      clearDisplayedMenu();
      void AsyncStorage.setItem(LAST_LOCATION_KEY, locationId).catch((error) => {
        console.warn('Failed to remember dining location:', error);
      });
      await loadMenu(locationId, selectedDate, { showBlockingLoader: true });
    }

    void loadRequestedLocation();
  }, [
    clearDisplayedMenu,
    loadMenu,
    loading,
    locations,
    menu,
    requestedLocationId,
    selectedDate,
    selectedLocationId,
  ]);

  const handleLocationPress = useCallback(
    async (locationId: string) => {
      setSelectedLocationId(locationId);
      clearDisplayedMenu();
      void AsyncStorage.setItem(LAST_LOCATION_KEY, locationId).catch((error) => {
        console.warn('Failed to remember dining location:', error);
      });
      await loadMenu(locationId, selectedDate, { showBlockingLoader: true });
    },
    [clearDisplayedMenu, loadMenu, selectedDate]
  );

  const handleDatePress = useCallback(
    async (date: string) => {
      setSelectedDate(date);
      clearDisplayedMenu();
      setLoading(true);

      let locationId = selectedLocationId;
      try {
        const nextLocations = await loadLocations(date);
        locationId =
          chooseAvailableLocationId(nextLocations, [selectedLocationId]) ??
          selectedLocationId;
      } catch (error) {
        console.warn('Failed to refresh dining location availability:', error);
      }

      setSelectedLocationId(locationId);
      if (locationId !== selectedLocationId) {
        void AsyncStorage.setItem(LAST_LOCATION_KEY, locationId).catch((error) => {
          console.warn('Failed to remember dining location:', error);
        });
      }
      await loadMenu(locationId, date, { showBlockingLoader: true });
    },
    [clearDisplayedMenu, loadLocations, loadMenu, selectedLocationId]
  );

  const onRefresh = useCallback(async () => {
    await Promise.allSettled([
      loadLocations(selectedDate),
      loadMenu(selectedLocationId, selectedDate, { showRefreshing: true }),
    ]);
  }, [loadLocations, loadMenu, selectedDate, selectedLocationId]);

  const availableDates = (
    menu?.availableDates.length
      ? menu.availableDates
      : [{ date: selectedDate, label: formatDateLabel(selectedDate) }]
  ).filter((dateOption) => isTodayOrFuture(dateOption.date));

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

      {menu?.serviceSchedule.currentStatusLabel ? (
        <View style={styles.notice}>
          <Ionicons name="time-outline" size={18} color={colors.brand} />
          <Text selectable style={styles.noticeText}>
            {menu.serviceSchedule.currentStatusLabel}
          </Text>
        </View>
      ) : null}

      {menu?.serviceSchedule.specialHours ? (
        <View style={styles.notice}>
          <Ionicons name="calendar-outline" size={18} color={colors.brand} />
          <Text selectable style={styles.noticeText}>
            Special hours: {formatSpecialHoursRange(menu.serviceSchedule.specialHours)}
          </Text>
        </View>
      ) : null}

      {menu?.serviceSchedule.note ? (
        <View style={styles.notice}>
          <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
          <Text selectable style={styles.noticeText}>
            {menu.serviceSchedule.note}
          </Text>
        </View>
      ) : null}

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
          style={styles.horizontalRail}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {locations.length > 0 ? (
            locations.map((location) => (
              <Chip
                key={location.id}
                label={location.closed ? `${location.name} · Closed` : location.name}
                selected={location.id === selectedLocationId}
                disabled={Boolean(location.closed)}
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
          style={styles.horizontalRail}
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
            menu?.meals.length === 0
              ? 'No menu has been published for this location and date.'
              : menu
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
  horizontalRail: {
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  rail: {
    gap: 4,
    paddingLeft: 0,
    paddingRight: 0,
  },
  chip: {
    minHeight: 38,
    maxWidth: 260,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: stealthTheme.radii.sm,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.accentMuted,
  },
  chipDisabled: {
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
  },
  chipLabel: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  chipLabelSelected: {
    color: colors.brandInk,
  },
  chipLabelDisabled: {
    color: colors.textSoft,
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
