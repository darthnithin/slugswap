const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

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

  return response.json();
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
  const response = await fetch(`${API_BASE_URL}/api/requesters/allowance?userId=${userId}`);

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

  return response.json();
}

export async function getClaimHistory(userId: string) {
  const response = await fetch(`${API_BASE_URL}/api/claims/history?userId=${userId}`);

  if (!response.ok) {
    const errorMessage = await readApiError(response, 'Failed to fetch claim history');
    throw new Error(errorMessage);
  }

  return response.json();
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
