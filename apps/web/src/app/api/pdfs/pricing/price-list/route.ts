import { type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { buildPriceListPdf } from "@/lib/pdf/documents";
import { pdfResponse } from "@/lib/pdf/renderer";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession([{ resource: "productos", action: "ver" }]);
    const params = request.nextUrl.searchParams;
    const list = Number(params.get("list") ?? params.get("lista") ?? 0);
    const file = await buildPriceListPdf(session.companyId, {
      listId: Number.isInteger(list) ? list : 0,
      vigencia: params.get("vigencia") ?? undefined,
      stock: params.get("stock") === "con" ? "con" : "todos",
      groupBy: params.get("groupBy") === "proveedor" ? "proveedor" : "categoria",
      filter: params.get("filter") ?? undefined,
      iva: params.get("iva") === "10.5" ? 10.5 : 21,
    });
    return pdfResponse(file, params.get("download") !== "1");
  } catch (error) {
    return handleApiError(error);
  }
}
