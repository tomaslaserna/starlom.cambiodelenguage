"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api-response";
import { createPurchase, purchaseInputFromBody } from "@/lib/purchases";
import { getReplenishmentSuggestions } from "@/lib/replenishment";
import { requireApiSession } from "@/lib/route-auth";
import { localDateIso } from "@/lib/timezone";

export async function createReplenishmentPurchaseRequestAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "compras", action: "crear" }]);
  const productId = String(formData.get("productId") ?? "").trim();
  const quantity = Math.trunc(Number(formData.get("quantity") ?? 0));
  if (!productId || quantity <= 0) throw new ApiError(400, "Producto o cantidad invalida");

  const suggestions = await getReplenishmentSuggestions(session.companyId);
  const suggestion = suggestions.items.find((item) => item.productId === productId);
  if (!suggestion) throw new ApiError(404, "La sugerencia MRP ya no esta disponible");
  if (!suggestion.supplierId) throw new ApiError(400, "El producto no tiene proveedor asociado");

  const safeQuantity = Math.min(quantity, Math.max(1, suggestion.suggestedQuantity));
  const estimatedTotal = Math.max(0, suggestion.unitCost * safeQuantity);
  const description = [
    "Solicitud MRP",
    suggestion.name,
    `Sugerido ${suggestion.suggestedQuantity}`,
    `Stock ${suggestion.currentStock}`,
    `Venta 90d ${suggestion.sold90}`,
  ].join(" | ");

  await createPurchase(
    session,
    purchaseInputFromBody({
      supplierId: suggestion.supplierId,
      description,
      total: String(estimatedTotal),
      date: localDateIso(),
      status: "pendiente",
      type: "solicitud_compra",
      productsJson: JSON.stringify([{ productId: suggestion.productId, quantity: safeQuantity }]),
    }),
  );

  revalidatePath("/purchases/replenishment");
  revalidatePath("/admin/approvals");
  redirect("/purchases/replenishment?created=1");
}
