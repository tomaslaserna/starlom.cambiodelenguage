"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { requireApiSession } from "@/lib/route-auth";

export async function saveVendorGoalAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "empleados", action: "editar" }]);
  const vendor = String(formData.get("vendor") ?? "").trim();
  const goalSales = Number(formData.get("goalSales") ?? 0);
  const goalClients = Number(formData.get("goalClients") ?? 0);
  if (!vendor) throw new ApiError(400, "Vendedor inválido");
  if (!Number.isFinite(goalSales) || goalSales < 0) throw new ApiError(400, "La meta de ventas no puede ser negativa");
  if (!Number.isInteger(goalClients) || goalClients < 0) throw new ApiError(400, "La meta de clientes debe ser un entero positivo");

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
    [session.companyId, vendor, goalSales, goalClients, session.username],
  );

  revalidatePath("/employees/vendors");
  revalidatePath("/employees");
}

export async function saveVendorCommissionAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "empleados", action: "editar" }]);
  const vendor = String(formData.get("vendor") ?? "").trim();
  const commissionRate = Number(formData.get("commissionRate") ?? 0);
  if (!vendor) throw new ApiError(400, "Vendedor inválido");
  if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) {
    throw new ApiError(400, "La comisión debe estar entre 0 y 100");
  }

  await queryWithCompanyContext(
    session.companyId,
    `
      INSERT INTO vendor_commissions (empresa_id, vendor, commission_rate, updated_by, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (empresa_id, vendor) DO UPDATE
      SET commission_rate = EXCLUDED.commission_rate,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
    `,
    [session.companyId, vendor, commissionRate, session.username],
  );

  revalidatePath("/employees/vendors");
  revalidatePath("/employees");
}
