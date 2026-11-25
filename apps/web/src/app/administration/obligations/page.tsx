import { notFound } from "next/navigation";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import {
  ADMIN_ACCOUNTS_PAYABLE_READ_PERMISSION,
  ADMIN_TREASURY_READ_PERMISSION,
  ADMIN_METRICS_READ_PERMISSION,
  ADMIN_SALARIES_READ_PERMISSION,
} from "@/lib/route-auth";
import { CostObligationsWorkspace } from "./workspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (process.env.COST_OBLIGATIONS_ENABLED !== "true") notFound();
  const s = await requireStaffSession();
  await requirePagePermission(s, [ADMIN_ACCOUNTS_PAYABLE_READ_PERMISSION]);
  await requirePagePermission(s, [ADMIN_TREASURY_READ_PERMISSION]);
  await requirePagePermission(s, [ADMIN_METRICS_READ_PERMISSION]);
  await requirePagePermission(s,[ADMIN_SALARIES_READ_PERMISSION]);
  return (
    <CostObligationsWorkspace endpoint="/api/administration/cost-obligations" />
  );
}
