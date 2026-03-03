import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/server/admin-auth";
import AdminLoginClient from "./login-client";

export default async function AdminLoginPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  let isAuthenticated = false;
  try {
    isAuthenticated = verifyAdminSessionToken(sessionToken);
  } catch {
    isAuthenticated = false;
  }

  if (isAuthenticated) {
    redirect("/admin");
  }

  return (
    <AdminLoginClient
      supabaseUrl={process.env.EXPO_PUBLIC_SUPABASE_URL ?? ""}
      supabaseAnonKey={process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ""}
    />
  );
}
