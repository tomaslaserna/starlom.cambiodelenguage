import { ApiError } from "@/lib/api-response";
import { exchangeDotToken } from "@/lib/supervisor-lab/dot-auth";
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 10000)
      throw new ApiError(413, "Solicitud demasiado grande");
    return Response.json(
      await exchangeDotToken(new URLSearchParams(await request.text())),
      { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
    );
  } catch (error) {
    return Response.json(
      {
        error: "invalid_grant",
        error_description:
          error instanceof ApiError
            ? error.message
            : "No se pudo conectar el Dot",
      },
      {
        status: error instanceof ApiError ? error.status : 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
