import LandingClient from "./landing-client";
import { getAdminConfig } from "@/lib/server/config";
import { getLandingStats } from "@/lib/server/landing-stats";

export const runtime = "nodejs";
export const revalidate = 60;

export default async function LandingPage() {
  const stats = await getLandingStats();

  let iosStoreUrl: string | null = null;
  let androidStoreUrl: string | null = null;

  try {
    const { config } = await getAdminConfig();
    iosStoreUrl = config.iosStoreUrl;
    androidStoreUrl = config.androidStoreUrl;
  } catch (error) {
    console.error("Failed to load admin app store config for landing page:", error);
  }

  return (
    <LandingClient
      pointsDistributed={stats.pointsDistributed}
      availablePointsThisWeek={stats.availablePointsThisWeek}
      activeDonors={stats.activeDonors}
      totalUsers={stats.totalUsers}
      iosStoreUrl={iosStoreUrl}
      androidStoreUrl={androidStoreUrl}
    />
  );
}
