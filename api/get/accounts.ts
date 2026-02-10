import type { VercelRequest, VercelResponse } from "@vercel/node";
import { callGetApi } from "./_lib/get-tools";
import { getActiveGetSession } from "./_lib/get-session";

type GetAccount = {
  id: string;
  accountDisplayName: string;
  isActive: boolean;
  isAccountTenderActive: boolean;
  depositAccepted: boolean;
  balance: number | null;
};

type RetrieveAccountsResponse =
  | GetAccount[]
  | {
      accounts?: GetAccount[];
      planName?: string;
    };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const userId = req.query.userId;
    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "Missing userId" });
    }

    const { sessionId } = await getActiveGetSession(userId);
    const retrieveAccountsResponse = await callGetApi<
      { sessionId: string },
      RetrieveAccountsResponse
    >(
      "commerce",
      "retrieveAccounts",
      { sessionId }
    );
    console.log(
      "[GET retrieveAccounts] full response:",
      JSON.stringify(retrieveAccountsResponse, null, 2)
    );

    const normalizedAccounts = Array.isArray(retrieveAccountsResponse)
      ? retrieveAccountsResponse
      : Array.isArray(retrieveAccountsResponse?.accounts)
      ? retrieveAccountsResponse.accounts
      : [];

    return res.status(200).json({
      linked: true,
      accounts: normalizedAccounts,
      planName:
        !Array.isArray(retrieveAccountsResponse) &&
        typeof retrieveAccountsResponse?.planName === "string"
          ? retrieveAccountsResponse.planName
          : null,
    });
  } catch (error: any) {
    const message = error?.message || "Failed to retrieve GET accounts";
    const status = message.includes("not linked") ? 400 : 500;
    return res.status(status).json({ error: message });
  }
}
