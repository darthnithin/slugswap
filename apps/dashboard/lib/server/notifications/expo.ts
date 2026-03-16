type ExpoPushPayload = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string | number>;
  sound?: "default";
};

type ExpoPushTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
};

type ExpoPushResponse = {
  data?: ExpoPushTicket | ExpoPushTicket[];
  errors?: Array<{ message?: string; code?: string }>;
};

export type ExpoPushSendResult = {
  ok: boolean;
  errorCode: string | null;
  errorMessage: string | null;
};

export function isLikelyExpoPushToken(token: string): boolean {
  return /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(token);
}

export async function sendExpoPushNotification(
  payload: ExpoPushPayload
): Promise<ExpoPushSendResult> {
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const bodyText = await response.text();
      return {
        ok: false,
        errorCode: "HTTP_ERROR",
        errorMessage: bodyText.slice(0, 300) || `HTTP ${response.status}`,
      };
    }

    const parsed = (await response.json()) as ExpoPushResponse;
    const firstTicket = Array.isArray(parsed.data) ? parsed.data[0] : parsed.data;
    if (firstTicket?.status === "ok") {
      return { ok: true, errorCode: null, errorMessage: null };
    }

    const expoErrorCode = firstTicket?.details?.error || null;
    const expoMessage =
      firstTicket?.message || parsed.errors?.[0]?.message || "Failed to send push notification";

    return {
      ok: false,
      errorCode: expoErrorCode,
      errorMessage: expoMessage,
    };
  } catch (error: any) {
    return {
      ok: false,
      errorCode: "NETWORK_ERROR",
      errorMessage: error?.message || "Unknown push send error",
    };
  }
}
