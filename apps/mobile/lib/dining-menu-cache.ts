import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getDiningLocations,
  getDiningMenu,
  type DiningLocation,
  type DiningMenu,
} from './api';
import { sortDiningLocations } from './dining-locations';
import {
  getDiningMenuWindow,
  isDiningCacheFresh,
} from './dining-menu-cache-utils';

export {
  getDiningMenuWindow,
  isDiningCacheFresh,
} from './dining-menu-cache-utils';

const CACHE_KEY = 'slugswap:menus:weekly-cache:v1';
const LEGACY_MENU_KEY_PATTERN = /^slugswap:menus:([^:]+):(\d{4}-\d{2}-\d{2})$/;
const CACHE_VERSION = 1;
const MENU_WINDOW_DAYS = 8;
const REFRESH_AFTER_MS = 30 * 60 * 1000;
const RETRY_AFTER_MS = 5 * 60 * 1000;

export type CachedDiningMenu = {
  menu: DiningMenu;
  savedAt: string;
};

export type CachedDiningLocations = {
  locations: DiningLocation[];
  savedAt: string;
};

type DiningMenuCacheState = {
  version: number;
  windowStart: string | null;
  lastSyncAttemptAt: string | null;
  lastFullSyncAt: string | null;
  menus: Record<string, CachedDiningMenu>;
  locationsByDate: Record<string, CachedDiningLocations>;
};

function emptyCache(): DiningMenuCacheState {
  return {
    version: CACHE_VERSION,
    windowStart: null,
    lastSyncAttemptAt: null,
    lastFullSyncAt: null,
    menus: {},
    locationsByDate: {},
  };
}

let cache = emptyCache();
let hydrationPromise: Promise<void> | null = null;
let persistencePromise: Promise<void> = Promise.resolve();
let weekSyncPromise: Promise<void> | null = null;
const pendingMenus = new Map<string, Promise<CachedDiningMenu>>();
const pendingLocations = new Map<string, Promise<CachedDiningLocations>>();

function menuKey(locationId: string, date: string): string {
  return `${locationId}:${date}`;
}

function normalizeCache(value: unknown): DiningMenuCacheState {
  if (!value || typeof value !== 'object') return emptyCache();
  const candidate = value as Partial<DiningMenuCacheState>;
  if (candidate.version !== CACHE_VERSION) return emptyCache();

  return {
    version: CACHE_VERSION,
    windowStart:
      typeof candidate.windowStart === 'string' ? candidate.windowStart : null,
    lastSyncAttemptAt:
      typeof candidate.lastSyncAttemptAt === 'string'
        ? candidate.lastSyncAttemptAt
        : null,
    lastFullSyncAt:
      typeof candidate.lastFullSyncAt === 'string'
        ? candidate.lastFullSyncAt
        : null,
    menus:
      candidate.menus && typeof candidate.menus === 'object'
        ? candidate.menus
        : {},
    locationsByDate:
      candidate.locationsByDate && typeof candidate.locationsByDate === 'object'
        ? candidate.locationsByDate
        : {},
  };
}

async function migrateLegacyMenus(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    LEGACY_MENU_KEY_PATTERN.test(key)
  );
  if (!keys.length) return;

  const entries = await AsyncStorage.multiGet(keys);
  for (const [key, raw] of entries) {
    if (!raw) continue;
    const match = LEGACY_MENU_KEY_PATTERN.exec(key);
    if (!match) continue;

    try {
      const parsed = JSON.parse(raw) as Partial<CachedDiningMenu>;
      if (!parsed.menu?.location?.id || !parsed.savedAt) continue;
      cache.menus[menuKey(match[1], match[2])] = {
        menu: parsed.menu,
        savedAt: parsed.savedAt,
      };
    } catch {
      // Ignore corrupt legacy entries; a background refresh replaces them.
    }
  }
}

function persistCache(): void {
  persistencePromise = persistencePromise
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache)))
    .catch((error) => {
      console.warn('Failed to persist weekly dining menu cache:', error);
    });
}

function pruneCache(windowStart: string): void {
  const validDates = new Set(
    getDiningMenuWindow(windowStart, MENU_WINDOW_DAYS)
  );

  for (const key of Object.keys(cache.menus)) {
    const date = key.slice(key.lastIndexOf(':') + 1);
    if (!validDates.has(date)) delete cache.menus[key];
  }

  for (const date of Object.keys(cache.locationsByDate)) {
    if (!validDates.has(date)) delete cache.locationsByDate[date];
  }

  if (cache.windowStart !== windowStart) {
    cache.windowStart = windowStart;
    cache.lastFullSyncAt = null;
  }
}

export async function hydrateDiningMenuCache(windowStart: string): Promise<void> {
  if (!hydrationPromise) {
    hydrationPromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (!raw) {
          await migrateLegacyMenus();
          return;
        }
        try {
          cache = normalizeCache(JSON.parse(raw));
        } catch {
          cache = emptyCache();
        }
      } catch (error) {
        console.warn('Failed to hydrate weekly dining menu cache:', error);
      }
    })();
  }

  await hydrationPromise;
  pruneCache(windowStart);
  persistCache();
}

export function peekDiningMenu(
  locationId: string,
  date: string
): CachedDiningMenu | null {
  return cache.menus[menuKey(locationId, date)] ?? null;
}

export function peekDiningLocations(date: string): CachedDiningLocations | null {
  return cache.locationsByDate[date] ?? null;
}

export async function refreshDiningMenu(
  locationId: string,
  date: string
): Promise<CachedDiningMenu> {
  const key = menuKey(locationId, date);
  const pending = pendingMenus.get(key);
  if (pending) return pending;

  const request = getDiningMenu({ locationId, date })
    .then((menu) => {
      const entry = { menu, savedAt: new Date().toISOString() };
      cache.menus[key] = entry;
      persistCache();
      return entry;
    })
    .finally(() => {
      pendingMenus.delete(key);
    });

  pendingMenus.set(key, request);
  return request;
}

export async function refreshDiningLocations(
  date: string
): Promise<CachedDiningLocations> {
  const pending = pendingLocations.get(date);
  if (pending) return pending;

  const request = getDiningLocations(date)
    .then((result) => {
      const entry = {
        locations: sortDiningLocations(result.locations),
        savedAt: new Date().toISOString(),
      };
      cache.locationsByDate[date] = entry;
      persistCache();
      return entry;
    })
    .finally(() => {
      pendingLocations.delete(date);
    });

  pendingLocations.set(date, request);
  return request;
}

async function mapWithConcurrency<T>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        await worker(values[index]);
      }
    }
  );
  await Promise.all(workers);
}

export async function syncDiningMenuWindow(
  windowStart: string,
  options?: { force?: boolean }
): Promise<void> {
  await hydrateDiningMenuCache(windowStart);
  if (weekSyncPromise) return weekSyncPromise;

  const force = Boolean(options?.force);
  if (
    !force &&
    isDiningCacheFresh(cache.lastFullSyncAt, REFRESH_AFTER_MS)
  ) {
    return;
  }
  if (
    !force &&
    isDiningCacheFresh(cache.lastSyncAttemptAt, RETRY_AFTER_MS)
  ) {
    return;
  }

  cache.lastSyncAttemptAt = new Date().toISOString();
  persistCache();

  weekSyncPromise = (async () => {
    let fullySynced = true;
    const dates = getDiningMenuWindow(windowStart);

    await mapWithConcurrency(dates, 2, async (date) => {
      let locationsEntry = peekDiningLocations(date);
      try {
        if (
          force ||
          !isDiningCacheFresh(locationsEntry?.savedAt, REFRESH_AFTER_MS)
        ) {
          locationsEntry = await refreshDiningLocations(date);
        }
      } catch (error) {
        fullySynced = false;
        console.warn(`Failed to refresh dining locations for ${date}:`, error);
      }

      if (!locationsEntry) return;
      const openLocations = locationsEntry.locations.filter(
        (location) => !location.closed
      );

      await mapWithConcurrency(openLocations, 3, async (location) => {
        const existing = peekDiningMenu(location.id, date);
        if (
          !force &&
          isDiningCacheFresh(existing?.savedAt, REFRESH_AFTER_MS)
        ) {
          return;
        }

        try {
          await refreshDiningMenu(location.id, date);
        } catch (error) {
          fullySynced = false;
          console.warn(
            `Failed to refresh ${location.name} menu for ${date}:`,
            error
          );
        }
      });
    });

    if (fullySynced) {
      cache.lastFullSyncAt = new Date().toISOString();
      persistCache();
    }
  })().finally(() => {
    weekSyncPromise = null;
  });

  return weekSyncPromise;
}
