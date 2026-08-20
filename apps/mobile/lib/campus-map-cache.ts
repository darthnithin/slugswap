import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  CampusMapLayerData,
  CampusMapLayerId,
} from './ucsc-map-data';

const CACHE_VERSION = 1;
const CACHE_PREFIX = '@slugswap/ucsc-map-layer';

type CampusMapCacheEnvelope = {
  version: number;
  fetchedAt: string;
  data: CampusMapLayerData;
};

function cacheKey(layerId: CampusMapLayerId): string {
  return `${CACHE_PREFIX}/${layerId}`;
}

function isLayerData(value: unknown): value is CampusMapLayerData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CampusMapLayerData>;
  return (
    Array.isArray(candidate.features) &&
    Array.isArray(candidate.polylines) &&
    Array.isArray(candidate.polygons)
  );
}

export async function readCampusMapLayerCache(
  layerId: CampusMapLayerId,
): Promise<CampusMapLayerData | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(layerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CampusMapCacheEnvelope>;
    if (parsed.version !== CACHE_VERSION || !isLayerData(parsed.data)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function writeCampusMapLayerCache(
  layerId: CampusMapLayerId,
  data: CampusMapLayerData,
): Promise<void> {
  const envelope: CampusMapCacheEnvelope = {
    version: CACHE_VERSION,
    fetchedAt: new Date().toISOString(),
    data,
  };

  await AsyncStorage.setItem(cacheKey(layerId), JSON.stringify(envelope));
}
