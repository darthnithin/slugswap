import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getLibraryRoomAvailability } from '@/lib/api';
import {
  buildRoomCheckoutUrl,
  formatReservationDate,
  formatSlotTime,
  getReservationDates,
  LIBRARY_RESERVATION_LOCATIONS,
  LIBRARY_ROOM_POLICIES_URL,
  type LibraryLocationId,
  type LibraryRoomAvailability,
} from '@/lib/library-reservations';
import {
  buttonOpacity,
  campusFonts,
  cardShadow,
  stealthTheme,
  typeScale,
} from '@/lib/stealth-theme';

const colors = stealthTheme.colors;
const COLLAPSED_SLOT_COUNT = 6;

type SelectedSlot = { roomId: number; roomName: string; start: string };

export default function RoomsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ library?: string | string[] }>();
  const requestedLibrary = Array.isArray(params.library) ? params.library[0] : params.library;
  const initialLibrary: LibraryLocationId =
    requestedLibrary === 'science-engineering' ? 'science-engineering' : 'mchenry';
  const reservationDates = useMemo(() => getReservationDates(), []);
  const [selectedLibrary, setSelectedLibrary] = useState<LibraryLocationId>(initialLibrary);
  const [selectedDate, setSelectedDate] = useState(reservationDates[0]);
  const [availability, setAvailability] = useState<Awaited<
    ReturnType<typeof getLibraryRoomAvailability>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [expandedRoomId, setExpandedRoomId] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);

  useEffect(() => {
    if (requestedLibrary === 'mchenry' || requestedLibrary === 'science-engineering') {
      setSelectedLibrary(requestedLibrary);
    }
  }, [requestedLibrary]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSelectedSlot(null);
    setExpandedRoomId(null);

    getLibraryRoomAvailability(
      { library: selectedLibrary, date: selectedDate },
      { signal: controller.signal },
    )
      .then(setAvailability)
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setAvailability(null);
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load UCSC room availability.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      });

    return () => controller.abort();
  }, [reloadKey, selectedDate, selectedLibrary]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setReloadKey((value) => value + 1);
  }, []);

  const availableRooms = useMemo(
    () => availability?.rooms.filter((room) => room.availableSlots.length > 0) ?? [],
    [availability],
  );
  const availableSlotCount = useMemo(
    () => availableRooms.reduce((total, room) => total + room.availableSlots.length, 0),
    [availableRooms],
  );

  const continueToUCSC = useCallback(async () => {
    if (!selectedSlot) return;
    try {
      await Linking.openURL(buildRoomCheckoutUrl(selectedSlot.roomId, selectedSlot.start));
    } catch (openError) {
      console.error('Failed to open UCSC room checkout:', openError);
      Alert.alert('Unable to open UCSC', 'Check your connection and try again.');
    }
  }, [selectedSlot]);

  const renderRoom = useCallback(
    ({ item }: { item: LibraryRoomAvailability }) => {
      const expanded = expandedRoomId === item.id;
      const visibleSlots = expanded
        ? item.availableSlots
        : item.availableSlots.slice(0, COLLAPSED_SLOT_COUNT);
      return (
        <View style={styles.roomCard}>
          <View style={styles.roomHeader}>
            <View style={styles.roomCopy}>
              <Text selectable style={styles.roomName}>{item.name}</Text>
              <Text selectable style={styles.capacity}>Up to {item.capacity} people</Text>
            </View>
            <View style={styles.roomMeta}>
              <Ionicons name="desktop-outline" size={25} color={colors.brand} />
              <Text selectable style={styles.slotCount}>
                {item.availableSlots.length} {item.availableSlots.length === 1 ? 'start' : 'starts'}
              </Text>
            </View>
          </View>

          <View style={styles.slotGrid}>
            {visibleSlots.map((slot) => {
              const selected = selectedSlot?.roomId === item.id && selectedSlot.start === slot.start;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`${item.name}, ${formatSlotTime(slot.start)}`}
                  key={slot.start}
                  onPress={() => setSelectedSlot({ roomId: item.id, roomName: item.name, start: slot.start })}
                  style={({ pressed }) => [
                    styles.slotButton,
                    selected ? styles.slotButtonSelected : null,
                    { opacity: buttonOpacity(pressed) },
                  ]}
                >
                  <Text selectable style={[styles.slotText, selected ? styles.slotTextSelected : null]}>
                    {formatSlotTime(slot.start)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {item.availableSlots.length > COLLAPSED_SLOT_COUNT ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setExpandedRoomId(expanded ? null : item.id)}
              style={({ pressed }) => [styles.moreButton, { opacity: buttonOpacity(pressed) }]}
            >
              <Text selectable style={styles.moreButtonText}>
                {expanded ? 'Show fewer starts' : `Show all ${item.availableSlots.length} starts`}
              </Text>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.brand} />
            </Pressable>
          ) : null}
        </View>
      );
    },
    [expandedRoomId, selectedSlot],
  );

  const selectedDateLabel = formatReservationDate(selectedDate);
  const header = (
    <View style={styles.headerContent}>
      <View style={styles.hero}>
        <View style={styles.heroTopline}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)/home');
            }}
            style={({ pressed }) => [styles.backButton, { opacity: buttonOpacity(pressed) }]}
          >
            <Ionicons name="arrow-back" size={24} color={colors.brand} />
          </Pressable>
          <Text selectable style={styles.eyebrow}>UCSC UNIVERSITY LIBRARY</Text>
        </View>
        <Text selectable style={styles.heading}>Study rooms</Text>
        <Text selectable style={styles.subheading}>
          Pick a start time here, then finish the reservation with UCSC.
        </Text>
      </View>

      <View style={styles.section}>
        <Text selectable style={styles.sectionTitle}>Library</Text>
        <View style={styles.libraryRow}>
          {LIBRARY_RESERVATION_LOCATIONS.map((library) => {
            const selected = selectedLibrary === library.id;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                key={library.id}
                onPress={() => setSelectedLibrary(library.id)}
                style={({ pressed }) => [
                  styles.libraryButton,
                  selected ? styles.libraryButtonSelected : null,
                  { opacity: buttonOpacity(pressed) },
                ]}
              >
                <Text selectable style={[styles.libraryText, selected ? styles.libraryTextSelected : null]}>{library.shortName}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text selectable style={styles.sectionTitle}>Date</Text>
          <Text selectable style={styles.dateWindow}>Today + 7 days</Text>
        </View>
        <FlatList
          horizontal
          data={reservationDates}
          keyExtractor={(date) => date}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateRow}
          renderItem={({ item: date, index }) => {
            const label = formatReservationDate(date);
            const selected = selectedDate === date;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${index === 0 ? 'Today, ' : ''}${label.full}`}
                onPress={() => setSelectedDate(date)}
                style={({ pressed }) => [styles.dateButton, selected ? styles.dateButtonSelected : null, { opacity: buttonOpacity(pressed) }]}
              >
                <Text selectable style={[styles.dateWeekday, selected ? styles.dateTextSelected : null]}>{index === 0 ? 'Today' : label.weekday}</Text>
                <Text selectable style={[styles.dateMonthDay, selected ? styles.dateTextSelected : null]}>{label.monthDay}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      <View style={styles.resultsHeading}>
        <View style={styles.resultsCopy}>
          <Text selectable style={styles.resultsDate}>{selectedDateLabel.full}</Text>
          {!loading && !error ? (
            <View style={styles.availabilityLine}>
              <Text selectable style={styles.resultMetric}>{availableSlotCount}</Text>
              <Text selectable style={styles.resultCount}>
                open {availableSlotCount === 1 ? 'start' : 'starts'} across {availableRooms.length}{' '}
                {availableRooms.length === 1 ? 'room' : 'rooms'}
              </Text>
            </View>
          ) : null}
        </View>
        {!loading ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh availability"
            onPress={refresh}
            style={({ pressed }) => [styles.refreshButton, { opacity: buttonOpacity(pressed) }]}
          >
            <Ionicons name="refresh" size={22} color={colors.brand} />
          </Pressable>
        ) : null}
      </View>

      {loading ? <View style={styles.stateCard}><ActivityIndicator color={colors.brand} /><Text selectable style={styles.stateTitle}>Checking live availability…</Text></View> : null}
      {error ? (
        <View style={styles.stateCard}>
          <Ionicons name="cloud-offline-outline" size={28} color={colors.danger} />
          <Text selectable style={styles.stateTitle}>Availability couldn’t load</Text>
          <Text selectable style={styles.stateBody}>{error}</Text>
          <Pressable onPress={refresh} style={styles.retryButton}><Text selectable style={styles.retryText}>Try again</Text></Pressable>
        </View>
      ) : null}
      {!loading && !error && availableRooms.length === 0 ? (
        <View style={styles.stateCard}>
          <Ionicons name="calendar-outline" size={28} color={colors.textSoft} />
          <Text selectable style={styles.stateTitle}>No start times left for this date</Text>
          <Text selectable style={styles.stateBody}>Choose another day or pull down to refresh.</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      {selectedSlot ? (
        <View style={[styles.checkoutBar, { bottom: insets.bottom + 12 }]}>
          <View style={styles.checkoutSelection}>
            <View style={styles.checkoutCopy}>
              <Text selectable numberOfLines={1} style={styles.checkoutRoom}>{selectedSlot.roomName}</Text>
              <Text selectable style={styles.checkoutTime}>{selectedDateLabel.weekday} at {formatSlotTime(selectedSlot.start)}</Text>
            </View>
            <Ionicons name="checkmark-circle" size={22} color={colors.success} />
          </View>
          <Pressable accessibilityRole="button" onPress={() => void continueToUCSC()} style={({ pressed }) => [styles.checkoutButton, { opacity: buttonOpacity(pressed) }]}>
            <Text selectable style={styles.checkoutButtonText}>Continue to UCSC</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.surface} />
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={loading || error ? [] : availableRooms}
        keyExtractor={(room) => String(room.id)}
        renderItem={renderRoom}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={styles.roomSeparator} />}
        ListFooterComponent={
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(LIBRARY_ROOM_POLICIES_URL)} style={({ pressed }) => [styles.policyLink, { opacity: buttonOpacity(pressed) }]}>
            <Text selectable style={styles.policyText}>Room policies</Text>
            <Ionicons name="open-outline" size={16} color={colors.brand} />
          </Pressable>
        }
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingBottom: selectedSlot ? insets.bottom + 184 : insets.bottom + 36,
          paddingHorizontal: 20,
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  headerContent: {
    gap: 22,
    paddingBottom: 16,
  },
  hero: {
    gap: 4,
  },
  heroTopline: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
    borderRadius: 18,
  },
  eyebrow: {
    ...typeScale.eyebrow,
    color: colors.brand,
  },
  heading: {
    fontFamily: campusFonts.serifSemibold,
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -0.8,
    color: colors.text,
  },
  subheading: {
    ...typeScale.body,
    maxWidth: 330,
    color: colors.textMuted,
  },
  section: {
    gap: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    ...typeScale.eyebrow,
    color: colors.text,
  },
  dateWindow: {
    ...typeScale.caption,
    color: colors.textSoft,
  },
  libraryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  libraryButton: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  libraryButtonSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  libraryText: {
    fontFamily: campusFonts.sansSemibold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.brand,
  },
  libraryTextSelected: {
    color: colors.surface,
  },
  dateRow: {
    gap: 9,
    paddingRight: 20,
  },
  dateButton: {
    minWidth: 88,
    alignItems: 'center',
    gap: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  dateButtonSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  dateWeekday: {
    fontFamily: campusFonts.sansSemibold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
  },
  dateMonthDay: {
    fontFamily: campusFonts.sansMedium,
    fontSize: 14,
    lineHeight: 18,
    color: colors.text,
  },
  dateTextSelected: {
    color: colors.surface,
  },
  resultsHeading: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    padding: 15,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: colors.surfaceStrong,
  },
  resultsCopy: {
    flex: 1,
    gap: 3,
  },
  resultsDate: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  availabilityLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  resultMetric: {
    fontFamily: campusFonts.serifSemibold,
    fontSize: 36,
    lineHeight: 40,
    color: colors.brand,
    fontVariant: ['tabular-nums'],
  },
  resultCount: {
    ...typeScale.caption,
    flex: 1,
    color: colors.textMuted,
  },
  refreshButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  stateCard: {
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    padding: 22,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stateTitle: {
    fontFamily: campusFonts.sansSemibold,
    fontSize: 16,
    lineHeight: 21,
    textAlign: 'center',
    color: colors.text,
  },
  stateBody: {
    ...typeScale.caption,
    textAlign: 'center',
    color: colors.textMuted,
  },
  retryButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 13,
    backgroundColor: colors.brand,
  },
  retryText: {
    fontFamily: campusFonts.sansSemibold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.surface,
  },
  roomSeparator: {
    height: 12,
  },
  roomCard: {
    gap: 15,
    padding: 16,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  roomCopy: {
    flex: 1,
    gap: 2,
  },
  roomMeta: {
    alignItems: 'flex-end',
    gap: 2,
  },
  roomName: {
    fontFamily: campusFonts.serifSemibold,
    fontSize: 25,
    lineHeight: 29,
    color: colors.text,
  },
  capacity: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  slotCount: {
    fontFamily: campusFonts.sansSemibold,
    fontSize: 10,
    lineHeight: 13,
    color: colors.brand,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotButton: {
    minWidth: 92,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  slotButtonSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  slotText: {
    fontFamily: campusFonts.sansMedium,
    fontSize: 14,
    lineHeight: 18,
    color: colors.text,
  },
  slotTextSelected: {
    fontFamily: campusFonts.sansSemibold,
    color: colors.surface,
  },
  moreButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  moreButtonText: {
    fontFamily: campusFonts.sansSemibold,
    fontSize: 13,
    lineHeight: 17,
    color: colors.brand,
  },
  policyLink: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  policyText: {
    fontFamily: campusFonts.sansSemibold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.brand,
  },
  checkoutBar: {
    position: 'absolute',
    zIndex: 10,
    left: 16,
    right: 16,
    gap: 10,
    padding: 12,
    borderRadius: 20,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...cardShadow('hero'),
  },
  checkoutSelection: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 3,
  },
  checkoutCopy: {
    flex: 1,
    gap: 1,
  },
  checkoutRoom: {
    fontFamily: campusFonts.sansSemibold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.text,
  },
  checkoutTime: {
    fontFamily: campusFonts.sans,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
  },
  checkoutButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.brand,
  },
  checkoutButtonText: {
    fontFamily: campusFonts.sansSemibold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.surface,
  },
});
