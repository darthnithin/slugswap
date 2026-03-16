import { NextRequest, NextResponse } from "next/server";
import { requireMobileIdentity } from "@/lib/server/mobile-auth";
import {
  getWebPushClientConfig,
} from "@/lib/server/notifications/web";
import {
  registerInstallation,
  unregisterInstallation,
} from "@/lib/server/notifications/installations";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ action: string }> };

function unauthorizedStatus(message: string) {
  return message === "Missing authorization header" || message === "Invalid token"
    ? 401
    : 500;
}

async function handleConfig(req: NextRequest) {
  if (req.method !== "GET") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  return NextResponse.json(getWebPushClientConfig(), { status: 200 });
}

async function handleRegisterInstallation(req: NextRequest) {
  if (req.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const identity = await requireMobileIdentity(req);
    const body = await req.json();
    const result = await registerInstallation(identity, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error: any) {
    const message = error?.message || "Internal server error";
    return NextResponse.json({ error: message }, { status: unauthorizedStatus(message) });
  }
}

async function handleUnregisterInstallation(req: NextRequest) {
  if (req.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const identity = await requireMobileIdentity(req);
    const body = (await req.json()) as { installationId?: string };
    const result = await unregisterInstallation(identity, body.installationId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error: any) {
    const message = error?.message || "Internal server error";
    return NextResponse.json({ error: message }, { status: unauthorizedStatus(message) });
  }
}

async function dispatch(req: NextRequest, ctx: Ctx) {
  const { action } = await ctx.params;

  if (action === "config") return handleConfig(req);
  if (action === "register-installation") return handleRegisterInstallation(req);
  if (action === "unregister-installation") return handleUnregisterInstallation(req);

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
