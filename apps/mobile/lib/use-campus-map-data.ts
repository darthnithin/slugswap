import { useCallback, useEffect, useRef, useState } from 'react';

import {
  readCampusMapLayerCache,
  writeCampusMapLayerCache,
} from './campus-map-cache';
import {
  fetchCampusMapLayer,
  searchCampusBuildings,
  type CampusMapFeature,
  type CampusMapLayerData,
  type CampusMapLayerId,
} from './ucsc-map-data';

const EMPTY_LAYER_DATA: CampusMapLayerData = {
  features: [],
  polylines: [],
  polygons: [],
};

export type CampusMapLayerLoadState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: CampusMapLayerData;
  error: string | null;
};

const INITIAL_LAYER_STATE: CampusMapLayerLoadState = {
  status: 'idle',
  data: EMPTY_LAYER_DATA,
  error: null,
};

export function useCampusMapLayers() {
  const [states, setStates] = useState<Partial<Record<CampusMapLayerId, CampusMapLayerLoadState>>>(
    {},
  );
  const loaded = useRef(new Set<CampusMapLayerId>());
  const controllers = useRef(new Map<CampusMapLayerId, AbortController>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controllers.current.forEach((controller) => controller.abort());
      controllers.current.clear();
    };
  }, []);

  const loadLayer = useCallback(async (layerId: CampusMapLayerId, force = false) => {
    if (!force && loaded.current.has(layerId)) return;
    loaded.current.add(layerId);

    controllers.current.get(layerId)?.abort();
    const controller = new AbortController();
    controllers.current.set(layerId, controller);

    setStates((current) => ({
      ...current,
      [layerId]: {
        status: 'loading',
        data: current[layerId]?.data ?? EMPTY_LAYER_DATA,
        error: null,
      },
    }));

    const cached = await readCampusMapLayerCache(layerId);
    if (cached && mounted.current && !controller.signal.aborted) {
      setStates((current) => ({
        ...current,
        [layerId]: { status: 'ready', data: cached, error: null },
      }));
    }

    try {
      const data = await fetchCampusMapLayer(layerId, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      setStates((current) => ({
        ...current,
        [layerId]: { status: 'ready', data, error: null },
      }));
      void writeCampusMapLayerCache(layerId, data).catch(() => undefined);
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : 'This layer could not be loaded.';
      setStates((current) => {
        const existingData = current[layerId]?.data ?? cached ?? EMPTY_LAYER_DATA;
        return {
          ...current,
          [layerId]: {
            status: existingData.features.length > 0 ? 'ready' : 'error',
            data: existingData,
            error: message,
          },
        };
      });
    } finally {
      if (controllers.current.get(layerId) === controller) {
        controllers.current.delete(layerId);
      }
    }
  }, []);

  const retryLayer = useCallback(
    (layerId: CampusMapLayerId) => {
      loaded.current.delete(layerId);
      void loadLayer(layerId, true);
    },
    [loadLayer],
  );

  const stateForLayer = useCallback(
    (layerId: CampusMapLayerId): CampusMapLayerLoadState =>
      states[layerId] ?? INITIAL_LAYER_STATE,
    [states],
  );

  return { states, stateForLayer, loadLayer, retryLayer };
}

export function useCampusBuildingSearch(query: string) {
  const [results, setResults] = useState<CampusMapFeature[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setResults([]);
      setStatus('idle');
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setStatus('loading');
      setError(null);
      void searchCampusBuildings(normalized, controller.signal)
        .then((nextResults) => {
          if (controller.signal.aborted) return;
          setResults(nextResults);
          setStatus('ready');
        })
        .catch((searchError: unknown) => {
          if (controller.signal.aborted) return;
          setResults([]);
          setStatus('error');
          setError(
            searchError instanceof Error
              ? searchError.message
              : 'Campus buildings could not be searched.',
          );
        });
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return { results, status, error };
}
