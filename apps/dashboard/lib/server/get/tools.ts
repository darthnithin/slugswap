type GetEnvelope<TParams> = {
  method: string;
  params: TParams;
};

type GetResult<TResponse> = {
  response?: TResponse;
  exception?: { message?: string; [key: string]: unknown };
};

const GET_BASE_URL =
  process.env.GET_API_BASE_URL ||
  "https://services.get.cbord.com/GETServices/services/json";

type GetService = "authentication" | "user" | "commerce";

export class GetApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GetApiError";
  }
}

function resolveErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }
  const maybe = payload as { exception?: { message?: string } };
  return maybe.exception?.message || fallback;
}

export async function callGetApi<TParams, TResponse>(
  service: GetService,
  method: string,
  params: TParams
): Promise<TResponse> {
  const body: GetEnvelope<TParams> = { method, params };
  const response = await fetch(`${GET_BASE_URL}/${service}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  let payload: GetResult<TResponse> | null = null;
  try {
    payload = (await response.json()) as GetResult<TResponse>;
  } catch {
    if (!response.ok) {
      throw new GetApiError(
        `GET API ${service}.${method} failed with HTTP ${response.status}`
      );
    }
    throw new GetApiError(`GET API ${service}.${method} returned non-JSON response`);
  }

  if (!response.ok) {
    throw new GetApiError(resolveErrorMessage(payload, `GET API ${service}.${method} failed`));
  }

  if (payload?.exception) {
    throw new GetApiError(resolveErrorMessage(payload, `GET API ${service}.${method} error`));
  }

  return payload?.response as TResponse;
}

export function extractValidatedSessionId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const uuidRegex =
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/;

  if (uuidRegex.test(trimmed)) {
    return trimmed.match(uuidRegex)?.[0] || null;
  }

  try {
    const parsed = new URL(trimmed);
    const fromParam =
      parsed.searchParams.get("sessionId") || parsed.searchParams.get("sessionID");
    if (fromParam && uuidRegex.test(fromParam)) {
      return fromParam.match(uuidRegex)?.[0] || null;
    }
    const asPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return asPath.match(uuidRegex)?.[0] || null;
  } catch {
    return null;
  }
}

export function generateDeviceId(): string {
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

export async function createPin(
  validatedSessionId: string,
  deviceId: string,
  pin: string
) {
  const response = await callGetApi<
    { sessionId: string; deviceId: string; PIN: string },
    boolean
  >("user", "createPIN", {
    sessionId: validatedSessionId,
    deviceId,
    PIN: pin,
  });

  if (response !== true) {
    throw new GetApiError("GET createPIN did not succeed");
  }
}

export async function authenticatePin(pin: string, deviceId: string): Promise<string> {
  const sessionId = await callGetApi<
    {
      pin: string;
      deviceId: string;
      systemCredentials: { userName: string; password: string; domain: string };
    },
    string
  >("authentication", "authenticatePIN", {
    pin,
    deviceId,
    systemCredentials: {
      userName: process.env.GET_SYSTEM_USERNAME || "get_mobile",
      password: process.env.GET_SYSTEM_PASSWORD || "NOTUSED",
      domain: process.env.GET_SYSTEM_DOMAIN || "",
    },
  });

  if (typeof sessionId !== "string" || !sessionId.trim()) {
    throw new GetApiError("GET authenticatePIN returned an invalid session");
  }

  return sessionId;
}

export async function verifyPin(sessionId: string, deviceId: string, pin: string) {
  const response = await callGetApi<
    { sessionId: string; deviceId: string; oldPIN: string; newPIN: string },
    boolean
  >("user", "updatePIN", {
    sessionId,
    deviceId,
    oldPIN: pin,
    newPIN: pin,
  });

  if (response !== true) {
    throw new GetApiError("GET updatePIN validation failed");
  }
}

export type GetAccount = {
  id: string;
  accountDisplayName: string;
  isActive: boolean;
  isAccountTenderActive: boolean;
  depositAccepted: boolean;
  balance: number | null;
};

type RetrieveAccountsResponse =
  | GetAccount[]
  | { accounts?: GetAccount[]; planName?: string };

export async function retrieveAccounts(sessionId: string): Promise<GetAccount[]> {
  const raw = await callGetApi<{ sessionId: string }, RetrieveAccountsResponse>(
    "commerce",
    "retrieveAccounts",
    { sessionId }
  );

  return Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.accounts)
      ? raw.accounts
      : [];
}

export async function revokePin(sessionId: string, deviceId: string) {
  const response = await callGetApi<{ deviceId: string; sessionId: string }, boolean>(
    "user",
    "deletePIN",
    {
      deviceId,
      sessionId,
    }
  );

  if (response !== true) {
    throw new GetApiError("GET deletePIN failed");
  }
}
