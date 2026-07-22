import { type NextRequest } from "next/server";
import { handleApiError, ok } from "@/lib/api-response";
import { commitStockImport } from "@/lib/inventory";
import { readRequestBody, textField } from "@/lib/request-body";
import { requireApiSession, STOCK_EDIT_PERMISSION } from "@/lib/route-auth";
import { parseStockImportText } from "@/lib/stock-import";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession([STOCK_EDIT_PERMISSION]);
    const body = await readRequestBody(request, 5 * 1024 * 1024);
    const rows = parseStockImportText(JSON.stringify({ items: body.rows ?? [] }));
    const data = await commitStockImport(session, rows, textField(body, "batchId"));
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
