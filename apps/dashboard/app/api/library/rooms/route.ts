import { NextRequest, NextResponse } from "next/server";

import {
  getLibraryAvailability,
  getPacificDate,
  isLibraryId,
  LibCalError,
} from "@/lib/server/library/libcal";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const library = req.nextUrl.searchParams.get("library")?.trim() ?? "";
  const date = req.nextUrl.searchParams.get("date")?.trim() || getPacificDate();
  if (!isLibraryId(library)) {
    return NextResponse.json({ error: "Choose a valid UCSC library." }, { status: 400 });
  }

  try {
    const availability = await getLibraryAvailability(library, date);
    return NextResponse.json(availability, {
      status: 200,
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=15" },
    });
  } catch (error) {
    const status = error instanceof LibCalError ? error.status : 503;
    const message = error instanceof Error ? error.message : "Failed to load room availability.";
    console.error("Library availability error:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

function methodNotAllowed() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
