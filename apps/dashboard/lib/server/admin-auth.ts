import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const ADMIN_SESSION_COOKIE = "slugswap_admin_session";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

type SessionPayload = {
  sub: string;
  email: string;
  exp: number;
};

export type AdminIdentity = {
  userId: string;
  email: string;
};

export type AdminBearerAuthResult =
  | { status: "authenticated"; identity: AdminIdentity }
  | { status: "invalid_token" }
  | { status: "forbidden" };

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase environment variables are not configured");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function getAdminSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SESSION_SECRET is not configured");
  }
  return secret;
}

function getAdminEmailAllowlist(): Set<string> {
  const raw = process.env.ADMIN_EMAIL_ALLOWLIST;
  if (!raw) {
    throw new Error("ADMIN_EMAIL_ALLOWLIST is not configured");
  }

  const emails = raw
    .split(/[\s,;]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (emails.length === 0) {
    throw new Error("ADMIN_EMAIL_ALLOWLIST is empty");
  }

  return new Set(emails);
}

function isAdminEmail(email: string): boolean {
  return getAdminEmailAllowlist().has(email.trim().toLowerCase());
}

function signPayload(payloadBase64Url: string): string {
  return crypto
    .createHmac("sha256", getAdminSessionSecret())
    .update(payloadBase64Url)
    .digest("base64url");
}

function decodePayload(payloadBase64Url: string): SessionPayload | null {
  try {
    const decoded = Buffer.from(payloadBase64Url, "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as SessionPayload;

    if (
      !payload ||
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export async function authenticateAdminBearerToken(
  bearerToken: string
): Promise<AdminBearerAuthResult> {
  const supabase = getSupabaseAdminClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(bearerToken);

  if (error || !user?.id || !user.email) {
    return { status: "invalid_token" };
  }

  const email = user.email.trim().toLowerCase();
  if (!isAdminEmail(email)) {
    return { status: "forbidden" };
  }

  return {
    status: "authenticated",
    identity: {
      userId: user.id,
      email,
    },
  };
}

function createAdminSessionToken(identity: AdminIdentity): string {
  const payload: SessionPayload = {
    sub: identity.userId,
    email: identity.email,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };

  const payloadBase64Url = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signPayload(payloadBase64Url);
  return `${payloadBase64Url}.${signature}`;
}

export function getAdminIdentityFromSessionToken(
  token: string | null | undefined
): AdminIdentity | null {
  if (!token) {
    return null;
  }

  const [payloadBase64Url, signature] = token.split(".");
  if (!payloadBase64Url || !signature) {
    return null;
  }

  const expectedSignature = signPayload(payloadBase64Url);
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  const payload = decodePayload(payloadBase64Url);
  if (!payload || payload.exp <= Date.now()) {
    return null;
  }

  if (!isAdminEmail(payload.email)) {
    return null;
  }

  return {
    userId: payload.sub,
    email: payload.email,
  };
}

export function verifyAdminSessionToken(token: string | null | undefined): boolean {
  return !!getAdminIdentityFromSessionToken(token);
}

export function getAdminIdentityFromRequest(req: NextRequest): AdminIdentity | null {
  return getAdminIdentityFromSessionToken(req.cookies.get(ADMIN_SESSION_COOKIE)?.value);
}

export function isAdminRequestAuthenticated(req: NextRequest): boolean {
  return !!getAdminIdentityFromRequest(req);
}

export function withAdminSessionCookie(response: NextResponse, identity: AdminIdentity): NextResponse {
  response.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(identity), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}

export function clearAdminSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}

export type ResolvedIdentity = {
  userId: string;
  email: string;
};

/**
 * Resolves the calling user's identity from either a Supabase Bearer token
 * or a valid admin session cookie. Returns null if neither is present or valid.
 */
export async function resolveRequestIdentity(
  req: NextRequest
): Promise<ResolvedIdentity | null> {
  // 1. Try Bearer token via Supabase
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    try {
      const supabase = getSupabaseAdminClient();
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user?.id && user.email) {
        return { userId: user.id, email: user.email };
      }
    } catch {
      // fall through to cookie check
    }
  }

  // 2. Fall back to admin session cookie
  const identity = getAdminIdentityFromRequest(req);
  if (identity) {
    return { userId: identity.userId, email: identity.email };
  }

  return null;
}
