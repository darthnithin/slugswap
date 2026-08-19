type LibraryId = "mchenry" | "science-engineering";

type LibraryConfig = {
  id: LibraryId;
  name: string;
  shortName: string;
  locationId: number;
  groupId: number;
};

export type LibraryRoom = {
  id: number;
  name: string;
  capacity: number;
  thumbnailUrl: string | null;
};

export type LibraryAvailabilityRoom = LibraryRoom & {
  availableSlots: Array<{ start: string; end: string }>;
};

export type LibraryAvailability = {
  library: Pick<LibraryConfig, "id" | "name" | "shortName"> & { roomCount: number };
  date: string;
  fetchedAt: string;
  rooms: LibraryAvailabilityRoom[];
};

type LibCalSlot = {
  start?: unknown;
  end?: unknown;
  itemId?: unknown;
  className?: unknown;
};

const LIBCAL_ORIGIN = "https://calendar.library.ucsc.edu";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 15_000;
const CATALOG_CACHE_TTL_MS = 60 * 60 * 1000;

const LIBRARIES: Record<LibraryId, LibraryConfig> = {
  mchenry: {
    id: "mchenry",
    name: "McHenry Library",
    shortName: "McHenry",
    locationId: 16577,
    groupId: 34977,
  },
  "science-engineering": {
    id: "science-engineering",
    name: "Science & Engineering Library",
    shortName: "S&E Library",
    locationId: 16578,
    groupId: 34972,
  },
};

const availabilityCache = new Map<string, { expiresAt: number; value: LibraryAvailability }>();
const catalogCache = new Map<LibraryId, { expiresAt: number; rooms: LibraryRoom[] }>();

export class LibCalError extends Error {
  constructor(message: string, public readonly status = 503) {
    super(message);
    this.name = "LibCalError";
  }
}

export function isLibraryId(value: string): value is LibraryId {
  return value === "mchenry" || value === "science-engineering";
}

function decodeJavaScriptString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value.replace(/\\u([0-9a-f]{4})/gi, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
  }
}

export function parseLibCalRooms(html: string): LibraryRoom[] {
  const names = new Map<number, string>();
  const namePattern = /resourceNameIdMap\["eid_(\d+)"\]\s*=\s*"((?:\\.|[^"\\])*)"/g;
  for (const match of html.matchAll(namePattern)) {
    names.set(Number(match[1]), decodeJavaScriptString(match[2]));
  }

  const rooms: LibraryRoom[] = [];
  const resourcePattern = /resources\.push\(\{([\s\S]*?)\}\);/g;
  for (const match of html.matchAll(resourcePattern)) {
    const block = match[1];
    const idMatch = block.match(/\beid:\s*(\d+)/);
    const capacityMatch = block.match(/\bcapacity:\s*(\d+)/);
    const titleMatch = block.match(/\btitle:\s*"((?:\\.|[^"\\])*)"/);
    const thumbnailMatch = block.match(/\bthumbnail:\s*"((?:\\.|[^"\\])*)"/);
    if (!idMatch || !capacityMatch || !titleMatch) continue;

    const id = Number(idMatch[1]);
    const thumbnail = thumbnailMatch ? decodeJavaScriptString(thumbnailMatch[1]) : "";
    rooms.push({
      id,
      name: names.get(id) ?? decodeJavaScriptString(titleMatch[1]).replace(/\s*\(Capacity \d+\)$/, ""),
      capacity: Number(capacityMatch[1]),
      thumbnailUrl: thumbnail
        ? thumbnail.startsWith("//")
          ? `https:${thumbnail}`
          : thumbnail
        : null,
    });
  }

  if (rooms.length === 0) {
    throw new LibCalError("UCSC returned an unreadable room catalog.");
  }
  return rooms;
}

export function mergeAvailability(
  rooms: LibraryRoom[],
  slots: LibCalSlot[],
): LibraryAvailabilityRoom[] {
  const availableByRoom = new Map<number, Array<{ start: string; end: string }>>();
  for (const slot of slots) {
    if (
      slot.className ||
      typeof slot.itemId !== "number" ||
      typeof slot.start !== "string" ||
      typeof slot.end !== "string"
    ) {
      continue;
    }
    const roomSlots = availableByRoom.get(slot.itemId) ?? [];
    roomSlots.push({ start: slot.start, end: slot.end });
    availableByRoom.set(slot.itemId, roomSlots);
  }

  return rooms.map((room) => ({
    ...room,
    availableSlots: availableByRoom.get(room.id) ?? [],
  }));
}

function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

export function getPacificDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function validateReservationDate(value: string, today = getPacificDate()): void {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new LibCalError("Use a date in YYYY-MM-DD format.", 400);
  }
  const normalized = addCalendarDays(value, 0);
  if (normalized !== value || value < today || value > addCalendarDays(today, 7)) {
    throw new LibCalError("Reservations are available from today through one week ahead.", 400);
  }
}

async function fetchUpstream(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Accept: init?.method === "POST" ? "application/json" : "text/html",
      "User-Agent": "SlugSwap/1.2 (+https://slugswap.vercel.app)",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new LibCalError(`UCSC availability returned HTTP ${response.status}.`);
  }
  return response;
}

async function getRoomCatalog(library: LibraryConfig, referer: string): Promise<LibraryRoom[]> {
  const cached = catalogCache.get(library.id);
  if (cached && cached.expiresAt > Date.now()) return cached.rooms;

  const response = await fetchUpstream(referer);
  const rooms = parseLibCalRooms(await response.text());
  catalogCache.set(library.id, {
    expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
    rooms,
  });
  return rooms;
}

export async function getLibraryAvailability(
  libraryId: LibraryId,
  date: string,
): Promise<LibraryAvailability> {
  validateReservationDate(date);
  const cacheKey = `${libraryId}:${date}`;
  const cached = availabilityCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const library = LIBRARIES[libraryId];
  const referer = `${LIBCAL_ORIGIN}/spaces?lid=${library.locationId}&gid=${library.groupId}&c=0`;
  const rooms = await getRoomCatalog(library, referer);

  const body = new URLSearchParams({
    lid: String(library.locationId),
    gid: String(library.groupId),
    eid: "-1",
    seat: "0",
    seatId: "0",
    zone: "0",
    start: date,
    end: addCalendarDays(date, 1),
    bookings: "[]",
    pageIndex: "0",
    pageSize: "100",
  });
  const gridResponse = await fetchUpstream(`${LIBCAL_ORIGIN}/spaces/availability/grid`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: referer,
      "X-Requested-With": "XMLHttpRequest",
    },
    body,
  });
  const payload = (await gridResponse.json()) as { slots?: unknown };
  if (!Array.isArray(payload.slots)) {
    throw new LibCalError("UCSC returned an unreadable availability response.");
  }

  const result: LibraryAvailability = {
    library: {
      id: library.id,
      name: library.name,
      shortName: library.shortName,
      roomCount: rooms.length,
    },
    date,
    fetchedAt: new Date().toISOString(),
    rooms: mergeAvailability(rooms, payload.slots as LibCalSlot[]),
  };
  availabilityCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: result });
  return result;
}
