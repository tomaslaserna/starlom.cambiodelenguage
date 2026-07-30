"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deletePriceOffer, savePriceOffer, setPriceOfferActive, type PriceOfferInput } from "@/lib/price-offers";
import { requireAdminApiSession } from "@/lib/route-auth";

function parseItems(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        productId: String((item as { productId?: unknown }).productId ?? ""),
        quantity: Number((item as { quantity?: unknown }).quantity ?? 0),
      }))
      .filter((item) => item.productId && item.quantity > 0);
  } catch {
    return [];
  }
}

function optionalNumber(formData: FormData, name: string): number | null {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export async function savePriceOfferAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const idRaw = String(formData.get("id") ?? "").trim();
  const stockRaw = String(formData.get("stockLimit") ?? "").trim();
  const input: PriceOfferInput = {
    id: idRaw || null,
    name: String(formData.get("name") ?? ""),
    active: formData.get("active") === "on",
    priceMode: formData.get("priceMode") === "descuento" ? "descuento" : "fijo",
    fixedPrice: optionalNumber(formData, "fixedPrice"),
    discountPercent: optionalNumber(formData, "discountPercent"),
    minPrice: optionalNumber(formData, "minPrice"),
    validFrom: String(formData.get("validFrom") ?? "").trim() || null,
    validTo: String(formData.get("validTo") ?? "").trim() || null,
    stockLimit: stockRaw ? Math.trunc(Number(stockRaw)) : null,
    items: parseItems(String(formData.get("itemsJson") ?? "[]")),
  };
  await savePriceOffer(session, input);
  revalidatePath("/prices/offers");
  redirect("/prices/offers?saved=1");
}

export async function togglePriceOfferAction(formData: FormData) {
  const session = await requireAdminApiSession();
  await setPriceOfferActive(session, String(formData.get("id") ?? ""), String(formData.get("active") ?? "") === "true");
  revalidatePath("/prices/offers");
}

export async function deletePriceOfferAction(formData: FormData) {
  const session = await requireAdminApiSession();
  await deletePriceOffer(session, String(formData.get("id") ?? ""));
  revalidatePath("/prices/offers");
}
