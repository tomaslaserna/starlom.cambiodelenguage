import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import {
  ButtonLink,
  Card,
  CardContent,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  EmptyState,
  PageHeader,
  StatCard,
  StatusBadge,
  type StatusBadgeTone,
} from "@/components/ui";
import { ApiError } from "@/lib/api-response";
import { requireStaffSession } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { sessionAllows, sessionCanReadSuppliers } from "@/lib/route-auth";
import { getSupplierDetail360 } from "@/lib/supplier-detail";
import { SupplierEditDialog } from "@/app/suppliers/supplier-edit-dialog";

type SupplierDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ updated?: string }>;
};

function value(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "Sin registrar";
  return String(value);
}

function line(label: string, content: string | number | null | undefined) {
  return (
    <div className="grid grid-cols-[minmax(8rem,0.8fr)_1.2fr] gap-3 border-b border-[color:var(--border)]/60 py-2.5 last:border-b-0">
      <span className="erp-text-caption text-[color:var(--muted)]">{label}</span>
      <span className="erp-text-body-sm break-words text-right font-semibold">{value(content)}</span>
    </div>
  );
}

function card(title: string, content: React.ReactNode) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[color:var(--border)] bg-[color:var(--background)] px-4 py-3">
        <h2 className="erp-text-body-sm font-black">{title}</h2>
      </div>
      <CardContent className="pt-2">{content}</CardContent>
    </Card>
  );
}

function statusTone(status: string): StatusBadgeTone {
  if (status === "recibida") return "success";
  if (status === "cancelada") return "danger";
  if (status === "pendiente") return "warning";
  return "neutral";
}

export default async function SupplierDetailPage({ params, searchParams }: SupplierDetailPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanReadSuppliers(session))) redirect("/");
  const { id } = await params;
  const detail = await getSupplierDetail360(session.companyId, id).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });
  if (!detail) notFound();
  const canEdit = await sessionAllows(session, [{ resource: "proveedores", action: "editar" }]);
  const query = await searchParams;
  const { supplier, summary, products, purchases } = detail;

  return (
    <ModulePage active="database" description="Ficha integral del proveedor." session={session} title={supplier.name}>
      <div className="grid gap-5" data-can-edit={canEdit ? "true" : "false"}>
        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--panel)] p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <PageHeader description={supplier.rubric || "Sin rubro registrado"} title={supplier.name} />
            <div className="flex flex-wrap items-center gap-2">
              <Link className="erp-text-body-sm font-semibold text-[color:var(--accent)] hover:underline" href="/suppliers">← Volver a Proveedores</Link>
              {canEdit ? <SupplierEditDialog supplier={supplier} /> : null}
            </div>
          </div>
        </div>

        {query.updated === "1" ? <div className="rounded-lg border border-[color:var(--success)] bg-[color:var(--success-subtle)] px-4 py-3 text-sm font-semibold text-[color:var(--success)]">Proveedor actualizado correctamente.</div> : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Total comprado" value={formatCurrency(summary.totalPurchased)} />
          <StatCard label="Compras recibidas" value={String(summary.receivedPurchaseCount)} />
          <StatCard label="Saldo pendiente" tone={summary.outstandingBalance > 0 ? "warning" : "success"} value={formatCurrency(summary.outstandingBalance)} />
          <StatCard label="Última compra" value={formatDate(summary.lastPurchaseDate)} />
          <StatCard label="Productos asociados" value={String(summary.activeProductCount)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {card("Identidad y datos fiscales", <>
            {line("Nombre comercial", supplier.name)}
            {line("Razón social", supplier.legalName)}
            {line("CUIT", supplier.taxId)}
            {line("Condición fiscal", supplier.fiscalCondition)}
            {line("Rubro", supplier.rubric)}
          </>)}
          {card("Contacto y ubicación", <>
            {line("Contacto principal", supplier.contactName)}
            {line("Teléfono", supplier.phone)}
            {line("Email", supplier.email)}
            {line("Dirección", supplier.address)}
            {line("Localidad", supplier.locality)}
            {line("Provincia", supplier.province)}
          </>)}
          {card("Condiciones y logística", <>
            {line("Plazo de pago", `${supplier.paymentTermDays} días`)}
            {line("Plazo de entrega", `${supplier.deliveryLeadDays} días`)}
            {line("Compra mínima", formatCurrency(supplier.minimumOrderAmount))}
            {line("Forma de envío", supplier.shippingMethod)}
          </>)}
          {card("Cuenta bancaria", <>
            {line("Banco", supplier.bankName)}
            {line("Tipo de cuenta", supplier.bankAccountType)}
            {line("Titular", supplier.bankAccountHolder)}
            {line("CBU/CVU", supplier.bankAccountIdentifier)}
            {line("Alias", supplier.bankAlias)}
          </>)}
          <div className="lg:col-span-2">
            {card("Notas", <p className="erp-text-body-sm min-h-16 whitespace-pre-wrap py-2 text-[color:var(--muted)]">{supplier.notes || "Sin registrar"}</p>)}
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border)] p-4">
            <h2 className="erp-text-body-sm font-black">Productos provistos</h2>
            <ButtonLink href="/prices" size="sm" variant="secondary">Ver catálogo</ButtonLink>
          </div>
          <DataTable caption="Productos asociados al proveedor" minWidth="720px" tableLabel="Productos provistos">
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>SKU</DataTableHead><DataTableHead>Producto</DataTableHead><DataTableHead>Categoría</DataTableHead><DataTableHead>Costo</DataTableHead><DataTableHead>Presentación</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {products.length === 0 ? <DataTableRow className="hover:bg-transparent"><DataTableCell colSpan={5}><EmptyState action={<ButtonLink href="/prices" variant="secondary">Ir al catálogo</ButtonLink>} description="Asigná el proveedor desde la edición del producto." title="Sin productos asociados" /></DataTableCell></DataTableRow> : products.map((product) => <DataTableRow key={product.id}>
                <DataTableCell className="font-mono text-xs">{product.sku || "-"}</DataTableCell>
                <DataTableCell><Link className="font-semibold text-[color:var(--accent)] hover:underline" href={`/prices?q=${encodeURIComponent(product.sku || product.name)}`}>{product.name}</Link></DataTableCell>
                <DataTableCell>{product.category || "-"}</DataTableCell>
                <DataTableCell>{formatCurrency(product.cost)}</DataTableCell>
                <DataTableCell>{product.presentationUnits} u.</DataTableCell>
              </DataTableRow>)}
            </DataTableBody>
          </DataTable>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border)] p-4">
            <h2 className="erp-text-body-sm font-black">Historial de compras</h2>
            <ButtonLink href="/purchases" size="sm" variant="secondary">Ver Compras</ButtonLink>
          </div>
          <DataTable caption="Historial de compras del proveedor" minWidth="1040px" tableLabel="Historial de compras">
            <DataTableHeader><DataTableRow className="hover:bg-transparent"><DataTableHead>Compra</DataTableHead><DataTableHead>Fecha</DataTableHead><DataTableHead>Descripción</DataTableHead><DataTableHead>Total</DataTableHead><DataTableHead>Pagado</DataTableHead><DataTableHead>Saldo</DataTableHead><DataTableHead>Vence</DataTableHead><DataTableHead>Estado</DataTableHead></DataTableRow></DataTableHeader>
            <DataTableBody>
              {purchases.length === 0 ? <DataTableRow className="hover:bg-transparent"><DataTableCell colSpan={8}><EmptyState action={<ButtonLink href="/purchases" variant="secondary">Ir a Compras</ButtonLink>} description="Las compras registradas para este proveedor aparecerán acá." title="Sin compras registradas" /></DataTableCell></DataTableRow> : purchases.map((purchase) => <DataTableRow key={purchase.id}>
                <DataTableCell><Link className="font-mono text-xs font-semibold text-[color:var(--accent)] hover:underline" href={`/purchases?q=${encodeURIComponent(purchase.purchaseNumber || purchase.id)}`}>{purchase.purchaseNumber || "-"}</Link></DataTableCell>
                <DataTableCell className="whitespace-nowrap">{formatDate(purchase.date)}</DataTableCell>
                <DataTableCell><div className="max-w-[260px] break-words">{purchase.description || "-"}</div></DataTableCell>
                <DataTableCell>{formatCurrency(purchase.total)}</DataTableCell>
                <DataTableCell>{formatCurrency(purchase.paid)}</DataTableCell>
                <DataTableCell>{formatCurrency(purchase.balance)}</DataTableCell>
                <DataTableCell className="whitespace-nowrap">{formatDate(purchase.dueDate)}</DataTableCell>
                <DataTableCell><StatusBadge tone={statusTone(purchase.status)}>{purchase.status || "Sin estado"}</StatusBadge></DataTableCell>
              </DataTableRow>)}
            </DataTableBody>
          </DataTable>
        </Card>
      </div>
    </ModulePage>
  );
}
