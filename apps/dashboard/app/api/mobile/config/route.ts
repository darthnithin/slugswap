import { NextResponse } from "next/server";
import { getAdminConfig } from "@/lib/server/config";

export const runtime = "nodejs";

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
      { status: 200 }
    );
  } catch (error) {
    console.error("Error loading mobile update policy:", error);
    return NextResponse.json(
      { error: "Failed to load mobile update policy" },
      { status: 500 }
    );
  }
}
