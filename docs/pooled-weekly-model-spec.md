# SlugSwap Pooled Weekly Model Spec

This document is the source of truth for how SlugSwap behaves when requesters draw from a shared weekly pool.

## Product Rules

1. Donors contribute to a shared weekly pool.
2. Requesters have an individual weekly allowance.
3. A requester can only generate a claim when both conditions are true:
   - They have enough personal allowance left for the claim amount.
   - The shared pool can still support a new claim.
4. Existing active claim codes stay usable until they expire, even if the pool becomes empty right after generation.

## Capacity States

SlugSwap should distinguish these states instead of showing a generic failure:

### 1. `allowance_available`

- The requester has enough weekly allowance remaining.
- The shared pool can support another claim.
- The primary CTA is enabled.

### 2. `allowance_exhausted`

- The requester does not have enough allowance left for the minimum claim amount.
- The primary CTA is disabled.
- This is a personal limit, not a community shortage.

Requester copy:
- Title: `You’re out of points for this week`
- Body: `You’ve used your SlugSwap allowance. Your allowance resets next week.`

### 3. `pool_low`

- The requester still has allowance, but the shared pool is getting tight.
- Claiming is still allowed.
- A warning should appear before the pool is fully exhausted.

Requester copy:
- Title: `Points are running low`
- Body: `You can still claim right now, but shared points may run out soon.`

### 4. `pool_exhausted`

- The requester still has allowance, but no new claim can be issued because the community pool cannot support another claim.
- The primary CTA is disabled or replaced with a retry action.
- This state should be shown inline on the requester screen, not only as an alert.
- The message should explicitly tell the user that SlugSwap is out of shared points right now.

Requester copy:
- Title: `We’re all out of points right now`
- Body: `Your personal allowance is still there, but the shared pool is empty. Check back later.`

### 5. `pool_unavailable`

- The system cannot determine usable capacity because donor access or GET Tools is temporarily unavailable.
- This is not the same as being out of points.
- The requester should see a temporary-unavailability message, not an exhausted-pool message.

Requester copy:
- Title: `Points are temporarily unavailable`
- Body: `SlugSwap couldn’t generate a claim right now. Please try again in a moment.`

## Requester Experience When The Pool Is Exhausted

When the app is out of shared points, the requester experience should behave like this:

1. Keep showing the requester's remaining weekly allowance.
2. Replace the normal generate-claim CTA with an exhausted-state card or a disabled button.
3. Explain that the block is caused by the shared pool, not by the requester doing anything wrong.
4. Continue showing the weekly reset timing.
5. Keep claim history visible.
6. Preserve any already-generated active claim code until it expires or is redeemed.
7. Allow pull-to-refresh / retry so the screen can recover if new donor capacity appears.

## Decision Rules

SlugSwap should treat these outcomes differently:

1. If the requester lacks allowance, return `allowance_exhausted`.
2. If allowance exists but no donor can support a new claim under current pool rules, return `pool_exhausted`.
3. If donor capacity may exist but code generation fails because GET Tools or donor access is down, return `pool_unavailable`.

This avoids telling users "we're out of points" when the real problem is a transient systems issue.

## Operational Behavior

### Low-points warning

SlugSwap should warn before full exhaustion. The exact threshold can be tuned later, but the product requirement is:

- Show `pool_low` before `pool_exhausted`.
- Do not wait until the final failed generate attempt to tell users supply is tight.

### Weekly reset

- `allowance_exhausted` clears on the next weekly reset for that requester.
- `pool_exhausted` clears when new usable donor capacity becomes available or the next weekly pool starts.

### Fairness

- Unused requester allowance does not guarantee immediate claimability if the shared pool is empty.
- The product should always message this clearly so "allowance" is understood as a ceiling, not a reservation.

## API Contract Recommendation

Claim-generation responses should include a machine-readable reason so mobile can render the correct state:

- `allowance_exhausted`
- `pool_low`
- `pool_exhausted`
- `pool_unavailable`

Suggested response shape on failure:

```json
{
  "error": "No shared points available right now",
  "reason": "pool_exhausted"
}
```

## Current Gap In The App

Today, the requester flow already handles `allowance_exhausted`, but `pool_exhausted` is still surfaced as a generic claim-generation error. The next implementation step is to map donor-capacity failures to a dedicated reason and render an inline exhausted-pool state on the Request tab.
