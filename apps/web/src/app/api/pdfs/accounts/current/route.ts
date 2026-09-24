import { type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { buildAccountStatementPdf, buildAccountsReceivablePdf } from "@/lib/pdf/documents";
import { pdfResponse } from "@/lib/pdf/renderer";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession([{ resource: "cobranzas", action: "ver" }]);
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type") ?? searchParams.get("tipo");
    const name = searchParams.get("name") ?? searchParams.get("nombre") ?? "";
    const file = (type ?? "cliente") === "cliente" && !name
      ? await buildAccountsReceivablePdf(session.companyId, searchParams.get("q") ?? "")
      : await buildAccountStatementPdf(session.companyId, {
          type,
          name,
          from: searchParams.get("from") ?? searchParams.get("desde") ?? "",
          to: searchParams.get("to") ?? searchParams.get("hasta") ?? "",
        });    return pdfResponse(file, searchParams.get("download") !== "1");
  } catch (error) {
    return handleApiError(error);
  }
}
