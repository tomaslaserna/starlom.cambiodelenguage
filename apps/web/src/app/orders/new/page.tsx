import { ModulePage } from "@/components/module-page";
import { createOrderAction } from "@/app/orders/new/actions";
import { OrderEntryFields } from "@/app/orders/new/order-entry-fields";
import { Button } from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { getOrderFormData } from "@/lib/orders";
import { requirePagePermission } from "@/lib/page-auth";
import { ORDERS_CREATE_PERMISSION } from "@/lib/route-auth";

export default async function NewOrderPage() {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ORDERS_CREATE_PERMISSION]);
  const formData = await getOrderFormData(session.companyId);

  return (
    <ModulePage
      active="sales"
      description="Carga inicial del pedido. Despues se confirma para stock."
      session={session}
      title="Cargar pedido"
    >
      <form
        action={createOrderAction}
        className="grid gap-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-5"
      >
        <OrderEntryFields clients={formData.clients} products={formData.products} />
        <Button type="submit">Crear pedido</Button>
      </form>
    </ModulePage>
  );
}
