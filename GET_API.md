# GET API Reference (SlugSwap)

This document captures the GET API behavior currently used by the SlugSwap project, based on analysis of the public `cabalex/get-tools` implementation.

> Status: unofficial, reverse-engineered usage notes.  
> Treat this as integration guidance, not vendor-issued API documentation.

## Scope

- Base endpoint and request envelope
- Session authentication lifecycle
- Methods used in production-like flows
- Common request/response patterns
- Security boundaries for SlugSwap

## Source of Truth

- Primary reverse-engineered reference: [cabalex/get-tools](https://github.com/cabalex/get-tools)
- Key implementation files:
  - [`src/getStore.ts`](https://github.com/cabalex/get-tools/blob/main/src/getStore.ts)
  - [`src/onboarding/Onboarding.svelte`](https://github.com/cabalex/get-tools/blob/main/src/onboarding/Onboarding.svelte)
  - [`src/share/Share.svelte`](https://github.com/cabalex/get-tools/blob/main/src/share/Share.svelte)

## Base URL

```
https://services.get.cbord.com/GETServices/services/json
```

Requests are sent to:

```
POST {BASE_URL}/{service}
```

Examples:

- `POST /authentication`
- `POST /user`
- `POST /commerce`

## Request Envelope

All observed methods use a JSON RPC-like body:

```json
{
  "method": "methodName",
  "params": {
    "...": "..."
  }
}
```

Headers:

- `Content-Type: application/json`
- `Accept: application/json`

## Response Shape

Observed response patterns:

- Success payload is usually in `response`
- Failure payload is usually in `exception`

Examples:

```json
{
  "response": {
    "accounts": []
  }
}
```

```json
{
  "exception": {
    "message": "..."
  }
}
```

Some methods return primitive `response` values (`true`, string session id, etc.).

## Authentication + Session Lifecycle

### 1) Create a device PIN (`user.createPIN`)

Used after obtaining a valid GET web session id from the login flow.

Request (observed):

```json
{
  "method": "createPIN",
  "params": {
    "sessionId": "<validated-session-id>",
    "deviceId": "<16-char device id>",
    "PIN": "<4-digit pin>"
  }
}
```

Result:

- `response === true` on success

### 2) Exchange device PIN for API session (`authentication.authenticatePIN`)

Request:

```json
{
  "method": "authenticatePIN",
  "params": {
    "pin": "1234",
    "deviceId": "abcdef0123456789",
    "systemCredentials": {
      "userName": "get_mobile",
      "password": "NOTUSED",
      "domain": ""
    }
  }
}
```

Result:

- `response` is a session id string
- That session id is used in subsequent method calls

### 3) Keep-alive / validity check (`user.updatePIN`)

Pattern used by `get-tools`:

- call `updatePIN` with `oldPIN == newPIN`
- if it fails, consider credential invalid/revoked

### 4) Revoke device (`user.deletePIN`)

Request:

```json
{
  "method": "deletePIN",
  "params": {
    "deviceId": "abcdef0123456789",
    "sessionId": "<session-id>"
  }
}
```

Result:

- `response === true` means revocation succeeded

## Commerce Methods

### `commerce.retrieveAccounts`

Purpose:

- Fetch account balances and tender metadata

Observed request:

```json
{
  "method": "retrieveAccounts",
  "params": {
    "sessionId": "<session-id>"
  }
}
```

Observed account fields include:

- `id`
- `accountDisplayName`
- `isActive`
- `isAccountTenderActive`
- `depositAccepted`
- `balance`
- card-like metadata (`lastFour`, `nameOnMedia`, etc.)

### `commerce.retrieveTransactionHistoryWithinDateRange`

Purpose:

- Fetch transaction history for insights and trends

Observed request:

```json
{
  "method": "retrieveTransactionHistoryWithinDateRange",
  "params": {
    "sessionId": "<session-id>",
    "paymentSystemType": 0,
    "queryCriteria": {
      "maxReturnMostRecent": 1000,
      "newestDate": null,
      "oldestDate": "2025-01-01T00:00:00.000Z",
      "accountId": null
    }
  }
}
```

Observed transaction fields include:

- `transactionId`
- `amount`
- `resultingBalance`
- `postedDate`
- `actualDate`
- `locationId`
- `locationName`
- `accountName`

### `authentication.retrievePatronBarcodePayload`

Purpose:

- Fetch payload used to render a scannable barcode (PDF417 in `get-tools`)

Observed request:

```json
{
  "method": "retrievePatronBarcodePayload",
  "params": {
    "sessionId": "<session-id>"
  }
}
```

Result:

- `response` is barcode payload data consumable by barcode renderer

## Method Inventory (Observed)

| Service | Method | Typical Use |
|---|---|---|
| `authentication` | `authenticatePIN` | Exchange `deviceId` + `pin` for session id |
| `authentication` | `retrievePatronBarcodePayload` | Generate scan code payload |
| `user` | `createPIN` | Create device credential |
| `user` | `updatePIN` | Verify credential still valid |
| `user` | `deletePIN` | Revoke device credential |
| `commerce` | `retrieveAccounts` | Read balances/accounts |
| `commerce` | `retrieveTransactionHistoryWithinDateRange` | Read history and trends |

## Session Rules to Enforce in SlugSwap

- Treat `deviceId + pin` as sensitive credentials.
- Never expose admin or service tokens in mobile client.
- Keep raw GET credentials server-side where feasible.
- Use short-lived, single-purpose claim tokens between app and backend.
- Separate responsibilities:
  - Client: request claim intent, display result
  - Backend: call GET API, enforce policy, audit actions

## Error Handling Guidance

When calling GET API:

1. If `exception` is present:
   - classify as auth, permission, or transient failure
   - do not trust partial `response`
2. If auth failures repeat:
   - revoke local session and require re-link
3. For transient network failures:
   - retry with capped exponential backoff
4. Always log:
   - method name
   - correlation id
   - sanitized error message
   - no secrets in logs

## Security Notes for SlugSwap

The `get-tools` share-code model can grant broad account access. SlugSwap should not replicate that trust model directly.

Recommended production posture:

- No plaintext credential sharing links.
- No long-lived client-held GET credentials.
- Proxy sensitive GET calls through authenticated server routes.
- Add abuse protection (rate limits, anomaly checks, revocation paths).
- Keep explicit user consent and revocation UX.

## Minimal TypeScript Shapes (Observed)

```ts
export type GetEnvelope<TParams> = {
  method: string;
  params: TParams;
};

export type GetResult<TResponse> = {
  response?: TResponse;
  exception?: { message?: string; [k: string]: unknown };
};

export type GetAccount = {
  id: string;
  accountDisplayName: string;
  isActive: boolean;
  isAccountTenderActive: boolean;
  depositAccepted: boolean;
  balance: number | null;
  lastFour?: string | null;
};

export type GetTransaction = {
  transactionId: string;
  amount: number;
  resultingBalance: number;
  postedDate: string;
  actualDate: string;
  locationId: string;
  locationName: string;
};
```

## Open Questions (Track Before Production)

- Are there documented rate limits or abuse controls from GET?
- Session expiry duration and invalidation semantics?
- Which methods are institution-specific vs broadly portable?
- Failure code taxonomy for robust retries and UX messaging?
- Any terms-of-service constraints on this integration path?

## Change Log

- 2026-02-09: Initial version created from `cabalex/get-tools` investigation.
