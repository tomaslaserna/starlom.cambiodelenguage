import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { ApiError, handleApiError, ok } from "@/lib/api-response";
import { previewStockImport } from "@/lib/inventory";
import { requireApiSession, STOCK_EDIT_PERMISSION } from "@/lib/route-auth";
import {
  decodeStockImportBytes,
  MAX_STOCK_IMPORT_BYTES,
  parseStockImportText,
} from "@/lib/stock-import";
import { assertRequestSize } from "@/lib/request-body";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession([STOCK_EDIT_PERMISSION]);
    assertRequestSize(request, MAX_STOCK_IMPORT_BYTES + 512 * 1024, "La carga de stock");
    const form = await request.formData();
    const file = form.get("file");
    const pastedText = String(form.get("text") ?? "");
    if (file instanceof File && file.size > MAX_STOCK_IMPORT_BYTES) {
      throw new ApiError(413, "El archivo supera el limite de 5 MB");
    }
    if (file instanceof File && !/\.(csv|json)$/i.test(file.name)) {
      throw new ApiError(400, "Solo se aceptan archivos CSV o JSON");
    }
    const text = file instanceof File ? decodeStockImportBytes(await file.arrayBuffer()) : pastedText;
    const rows = parseStockImportText(text, {
      defaultMode: String(form.get("defaultMode") ?? ""),
      defaultReason: String(form.get("reason") ?? ""),
      fileName: file instanceof File ? file.name : "",
    });
    const data = await previewStockImport(session.companyId, rows, randomUUID());
    return ok({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
