import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  authenticateAppUser,
  syncAuthenticatedUser,
} from "@/lib/server/app-user-auth";
import { db } from "@/lib/server/db";
import { users } from "@/lib/server/schema";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ action: string }> };

async function dispatch(req: NextRequest, ctx: Ctx) {
  const { action } = await ctx.params;

  if (action === "me") {
    if (req.method !== "GET") {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }
    try {
      const auth = await authenticateAppUser(req);
      if ("response" in auth) {
        return auth.response;
      }
      await syncAuthenticatedUser(auth.user);

      const user = await db.query.users.findFirst({
        where: eq(users.id, auth.user.id),
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
    const auth = await authenticateAppUser(req);
    if ("response" in auth) {
      return auth.response;
    }
    await syncAuthenticatedUser(auth.user);
    const user = auth.user;

    if (req.method === "GET") {
      const data = await db.query.users.findFirst({
        where: eq(users.id, user.id),
      });

      if (!data) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      return NextResponse.json(data, { status: 200 });
    }

    if (req.method === "PATCH") {
      const { name, avatar_url } = (await req.json()) as {
        name?: string;
        avatar_url?: string;
      };
      const updates: Partial<typeof users.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (name !== undefined) {
        updates.name = typeof name === "string" ? name : null;
      }
      if (avatar_url !== undefined) {
        updates.avatarUrl = typeof avatar_url === "string" ? avatar_url : null;
      }
      const [data] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, user.id))
        .returning();

      if (!data) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
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
