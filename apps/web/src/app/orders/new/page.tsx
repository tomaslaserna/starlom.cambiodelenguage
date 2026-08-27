import { ModulePage } from "@/components/module-page";
import { createOrderAction } from "@/app/orders/new/actions";
import { OrderEntryFields } from "@/app/orders/new/order-entry-fields";
import { OrderEntryForm } from "@/app/orders/order-entry-form";
import { createSalesAdjustmentAction } from "@/app/orders/new/adjustment-actions";
import { SalesAdjustmentFields } from "@/app/orders/new/sales-adjustment-fields";
import { ButtonLink } from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { currentMonth } from "@/lib/month-range";
import { listActiveOffers } from "@/lib/offers";
import { getOrderFormData } from "@/lib/orders";
import { listPriceOffers } from "@/lib/price-offers";
import { listPriceListParameters } from "@/lib/pricing";
import { requirePagePermission } from "@/lib/page-auth";
import { getBreakEvenStatus } from "@/lib/profitability";
import { ORDERS_CREATE_PERMISSION, SALES_OPERATE_PERMISSION, sessionAllows } from "@/lib/route-auth";
import { listSalesAdjustmentReferences } from "@/lib/sales-documents";
import { localDateIso } from "@/lib/timezone";

type NewOrderPageProps = {
  searchParams: Promise<{ tipo?: string; venta?: string }>;
};

export default async function NewOrderPage({ searchParams }: NewOrderPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ORDERS_CREATE_PERMISSION]);
  const query = await searchParams;
  const operation = query.tipo;
  const adjustmentClass = operation === "nota_credito" ? "NC" : operation === "nota_debito" ? "ND" : null;
  const canOperateSales = await sessionAllows(session, [SALES_OPERATE_PERMISSION]);

  if (adjustmentClass) {
    await requirePagePermission(session, [SALES_OPERATE_PERMISSION]);
    const [formData, references] = await Promise.all([
      getOrderFormData(session.companyId),
      listSalesAdjustmentReferences(session.companyId),
    ]);
    return (
      <ModulePage
        active="orders"
        description="Registra una devolucion o un agregado vinculado obligatoriamente a una venta entregada."
        session={session}
        title="Cargar pedido"
      >
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink href="/orders" size="sm" variant="outline">Registro de pedidos</ButtonLink>
            <ButtonLink href="/orders/new" size="sm" variant="secondary">Pedido / venta</ButtonLink>
            <ButtonLink href="/orders/new?tipo=nota_credito" size="sm" variant={adjustmentClass === "NC" ? "primary" : "secondary"}>Nota de credito / devolucion</ButtonLink>
            <ButtonLink href="/orders/new?tipo=nota_debito" size="sm" variant={adjustmentClass === "ND" ? "primary" : "secondary"}>Nota de debito / agregado</ButtonLink>
          </div>
          <OrderEntryForm action={createSalesAdjustmentAction} className="grid gap-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
            <SalesAdjustmentFields className={adjustmentClass} initialSaleId={query.venta} issueDate={localDateIso()} products={formData.products} references={references} />
          </OrderEntryForm>
        </div>
      </ModulePage>
    );
  }

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
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href="/orders" size="sm" variant="outline">Registro de pedidos</ButtonLink>
          <ButtonLink href="/orders/new" size="sm">Pedido / venta</ButtonLink>
          {canOperateSales ? (
            <>
              <ButtonLink href="/orders/new?tipo=nota_credito" size="sm" variant="secondary">Nota de credito / devolucion</ButtonLink>
              <ButtonLink href="/orders/new?tipo=nota_debito" size="sm" variant="secondary">Nota de debito / agregado</ButtonLink>
            </>
          ) : null}
        </div>
        <OrderEntryForm
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
        </OrderEntryForm>
      </div>
    </ModulePage>
  );
}
