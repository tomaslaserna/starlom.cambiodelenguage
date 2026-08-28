import { type NextRequest } from "next/server";
import { ApiError, handleApiError } from "@/lib/api-response";
import { buildOrderRemitoPdf } from "@/lib/pdf/documents";
import { pdfResponse } from "@/lib/pdf/renderer";
import { uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function shouldFallbackToPriceFreeRemito(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.message.includes("Use el remito sin precios")
  );
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "pedidos", action: "ver" }]);
    const { id } = await context.params;
    const searchParams = request.nextUrl.searchParams;
    const orderId = uuidParam(id, "Pedido");
    const includePrices = searchParams.get("precios") === "si";
    const options = {
      includePrices,
      copia: searchParams.get("copia") === "1",
    };

    try {
      const file = await buildOrderRemitoPdf(session.companyId, orderId, options);
      return pdfResponse(file, searchParams.get("download") !== "1");
    } catch (error) {
      // Las ventas historicas incoherentes no se reinterpretan con precios. El
      // usuario sigue pudiendo abrir el remito operativo sin valores.
      if (includePrices && shouldFallbackToPriceFreeRemito(error)) {
        const file = await buildOrderRemitoPdf(session.companyId, orderId, { ...options, includePrices: false });
        return pdfResponse(file, searchParams.get("download") !== "1");
      }
      throw error;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
