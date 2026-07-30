import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { listPurchaseFormSuppliers } from "@/lib/purchases";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireApiSession([{ resource: "compras", action: "ver" }]);
    const suppliers = await listPurchaseFormSuppliers(session.companyId);
    return NextResponse.json({ ok: true, data: suppliers });
  } catch (error) {
    return handleApiError(error);
  }
}
