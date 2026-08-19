export const LIBRARY_RESERVATION_BASE_URL = 'https://calendar.library.ucsc.edu/spaces';
export const LIBRARY_ROOM_POLICIES_URL = 'https://library.ucsc.edu/study-room-policies';

export type LibraryLocationId = 'mchenry' | 'science-engineering';

export type LibraryRoomAvailability = {
  id: number;
  name: string;
  capacity: number;
  thumbnailUrl: string | null;
  availableSlots: Array<{ start: string; end: string }>;
};

export type LibraryAvailability = {
  library: {
    id: LibraryLocationId;
    name: string;
    shortName: string;
    roomCount: number;
  };
  date: string;
  fetchedAt: string;
  rooms: LibraryRoomAvailability[];
};

export type LibraryReservationLocation = {
  id: LibraryLocationId;
  name: string;
  shortName: string;
  description: string;
  roomCount: number;
  locationId: number;
  groupId: number;
};

export const LIBRARY_RESERVATION_LOCATIONS: readonly LibraryReservationLocation[] = [
  {
    id: 'mchenry',
    name: 'McHenry Library',
    shortName: 'McHenry',
    description: 'Study rooms across all floors',
    roomCount: 36,
    locationId: 16577,
    groupId: 34977,
  },
  {
    id: 'science-engineering',
    name: 'Science & Engineering Library',
    shortName: 'S&E Library',
    description: 'Rooms on the upper and lower floors',
    roomCount: 16,
    locationId: 16578,
    groupId: 34972,
  },
] as const;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LIBCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

function addCalendarDays(isoDate: string, days: number): string {
  if (!ISO_DATE_PATTERN.test(isoDate)) throw new Error('A valid ISO date is required.');
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return [
    date.getUTCFullYear().toString().padStart(4, '0'),
    (date.getUTCMonth() + 1).toString().padStart(2, '0'),
    date.getUTCDate().toString().padStart(2, '0'),
  ].join('-');
}

export function getPacificDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getReservationDates(today = getPacificDate()): string[] {
  return Array.from({ length: 8 }, (_, index) => addCalendarDays(today, index));
}

export function formatReservationDate(isoDate: string): {
  weekday: string;
  monthDay: string;
  full: string;
} {
  if (!ISO_DATE_PATTERN.test(isoDate)) throw new Error('A valid ISO date is required.');
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const baseOptions = { timeZone: 'UTC' } as const;
  return {
    weekday: new Intl.DateTimeFormat('en-US', { ...baseOptions, weekday: 'short' }).format(date),
    monthDay: new Intl.DateTimeFormat('en-US', {
      ...baseOptions,
      month: 'short',
      day: 'numeric',
    }).format(date),
    full: new Intl.DateTimeFormat('en-US', {
      ...baseOptions,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(date),
  };
}

export function formatSlotTime(value: string): string {
  if (!LIBCAL_DATE_TIME_PATTERN.test(value)) throw new Error('Invalid LibCal time.');
  const hour = Number(value.slice(11, 13));
  const minute = value.slice(14, 16);
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function buildLibraryReservationUrl(locationId: LibraryLocationId): string {
  const location = LIBRARY_RESERVATION_LOCATIONS.find((item) => item.id === locationId);
  if (!location) {
    throw new Error('Unknown library location.');
  }
  const url = new URL(LIBRARY_RESERVATION_BASE_URL);
  url.searchParams.set('lid', String(location.locationId));
  url.searchParams.set('gid', String(location.groupId));
  url.searchParams.set('c', '0');
  return url.toString();
}

export function buildRoomCheckoutUrl(roomId: number, start: string): string {
  if (!Number.isSafeInteger(roomId) || roomId <= 0 || !LIBCAL_DATE_TIME_PATTERN.test(start)) {
    throw new Error('A valid room and start time are required.');
  }
  const url = new URL(`https://calendar.library.ucsc.edu/space/${roomId}`);
  url.searchParams.set('date', start);
  return url.toString();
}
