# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SlugSwap is a mobile app that helps university students share dining points. Donors contribute to a shared weekly pool; requesters draw from a weekly allowance via short-lived claim codes generated through the school's GET Tools API.

The product spec lives in `slugswap-release.md`. It defines user stories, release strategy (Releases 0–3), KPIs, and prioritization framework. Treat it as the source of truth for product requirements.

## Tech Stack (Confirmed)

- **Frontend**: Expo Router (React Native) — iOS/Android mobile app
- **Database**: Neon (serverless Postgres) + Drizzle ORM
- **Auth**: Supabase Auth with Google OAuth
- **API Layer**: Vercel serverless functions
- **External Dependency**: GET Tools API (school point system — code generation/redemption)

## Key Domain Concepts

- **Pooled weekly model**: Donor monthly contributions are divided into weekly pools. Requesters get a weekly allowance drawn from the pool.
- **Claim code lifecycle**: Generated via GET Tools API → displayed with countdown/expiry → redeemed or expired. Codes are short-lived to prevent abuse.
- **User roles**: A student can be both a donor and a requester. There is no strict role separation.

## Agent Skills

Skills are installed in `.agents/skills/`. Key ones:
- `building-native-ui` — Expo Router patterns, navigation, animations, native components
- `vercel-composition-patterns` — React component architecture (compound components, avoid boolean props, lift state)
- `ui-ux-pro-max` — Design system generation (colors, typography, styles)
- `frontend-design` — Production-grade UI design guidance

## Prioritization (from product spec)

When making implementation decisions, follow this order:
1. User trust and fairness first
2. Redemption reliability second
3. Onboarding speed third
4. Visual polish after core reliability is stable
