import { ModulePage } from "@/components/module-page";
import { createOrderAction } from "@/app/orders/new/actions";
import { requireStaffSession } from "@/lib/auth";

export default async function NewOrderPage() {
  const session = await requireStaffSession();

  return (
    <ModulePage
      active="sales"
      description="Carga inicial de pedido en estado recibido."
      session={session}
      title="Cargar pedido"
    >
      <form
        action={createOrderAction}
        className="grid max-w-3xl gap-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-5"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            Cliente
            <input className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3" name="customerName" required />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            CUIT / DNI
            <input className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3" name="customerDocument" />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-2 text-sm font-medium">
            Fecha
            <input className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3" name="date" type="date" />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Monto
            <input className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3" min="0.01" name="amount" required step="0.01" type="number" />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Vendedor
            <input className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3" name="seller" />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-2 text-sm font-medium">
            Lista
            <input className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3" name="priceList" />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Condicion de pago
            <input className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3" name="paymentCondition" />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Comprobante
            <select className="min-h-11 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3" name="desiredDocument" defaultValue="remito">
              <option value="remito">Remito</option>
              <option value="factura">Factura</option>
            </select>
          </label>
        </div>
        <label className="grid gap-2 text-sm font-medium">
          Observacion
          <textarea className="min-h-24 rounded-md border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2" name="observation" />
        </label>
        <button className="min-h-11 rounded-md bg-[color:var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[color:var(--accent-strong)]">
          Crear pedido
        </button>
      </form>
    </ModulePage>
  );
}
