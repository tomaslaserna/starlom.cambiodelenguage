import { ApiError } from "@/lib/api-response";

export type RequestBody = Record<string, unknown>;

export const DEFAULT_BODY_LIMIT_BYTES = 256 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertRequestSize(request: Request, maxBytes: number, label = "El cuerpo de la solicitud") {
  const rawLength = request.headers.get("content-length");
  if (!rawLength) return;
  const size = Number(rawLength);
  if (!Number.isFinite(size) || size < 0) throw new ApiError(400, "Content-Length invalido");
  if (size > maxBytes) throw new ApiError(413, `${label} supera el limite permitido`);
}

export async function readRequestBody(
  request: Request,
  maxBytes = DEFAULT_BODY_LIMIT_BYTES,
): Promise<RequestBody> {
  assertRequestSize(request, maxBytes);
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const raw = await request.text().catch(() => "");
    if (Buffer.byteLength(raw, "utf8") > maxBytes) {
      throw new ApiError(413, "El JSON supera el limite permitido");
    }
    const body = safeJson(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError(400, "JSON invalido");
    }
    return body as RequestBody;
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();
    return Object.fromEntries(formData.entries());
  }

  throw new ApiError(415, "Content-Type no soportado");
}

function safeJson(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function textField(body: RequestBody, key: string, fallback = "") {
  const value = body[key];
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

export function numberField(body: RequestBody, key: string, fallback = 0) {
  const value = body[key];
  if (value === undefined || value === null || value === "") return fallback;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) throw new ApiError(400, `${key} debe ser numerico`);
  return numberValue;
}

export function intField(body: RequestBody, key: string, fallback = 0) {
  const numberValue = numberField(body, key, fallback);
  if (!Number.isInteger(numberValue)) throw new ApiError(400, `${key} debe ser entero`);
  return numberValue;
}

export function positiveId(value: string | number | undefined, label = "ID") {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, `${label} invalido`);
  return id;
}

export function uuidParam(value: string | undefined, label = "ID") {
  const id = String(value ?? "").trim();
  if (!UUID_PATTERN.test(id)) throw new ApiError(400, `${label} invalido`);
  return id;
}
