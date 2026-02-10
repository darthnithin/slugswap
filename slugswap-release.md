# SlugSwap Agile Release Plan (User-Story First)

This is a product plan for launching SlugSwap in fast iterations.

Implementation detail policy for this doc:
- Keep implementation details minimal.
- Only explicit technical dependency called out: there is a GET Tools API used to interact with the school's point system and generate codes.

## 1. Product Goal

SlugSwap helps students share dining points quickly and fairly.

The experience should feel simple:
1. Donors choose to share and set a monthly amount.
2. Requesters see what they can claim this week.
3. Requesters tap one button to get a claim code.
4. Claim codes are redeemed successfully with low friction.

## 2. Product Model

SlugSwap uses a pooled weekly model:
1. Donors contribute to a shared weekly pool.
2. Requesters draw from an allocated weekly allowance.
3. Each claim is represented by a short-lived code.
4. Claims are tracked so usage is fair and transparent.

## 3. User Personas

1. Donor student
- Wants to help others with minimal effort.
- Wants confidence their contribution is used responsibly.
- Wants to see clear impact.

2. Requester student
- Needs points quickly.
- Wants a predictable weekly amount.
- Needs a simple, reliable code redemption flow.

3. Program/admin stakeholder (future)
- Wants visibility into pool health and abuse signals.
- Wants confidence in fairness and compliance.

## 4. North-Star Outcomes

1. Time to first successful donor setup is under 2 minutes.
2. Time to first requester claim code is under 30 seconds after login.
3. High successful redemption rate.
4. Low support incidents around "code didn't work".
5. Weekly retention for both donors and requesters improves over time.

## 5. Core User Stories

## 5.1 Donor stories

1. As a donor, I can choose "Share" and set a monthly contribution preference so I can help without repeated setup.
- Acceptance criteria:
  - I can set and save my monthly amount.
  - I can update it later.
  - I see confirmation that I am active.

2. As a donor, I can view my weekly and monthly impact so I know my contribution matters.
- Acceptance criteria:
  - I can see "people helped" and "points contributed".
  - Data refreshes at least daily.

3. As a donor, I can pause sharing temporarily so I stay in control.
- Acceptance criteria:
  - Pause and resume are one tap each.
  - Status is clearly shown.

## 5.2 Requester stories

1. As a requester, I can choose "Request" and see my weekly available allowance so I can plan usage.
- Acceptance criteria:
  - Remaining allowance is visible on home screen.
  - Weekly reset timing is visible.

2. As a requester, I can tap one button to generate a claim code so I can redeem quickly.
- Acceptance criteria:
  - Code appears quickly.
  - Code clearly shows countdown/expiry.

3. As a requester, I can view claim history so I understand what I already used.
- Acceptance criteria:
  - History shows recent claims and status.
  - I can distinguish redeemed vs expired codes.

## 5.3 System integrity stories

1. As the product owner, I need pool and allowance limits enforced so usage remains fair.
- Acceptance criteria:
  - Requesters cannot claim above allowance.
  - Total claims cannot exceed available pool.

2. As the product owner, I need claim codes to be safe against abuse so trust remains high.
- Acceptance criteria:
  - Codes expire quickly.
  - Duplicate/invalid redemption attempts fail gracefully.

## 6. GET Tools API Dependency

SlugSwap must support a school's point system through the GET Tools API.

Required product behavior:
1. The app can request code generation via GET Tools.
2. The app can handle unavailable/degraded GET Tools responses gracefully.
3. User messaging is clear when school systems are temporarily unavailable.

Out of scope for this doc:
- Endpoint-level contract details.
- Internal service architecture details.

## 7. Release Strategy (Agile, Outcome-Based)

## Release 0: Problem/Solution validation (1-2 weeks)

Goal:
- Validate that students understand and want the pooled model.

Scope:
1. Clickable prototype of donor and requester flows.
2. Messaging tests for "pool" and "weekly allowance" concepts.
3. Lightweight user interviews (donors and requesters).

## Release 1: Private Alpha (2-4 weeks)

Goal:
- End-to-end happy path for a small closed group.

Scope:
1. Donor onboarding with monthly preference.
2. Requester weekly allowance visibility.
3. Claim code generation and redemption.
4. Basic impact and history views.
5. Basic handling for GET Tools unavailability.  

## Release 2: Beta (2-4 weeks)

Goal:
- Improve reliability, clarity, and trust signals.

Scope:
1. Better status messaging for failures and expirations.
2. Pause/resume donor controls.
3. Improved history and transparency views.
4. Basic anti-abuse guardrails.

## Release 3: General Availability readiness (2-4 weeks)

Goal:
- Prepare for broader campus usage.

Scope:
1. Operational playbooks for incidents/support.
2. Admin-facing visibility for pool health and anomalies.
3. Final UX polish on onboarding and error recovery.

## 8. Prioritization Framework

Use this order when choosing sprint work:
1. User trust and fairness first.
2. Redemption reliability second.
3. Onboarding speed third.
4. Delight/visual polish after core reliability is stable.

## 9. KPIs by Release

1. Funnel metrics
- donor onboarding completion
- requester onboarding completion
- code generation completion
- successful redemption completion

2. Reliability metrics
- claim code success rate
- expiration-before-use rate
- GET Tools dependency error rate (user-visible impact)

3. Retention/impact metrics
- weekly active donors
- weekly active requesters
- people helped per week
- points redeemed per week

## 10. Risks and Mitigations

1. Risk: users do not understand pooled model
- Mitigation: simplify copy; test language in Release 0.

2. Risk: school system instability affects trust
- Mitigation: clear degraded-state messaging and fallback UX.

3. Risk: abuse patterns emerge
- Mitigation: tighten claim limits/cooldowns and monitor anomaly signals.

4. Risk: donor drop-off after setup
- Mitigation: stronger impact storytelling and reminders.

## 11. Definition of Product Success

SlugSwap is successful when:
1. Students can complete core donor/requester flows with minimal effort.
2. Claims are perceived as fair and reliable.
3. Weekly usage and impact trends move up consistently.
4. Support burden remains manageable.

## 12. Fresh-Model Prompt (Product-First)

```text
You are building SlugSwap from scratch.

Use docs/pooled-weekly-model-spec.md as the source of truth.

Important instructions:
1) Prioritize user stories and outcomes over implementation detail.
2) Only fixed technical dependency to explicitly preserve: there is a GET Tools API used to interact with the school's point system and generate codes.
3) Keep all other technical choices pragmatic and lightweight.
```
