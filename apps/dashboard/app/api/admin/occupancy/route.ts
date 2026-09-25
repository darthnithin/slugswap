import { NextRequest, NextResponse } from "next/server";
import { FACILITIES, getOccupancyHistory } from "@slugswap/occupancy";
import { isAdminRequestAuthenticated } from "@/lib/server/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdminRequestAuthenticated(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const facility =
    request.nextUrl.searchParams.get("facility") ?? FACILITIES[0].id;
  const days = Number(request.nextUrl.searchParams.get("days") ?? 7);
  if (
    !FACILITIES.some((f) => f.id === facility) ||
    ![1, 7, 30].includes(days)
  ) {
    return NextResponse.json(
      { error: "Choose a listed facility and 1, 7, or 30 days." },
      { status: 400 },
    );
  }
  try {
    const history = await getOccupancyHistory(
      process.env.DATABASE_URL!,
      facility,
      days,
    );
    return NextResponse.json(history, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Occupancy history could not be loaded." },
      { status: 503 },
    );
  }
}
