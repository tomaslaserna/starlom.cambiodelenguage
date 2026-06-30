import { redirect } from "next/navigation";
import type { AuthSession } from "@/lib/auth";
import { sessionAllows, type Permission } from "@/lib/route-auth";

export async function requirePagePermission(
  session: AuthSession,
  permissions: Permission[],
  redirectTo = "/",
) {
  if (!(await sessionAllows(session, permissions))) {
    redirect(redirectTo);
  }
}
