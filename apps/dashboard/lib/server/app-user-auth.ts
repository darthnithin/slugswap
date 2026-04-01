import { createClient, type User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { users } from "@/lib/server/schema";

function getSupabaseServiceClient() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase environment variables not configured");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export function unauthorizedAppUserResponse(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 });
}

function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function authenticateAppUser(
  req: NextRequest
): Promise<{ user: User } | { response: NextResponse }> {
  const token = extractBearerToken(req);
  if (!token) {
    return { response: unauthorizedAppUserResponse() };
  }

  const supabase = getSupabaseServiceClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user?.id) {
    return { response: unauthorizedAppUserResponse("Invalid token") };
  }

  return { user };
}

export async function syncAuthenticatedUser(user: User) {
  await db
    .insert(users)
    .values({
      id: user.id,
      email: user.email || `${user.id}@unknown.local`,
      name: user.user_metadata?.name || null,
      avatarUrl: user.user_metadata?.avatar_url || null,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: user.email || `${user.id}@unknown.local`,
        name: user.user_metadata?.name || null,
        avatarUrl: user.user_metadata?.avatar_url || null,
        updatedAt: new Date(),
      },
    });
}
