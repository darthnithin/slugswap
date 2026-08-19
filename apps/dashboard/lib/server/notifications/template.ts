export type DonorSpendTemplateVariables = {
  amount: number;
};

export function formatNotificationAmount(amount: number): string {
  if (!Number.isFinite(amount)) return "0";
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}

export function renderDonorSpendTemplate(
  template: string,
  variables: DonorSpendTemplateVariables
): string {
  return template.replace(
    /{{\s*amount\s*}}/g,
    formatNotificationAmount(variables.amount)
  );
}

export type ExpoPushTicketSummary = {
  errors: string[];
  successfulTickets: ExpoPushTicket[];
  unregisteredTokens: string[];
};

export type ExpoPushTicket = {
  id: string;
  token: string;
};

export type ExpoPushReceiptSummary = {
  errors: string[];
  isValid: boolean;
  pendingTicketIds: string[];
  successfulTicketIds: string[];
  unregisteredTokens: string[];
};

export function buildExpoPushMessages(
  tokens: string[],
  title: string,
  body: string,
  claimCodeId: string
) {
  return tokens.map((to) => ({
    to,
    title,
    body,
    sound: "default" as const,
    channelId: "donor-updates",
    data: {
      kind: "donor_spend",
      claimCodeId,
    },
  }));
}

export function summarizeExpoPushTickets(
  payload: unknown,
  tokens: string[]
): ExpoPushTicketSummary {
  const data =
    payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : null;

  if (!data) {
    return {
      errors: ["Expo Push API returned an invalid response"],
      successfulTickets: [],
      unregisteredTokens: [],
    };
  }

  const errors: string[] = [];
  const successfulTickets: ExpoPushTicket[] = [];
  const unregisteredTokens: string[] = [];

  data.forEach((rawTicket, index) => {
    const ticket = rawTicket as {
      status?: unknown;
      id?: unknown;
      message?: unknown;
      details?: { error?: unknown };
    };
    const token = tokens[index];
    if (ticket?.status === "ok" && typeof ticket.id === "string" && token) {
      successfulTickets.push({ id: ticket.id, token });
      return;
    }

    const detail = ticket?.details?.error;
    if (detail === "DeviceNotRegistered" && token) {
      unregisteredTokens.push(token);
    }
    errors.push(
      typeof ticket?.message === "string"
        ? ticket.message
        : typeof detail === "string"
          ? detail
          : "Expo Push API rejected a notification"
    );
  });

  if (data.length < tokens.length) {
    errors.push("Expo Push API omitted one or more notification tickets");
  }

  return { errors, successfulTickets, unregisteredTokens };
}

export function serializeExpoPushTickets(tickets: ExpoPushTicket[]): string {
  return JSON.stringify(tickets);
}

export function parseExpoPushTickets(value: string | null): ExpoPushTicket[] | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const tickets = parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const candidate = entry as { id?: unknown; token?: unknown };
      return typeof candidate.id === "string" && typeof candidate.token === "string"
        ? [{ id: candidate.id, token: candidate.token }]
        : [];
    });

    return tickets.length === parsed.length ? tickets : null;
  } catch {
    return null;
  }
}

export function summarizeExpoPushReceipts(
  payload: unknown,
  tickets: ExpoPushTicket[]
): ExpoPushReceiptSummary {
  const data =
    payload &&
    typeof payload === "object" &&
    (payload as { data?: unknown }).data &&
    typeof (payload as { data: unknown }).data === "object" &&
    !Array.isArray((payload as { data: unknown }).data)
      ? ((payload as { data: Record<string, unknown> }).data)
      : null;

  if (!data) {
    return {
      errors: ["Expo Push Receipt API returned an invalid response"],
      isValid: false,
      pendingTicketIds: [],
      successfulTicketIds: [],
      unregisteredTokens: [],
    };
  }

  const errors: string[] = [];
  const pendingTicketIds: string[] = [];
  const successfulTicketIds: string[] = [];
  const unregisteredTokens: string[] = [];

  for (const ticket of tickets) {
    const rawReceipt = data[ticket.id];
    if (rawReceipt === undefined) {
      pendingTicketIds.push(ticket.id);
      continue;
    }

    const receipt = rawReceipt as {
      status?: unknown;
      message?: unknown;
      details?: { error?: unknown };
    };
    if (receipt?.status === "ok") {
      successfulTicketIds.push(ticket.id);
      continue;
    }

    const detail = receipt?.details?.error;
    if (detail === "DeviceNotRegistered") {
      unregisteredTokens.push(ticket.token);
    }
    errors.push(
      typeof receipt?.message === "string"
        ? receipt.message
        : typeof detail === "string"
          ? detail
          : "Expo could not deliver a notification to the push provider"
    );
  }

  return {
    errors,
    isValid: true,
    pendingTicketIds,
    successfulTicketIds,
    unregisteredTokens,
  };
}
