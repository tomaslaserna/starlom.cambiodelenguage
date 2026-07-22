import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { commitStockImport } from "@/lib/inventory";
import { readRequestBody } from "@/lib/request-body";
import { requireApiSession, STOCK_EDIT_PERMISSION } from "@/lib/route-auth";
import { parseStockImportText } from "@/lib/stock-import";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireApiSession([STOCK_EDIT_PERMISSION]);
    const body = await readRequestBody(request);
    const rows = parseStockImportText(JSON.stringify({ items: body.items ?? body.productos ?? [] }), {
      defaultReason: "Actualizacion masiva de stock",
    });
    const data = await commitStockImport(session, rows, randomUUID());
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
