import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db } from "../../db";
import { getCredentials } from "../../db/schema";
import { eq } from "drizzle-orm";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const userId = req.query.userId;
    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "Missing userId" });
    }

    const credential = await db.query.getCredentials.findFirst({
      where: eq(getCredentials.userId, userId),
    });

    return res.status(200).json({
      linked: !!credential,
      linkedAt: credential?.linkedAt ?? null,
    });
  } catch (error) {
    console.error("Error checking GET link status:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
