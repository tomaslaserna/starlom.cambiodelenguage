import { ApiError } from "@/lib/api-response";
import { getDbPool } from "@/lib/db";
import { registerDotClient } from "@/lib/supervisor-lab/dot-auth";
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 10000)
      throw new ApiError(413, "Solicitud demasiado grande");
    const count = await getDbPool().query(
      "SELECT COUNT(*)::int AS count FROM starlim_dot.oauth_clients WHERE created_at>now()-interval '5 minutes'",
    );
    if (count.rows[0].count >= 20)
      throw new ApiError(429, "Demasiados registros OAuth");
    return Response.json(await registerDotClient(await request.json()), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        error: "invalid_client_metadata",
        error_description:
          error instanceof ApiError ? error.message : "Registro inválido",
      },
      { status: error instanceof ApiError ? error.status : 400 },
    );
  }
}
