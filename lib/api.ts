import { supabase } from './supabase';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

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

async function readApiError(response: Response, fallback: string): Promise<string> {
  const bodyText = await response.text();
  if (!bodyText) return fallback;

  try {
    const parsed = JSON.parse(bodyText) as { error?: string; message?: string };
    return parsed.error || parsed.message || fallback;
  } catch {
    // Some upstream failures return plain text (for example, Vercel 502 pages).
    return bodyText.slice(0, 200) || fallback;
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

export async function setDonation(userId: string, amount: number, userEmail?: string | null) {
  const response = await fetch(`${API_BASE_URL}/api/donations/set`, {
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
  const response = await fetch(`${API_BASE_URL}/api/donations/impact?userId=${userId}`);

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to fetch impact');
    throw new Error(errorMessage);
  }

  return response.json() as Promise<DonorImpact>;
}

export async function pauseDonation(userId: string, paused: boolean) {
  const response = await fetch(`${API_BASE_URL}/api/donations/pause`, {
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
  const response = await fetch(`${API_BASE_URL}/api/requesters/allowance?userId=${userId}`, {
    headers,
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to fetch allowance');
    throw new Error(errorMessage);
  }

  return response.json();
}

export async function generateClaimCode(userId: string, amount: number) {
  const response = await fetch(`${API_BASE_URL}/api/claims/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, amount }),
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to generate claim code');
    throw new Error(errorMessage);
  }

  return response.json() as Promise<{ success: boolean; claimCode: ClaimCodePayload }>;
}

export async function getClaimHistory(userId: string) {
  const response = await fetch(`${API_BASE_URL}/api/claims/history?userId=${userId}`);

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to fetch claim history');
    throw new Error(errorMessage);
  }

  return response.json();
}

export async function refreshClaimCode(userId: string, claimCodeId: string) {
  const response = await fetch(`${API_BASE_URL}/api/claims/refresh`, {
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
  const response = await fetch(`${API_BASE_URL}/api/claims/check-redemption`, {
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
  const response = await fetch(`${API_BASE_URL}/api/claims/delete`, {
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
  const response = await fetch(`${API_BASE_URL}/api/get/login-url`);

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to load GET login URL');
    throw new Error(errorMessage);
  }

  return response.json() as Promise<{ loginUrl: string }>;
}

export async function getGetLinkStatus(userId: string) {
  const response = await fetch(`${API_BASE_URL}/api/get/link-status?userId=${userId}`);

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
  const response = await fetch(`${API_BASE_URL}/api/get/link`, {
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
  const response = await fetch(`${API_BASE_URL}/api/get/link?userId=${userId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to unlink GET account');
    throw new Error(errorMessage);
  }

  return response.json() as Promise<{ success: boolean; linked: boolean }>;
}

export async function getGetAccounts(userId: string) {
  const response = await fetch(`${API_BASE_URL}/api/get/accounts?userId=${userId}`);

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

  const response = await fetch(`${API_BASE_URL}/api/admin/user-balance?${searchParams.toString()}`, {
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
  const response = await fetch(`${API_BASE_URL}/api/mobile/config`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to fetch mobile update policy');
    throw new Error(errorMessage);
  }

  return response.json() as Promise<MobileUpdatePolicyResponse>;
}
