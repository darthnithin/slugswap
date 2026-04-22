import { NextRequest, NextResponse } from "next/server";
import {
  COLLEGE_NINE_LOCATION_ID,
  FoodProError,
  getDiningMenu,
} from "@/lib/server/menus/foodpro";

export const runtime = "nodejs";

function todayInPacific(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return new Date().toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

export async function GET(req: NextRequest) {
  const locationId =
    req.nextUrl.searchParams.get("locationId")?.trim() || COLLEGE_NINE_LOCATION_ID;
  const date = req.nextUrl.searchParams.get("date")?.trim() || todayInPacific();

  try {
    const menu = await getDiningMenu({ locationId, date });
    return NextResponse.json(menu, { status: 200 });
  } catch (error) {
    const status = error instanceof FoodProError ? error.status : 503;
    const message = error instanceof Error ? error.message : "Failed to load dining menu";
    if (status >= 500) {
      console.error("Error loading dining menu:", error);
    } else {
      console.warn("Invalid dining menu request:", message);
    }
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
