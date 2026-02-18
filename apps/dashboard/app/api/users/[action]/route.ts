import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { users } from "@/lib/server/schema";
import { resolveRequestIdentity } from "@/lib/server/admin-auth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ action: string }> };

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase server environment variables are not configured");
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

async function dispatch(req: NextRequest, ctx: Ctx) {
  const { action } = await ctx.params;

  if (action === "me") {
    if (req.method !== "GET") {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }
    try {
      const identity = await resolveRequestIdentity(req);
      if (!identity) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const user = await db.query.users.findFirst({
        where: eq(users.id, identity.userId),
      });

      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      return NextResponse.json(user, { status: 200 });
    } catch (error: any) {
      console.error("Error fetching user:", error);
      return NextResponse.json(
        { error: error?.message || "Internal server error" },
        { status: 500 }
      );
    }
  }

  if (action === "profile") {
    let supabase;
    try {
      supabase = getSupabaseAdminClient();
    } catch (error: any) {
      return NextResponse.json({ error: error?.message || "Server misconfigured" }, { status: 500 });
    }

    const identity = await resolveRequestIdentity(req);
    if (!identity) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", identity.userId)
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(data, { status: 200 });
    }

    if (req.method === "PATCH") {
      const { name, avatar_url } = (await req.json()) as {
        name?: string;
        avatar_url?: string;
      };
      const { data, error } = await supabase
        .from("users")
        .update({ name, avatar_url })
        .eq("id", identity.userId)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(data, { status: 200 });
    }

    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!action) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return dispatch(req, ctx);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return dispatch(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return dispatch(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return dispatch(req, ctx);
}
