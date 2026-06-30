import { ModulePage } from "@/components/module-page";
import { Button, ButtonLink, Card, CardContent, PageHeader, StatusBadge } from "@/components/ui";
import { updateLoadedOrderAction } from "@/app/orders/[id]/edit/actions";
import { OrderEntryFields, type OrderEntryInitialValue } from "@/app/orders/new/order-entry-fields";
import { requireStaffSession } from "@/lib/auth";
import { getOrder, getOrderFormData } from "@/lib/orders";
import { orderStatusLabel } from "@/lib/order-status";
import { uuidParam } from "@/lib/request-body";
import { requirePagePermission } from "@/lib/page-auth";

type EditOrderPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditOrderPage({ params }: EditOrderPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [{ resource: "pedidos", action: "editar" }]);
  const { id: rawId } = await params;
  const id = uuidParam(rawId, "Pedido");
  const [order, formData] = await Promise.all([
    getOrder(session.companyId, id),
    getOrderFormData(session.companyId),
  ]);

  const initialValue: OrderEntryInitialValue = {
    customerId: order.customerId ?? "",
    date: order.date ?? new Date().toISOString().slice(0, 10),
    observation: order.observation,
    priceListOverride: order.priceList,
    desiredDocumentOverride: order.desiredDocument,
    lines: order.lines
      .filter((line) => Boolean(line.productId))
      .map((line) => ({
        productId: line.productId as string,
        quantity: String(line.quantity),
        discount: String(line.discount),
      })),
  };

  return (
    <ModulePage
      active="orders"
      description="Correccion del pedido cargado antes de confirmar stock."
      session={session}
      title="Modificar pedido"
    >
      <div className="grid gap-4">
        <PageHeader
          title={`Modificar pedido #${order.receiptNumber || order.id.slice(0, 8)}`}
          description="Ajusta cliente, productos, cantidades, descuentos, lista y comprobante antes de confirmar."
          actions={
            <ButtonLink href="/orders?status=cargado" variant="secondary">
              Volver
            </ButtonLink>
          }
        />

        {order.orderStatus !== "cargado" ? (
          <Card>
            <CardContent className="grid gap-3 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-bold">El pedido ya no esta editable.</span>
                <StatusBadge tone={order.orderStatus === "entregado" ? "success" : "warning"}>
                  {orderStatusLabel(order.orderStatus)}
                </StatusBadge>
              </div>
              <p className="text-sm text-[color:var(--muted)]">
                Solo se modifican pedidos cargados. Si ya fue confirmado, el cambio tiene que hacerse desde una
                anulacion o ajuste controlado.
              </p>
              <ButtonLink className="w-fit" href="/orders" variant="secondary">
                Ver pedidos
              </ButtonLink>
            </CardContent>
          </Card>
        ) : (
          <form
            action={updateLoadedOrderAction}
            className="grid gap-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-5"
          >
            <input name="id" type="hidden" value={order.id} />
            <OrderEntryFields clients={formData.clients} initialValue={initialValue} products={formData.products} />
            <Button type="submit">Guardar cambios</Button>
          </form>
        )}
      </div>
    </ModulePage>
  );
}
