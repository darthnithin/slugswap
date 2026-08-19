import { supabase } from './supabase';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { LibraryAvailability, LibraryLocationId } from './library-reservations';

const FALLBACK_LOCAL_API_URL = 'http://localhost:3000';
const FALLBACK_REMOTE_API_URL = 'https://slugswap.vercel.app';
const REQUEST_TIMEOUT_MS = 15_000;

function readExpoDevHost(): string | null {
  const constants = Constants as unknown as Record<string, unknown>;
  const expoConfig = constants.expoConfig as Record<string, unknown> | undefined;
  const manifest = constants.manifest as Record<string, unknown> | undefined;
  const manifest2 = constants.manifest2 as Record<string, unknown> | undefined;
  const manifest2Extra = manifest2?.extra as Record<string, unknown> | undefined;
  const expoClient = manifest2Extra?.expoClient as Record<string, unknown> | undefined;

  const candidates = [expoConfig?.hostUri, manifest?.debuggerHost, expoClient?.hostUri];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    const withoutProtocol = candidate.replace(/^https?:\/\//, '');
    const host = withoutProtocol.split('/')[0]?.split(':')[0]?.trim();
    if (host) return host;
  }

  return null;
}

function rewriteLocalhostUrl(urlValue: string, host: string): string {
  try {
    const parsed = new URL(urlValue);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      parsed.hostname = host;
      return parsed.toString().replace(/\/$/, '');
    }
  } catch {
    // Keep original value when URL parsing fails.
  }

  return urlValue;
}

function resolveApiBaseUrl(): string {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  const expoDevHost = readExpoDevHost();

  if (configuredUrl) {
    if (
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      window.location?.origin &&
      window.location.pathname.startsWith('/app')
    ) {
      try {
        const parsed = new URL(configuredUrl);
        if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
          return window.location.origin;
        }
      } catch {
        // Fall through to the configured value when URL parsing fails.
      }
    }

    if (Platform.OS !== 'web' && expoDevHost) {
      return rewriteLocalhostUrl(configuredUrl, expoDevHost);
    }

    return configuredUrl;
  }

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    return FALLBACK_LOCAL_API_URL;
  }

  if (expoDevHost) {
    return `http://${expoDevHost}:3000`;
  }

  return FALLBACK_REMOTE_API_URL;
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function isLikelyNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!(error instanceof Error)) return false;
  return /network request failed|fetch failed|networkerror|request timed out/i.test(error.message);
}

const API_BASE_URL = normalizeBaseUrl(resolveApiBaseUrl());
const REMOTE_API_BASE_URL = normalizeBaseUrl(FALLBACK_REMOTE_API_URL);

function isSafeRequest(init?: RequestInit): boolean {
  const method = (init?.method ?? 'GET').toUpperCase();
  return method === 'GET' || method === 'HEAD';
}

type BufferedApiResponse = {
  bodyText: string;
  ok: boolean;
  status: number;
};

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<BufferedApiResponse> {
  const controller = new AbortController();
  const callerSignal = init?.signal;
  let timedOut = false;

  const abortFromCaller = () => controller.abort();
  if (callerSignal?.aborted) {
    controller.abort();
  } else {
    callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const bodyText = await response.text();

    return {
      bodyText,
      ok: response.ok,
      status: response.status,
    };
  } catch (error) {
    if (timedOut && !callerSignal?.aborted) {
      throw new Error('Request timed out. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
}

async function fetchWithFallback(
  url: string,
  init?: RequestInit
): Promise<BufferedApiResponse> {
  try {
    return await fetchWithTimeout(url, init);
  } catch (error) {
    const canRetryRemote =
      Platform.OS !== 'web' &&
      isSafeRequest(init) &&
      !init?.signal?.aborted &&
      API_BASE_URL !== REMOTE_API_BASE_URL &&
      url.startsWith(`${API_BASE_URL}/api/`) &&
      isLikelyNetworkFailure(error);

    if (!canRetryRemote) {
      throw error;
    }

    const fallbackUrl = url.replace(API_BASE_URL, REMOTE_API_BASE_URL);
    console.warn('Primary API request failed; retrying with remote API.', {
      primaryUrl: url,
      fallbackUrl,
    });

    return fetchWithTimeout(fallbackUrl, init);
  }
}

if (__DEV__) {
  console.log('Resolved API_BASE_URL:', API_BASE_URL);
  if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(API_BASE_URL)) {
    console.log('Using local API backend:', API_BASE_URL);
  } else {
    console.log('Using remote API backend:', API_BASE_URL);
  }
}

export type DonorImpact = {
  isActive: boolean;
  weeklyAmount: number;
  status: string;
  peopleHelped: number;
  pointsContributed: number;
  capAmount: number;
  redeemedThisWeek: number;
  reservedThisWeek: number;
  remainingThisWeek: number;
  capReached: boolean;
  weekStart: string;
  weekEnd: string;
  timezone: string;
};

export type CheckoutRail = "points-or-bucks" | "flexi-dollars";
export type ClaimGenerationFailureReason =
  | 'allowance_exhausted'
  | 'pool_low'
  | 'pool_exhausted'
  | 'pool_unavailable';
export type RequesterPoolStatus = 'available' | 'empty' | 'unavailable';
export type RequesterAllowance = {
  weeklyLimit: number;
  usedAmount: number;
  remainingAmount: number;
  weekStart: string | null;
  weekEnd: string | null;
  daysUntilReset: number;
  poolStatus: RequesterPoolStatus;
};

type ClaimCodePayload = {
  id: string;
  code: string;
  amount: number;
  expiresAt: string;
  status: string;
  redeemedAt?: string;
  redemptionAmount?: number;
  redemptionAccount?: string;
  recommendedRail?: CheckoutRail;
  donorDisplayName?: string | null;
};

export type MobileUpdatePolicyResponse = {
  updatePolicy: {
    iosRequiredVersion: string;
    androidRequiredVersion: string;
    iosStoreUrl: string | null;
    androidStoreUrl: string | null;
  };
  updatedAt: string;
};

export type MobileHomeResponse = {
  user: {
    id: string;
    email: string | null;
    fullName: string | null;
  };
  linkStatus: {
    linked: boolean;
    linkedAt: string | null;
  };
  impact: DonorImpact;
  allowance: RequesterAllowance;
};

export type DiningLocation = {
  id: string;
  slug: string;
  name: string;
  closed?: boolean;
};

export type DiningMenu = {
  location: DiningLocation;
  date: string;
  sourceDateLabel: string;
  fetchedAt: string;
  availableDates: Array<{ date: string; label: string }>;
  recommendedPublishedMealId: string | null;
  serviceSchedule: {
    source: 'regular' | 'special-override' | 'official-live' | 'unavailable';
    closed: boolean;
    periods: Array<{
      id: string;
      label: string;
      startMinutes: number;
      endMinutes: number;
      mappedPublishedMealIds: string[];
    }>;
    activePeriodId: string | null;
    currentStatusLabel: string | null;
    note: string | null;
    specialHours: {
      opensAt: string | null;
      closesAt: string | null;
    } | null;
  };
  meals: Array<{
    id: string;
    name: string;
    sections: Array<{
      name: string;
      items: Array<{ name: string }>;
    }>;
  }>;
};

function normalizeClaimGenerationFailureReason(
  reason: unknown
): ClaimGenerationFailureReason | undefined {
  if (
    reason === 'allowance_exhausted' ||
    reason === 'pool_low' ||
    reason === 'pool_exhausted' ||
    reason === 'pool_unavailable'
  ) {
    return reason;
  }

  return undefined;
}

async function readApiErrorPayload(
  response: BufferedApiResponse,
  fallback: string
): Promise<{ message: string; reason?: ClaimGenerationFailureReason }> {
  const { bodyText } = response;
  if (!bodyText) return { message: fallback };

  const normalizedBody = bodyText.trimStart().toLowerCase();
  if (normalizedBody.startsWith('<!doctype html') || normalizedBody.startsWith('<html')) {
    return { message: fallback };
  }

  try {
    const parsed = JSON.parse(bodyText) as {
      error?: string;
      message?: string;
      reason?: unknown;
    };
    return {
      message: parsed.error || parsed.message || fallback,
      reason: normalizeClaimGenerationFailureReason(parsed.reason),
    };
  } catch {
    // Some upstream failures return plain text (for example, Vercel 502 pages).
    return { message: bodyText.slice(0, 200) || fallback };
  }
}

async function readApiError(
  response: BufferedApiResponse,
  fallback: string
): Promise<string> {
  const payload = await readApiErrorPayload(response, fallback);
  return payload.message;
}

function readApiJson<T>(response: BufferedApiResponse, fallback: string): T {
  if (!response.bodyText) {
    throw new Error(fallback);
  }

  try {
    return JSON.parse(response.bodyText) as T;
  } catch {
    throw new Error(`${fallback}: server returned an invalid response`);
  }
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  return headers;
}

export async function setDonation(amount: number) {
  const headers = await getAuthHeaders();
  const response = await fetchWithFallback(`${API_BASE_URL}/api/donations/set`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ amount }),
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to set donation');
    throw new Error(errorMessage);
  }

  return readApiJson(response, 'Failed to read donation response');
}

export async function pauseDonation(paused: boolean) {
  const headers = await getAuthHeaders();
  const response = await fetchWithFallback(`${API_BASE_URL}/api/donations/pause`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ paused }),
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to update donation status');
    throw new Error(errorMessage);
  }

  return readApiJson(response, 'Failed to read donation status response');
}

export async function generateClaimCode(amount?: number) {
  const headers = await getAuthHeaders();
  const response = await fetchWithFallback(`${API_BASE_URL}/api/claims/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(amount === undefined ? {} : { amount }),
  });

  if (!response.ok) {
    const { message, reason } = await readApiErrorPayload(response, 'Failed to generate claim code');
    const error = new Error(message) as Error & { reason?: ClaimGenerationFailureReason };
    error.reason = reason;
    throw error;
  }

  return readApiJson<{ success: boolean; claimCode: ClaimCodePayload }>(
    response,
    'Failed to read generated claim code'
  );
}

export async function refreshClaimCode(claimCodeId: string) {
  const headers = await getAuthHeaders();
  const response = await fetchWithFallback(`${API_BASE_URL}/api/claims/refresh`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ claimCodeId }),
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to refresh claim code');
    throw new Error(errorMessage);
  }

  return readApiJson<{
    success: boolean;
    claimCode: ClaimCodePayload;
  }>(response, 'Failed to read refreshed claim code');
}

export async function checkRedemption(claimCodeId: string) {
  const headers = await getAuthHeaders();
  const response = await fetchWithFallback(`${API_BASE_URL}/api/claims/check-redemption`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ claimCodeId }),
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to check redemption');
    throw new Error(errorMessage);
  }

  return readApiJson<{
    redeemed: boolean;
    amount?: number;
    accountName?: string;
  }>(response, 'Failed to read redemption status');
}

export async function getGetLoginUrl() {
  const response = await fetchWithFallback(`${API_BASE_URL}/api/get/login-url`);

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to load GET login URL');
    throw new Error(errorMessage);
  }

  return readApiJson<{ loginUrl: string }>(response, 'Failed to read GET login URL');
}

export async function getGetLinkStatus() {
  const headers = await getAuthHeaders();
  const response = await fetchWithFallback(`${API_BASE_URL}/api/get/link-status`, {
    headers,
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to fetch GET link status');
    throw new Error(errorMessage);
  }

  return readApiJson<{ linked: boolean; linkedAt: string | null }>(
    response,
    'Failed to read GET link status'
  );
}

export async function linkGetAccount(validatedUrl: string) {
  const headers = await getAuthHeaders();
  const response = await fetchWithFallback(`${API_BASE_URL}/api/get/link`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ validatedUrl }),
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to link GET account');
    throw new Error(errorMessage);
  }

  return readApiJson<{ success: boolean; linked: boolean }>(
    response,
    'Failed to read GET link response'
  );
}

export async function unlinkGetAccount() {
  const headers = await getAuthHeaders();
  const response = await fetchWithFallback(`${API_BASE_URL}/api/get/link`, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to unlink GET account');
    throw new Error(errorMessage);
  }

  return readApiJson<{ success: boolean; linked: boolean }>(
    response,
    'Failed to read GET unlink response'
  );
}

export async function getGetAccounts() {
  const headers = await getAuthHeaders();
  const response = await fetchWithFallback(`${API_BASE_URL}/api/get/accounts`, {
    headers,
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to fetch GET accounts');
    throw new Error(errorMessage);
  }

  return readApiJson<{
    linked: boolean;
    accounts: Array<{
      id: string;
      accountDisplayName: string;
      balance: number | null;
    }>;
  }>(response, 'Failed to read GET accounts');
}

export async function getGetBarcode() {
  const headers = await getAuthHeaders();
  const response = await fetchWithFallback(`${API_BASE_URL}/api/get/barcode`, {
    headers,
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to fetch GET barcode');
    throw new Error(errorMessage);
  }

  return readApiJson<{ linked: boolean; code: string; fetchedAt: string }>(
    response,
    'Failed to read GET barcode'
  );
}

export async function getGetWallet() {
  const headers = await getAuthHeaders();
  const response = await fetchWithFallback(`${API_BASE_URL}/api/get/wallet`, {
    headers,
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to fetch GET wallet');
    throw new Error(errorMessage);
  }

  return readApiJson<{
    linked: boolean;
    accounts: Array<{ id: string; accountDisplayName: string; balance: number | null }>;
    barcode: { code: string; fetchedAt: string };
  }>(response, 'Failed to read GET wallet');
}

export async function getMobileAppConfig() {
  const response = await fetchWithFallback(`${API_BASE_URL}/api/mobile/config`);

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to fetch mobile update policy');
    throw new Error(errorMessage);
  }

  return readApiJson<MobileUpdatePolicyResponse>(
    response,
    'Failed to read mobile update policy'
  );
}

export async function getMobileHome() {
  const headers = await getAuthHeaders();
  const response = await fetchWithFallback(`${API_BASE_URL}/api/mobile/home`, {
    headers,
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to fetch mobile home');
    throw new Error(errorMessage);
  }

  return readApiJson<MobileHomeResponse>(response, 'Failed to read mobile home');
}

export async function getDiningLocations(date: string) {
  const searchParams = new URLSearchParams({ date });
  const response = await fetchWithFallback(
    `${API_BASE_URL}/api/menus/locations?${searchParams.toString()}`,
    { cache: 'no-store' }
  );

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to fetch dining locations');
    throw new Error(errorMessage);
  }

  return readApiJson<{ locations: DiningLocation[] }>(
    response,
    'Failed to read dining locations'
  );
}

export async function getDiningMenu(
  params: { locationId: string; date: string },
  options?: { signal?: AbortSignal }
) {
  const searchParams = new URLSearchParams({
    locationId: params.locationId,
    date: params.date,
  });

  const response = await fetchWithFallback(`${API_BASE_URL}/api/menus?${searchParams.toString()}`, {
    cache: 'no-store',
    signal: options?.signal,
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to fetch dining menu');
    throw new Error(errorMessage);
  }

  return readApiJson<DiningMenu>(response, 'Failed to read dining menu');
}

export async function getLibraryRoomAvailability(
  params: { library: LibraryLocationId; date: string },
  options?: { signal?: AbortSignal }
) {
  const searchParams = new URLSearchParams({
    library: params.library,
    date: params.date,
  });
  const response = await fetchWithFallback(
    `${API_BASE_URL}/api/library/rooms?${searchParams.toString()}`,
    { cache: 'no-store', signal: options?.signal },
  );

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to fetch room availability');
    throw new Error(errorMessage);
  }
  return readApiJson<LibraryAvailability>(
    response,
    'Failed to read room availability',
  );
}
