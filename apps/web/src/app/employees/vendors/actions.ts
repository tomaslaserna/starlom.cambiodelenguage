"use server";

import { revalidatePath } from "next/cache";
import { queryWithCompanyContext } from "@/lib/db";
import { requireApiSession } from "@/lib/route-auth";

export async function saveVendorGoalAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "empleados", action: "editar" }]);
  const vendor = String(formData.get("vendor") ?? "").trim();
  const goalSales = Number(formData.get("goalSales") ?? 0);
  const goalClients = Number(formData.get("goalClients") ?? 0);
  if (!vendor) return;

  await queryWithCompanyContext(
    session.companyId,
    `
      INSERT INTO vendor_goals (
        empresa_id, vendor, period, goal_sales, goal_clients, updated_by, updated_at
      )
      VALUES ($1, $2, date_trunc('month', CURRENT_DATE)::date, $3, $4, $5, NOW())
      ON CONFLICT (empresa_id, vendor, period) DO UPDATE
      SET goal_sales = EXCLUDED.goal_sales,
          goal_clients = EXCLUDED.goal_clients,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
    `,
    [session.companyId, vendor, Number.isFinite(goalSales) ? goalSales : 0, Number.isFinite(goalClients) ? Math.trunc(goalClients) : 0, session.username],
  );

  revalidatePath("/employees/vendors");
}
