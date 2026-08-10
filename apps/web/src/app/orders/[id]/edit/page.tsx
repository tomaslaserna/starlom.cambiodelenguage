import { ModulePage } from "@/components/module-page";
import { ButtonLink, Card, CardContent, PageHeader, StatusBadge } from "@/components/ui";
import { updateLoadedOrderAction } from "@/app/orders/[id]/edit/actions";
import { OrderEntryFields, type OrderEntryInitialValue } from "@/app/orders/new/order-entry-fields";
import { OrderEntryForm } from "@/app/orders/order-entry-form";
import { requireStaffSession } from "@/lib/auth";
import { currentMonth } from "@/lib/month-range";
import { listActiveOffers } from "@/lib/offers";
import { getOrder, getOrderFormData } from "@/lib/orders";
import { orderStatusLabel } from "@/lib/order-status";
import { formatSaleCommercialCode } from "@/lib/sale-commercial-code";
import { uuidParam } from "@/lib/request-body";
import { requirePagePermission } from "@/lib/page-auth";
import { getBreakEvenStatus } from "@/lib/profitability";
import { localDateIso } from "@/lib/timezone";

type EditOrderPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditOrderPage({ params }: EditOrderPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [{ resource: "pedidos", action: "editar" }]);
  const { id: rawId } = await params;
  const id = uuidParam(rawId, "Pedido");
  const [order, formData, offers, breakEven] = await Promise.all([
    getOrder(session.companyId, id),
    getOrderFormData(session.companyId, { excludeReservedSaleId: id }),
    listActiveOffers(session.companyId),
    getBreakEvenStatus(session.companyId, currentMonth()),
  ]);

  const initialValue: OrderEntryInitialValue = {
    customerId: order.customerId ?? "",
    date: order.date ?? localDateIso(),
    observation: order.observation,
    priceListOverride: order.priceList,
    desiredDocumentOverride: order.desiredDocument,
    vatRate: order.vatRate,
    lines: order.lines
      .filter((line) => Boolean(line.productId))
      .map((line) => ({
        productId: line.productId as string,
        quantity: String(line.quantity),
        discount: String(line.discount),
      })),
  };
  const availableOffers = breakEven.reached
    ? offers.map((offer) => ({ id: offer.id, title: offer.title, description: offer.description }))
    : [];
  const orderNumberLabel = formatSaleCommercialCode({
    commercialNumber: order.commercialNumber,
    saleNumber: order.saleNumber,
    deliveryNumber: order.deliveryNumber,
    legacyRemittanceNumber: order.receiptNumber,
  });

  return (
    <ModulePage
      active="orders"
      description="Correccion del pedido antes de entregarlo."
      session={session}
      title="Modificar pedido"
    >
      <div className="grid gap-4">
        <PageHeader
          title={`Modificar pedido #${orderNumberLabel}`}
          description="Ajusta cliente, productos, cantidades, descuentos, lista y comprobante antes de entregar."
          actions={
            <ButtonLink href="/orders?status=cargado" variant="secondary">
              Volver
            </ButtonLink>
          }
        />

        {order.orderStatus !== "cargado" && order.orderStatus !== "confirmado" ? (
          <Card>
            <CardContent className="grid gap-3 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-bold">El pedido ya no esta editable.</span>
                <StatusBadge tone={order.orderStatus === "entregado" ? "success" : "danger"}>
                  {orderStatusLabel(order.orderStatus)}
                </StatusBadge>
              </div>
              <p className="text-sm text-[color:var(--muted)]">
                Solo se pueden modificar pedidos cargados o confirmados. Un pedido entregado o cancelado no se edita.
              </p>
              <ButtonLink className="w-fit" href="/orders" variant="secondary">
                Ver pedidos
              </ButtonLink>
            </CardContent>
          </Card>
        ) : (
          <OrderEntryForm
            action={updateLoadedOrderAction}
            className="grid gap-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-5"
          >
            <input name="id" type="hidden" value={order.id} />
            {order.orderStatus === "confirmado" ? (
              <p className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-3 text-sm text-[color:var(--foreground)]">
                <strong>Atención:</strong> este pedido está confirmado. Al guardar, volverá a <strong>cargado</strong> y se liberará su reserva de stock hasta que sea entregado.
              </p>
            ) : null}
            <OrderEntryFields
              clients={formData.clients}
              initialValue={initialValue}
              offers={availableOffers}
              offersEnabled={breakEven.reached}
              offersRemaining={breakEven.remaining}
              priceLists={formData.priceLists}
              products={formData.products}
              submitLabel="Guardar cambios"
            />
          </OrderEntryForm>
        )}
      </div>
    </ModulePage>
  );
}
