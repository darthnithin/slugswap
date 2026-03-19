import { supabase } from './supabase';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const FALLBACK_LOCAL_API_URL = 'http://localhost:3000';
const FALLBACK_REMOTE_API_URL = 'https://slugswap.vercel.app';

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
  return /network request failed|fetch failed|networkerror/i.test(error.message);
}

const API_BASE_URL = normalizeBaseUrl(resolveApiBaseUrl());
const REMOTE_API_BASE_URL = normalizeBaseUrl(FALLBACK_REMOTE_API_URL);

async function fetchWithFallback(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    const canRetryRemote =
      Platform.OS !== 'web' &&
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

    return fetch(fallbackUrl, init);
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
  response: Response,
  fallback: string
): Promise<{ message: string; reason?: ClaimGenerationFailureReason }> {
  const bodyText = await response.text();
  if (!bodyText) return { message: fallback };

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

async function readApiError(response: Response, fallback: string): Promise<string> {
  const payload = await readApiErrorPayload(response, fallback);
  return payload.message;
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  return headers;
}

export async function setDonation(userId: string, amount: number, userEmail?: string | null) {
  const response = await fetchWithFallback(`${API_BASE_URL}/api/donations/set`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, amount, userEmail }),
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to set donation');
    throw new Error(errorMessage);
  }

  return response.json();
}

export async function getDonorImpact(userId: string) {
  const response = await fetchWithFallback(`${API_BASE_URL}/api/donations/impact?userId=${userId}`);

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to fetch impact');
    throw new Error(errorMessage);
  }

  return response.json() as Promise<DonorImpact>;
}

export async function pauseDonation(userId: string, paused: boolean) {
  const response = await fetchWithFallback(`${API_BASE_URL}/api/donations/pause`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, paused }),
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to update donation status');
    throw new Error(errorMessage);
  }

  return response.json();
}

export async function getRequesterAllowance(userId: string) {
  const headers = await getAuthHeaders();
  const response = await fetchWithFallback(`${API_BASE_URL}/api/requesters/allowance?userId=${userId}`, {
    headers,
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to fetch allowance');
    throw new Error(errorMessage);
  }

  return response.json();
}

export async function generateClaimCode(userId: string, amount: number) {
  const response = await fetchWithFallback(`${API_BASE_URL}/api/claims/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, amount }),
  });

  if (!response.ok) {
    const { message, reason } = await readApiErrorPayload(response, 'Failed to generate claim code');
    const error = new Error(message) as Error & { reason?: ClaimGenerationFailureReason };
    error.reason = reason;
    throw error;
  }

  return response.json() as Promise<{ success: boolean; claimCode: ClaimCodePayload }>;
}

export async function getClaimHistory(userId: string) {
  const response = await fetchWithFallback(`${API_BASE_URL}/api/claims/history?userId=${userId}`);

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to fetch claim history');
    throw new Error(errorMessage);
  }

  return response.json();
}

export async function refreshClaimCode(userId: string, claimCodeId: string) {
  const response = await fetchWithFallback(`${API_BASE_URL}/api/claims/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, claimCodeId }),
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to refresh claim code');
    throw new Error(errorMessage);
  }

  return response.json() as Promise<{
    success: boolean;
    claimCode: ClaimCodePayload;
  }>;
}

export async function checkRedemption(userId: string, claimCodeId: string) {
  const response = await fetchWithFallback(`${API_BASE_URL}/api/claims/check-redemption`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, claimCodeId }),
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to check redemption');
    throw new Error(errorMessage);
  }

  return response.json() as Promise<{
    redeemed: boolean;
    amount?: number;
    accountName?: string;
  }>;
}

export async function deleteClaimCode(userId: string, claimCodeId: string) {
  const response = await fetchWithFallback(`${API_BASE_URL}/api/claims/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, claimCodeId }),
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to delete claim');
    throw new Error(errorMessage);
  }

  return response.json() as Promise<{ success: boolean; message: string }>;
}

export async function getGetLoginUrl() {
  const response = await fetchWithFallback(`${API_BASE_URL}/api/get/login-url`);

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to load GET login URL');
    throw new Error(errorMessage);
  }

  return response.json() as Promise<{ loginUrl: string }>;
}

export async function getGetLinkStatus(userId: string) {
  const response = await fetchWithFallback(`${API_BASE_URL}/api/get/link-status?userId=${userId}`);

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to fetch GET link status');
    throw new Error(errorMessage);
  }

  return response.json() as Promise<{ linked: boolean; linkedAt: string | null }>;
}

export async function linkGetAccount(params: {
  userId: string;
  validatedUrl: string;
  userEmail?: string | null;
}) {
  const response = await fetchWithFallback(`${API_BASE_URL}/api/get/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to link GET account');
    throw new Error(errorMessage);
  }

  return response.json() as Promise<{ success: boolean; linked: boolean }>;
}

export async function unlinkGetAccount(userId: string) {
  const response = await fetchWithFallback(`${API_BASE_URL}/api/get/link?userId=${userId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to unlink GET account');
    throw new Error(errorMessage);
  }

  return response.json() as Promise<{ success: boolean; linked: boolean }>;
}

export async function getGetAccounts(userId: string) {
  const response = await fetchWithFallback(`${API_BASE_URL}/api/get/accounts?userId=${userId}`);

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to fetch GET accounts');
    throw new Error(errorMessage);
  }

  return response.json() as Promise<{ linked: boolean; accounts: Array<{ id: string; accountDisplayName: string; balance: number | null }> }>;
}

export async function getUserBalance(params: { name?: string; email?: string; userId?: string }) {
  const headers = await getAuthHeaders();
  const searchParams = new URLSearchParams();
  if (params.name) searchParams.set('name', params.name);
  if (params.email) searchParams.set('email', params.email);
  if (params.userId) searchParams.set('userId', params.userId);

  const response = await fetchWithFallback(`${API_BASE_URL}/api/admin/user-balance?${searchParams.toString()}`, {
    headers,
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to fetch user balance');
    throw new Error(errorMessage);
  }

  return response.json() as Promise<{
    user: {
      id: string;
      email: string | null;
      name: string | null;
    };
    weekWindow: {
      timezone: string;
      weekStart: string;
      weekEnd: string;
    };
    getLinkStatus: {
      linked: boolean;
      linkedAt: string | null;
      accountsFetchError: string | null;
    };
    getBalance: Array<{ id: string; accountDisplayName: string; balance: number | null }> | null;
    trackedGetBalanceTotal: number;
    weeklyAllowance: {
      weeklyLimit: number;
      usedAmount: number;
      remainingAmount: number;
    } | null;
    requesterUsage: {
      allTimeClaimsCount: number;
      allTimeClaimsAmount: number;
      allTimeRedeemedCount: number;
      allTimeRedeemedAmount: number;
      thisWeekClaimsCount: number;
      thisWeekClaimsAmount: number;
      thisWeekRedeemedCount: number;
      thisWeekRedeemedAmount: number;
      activeClaimsCount: number;
    };
    donorUsage: {
      status: string;
      weeklyAmount: number;
      redeemedThisWeek: number;
      reservedThisWeek: number;
      remainingThisWeek: number;
      allTimeRedeemedAmount: number;
      allTimeRedeemedCount: number;
    } | null;
  }>;
}

export async function getMobileAppConfig() {
  const response = await fetchWithFallback(`${API_BASE_URL}/api/mobile/config`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to fetch mobile update policy');
    throw new Error(errorMessage);
  }

  return response.json() as Promise<MobileUpdatePolicyResponse>;
}
