import { isAdminRole } from "@/lib/auth";
import { ApiError, handleApiError } from "@/lib/api-response";
import { requireApiSession } from "@/lib/route-auth";
import {
  authorizeDot,
  encryptDotSecret,
  decryptDotSecret,
  validateAuthorization,
} from "@/lib/supervisor-lab/dot-auth";
function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    await validateAuthorization(params);
    const session = await requireApiSession();
    if (!isAdminRole(session.role))
      throw new ApiError(
        403,
        "Necesitás un administrador para conectar el Dot",
      );
    const consent = encryptDotSecret(
      JSON.stringify({
        userId: session.userId,
        companyId: session.companyId,
        query: params.toString(),
        expires: Date.now() + 300000,
      }),
    );
    return new Response(
      `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Conectar LA TIRRA a tu Dot</title><body><main><h1>Conectar LA TIRRA a tu Dot</h1><p>Cuenta: ${escapeHtml(session.displayName)} · ${escapeHtml(session.companyName)}</p><p>El Dot podrá atender consultas enviadas por los usuarios de StarLim, leer los datos permitidos para cada usuario y publicar respuestas en su conversación.</p><p>No podrá modificar precios, clientes, stock, ventas, compras, facturas ni pagos. Esta conexión no llama a la API paga de OpenAI ni compra créditos.</p><form method="post"><input type="hidden" name="consent" value="${escapeHtml(consent)}"><button type="submit">Conectar Dot con StarLim</button></form><p><a href="/supervisor-lab">Volver a LA TIRRA</a></p></main></body></html>`,
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy":
            "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
          "X-Frame-Options": "DENY",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const login = new URL("/login", request.url);
      login.searchParams.set(
        "next",
        new URL(request.url).pathname + new URL(request.url).search,
      );
      return Response.redirect(login, 303);
    }
    return handleApiError(error);
  }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      throw new ApiError(403, "Origen inválido");
    const session = await requireApiSession();
    const data = await request.formData();
    const consent = JSON.parse(decryptDotSecret(String(data.get("consent"))));
    if (
      consent.userId !== session.userId ||
      consent.companyId !== session.companyId ||
      consent.expires < Date.now()
    )
      throw new ApiError(403, "La autorización venció");
    return Response.redirect(
      await authorizeDot(session, new URLSearchParams(consent.query)),
      303,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
