import { Ionicons } from '@expo/vector-icons';
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
import { buttonOpacity, cardShadow, stealthTheme, typeScale } from '@/lib/stealth-theme';

const colors = stealthTheme.colors;
const COLLAPSED_SLOT_COUNT = 6;

type SelectedSlot = { roomId: number; roomName: string; start: string };

export default function RoomsScreen() {
  const insets = useSafeAreaInsets();
  const reservationDates = useMemo(() => getReservationDates(), []);
  const [selectedLibrary, setSelectedLibrary] = useState<LibraryLocationId>('mchenry');
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
            <View style={styles.roomIcon}>
              <Ionicons name="people-outline" size={20} color={colors.brand} />
            </View>
            <View style={styles.roomCopy}>
              <Text selectable style={styles.roomName}>{item.name}</Text>
              <Text selectable style={styles.capacity}>Up to {item.capacity} people</Text>
            </View>
            <Text selectable style={styles.slotCount}>
              {item.availableSlots.length} {item.availableSlots.length === 1 ? 'start' : 'starts'}
            </Text>
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
        <View style={styles.heroIcon}>
          <Ionicons name="library" size={25} color={colors.brand} />
        </View>
        <View style={styles.heroCopy}>
          <Text selectable style={styles.eyebrow}>UCSC UNIVERSITY LIBRARY</Text>
          <Text selectable style={styles.heading}>Find a study room</Text>
          <Text selectable style={styles.subheading}>
            Browse live availability here. UCSC opens only to choose duration and sign in.
          </Text>
        </View>
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
                <Ionicons name={library.id === 'mchenry' ? 'library-outline' : 'flask-outline'} size={20} color={selected ? colors.surface : colors.brand} />
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
        <View>
          <Text selectable style={styles.sectionTitle}>{selectedDateLabel.full}</Text>
          {!loading && !error ? <Text selectable style={styles.resultCount}>{availableSlotCount} open starts across {availableRooms.length} rooms</Text> : null}
        </View>
        {!loading ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh availability" onPress={refresh}>
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
        <View style={[styles.checkoutBar, { bottom: insets.bottom + 74 }]}>
          <View style={styles.checkoutCopy}>
            <Text selectable numberOfLines={1} style={styles.checkoutRoom}>{selectedSlot.roomName}</Text>
            <Text selectable style={styles.checkoutTime}>{selectedDateLabel.weekday} at {formatSlotTime(selectedSlot.start)}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => void continueToUCSC()} style={({ pressed }) => [styles.checkoutButton, { opacity: buttonOpacity(pressed) }]}>
            <Text selectable style={styles.checkoutButtonText}>Continue</Text>
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
        contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: selectedSlot ? 180 : 110, paddingHorizontal: 18 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  headerContent: { gap: 24, paddingBottom: 14 },
  hero: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  heroIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderCurve: 'continuous', backgroundColor: colors.accentMuted },
  heroCopy: { flex: 1, gap: 4 },
  eyebrow: { ...typeScale.eyebrow, color: colors.brand },
  heading: { fontSize: 30, lineHeight: 35, fontWeight: '800', color: colors.text },
  subheading: { ...typeScale.body, color: colors.textMuted },
  section: { gap: 11 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { ...typeScale.title, color: colors.text },
  dateWindow: { ...typeScale.caption, color: colors.textSoft },
  libraryRow: { flexDirection: 'row', gap: 10 },
  libraryButton: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 17, borderCurve: 'continuous', backgroundColor: colors.surface },
  libraryButtonSelected: { borderColor: colors.brand, backgroundColor: colors.brand },
  libraryText: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: colors.brand },
  libraryTextSelected: { color: colors.surface },
  dateRow: { gap: 9, paddingRight: 18 },
  dateButton: { minWidth: 82, alignItems: 'center', gap: 2, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 17, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  dateButtonSelected: { borderColor: colors.brand, backgroundColor: colors.brand },
  dateWeekday: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.textMuted },
  dateMonthDay: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.text },
  dateTextSelected: { color: colors.surface },
  resultsHeading: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultCount: { ...typeScale.caption, color: colors.textMuted },
  stateCard: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 22, borderRadius: 22, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  stateTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', textAlign: 'center', color: colors.text },
  stateBody: { ...typeScale.caption, textAlign: 'center', color: colors.textMuted },
  retryButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 14, backgroundColor: colors.accentMuted },
  retryText: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: colors.brand },
  roomSeparator: { height: 12 },
  roomCard: { gap: 14, padding: 16, borderRadius: 22, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, ...cardShadow('surface') },
  roomHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roomIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderCurve: 'continuous', backgroundColor: colors.accentMuted },
  roomCopy: { flex: 1, gap: 1 },
  roomName: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: colors.text },
  capacity: { ...typeScale.caption, color: colors.textMuted },
  slotCount: { fontSize: 11, lineHeight: 15, fontWeight: '700', color: colors.brand },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotButton: { minWidth: 88, minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, borderRadius: 13, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceMuted },
  slotButtonSelected: { borderColor: colors.brand, backgroundColor: colors.brand },
  slotText: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: colors.text },
  slotTextSelected: { color: colors.surface },
  moreButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  moreButtonText: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: colors.brand },
  policyLink: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  policyText: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: colors.brand },
  checkoutBar: { position: 'absolute', zIndex: 10, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 22, borderCurve: 'continuous', backgroundColor: colors.brandDeeper, ...cardShadow('hero') },
  checkoutCopy: { flex: 1, gap: 2 },
  checkoutRoom: { fontSize: 14, lineHeight: 18, fontWeight: '800', color: colors.surface },
  checkoutTime: { fontSize: 12, lineHeight: 16, color: '#d9efff' },
  checkoutButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 15, borderRadius: 15, borderCurve: 'continuous', backgroundColor: colors.brand },
  checkoutButtonText: { fontSize: 14, lineHeight: 18, fontWeight: '800', color: colors.surface },
});
