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

export async function deleteAppUserIdentity(userId: string): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.auth.admin.deleteUser(userId);

  if (error) {
    throw new Error(`Failed to delete Supabase user: ${error.message}`);
  }
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

function metadataString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function syncAuthenticatedUser(user: User) {
  const metadataName =
    metadataString(user.user_metadata?.full_name) ??
    metadataString(user.user_metadata?.name);
  const metadataAvatar =
    metadataString(user.user_metadata?.avatar_url) ??
    metadataString(user.user_metadata?.picture);

  await db
    .insert(users)
    .values({
      id: user.id,
      email: user.email || `${user.id}@unknown.local`,
      name: metadataName,
      avatarUrl: metadataAvatar,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: user.email || `${user.id}@unknown.local`,
        updatedAt: new Date(),
      },
    });
}
