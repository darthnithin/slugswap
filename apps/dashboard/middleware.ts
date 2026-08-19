import { NextRequest, NextResponse } from "next/server";

const DEFAULT_ALLOWED_HEADERS = "Content-Type, Authorization";
const DEFAULT_ALLOWED_METHODS = "GET, POST, PATCH, DELETE, OPTIONS";
const DEV_ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "http://localhost:19006",
  "http://127.0.0.1:19006",
]);

function getAllowedOrigins(): Set<string> {
  const allowedOrigins = new Set<string>();
  const raw = process.env.CORS_ALLOWED_ORIGINS;

  for (const value of raw?.split(/[\s,;]+/) ?? []) {
    const trimmed = value.trim();
    if (trimmed) {
      allowedOrigins.add(trimmed);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    for (const origin of DEV_ALLOWED_ORIGINS) {
      allowedOrigins.add(origin);
    }
  }

  return allowedOrigins;
}

function buildCorsHeaders(origin: string): Headers {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", DEFAULT_ALLOWED_METHODS);
  headers.set("Access-Control-Allow-Headers", DEFAULT_ALLOWED_HEADERS);
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin");
  return headers;
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) {
    if (req.method === "OPTIONS") {
      return new NextResponse(null, { status: 204 });
    }
    return NextResponse.next();
  }

  const allowedOrigins = getAllowedOrigins();
  const isSameOrigin = origin === req.nextUrl.origin;
  const isAllowedOrigin = isSameOrigin || allowedOrigins.has(origin);

  if (!isAllowedOrigin) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  }

  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  const response = NextResponse.next();
  corsHeaders.forEach((value, key) => {
    response.headers.set(key, value);
  });
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
