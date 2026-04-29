import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RequestBody = {
  endpoint?: string;
  action?: string;
  code?: string;
  timestamp?: string;
  rawOptions?: string;
  encodedOptions?: string;
};

function badRequest(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

function isSafeHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RequestBody | null;

  if (!body) {
    return badRequest("Expected a JSON request body.");
  }

  const endpoint = body.endpoint?.trim();
  const action = body.action?.trim();
  const code = body.code?.trim();
  const timestamp = body.timestamp?.trim() || String(Date.now());
  const rawOptions = body.rawOptions ?? "";
  const encodedOptions =
    body.encodedOptions?.trim() || Buffer.from(rawOptions, "utf8").toString("base64");

  if (!endpoint || !isSafeHttpUrl(endpoint)) {
    return badRequest("Provide a valid http or https endpoint.");
  }

  if (!action) {
    return badRequest("Action is required.");
  }

  if (!code) {
    return badRequest("Code is required.");
  }

  const upstreamUrl = new URL(endpoint);
  upstreamUrl.searchParams.set("t", timestamp);
  upstreamUrl.searchParams.set("action", action);
  upstreamUrl.searchParams.set("code", code);
  upstreamUrl.searchParams.set("options", encodedOptions);

  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      "user-agent": "SlugSwap MBHI Lab",
    },
    cache: "no-store",
  }).catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Could not reach the upstream endpoint.";
    throw new Error(message);
  });

  const responseText = await upstreamResponse.text();

  return NextResponse.json({
    requestUrl: upstreamUrl.toString(),
    encodedOptions,
    rawOptions,
    status: upstreamResponse.status,
    ok: upstreamResponse.ok,
    contentType: upstreamResponse.headers.get("content-type"),
    responseText,
  });
}
