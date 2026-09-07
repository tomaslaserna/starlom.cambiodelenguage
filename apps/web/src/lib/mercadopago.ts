import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/api-response";
import { envValue } from "@/lib/env";

const API = "https://api.mercadopago.com";

function token() {
  const value = envValue("MERCADOPAGO_ACCESS_TOKEN");
  if (!value) throw new ApiError(503, "Mercado Pago todavía no está configurado");
  return value;
}

async function mpFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(502, payload?.message || "Mercado Pago no pudo procesar la solicitud");
  return payload;
}

export async function createPreference(input: { intentId: string; amount: number; description: string; email: string; origin: string }) {
  return mpFetch("/checkout/preferences", {
    method: "POST",
    body: JSON.stringify({
      items: [{ id: input.intentId, title: input.description, currency_id: "ARS", quantity: 1, unit_price: input.amount }],
      payer: { email: input.email },
      external_reference: input.intentId,
      notification_url: `${input.origin}/api/webhooks/mercadopago`,
      back_urls: { success: `${input.origin}/portal?payment=success`, pending: `${input.origin}/portal?payment=pending`, failure: `${input.origin}/portal?payment=failure` },
      auto_return: "approved",
      statement_descriptor: "STARLIM",
    }),
  });
}

export async function getPayment(id: string) { return mpFetch(`/v1/payments/${encodeURIComponent(id)}`); }

export function validWebhookSignature(request: Request, dataId: string) {
  const secret = envValue("MERCADOPAGO_WEBHOOK_SECRET");
  const signature = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";
  if (!secret || !signature || !requestId || !dataId) return false;
  const parts = Object.fromEntries(signature.split(",").map((part) => part.trim().split("=", 2)));
  if (!parts.ts || !parts.v1) return false;
  const expected = createHmac("sha256", secret).update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`).digest("hex");
  const left = Buffer.from(expected); const right = Buffer.from(parts.v1);
  return left.length === right.length && timingSafeEqual(left, right);
}
