import { type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { buildDeliveryPdf, buildFiscalSalePdf, buildOrderRequestPdf } from "@/lib/pdf/documents";
import { pdfResponse } from "@/lib/pdf/renderer";
import { uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "pedidos", action: "ver" }]);
    const { id } = await context.params;
    const orderId = uuidParam(id, "Pedido");
    const document = await queryWithCompanyContext<{
      fiscal_status: string;
      cae: string;
      delivery_id: string | null;
    }>(
      session.companyId,
      `
        SELECT COALESCE(s.fiscal_status, 'no_enviado') AS fiscal_status,
               COALESCE(s.cae, '') AS cae,
               d.id::text AS delivery_id
        FROM sales s
        LEFT JOIN delivery_documents d ON d.sale_id = s.id AND d.empresa_id = s.empresa_id
        WHERE s.id = $1::uuid AND s.empresa_id = $2
        ORDER BY d.created_at DESC NULLS LAST
        LIMIT 1
      `,
      [orderId, session.companyId],
    );
    const row = document.rows[0];

    if (row?.fiscal_status === "aprobado" && row.cae) {
      const file = await buildFiscalSalePdf(session.companyId, orderId);
      return pdfResponse(file, request.nextUrl.searchParams.get("download") !== "1");
    }

    if (row?.delivery_id) {
      const file = await buildDeliveryPdf(session.companyId, row.delivery_id, true);
      return pdfResponse(file, request.nextUrl.searchParams.get("download") !== "1");
    }

    const file = await buildOrderRequestPdf(session.companyId, orderId);
    return pdfResponse(file, request.nextUrl.searchParams.get("download") !== "1");
  } catch (error) {
    return handleApiError(error);
  }
}
