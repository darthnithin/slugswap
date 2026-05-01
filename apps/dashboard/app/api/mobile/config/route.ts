import { NextResponse } from "next/server";
import { getAdminConfig } from "@/lib/server/config";

export const runtime = "nodejs";
const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=3600";

export async function GET() {
  try {
    const { config, updatedAt } = await getAdminConfig();

    return NextResponse.json(
      {
        updatePolicy: {
          iosRequiredVersion: config.iosRequiredVersion,
          androidRequiredVersion: config.androidRequiredVersion,
          iosStoreUrl: config.iosStoreUrl,
          androidStoreUrl: config.androidStoreUrl,
        },
        updatedAt: updatedAt.toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": CACHE_CONTROL,
        },
      }
    );
  } catch (error) {
    console.error("Error loading mobile update policy:", error);
    return NextResponse.json(
      { error: "Failed to load mobile update policy" },
      { status: 500 }
    );
  }
}
