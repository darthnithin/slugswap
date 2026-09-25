import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FACILITIES } from "@slugswap/occupancy";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/server/admin-auth";
import OccupancyClient from "./occupancy-client";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Facility occupancy | SlugSwap",
  robots: { index: false, follow: false },
};

export default async function OccupancyPage() {
  const store = await cookies();
  let authenticated = false;
  try {
    authenticated = verifyAdminSessionToken(
      store.get(ADMIN_SESSION_COOKIE)?.value,
    );
  } catch {
    /* fail closed */
  }
  if (!authenticated) redirect("/admin/login");
  return <OccupancyClient facilities={FACILITIES} />;
}
