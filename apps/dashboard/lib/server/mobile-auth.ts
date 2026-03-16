import { createClient, type User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export type MobileIdentity = {
  userId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
};

function getSupabaseServiceClient() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase environment variables not configured");
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

function toMobileIdentity(user: User): MobileIdentity {
  return {
    userId: user.id,
    email: user.email ?? null,
    name: (user.user_metadata?.name as string | undefined) ?? null,
    avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
  };
}

export function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token.trim() || null;
}

export async function requireMobileIdentity(req: NextRequest): Promise<MobileIdentity> {
  const token = extractBearerToken(req);
  if (!token) {
    throw new Error("Missing authorization header");
  }

  const supabase = getSupabaseServiceClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error("Invalid token");
  }

  return toMobileIdentity(user);
}
