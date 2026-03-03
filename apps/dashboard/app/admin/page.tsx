import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import DashboardHomePage from "../admin-dashboard-client";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/server/admin-auth";

export default async function Page() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  let isAuthenticated = false;

  try {
    isAuthenticated = verifyAdminSessionToken(sessionToken);
  } catch {
    isAuthenticated = false;
  }

  if (!isAuthenticated) {
    redirect("/admin/login");
  }

  return <DashboardHomePage />;
}
