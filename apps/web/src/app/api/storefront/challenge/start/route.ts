import { ApiError, handleApiError, ok } from "@/lib/api-response";
import { issueChallengeToken } from "@/lib/starlim-challenge-token.server";

export const runtime = "nodejs";

function text(value: unknown, max: number) { return String(value ?? "").trim().slice(0, max); }

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 8 * 1024) throw new ApiError(413, "Solicitud demasiado grande");
    const body = await request.json() as Record<string, unknown>;
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const name = text(body.name, 160);
    const phone = text(body.phone, 40);
    const businessName = text(body.businessName, 160);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !name || !phone) throw new ApiError(400, "Completá tus datos y permití validar la ubicación");
    const issued = issueChallengeToken({ latitude, longitude, name, phone, businessName });
    if (!issued) throw new ApiError(400, "Esta ubicación está fuera del área del Desafío Starlim");
    return ok({ data: { ...issued.claims, token: issued.token } }, 201);
  } catch (error) { return handleApiError(error); }
}
