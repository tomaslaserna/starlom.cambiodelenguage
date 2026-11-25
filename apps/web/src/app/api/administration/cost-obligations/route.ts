import { NextResponse } from "next/server";

import {
  requireApiSession,
  requireSessionPermission,
  ADMIN_ACCOUNTS_PAYABLE_READ_PERMISSION,
  ADMIN_ACCOUNTS_PAYABLE_WRITE_PERMISSION,
  ADMIN_TREASURY_WRITE_PERMISSION,
  ADMIN_TREASURY_READ_PERMISSION,
  ADMIN_METRICS_READ_PERMISSION,
  ADMIN_SALARIES_READ_PERMISSION,
  ADMIN_SALARIES_WRITE_PERMISSION,
} from "@/lib/route-auth";

import { withCompanyContext } from "@/lib/db";

import {
  createCostObligation,
  cancelCostObligation,
  reverseCostPayment,
  payCostObligation,
} from "@/lib/cost-obligations-core";

import { readCostPaymentWorkspace } from "@/lib/cost-obligations-read";

import { localDateIso } from "@/lib/timezone";

import { ApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

async function auth() {
  if (process.env.COST_OBLIGATIONS_ENABLED !== "true")
    throw new ApiError(404, "Circuito no habilitado");
  const s = await requireApiSession([ADMIN_ACCOUNTS_PAYABLE_READ_PERMISSION]);
  await requireSessionPermission(s, [ADMIN_TREASURY_READ_PERMISSION]);
  await requireSessionPermission(s, [ADMIN_METRICS_READ_PERMISSION]);
  await requireSessionPermission(s, [ADMIN_SALARIES_READ_PERMISSION]);
  return s;
}

function fail(e: unknown) {
  return NextResponse.json(
    {
      error:
        e instanceof ApiError
          ? e.message
          : "No se confirmó la operación. Actualizá la pantalla antes de reintentar.",
    },
    { status: e instanceof ApiError ? e.status : 409 },
  );
}

export async function GET(request: Request) {
  try {
    const s = await auth(),
      today = localDateIso(),
      month =
        new URL(request.url).searchParams.get("month") ?? today.slice(0, 7);
    return NextResponse.json(
      await withCompanyContext(s.companyId, (tx) =>
        readCostPaymentWorkspace(tx, s.companyId, month, today),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      throw new ApiError(403, "Origen inválido");
    const s = await auth();
    await requireSessionPermission(s, [
      ADMIN_ACCOUNTS_PAYABLE_WRITE_PERMISSION,
    ]);
    const b = await request.json();
    if (b.intent === "pay" || b.intent === "reverse")
      await requireSessionPermission(s, [ADMIN_TREASURY_WRITE_PERMISSION]);
    else if (!["create","cancel"].includes(b.intent)) throw new ApiError(400, "Acción inválida");
    // Salary data is restricted even when it uses the common payment workspace.
    const salary = b.intent === "create" ? String(b.costId).startsWith("salary:") : await withCompanyContext(s.companyId, async tx => {
      const result = b.intent === "reverse"
        ? await tx.query("SELECT o.cost_id FROM admin_cost_obligations o JOIN admin_cost_obligation_payments p ON p.obligation_id=o.id AND p.empresa_id=o.empresa_id WHERE o.empresa_id=$1 AND p.id=$2",[s.companyId,b.paymentId])
        : await tx.query("SELECT cost_id FROM admin_cost_obligations WHERE empresa_id=$1 AND id=$2",[s.companyId,b.obligationId]);
      return String(result.rows[0]?.cost_id??"").startsWith("salary:");
    });
    if(salary) await requireSessionPermission(s,[ADMIN_SALARIES_WRITE_PERMISSION]);
    const result = await withCompanyContext(s.companyId, async (tx) => {
      try {
        if(b.intent === "cancel") return await cancelCostObligation(tx,s.companyId,s.userId,b,localDateIso());
        if(b.intent === "reverse") return await reverseCostPayment(tx,s.companyId,s.userId,b,localDateIso());
        return b.intent === "create"
          ? await createCostObligation(
              tx,
              s.companyId,
              s.userId,
              b,
              localDateIso(),
            )
          : await payCostObligation(
              tx,
              s.companyId,
              s.userId,
              b,
              localDateIso(),
            );
      } catch (e) {
        throw new ApiError(
          409,
          e instanceof Error ? e.message : "No se confirmó la operación",
        );
      }
    });
    return NextResponse.json(result);
  } catch (e) {
    return fail(e);
  }
}
