import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  type DiningLocation,
  type DiningMenu,
} from '@/lib/api';
import { chooseAvailableLocationId } from '@/lib/dining-locations';
import {
  getDiningMenuWindow,
  hydrateDiningMenuCache,
  isDiningCacheFresh,
  peekDiningLocations,
  peekDiningMenu,
  refreshDiningLocations,
  refreshDiningMenu,
  syncDiningMenuWindow,
} from '@/lib/dining-menu-cache';
import {
  buttonOpacity,
  campusFonts,
  stealthTheme,
  typeScale,
} from '../../lib/stealth-theme';

const colors = stealthTheme.colors;
const DEFAULT_LOCATION_ID = '40';
const LAST_LOCATION_KEY = 'slugswap:menus:last-location';

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
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ locationId?: string | string[] }>();
  const requestedLocationId = firstParam(params.locationId);
  const [locations, setLocations] = useState<DiningLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState(DEFAULT_LOCATION_ID);
  const [selectedDate, setSelectedDate] = useState(todayInPacific);
  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);
  const [menu, setMenu] = useState<DiningMenu | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [staleSavedAt, setStaleSavedAt] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const menuRequestIdRef = useRef(0);
  const selectionRef = useRef({
    locationId: DEFAULT_LOCATION_ID,
    date: todayInPacific(),
  });
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

  const showSelection = useCallback(
    (locationId: string, date: string) => {
      selectionRef.current = { locationId, date };
      setSelectedLocationId(locationId);
      setSelectedDate(date);
      setErrorMessage(null);

      const cached = peekDiningMenu(locationId, date);
      if (cached) {
        applyMenu(cached.menu);
      } else {
        clearDisplayedMenu();
      }
    },
    [applyMenu, clearDisplayedMenu]
  );

  const loadLocations = useCallback(
    async (date: string, options?: { forceRefresh?: boolean }) => {
      const cached = peekDiningLocations(date);
      if (cached && selectionRef.current.date === date) {
        setLocations(cached.locations);
      }
      if (!options?.forceRefresh && isDiningCacheFresh(cached?.savedAt)) {
        return cached?.locations ?? [];
      }

      try {
        const refreshed = await refreshDiningLocations(date);
        if (selectionRef.current.date === date) {
          setLocations(refreshed.locations);
        }
        return refreshed.locations;
      } catch (error) {
        if (!cached) {
          console.warn('Failed to load dining location availability:', error);
        }
        return cached?.locations ?? [];
      }
    },
    []
  );

  const loadMenu = useCallback(
    async (
      locationId: string,
      date: string,
      options?: { forceRefresh?: boolean; showRefreshing?: boolean }
    ) => {
      const requestId = menuRequestIdRef.current + 1;
      menuRequestIdRef.current = requestId;
      const isCurrentRequest = () => menuRequestIdRef.current === requestId;
      const cached = peekDiningMenu(locationId, date);

      if (options?.showRefreshing) setRefreshing(true);
      setErrorMessage(null);

      if (cached) {
        applyMenu(cached.menu);
      } else {
        clearDisplayedMenu();
      }

      if (!isTodayOrFuture(date)) {
        if (isCurrentRequest()) {
          setErrorMessage('Past dining menus are not available.');
          if (options?.showRefreshing) setRefreshing(false);
        }
        return;
      }

      if (!options?.forceRefresh && isDiningCacheFresh(cached?.savedAt)) {
        if (options?.showRefreshing) setRefreshing(false);
        return;
      }

      try {
        const refreshed = await refreshDiningMenu(locationId, date);
        if (!isCurrentRequest()) return;
        applyMenu(refreshed.menu);
      } catch (error: any) {
        if (!isCurrentRequest()) return;
        if (cached && isTodayOrFuture(cached.menu.date)) {
          applyMenu(cached.menu, cached.savedAt);
        } else {
          setErrorMessage(error?.message || 'Failed to load dining menu');
        }
      } finally {
        if (isCurrentRequest()) {
          if (options?.showRefreshing) setRefreshing(false);
        }
      }
    },
    [applyMenu, clearDisplayedMenu]
  );

  useEffect(() => {
    let active = true;

    async function loadInitialState() {
      const initialDate = todayInPacific();
      const [, storedLocationId] = await Promise.all([
        hydrateDiningMenuCache(initialDate),
        AsyncStorage.getItem(LAST_LOCATION_KEY).catch(() => null),
      ]);
      const preferredLocationId = requestedLocationId || storedLocationId || DEFAULT_LOCATION_ID;

      if (!active) return;
      if (requestedLocationId) {
        handledRequestedLocationRef.current = requestedLocationId;
      }

      const cachedLocations = peekDiningLocations(initialDate)?.locations ?? [];
      if (cachedLocations.length) setLocations(cachedLocations);

      const initialLocationId =
        chooseAvailableLocationId(cachedLocations, [preferredLocationId]) ??
        preferredLocationId;
      showSelection(initialLocationId, initialDate);
      setInitialized(true);

      const freshLocations = await loadLocations(initialDate, {
        forceRefresh: true,
      });
      if (!active) return;

      const availableLocationId =
        chooseAvailableLocationId(freshLocations, [initialLocationId]) ??
        initialLocationId;
      if (availableLocationId !== initialLocationId) {
        showSelection(availableLocationId, initialDate);
        void AsyncStorage.setItem(LAST_LOCATION_KEY, availableLocationId).catch(
          (error) => {
            console.warn('Failed to remember dining location:', error);
          }
        );
      }
      await loadMenu(availableLocationId, initialDate, { forceRefresh: true });
    }

    void loadInitialState();

    return () => {
      active = false;
      menuRequestIdRef.current += 1;
    };
  }, [loadLocations, loadMenu, showSelection]);

  useFocusEffect(
    useCallback(() => {
      const windowStart = todayInPacific();
      void syncDiningMenuWindow(windowStart).catch((error) => {
        console.warn('Failed to refresh weekly dining menus:', error);
      });
    }, [])
  );

  useEffect(() => {
    if (
      !initialized ||
      !requestedLocationId ||
      handledRequestedLocationRef.current === requestedLocationId
    ) {
      return;
    }

    const locationId =
      chooseAvailableLocationId(locations, [requestedLocationId]) ??
      requestedLocationId;
    handledRequestedLocationRef.current = requestedLocationId;

    async function loadRequestedLocation() {
      showSelection(locationId, selectedDate);
      void AsyncStorage.setItem(LAST_LOCATION_KEY, locationId).catch((error) => {
        console.warn('Failed to remember dining location:', error);
      });
      await loadMenu(locationId, selectedDate);
    }

    void loadRequestedLocation();
  }, [
    initialized,
    loadMenu,
    locations,
    requestedLocationId,
    selectedDate,
    showSelection,
  ]);

  const handleLocationPress = useCallback(
    (locationId: string) => {
      showSelection(locationId, selectedDate);
      void AsyncStorage.setItem(LAST_LOCATION_KEY, locationId).catch((error) => {
        console.warn('Failed to remember dining location:', error);
      });
      void loadMenu(locationId, selectedDate);
    },
    [loadMenu, selectedDate, showSelection]
  );

  const handleDatePress = useCallback(
    (date: string) => {
      const cachedLocations = peekDiningLocations(date)?.locations ?? [];
      if (cachedLocations.length) setLocations(cachedLocations);
      const locationId =
        chooseAvailableLocationId(cachedLocations, [selectedLocationId]) ??
        selectedLocationId;
      showSelection(locationId, date);
      if (locationId !== selectedLocationId) {
        void AsyncStorage.setItem(LAST_LOCATION_KEY, locationId).catch((error) => {
          console.warn('Failed to remember dining location:', error);
        });
      }

      void loadMenu(locationId, date);
      void loadLocations(date, { forceRefresh: true }).then((nextLocations) => {
        if (selectionRef.current.date !== date) return;
        const availableLocationId =
          chooseAvailableLocationId(nextLocations, [selectionRef.current.locationId]) ??
          selectionRef.current.locationId;
        if (availableLocationId === selectionRef.current.locationId) return;

        showSelection(availableLocationId, date);
        void AsyncStorage.setItem(LAST_LOCATION_KEY, availableLocationId).catch(
          (error) => {
            console.warn('Failed to remember dining location:', error);
          }
        );
        void loadMenu(availableLocationId, date);
      });
    },
    [loadLocations, loadMenu, selectedLocationId, showSelection]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const nextLocations = await loadLocations(selectedDate, {
        forceRefresh: true,
      });
      const locationId =
        chooseAvailableLocationId(nextLocations, [selectedLocationId]) ??
        selectedLocationId;
      if (locationId !== selectedLocationId) {
        showSelection(locationId, selectedDate);
      }
      await loadMenu(locationId, selectedDate, { forceRefresh: true });
    } finally {
      setRefreshing(false);
    }
  }, [loadLocations, loadMenu, selectedDate, selectedLocationId, showSelection]);

  const availableDates = (
    menu?.availableDates.length
      ? menu.availableDates
      : getDiningMenuWindow(todayInPacific()).map((date) => ({
          date,
          label: formatDateLabel(date),
        }))
  ).filter((dateOption) => isTodayOrFuture(dateOption.date));

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
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 104,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerTopline}>
          <Text style={styles.eyebrow}>UCSC CAMPUS DINING</Text>
          <View style={styles.liveBadge}>
            <View style={[styles.liveDot, staleSavedAt ? styles.savedDot : null]} />
            <Text style={styles.liveBadgeText}>
              {staleSavedAt ? 'Saved menu' : menu ? 'Live menu' : 'Campus menus'}
            </Text>
          </View>
        </View>
        <Text selectable style={styles.title}>Dining</Text>
        <Text selectable style={styles.subtitle}>
          Browse what’s being served across campus.
        </Text>
      </View>

      <View style={styles.locationBlock}>
        <View style={styles.locationIcon}>
          <Ionicons name="location" size={20} color={colors.surface} />
        </View>
        <View style={styles.locationCopy}>
          <Text style={styles.locationLabel}>Dining hall</Text>
          <Text selectable numberOfLines={1} style={styles.locationName}>
            {selectedLocation?.name ?? 'Choose a location'}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={19} color={colors.brand} />
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
        <View style={styles.controlHeading}>
          <Text style={styles.controlLabel}>Location</Text>
          <Text style={styles.controlHint}>Swipe to change</Text>
        </View>
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
        <Text style={styles.controlLabel}>Day</Text>
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
          <Text style={styles.controlLabel}>Meal period</Text>
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
          <View style={styles.menuHeadingRow}>
            <View>
              <Text selectable style={styles.menuEyebrow}>
                {menu?.sourceDateLabel ?? formatDateLabel(selectedDate)}
              </Text>
              <Text selectable style={styles.menuHeading}>{selectedMeal.name}</Text>
            </View>
            <Ionicons name="restaurant-outline" size={24} color={colors.brand} />
          </View>
          {selectedMeal.sections.map((section) => (
            <View key={section.name} style={styles.sectionCard}>
              <View style={styles.sectionHeadingRow}>
                <Text selectable style={styles.sectionTitle}>
                  {section.name}
                </Text>
                <View style={styles.sectionRule} />
              </View>
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
    gap: 20,
    paddingHorizontal: 20,
  },
  header: {
    gap: 4,
    paddingTop: 2,
  },
  headerTopline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  liveBadge: {
    minHeight: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    borderRadius: stealthTheme.radii.pill,
    backgroundColor: colors.surfaceStrong,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  savedDot: {
    backgroundColor: colors.warning,
  },
  liveBadgeText: {
    fontFamily: campusFonts.sansSemibold,
    fontSize: 11,
    lineHeight: 14,
    color: colors.brand,
  },
  eyebrow: {
    ...typeScale.eyebrow,
    color: colors.brand,
  },
  title: {
    fontFamily: campusFonts.serifSemibold,
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -0.8,
    color: colors.text,
  },
  subtitle: {
    ...typeScale.body,
    color: colors.textMuted,
  },
  locationBlock: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: stealthTheme.radii.md,
    backgroundColor: colors.surface,
  },
  locationIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: colors.brand,
  },
  locationCopy: {
    flex: 1,
    gap: 1,
  },
  locationLabel: {
    fontFamily: campusFonts.sansMedium,
    fontSize: 11,
    lineHeight: 14,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  locationName: {
    fontFamily: campusFonts.sansSemibold,
    fontSize: 17,
    lineHeight: 21,
    color: colors.text,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 1,
  },
  noticeText: {
    flex: 1,
    ...typeScale.caption,
    color: colors.textMuted,
  },
  controlGroup: {
    gap: 9,
  },
  controlHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlLabel: {
    ...typeScale.eyebrow,
    color: colors.text,
  },
  controlHint: {
    ...typeScale.caption,
    color: colors.textSoft,
  },
  horizontalRail: {
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  rail: {
    gap: 8,
    paddingLeft: 0,
    paddingRight: 0,
  },
  chip: {
    minHeight: 42,
    maxWidth: 260,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  chipDisabled: {
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
  },
  chipLabel: {
    ...typeScale.caption,
    color: colors.text,
  },
  chipLabelSelected: {
    color: colors.surface,
  },
  chipLabelDisabled: {
    color: colors.textSoft,
  },
  segmented: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 0,
    backgroundColor: 'transparent',
  },
  segment: {
    minHeight: 44,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  segmentSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  segmentLabel: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  segmentLabelSelected: {
    color: colors.surface,
  },
  menuStack: {
    gap: 22,
    paddingTop: 4,
  },
  menuHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 2,
  },
  menuEyebrow: {
    ...typeScale.eyebrow,
    marginBottom: 2,
    color: colors.textMuted,
  },
  menuHeading: {
    fontFamily: campusFonts.serifSemibold,
    fontSize: 30,
    lineHeight: 34,
    color: colors.text,
  },
  sectionCard: {
    gap: 12,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    fontFamily: campusFonts.serifSemibold,
    fontSize: 24,
    lineHeight: 28,
    color: colors.text,
  },
  sectionRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderStrong,
  },
  itemList: {
    gap: 12,
  },
  itemRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  itemDot: {
    width: 8,
    height: 8,
    marginTop: 6,
    borderRadius: 3,
    backgroundColor: colors.gold,
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
