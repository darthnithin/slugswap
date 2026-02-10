import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const loginUrl = process.env.GET_LOGIN_URL;
  if (!loginUrl) {
    return res.status(400).json({ error: "GET_LOGIN_URL is not configured" });
  }

  return res.status(200).json({ loginUrl });
}
