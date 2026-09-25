import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getFoodVendors } from './api';
import {
  foodVendorDate,
  isFoodVendorFeed,
  type FoodVendorFeed,
} from './food-vendors';

const CACHE_KEY = 'slugswap:food-vendors:v1';
const FRESH_MS = 5 * 60 * 1000;
let memory: FoodVendorFeed | null = null;

export function useFoodVendors() {
  const [data, setData] = useState<FoodVendorFeed | null>(memory);
  const [date, setDate] = useState(foodVendorDate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const focused = useRef(false);

  const refresh = useCallback(async (force = true) => {
    if (!focused.current) return;
    const today = foodVendorDate();
    setDate(today);
    if (memory?.date !== today) {
      memory = null;
      setData(null);
    }
    const isFresh =
      memory && Date.now() - Date.parse(memory.fetchedAt) < FRESH_MS;
    if (!force && isFresh) {
      setData(memory);
      setStale(false);
      setError(null);
      setLoading(false);
      return;
    }
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError(null);
    setStale(true);
    try {
      const next = await getFoodVendors(request.signal);
      if (request.signal.aborted) return;
      if (next.date !== foodVendorDate())
        throw new Error(
          'The vendor schedule has changed days. Pull to refresh.',
        );
      memory = next;
      setData(next);
      setDate(next.date);
      setStale(Date.now() - Date.parse(next.fetchedAt) >= FRESH_MS);
      void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(
        () => undefined,
      );
    } catch (err) {
      if (!request.signal.aborted) {
        setDate(foodVendorDate());
        setError(
          err instanceof Error
            ? err.message
            : 'Food vendors could not be refreshed.',
        );
      }
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      let active = true;
      void (async () => {
        if (!memory) {
          try {
            const raw = await AsyncStorage.getItem(CACHE_KEY);
            const saved: unknown = raw ? JSON.parse(raw) : null;
            if (
              active &&
              isFoodVendorFeed(saved) &&
              saved.date === foodVendorDate()
            ) {
              memory = saved;
              setData(saved);
            }
          } catch {
            /* A corrupt cache must not block a fresh request. */
          }
        }
        if (active) void refresh(false);
      })();
      const timer = setInterval(() => void refresh(false), 60_000);
      const subscription = AppState.addEventListener('change', (status) => {
        if (status === 'active') void refresh(false);
      });
      return () => {
        active = false;
        focused.current = false;
        controller.current?.abort();
        setLoading(false);
        clearInterval(timer);
        subscription.remove();
      };
    }, [refresh]),
  );

  return {
    data: data?.date === date ? data : null,
    date,
    loading,
    error,
    stale,
    refresh,
  };
}
