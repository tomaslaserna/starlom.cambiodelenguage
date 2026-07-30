import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  StatusBadge,
  type StatusBadgeTone,
} from "@/components/ui";
import { getOrderFormData } from "@/lib/orders";
import { listPriceOffers, type PriceOffer } from "@/lib/price-offers";
import { formatCurrency, formatNumber } from "@/lib/format";
import { isAdminRole, requireStaffSession } from "@/lib/auth";
import { sessionCanReadProducts } from "@/lib/route-auth";
import { OfferForm } from "@/app/prices/offers/offer-form";
import { deletePriceOfferAction, savePriceOfferAction, togglePriceOfferAction } from "@/app/prices/offers/actions";

type OffersPageProps = {
  searchParams: Promise<{ saved?: string }>;
};

function statusTone(status: PriceOffer["status"]): StatusBadgeTone {
  if (status === "vigente") return "success";
  if (status === "programada") return "info";
  if (status === "vencida") return "danger";
  return "neutral";
}

function priceLabel(offer: PriceOffer) {
  if (offer.priceMode === "fijo") return `Fijo: ${formatCurrency(offer.fixedPrice ?? 0)}`;
  const min = offer.minPrice != null ? ` (mín ${formatCurrency(offer.minPrice)})` : "";
  return `-${offer.discountPercent ?? 0}% sobre lista${min}`;
}

export default async function OffersPage({ searchParams }: OffersPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanReadProducts(session))) redirect("/");
  const params = await searchParams;
  const canEdit = isAdminRole(session.role);

  const [offers, formData] = await Promise.all([listPriceOffers(session.companyId), getOrderFormData(session.companyId)]);

  return (
    <ModulePage
      active="prices"
      description="Ofertas y combos con reglas de precio, vigencia y stock."
      session={session}
      title="Ofertas"
    >
      <div className="grid gap-4">
        <PageHeader
          description="Armá ofertas y combos con artículos existentes: precio fijo o descuento por lista, vigencia y límite de stock."
          moduleIntro
          title="Ofertas"
        />

        {params.saved ? (
          <div className="rounded-[10px] border border-[#bbf7d0] bg-[#ecfdf5] px-4 py-3 text-sm font-semibold text-[#047857]">
            Oferta guardada.
          </div>
        ) : null}

        {canEdit ? (
          <Card>
            <CardHeader>
              <CardTitle>Nueva oferta</CardTitle>
              <CardDescription>Elegí los artículos del combo y su regla de precio y vigencia.</CardDescription>
            </CardHeader>
            <CardContent>
              <OfferForm action={savePriceOfferAction} products={formData.products} />
            </CardContent>
          </Card>
        ) : null}

        {offers.length === 0 ? (
          <Card className="p-4">
            <EmptyState description="Creá la primera oferta con el formulario de arriba." title="No hay ofertas" />
          </Card>
        ) : (
          <div className="grid gap-3">
            {offers.map((offer) => (
              <Card className="overflow-hidden" key={offer.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3">
                    <span aria-hidden="true" className="erp-text-caption w-3 shrink-0 text-center transition-transform group-open:rotate-90">&gt;</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-black">{offer.name}</span>
                      <span className="ml-2 text-xs text-[color:var(--muted)]">{priceLabel(offer)}</span>
                      <div className="mt-0.5 truncate text-xs text-[color:var(--muted)]">
                        {offer.items.map((item) => `${formatNumber(item.quantity)}× ${item.productName}`).join(", ") || "Sin artículos"}
                      </div>
                    </span>
                    <StatusBadge tone={statusTone(offer.status)}>{offer.status}</StatusBadge>
                    {canEdit ? (
                      <span className="flex items-center gap-2">
                        <form action={togglePriceOfferAction}>
                          <input name="id" type="hidden" value={offer.id} />
                          <input name="active" type="hidden" value={offer.active ? "false" : "true"} />
                          <button className="text-xs font-bold text-[#2563eb] hover:underline" type="submit">
                            {offer.active ? "Desactivar" : "Activar"}
                          </button>
                        </form>
                        <form action={deletePriceOfferAction}>
                          <input name="id" type="hidden" value={offer.id} />
                          <button className="text-xs font-bold text-[#dc2626] hover:underline" type="submit">
                            Borrar
                          </button>
                        </form>
                      </span>
                    ) : null}
                  </summary>
                  {canEdit ? (
                    <div className="border-t border-[color:var(--border)] p-4">
                      <OfferForm action={savePriceOfferAction} offer={offer} products={formData.products} />
                    </div>
                  ) : null}
                </details>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ModulePage>
  );
}
