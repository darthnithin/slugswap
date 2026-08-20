import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  authenticateAppUser,
  deleteAppUserIdentity,
  syncAuthenticatedUser,
} from "@/lib/server/app-user-auth";
import {
  deleteStoredAccountData,
  revokeLinkedGetAccount,
  runAccountDeletion,
} from "@/lib/server/account-deletion";
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
      const body = (await req.json().catch(() => null)) as {
        name?: unknown;
        avatar_url?: unknown;
      } | null;
      if (!body) {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const { name, avatar_url } = body;
      if (name !== undefined && name !== null && typeof name !== "string") {
        return NextResponse.json({ error: "name must be a string or null" }, { status: 400 });
      }
      const normalizedName = typeof name === "string" ? name.trim() : null;
      if (normalizedName && normalizedName.length > 100) {
        return NextResponse.json({ error: "name is too long" }, { status: 400 });
      }

      if (
        avatar_url !== undefined &&
        avatar_url !== null &&
        typeof avatar_url !== "string"
      ) {
        return NextResponse.json(
          { error: "avatar_url must be an HTTPS URL or null" },
          { status: 400 }
        );
      }
      const normalizedAvatar =
        typeof avatar_url === "string" ? avatar_url.trim() : null;
      if (normalizedAvatar) {
        try {
          const parsed = new URL(normalizedAvatar);
          if (parsed.protocol !== "https:" || normalizedAvatar.length > 2048) {
            throw new Error("invalid avatar URL");
          }
        } catch {
          return NextResponse.json(
            { error: "avatar_url must be an HTTPS URL or null" },
            { status: 400 }
          );
        }
      }

      const updates: Partial<typeof users.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (name !== undefined) {
        updates.name = normalizedName || null;
      }
      if (avatar_url !== undefined) {
        updates.avatarUrl = normalizedAvatar || null;
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

  if (action === "delete-account") {
    if (req.method !== "DELETE") {
      return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
      const auth = await authenticateAppUser(req);
      if ("response" in auth) {
        return auth.response;
      }

      const userId = auth.user.id;
      await runAccountDeletion(
        () => revokeLinkedGetAccount(userId),
        () => deleteStoredAccountData(userId),
        () => deleteAppUserIdentity(userId)
      );

      return NextResponse.json({ success: true }, { status: 200 });
    } catch (error: any) {
      console.error("Error deleting account:", error);
      return NextResponse.json(
        { error: error?.message || "Failed to delete account" },
        { status: 500 }
      );
    }
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
