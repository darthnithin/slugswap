import { processDonorSpendNotificationQueue } from "@/lib/server/notifications/donor-spend";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processDonorSpendNotificationQueue();
    return Response.json({
      ok: true,
      ...result,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Notification recovery cron failed", error);
    return Response.json({ error: "Notification recovery failed" }, { status: 500 });
  }
}
