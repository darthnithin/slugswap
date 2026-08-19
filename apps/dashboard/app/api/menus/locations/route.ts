import { NextResponse } from "next/server";
import {
  describeFoodProError,
  FoodProError,
  getDiningLocations,
} from "@/lib/server/menus/foodpro";

export const runtime = "nodejs";

export async function GET() {
  try {
    const locations = await getDiningLocations();
    return NextResponse.json({ locations }, { status: 200 });
  } catch (error) {
    const status = error instanceof FoodProError ? error.status : 503;
    const message =
      error instanceof Error ? error.message : "Failed to load dining locations";
    if (status >= 500) {
      console.error("Dining locations upstream request failed", {
        route: "/api/menus/locations",
        errors: describeFoodProError(error),
      });
    } else {
      console.warn("Invalid dining locations request:", message);
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
