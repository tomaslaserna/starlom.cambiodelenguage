import { SystemPrototype } from "./prototype-shell";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { ADMIN_BALANCE_READ_PERMISSION } from "@/lib/route-auth";

export default async function SystemV2Page() {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ADMIN_BALANCE_READ_PERMISSION]);

  return <SystemPrototype />;
}
