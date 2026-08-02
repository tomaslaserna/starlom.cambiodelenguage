import { ModulePage } from "@/components/module-page";
import { createOrderAction } from "@/app/orders/new/actions";
import { OrderEntryFields } from "@/app/orders/new/order-entry-fields";
import { requireStaffSession } from "@/lib/auth";
import { currentMonth } from "@/lib/month-range";
import { listActiveOffers } from "@/lib/offers";
import { getOrderFormData } from "@/lib/orders";
import { listPriceOffers } from "@/lib/price-offers";
import { listPriceListParameters } from "@/lib/pricing";
import { requirePagePermission } from "@/lib/page-auth";
import { getBreakEvenStatus } from "@/lib/profitability";
import { ORDERS_CREATE_PERMISSION } from "@/lib/route-auth";

type NewOrderPageProps = {
  searchParams: Promise<{ status?: string; message?: string }>;
};

export default async function NewOrderPage({ searchParams }: NewOrderPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ORDERS_CREATE_PERMISSION]);
  const params = await searchParams;
  const [formData, offers, breakEven, priceOffers, priceListParams] = await Promise.all([
    getOrderFormData(session.companyId),
    listActiveOffers(session.companyId),
    getBreakEvenStatus(session.companyId, currentMonth()),
    listPriceOffers(session.companyId),
    listPriceListParameters(session.companyId),
  ]);
  const comboOffers = priceOffers.filter((offer) => offer.status === "vigente");
  const offerListNames = priceListParams.filter((list) => list.admitsOffers).map((list) => list.name);

  return (
    <ModulePage
      active="orders"
      description="Carga inicial del pedido. Luego se entrega o cancela desde el registro."
      session={session}
      title="Cargar pedido"
    >
      {params.status === "error" ? (
        <div
          className="mb-4 rounded-lg border border-[color:var(--danger)] bg-[color:var(--danger-subtle)] px-4 py-3 text-sm font-semibold text-[color:var(--danger)]"
          role="alert"
        >
          {params.message ?? "No se pudo crear el pedido."}
        </div>
      ) : null}
      <form
        action={createOrderAction}
        className="grid gap-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-5"
      >
        <OrderEntryFields
          clients={formData.clients}
          comboOffers={comboOffers}
          offerListNames={offerListNames}
          offers={breakEven.reached ? offers.map((offer) => ({ id: offer.id, title: offer.title, description: offer.description })) : []}
          offersEnabled={breakEven.reached}
          offersRemaining={breakEven.remaining}
          priceLists={formData.priceLists}
          products={formData.products}
          submitLabel="Crear pedido"
        />
      </form>
    </ModulePage>
  );
}
