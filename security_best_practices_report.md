# Security Best Practices Report

Date: 2026-03-25

Scope:
- `apps/dashboard`
- `apps/mobile`
- `lib`
- `db`

Method:
- Static review of the TypeScript/Next.js/React Native codebase
- Targeted review of auth, session, API, GET Tools, and claim/redemption flows
- Best-practices comparison against the loaded Next.js and React security guidance
- One package-level pass with `npm audit --omit=dev --json`

Limits:
- This was a code review, not a live penetration test
- Edge/runtime controls may exist outside the repo; where not visible in code, I call that out explicitly

## Executive Summary

I found 7 actionable issues.

The most important problems are missing authentication and authorization on donor-facing and GET Tools routes that trust caller-supplied `userId` values. In the current code, those routes can be called without a verified Supabase user, which means an attacker who can supply or learn a UUID can modify donor state, unlink or relink GET credentials, and read live GET account balances.

The next cluster of issues is defense-in-depth and data-integrity related: reflective CORS across all API routes, a revalidation secret passed in the URL, and non-idempotent redemption inserts. I also noted one clearly broken auth check on `/api/users/me` and an app-code gap around security headers/CSP that should be verified at runtime.

## High Severity

### 1. `AUTHZ-GET-001` - GET Tools account routes trust caller-supplied `userId` and do not authenticate the caller

- Severity: High
- Location:
  - `apps/dashboard/app/api/get/[action]/route.ts:110-250`
  - `apps/dashboard/lib/server/get/session.ts:16-30`
  - `lib/api.ts:367-418`

Evidence:

```ts
// apps/dashboard/app/api/get/[action]/route.ts:115-121
const userId = new URL(req.url).searchParams.get("userId");
...
const credential = await db.query.getCredentials.findFirst({
  where: eq(getCredentials.userId, userId),
});
```

```ts
// apps/dashboard/app/api/get/[action]/route.ts:145-151
const userId = new URL(req.url).searchParams.get("userId");
...
const { sessionId } = await getActiveGetSession(userId);
const accounts = await retrieveAccounts(sessionId);
```

```ts
// apps/dashboard/app/api/get/[action]/route.ts:172-207
const { userId, userEmail, validatedUrl } = (await req.json()) as {
  userId?: string;
  userEmail?: string | null;
  validatedUrl?: string;
};
...
await db
  .insert(getCredentials)
  .values({
    userId,
    deviceId,
    encryptedPin: encryptSecret(safePin),
  })
```

```ts
// apps/dashboard/lib/server/get/session.ts:20-30
const credential = await db.query.getCredentials.findFirst({
  where: eq(getCredentials.userId, userId),
});
...
const pin = decryptSecret(credential.encryptedPin);
const sessionId = await authenticatePin(pin, credential.deviceId);
```

```ts
// lib/api.ts:367-418
fetchWithFallback(`${API_BASE_URL}/api/get/link-status?userId=${userId}`)
fetchWithFallback(`${API_BASE_URL}/api/get/link`, { method: 'POST', ... })
fetchWithFallback(`${API_BASE_URL}/api/get/link?userId=${userId}`, { method: 'DELETE' })
fetchWithFallback(`${API_BASE_URL}/api/get/accounts?userId=${userId}`)
```

Impact:
- An unauthenticated caller can query GET link status, fetch live GET account balances, unlink a donor's GET account, or overwrite the stored GET credential binding for an arbitrary internal user ID.
- Because `getActiveGetSession()` decrypts and re-authenticates the donor PIN server-side, this becomes a direct privilege boundary break around stored GET credentials.

Fix:
- Require verified Supabase auth on every `/api/get/*` route except the public login URL endpoint if that one truly must stay public.
- Derive `userId` from the verified bearer token, not from query params or request JSON.
- Reject requests where the authenticated user does not match the linked credential row.
- Add rate limiting and audit logging around GET credential changes and balance reads.

Mitigation:
- Until fixed, restrict these routes at the edge/WAF to trusted clients only and monitor for repeated `link`, `unlink`, and `accounts` calls.

False positive notes:
- If these routes are behind a private network boundary outside this repo, exposure could be lower, but no such boundary is visible in app code.

### 2. `AUTHZ-DON-001` - Donor contribution routes are unauthenticated and allow arbitrary donor mutation

- Severity: High
- Location:
  - `apps/dashboard/app/api/donations/[action]/route.ts:16-87`
  - `apps/dashboard/app/api/donations/[action]/route.ts:97-255`
  - `lib/api.ts:214-245`

Evidence:

```ts
// apps/dashboard/app/api/donations/[action]/route.ts:22-29
const { userId, amount, userEmail } = (await req.json()) as {
  userId?: string;
  amount?: number | string;
  userEmail?: string | null;
};

if (!userId || amount === undefined || amount === null) {
  return NextResponse.json({ error: "Missing userId or amount" }, { status: 400 });
}
```

```ts
// apps/dashboard/app/api/donations/[action]/route.ts:50-53
await db
  .insert(schema.users)
  .values({ id: userId, email: userEmail })
  .onConflictDoNothing();
```

```ts
// apps/dashboard/app/api/donations/[action]/route.ts:235-247
const { userId, paused } = (await req.json()) as {
  userId?: string;
  paused?: boolean;
};
...
await db
  .update(schema.donations)
  .set({ status: newStatus, updatedAt: new Date() })
  .where(eq(schema.donations.userId, userId))
```

```ts
// lib/api.ts:214-245
fetchWithFallback(`${API_BASE_URL}/api/donations/set`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId, amount, userEmail }),
})

fetchWithFallback(`${API_BASE_URL}/api/donations/pause`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId, paused }),
})
```

Impact:
- Any caller can create or modify donation records, pause or resume donor participation, and fetch donor impact information without proving they are the donor.
- Because `handleSet()` can create a `users` row for an arbitrary UUID/email pair, this also allows unauthorized creation of local donor records.

Fix:
- Require authenticated Supabase bearer tokens on all donation routes.
- Bind the donor identity to `auth.user.id`; do not accept `userId` from the client for self-service endpoints.
- Enforce configured minimum and maximum donation amounts on the server.
- Add audit logs for donation changes and donor pauses.

Mitigation:
- If an immediate code fix is not possible, block these endpoints behind a trusted proxy and alert on direct internet traffic to them.

False positive notes:
- UUID-based object IDs make blind guessing harder, but the routes are still missing a real authorization check.

## Medium Severity

### 3. `AUTH-USER-001` - `/api/users/me` only checks for header presence and returns a hardcoded user record

- Severity: Medium
- Location: `apps/dashboard/app/api/users/[action]/route.ts:23-40`

Evidence:

```ts
const authHeader = req.headers.get("authorization");
if (!authHeader) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const user = await db.query.users.findFirst({
  where: eq(users.email, "example@example.com"),
});
```

Impact:
- Any caller can satisfy this check by sending any `Authorization` header value.
- If a row for `example@example.com` exists, that record is disclosed without validating the token at all.

Fix:
- Remove this endpoint if it is unused.
- Otherwise, validate the bearer token with Supabase exactly as `/api/users/profile` does and query by the authenticated user ID instead of a hardcoded email.

Mitigation:
- Until fixed, disable route exposure at the edge or return `404` from this endpoint.

False positive notes:
- I did not find any current caller for this endpoint, so this may be dead code, but it is still reachable in its present form.

### 4. `CORS-API-001` - Middleware reflects arbitrary origins across all API routes

- Severity: Medium
- Location: `apps/dashboard/middleware.ts:6-31`

Evidence:

```ts
function buildCorsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", origin ?? "*");
  headers.set("Access-Control-Allow-Methods", DEFAULT_ALLOWED_METHODS);
  headers.set("Access-Control-Allow-Headers", DEFAULT_ALLOWED_HEADERS);
```

```ts
export const config = {
  matcher: ["/api/:path*"],
};
```

Impact:
- Any website can issue browser-readable cross-origin requests to every `/api/*` route.
- This materially amplifies the unauthenticated GET/donation findings above by making them exploitable from a malicious web page, not just from direct server-to-server calls.

Fix:
- Replace reflection with an explicit origin allowlist from environment/config.
- Do not apply CORS headers to same-origin-only admin/API routes unless cross-origin access is intentionally required.
- If only mobile/native clients need access, consider removing browser CORS entirely and using bearer auth from the app.

Mitigation:
- Short term, restrict CORS to the known dashboard origin and any exact Expo web origin you intentionally support.

False positive notes:
- Because `Access-Control-Allow-Credentials` is not set, cookie-based admin endpoints are somewhat less exposed to browser abuse than the unauthenticated routes.

### 5. `NEXT-REVALIDATE-001` - Revalidation uses a secret in the URL query string on a GET request

- Severity: Medium
- Location: `apps/dashboard/app/api/revalidate/route.ts:5-18`

Evidence:

```ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const path = searchParams.get("path") ?? "/";
```

```ts
if (!secret || secret !== process.env.REVALIDATE_SECRET) {
  return Response.json({ error: "Invalid credentials" }, { status: 401 });
}
```

Impact:
- Query-string secrets commonly leak via logs, browser history, analytics, referrers, and monitoring tools.
- If leaked, an attacker can trigger arbitrary revalidation calls and force cache churn on chosen paths.

Fix:
- Change this endpoint to `POST`.
- Accept the secret in an `Authorization` header or JSON body instead of the URL.
- Consider narrowing `path` to an allowlist of known revalidation targets.

Mitigation:
- Avoid calling this endpoint from browsers and review any logs/analytics that may record request URLs.

False positive notes:
- If this route is only called server-to-server and URLs are not logged anywhere, practical exposure is lower, but that protection is not visible here.

### 6. `DATA-INTEGRITY-001` - Redemption writes are not idempotent and `redemptions.claim_code_id` is not unique

- Severity: Medium
- Location:
  - `db/schema.ts:52-60`
  - `apps/dashboard/app/api/claims/[action]/route.ts:756-767`

Evidence:

```ts
// db/schema.ts
export const redemptions = pgTable("redemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  claimCodeId: uuid("claim_code_id").references(() => claimCodes.id).notNull(),
```

```ts
// apps/dashboard/app/api/claims/[action]/route.ts:756-767
await db
  .update(schema.claimCodes)
  .set({ status: "redeemed", redeemedAt: now, amount: delta.toString() })
  .where(eq(schema.claimCodes.id, claim.id));

await db.insert(schema.redemptions).values({
  claimCodeId: claim.id,
  userId: claim.userId,
  amount: delta.toString(),
  redeemedAt: now,
  getToolsTransactionId: `balance_delta:${snap.id}`,
});
```

Impact:
- Concurrent or repeated redemption detection can create duplicate redemption rows for the same claim code.
- That weakens accounting integrity and can cascade into incorrect allowance and reporting values.

Fix:
- Add a unique constraint or unique index on `redemptions.claim_code_id`.
- Make redemption recording transactional and idempotent.
- Use a stable external transaction ID when available instead of a derived `balance_delta:*` placeholder.

Mitigation:
- Until fixed, monitor for duplicate `claim_code_id` values in `redemptions` and reconcile before reporting.

False positive notes:
- If redemption polling is guaranteed single-threaded at runtime, exploitability is lower, but I did not find a code-level guarantee of that.

## Low Severity

### 7. `HEADERS-BASELINE-001` - No app-code evidence of CSP, clickjacking, or referrer-policy headers

- Severity: Low
- Location:
  - `apps/dashboard/app/layout.tsx:27-40`
  - `apps/dashboard/next.config.mjs:1-36`
  - `apps/dashboard/middleware.ts:6-31`

Evidence:
- I found metadata and CORS handling, but no app-code setting for:
  - `Content-Security-Policy`
  - `frame-ancestors` or `X-Frame-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`

Impact:
- The dashboard and public site appear to rely on platform defaults for browser-enforced protections.
- That is a defense-in-depth gap, especially on the admin surface.

Fix:
- Add baseline security headers in Next config, middleware, or edge config.
- At minimum, define CSP, clickjacking protection, `Referrer-Policy`, and `X-Content-Type-Options`.

Mitigation:
- Verify the deployed Vercel response headers before treating this as a runtime issue.

False positive notes:
- These headers may already be added by Vercel or another reverse proxy; they are simply not visible in this repository.

## Dependency Audit Notes

`npm audit --omit=dev --json` reported 32 advisories in the installed dependency tree, including 24 high-severity entries. The noisy concentration is in Vercel-related tooling and transitive packages such as:

- `vercel`
- `@vercel/node`
- `undici`
- `tar`
- `picomatch`

I did not elevate these into the main findings because the audit output does not, by itself, prove runtime exploitability for this app. It does mean the lockfile and deployment/build toolchain need a separate dependency triage pass.

## Recommended Remediation Order

1. Lock down `/api/get/*` so every non-public route authenticates the caller and derives identity from the verified token.
2. Lock down `/api/donations/*` the same way and stop accepting caller-supplied `userId` values for self-service operations.
3. Remove or fix `/api/users/me`.
4. Replace reflective CORS with an explicit allowlist.
5. Move `/api/revalidate` to a POST + header/body secret.
6. Add redemption idempotency and a uniqueness constraint on `redemptions.claim_code_id`.
7. Verify and add security headers/CSP at the app or edge layer.
