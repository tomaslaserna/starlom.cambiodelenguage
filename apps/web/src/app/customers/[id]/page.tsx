import Link from "next/link";
import { notFound } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import {
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
} from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { getCustomer } from "@/lib/catalog-management";
import { listClientOptions } from "@/lib/catalog";
import { getCustomerPurchaseHistory } from "@/lib/customer-detail";
import { formatCurrency } from "@/lib/format";
import { listVendors } from "@/lib/imports";
import { listPriceLists } from "@/lib/pricing";
import { requirePagePermission } from "@/lib/page-auth";
import { CUSTOMERS_READ_PERMISSION, sessionAllows } from "@/lib/route-auth";
import { CustomerRowActions } from "@/app/customers/customer-row-actions";
import { deleteCustomerAction, mergeCustomersAction, updateCustomerAction } from "@/app/customers/actions";

type CustomerDetailPageProps = {
  params: Promise<{ id: string }>;
  crmMode?: boolean;
};

function line(label: string, value: string) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="erp-text-caption text-[color:var(--muted)]">{label}</span>
      <span className="erp-text-body-sm font-medium">{value || "-"}</span>
    </div>
  );
}

export default async function CustomerDetailPage({ params, crmMode = false }: CustomerDetailPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [CUSTOMERS_READ_PERMISSION]);
  const { id } = await params;

  const customer = await getCustomer(session.companyId, id).catch(() => null);
  if (!customer) notFound();

  const [history, vendors, canDelete, allClients, priceLists] = await Promise.all([
    getCustomerPurchaseHistory(session.companyId, id),
    listVendors(session.companyId),
    sessionAllows(session, [{ resource: "clientes", action: "eliminar" }]),
    listClientOptions(session.companyId),
    listPriceLists(session.companyId, true),
  ]);
  const priceListNames = priceLists.filter((list) => list.active).map((list) => list.name);

  return (
    <ModulePage active={crmMode ? "crm" : "database"} description="Ficha del cliente." session={session} title={customer.name || "Cliente"}>
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PageHeader
            description={`${customer.taxIdType || "ID"} ${customer.taxId || "-"}`}
            title={customer.name || "Sin nombre"}
          />
          <div className="flex items-center gap-2">
            <Link className="erp-text-body-sm text-[color:var(--accent)] hover:underline" href={crmMode ? "/crm/clientes" : "/customers"}>
              ← Volver a Clientes
            </Link>
            <CustomerRowActions
              allClients={allClients}
              canDelete={canDelete}
              customer={{
                id: customer.id,
                name: customer.name,
                businessName: customer.businessName,
                taxIdType: customer.taxIdType,
                taxId: customer.taxId,
                vatCondition: customer.vatCondition,
                phone: customer.phone,
                address: customer.address,
                city: customer.city,
                province: customer.province,
                priceList: customer.priceList,
                status: customer.status,
                seller: customer.seller,
                assignedSeller: customer.assignedSeller,
                observation: customer.observation,
                salesCount: history.summary.count,
              }}
              deleteAction={deleteCustomerAction}
              mergeAction={mergeCustomersAction}
              priceLists={priceListNames}
              updateAction={updateCustomerAction}
              vendors={vendors}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total comprado" value={formatCurrency(history.summary.totalAmount)} />
          <StatCard label="Compras" value={String(history.summary.count)} />
          <StatCard label="Última compra" value={history.summary.lastPurchase ?? "-"} />
          <StatCard
            detail={history.summary.expectedNext ? `próxima ~ ${history.summary.expectedNext}` : undefined}
            label="Ritmo (días)"
            value={history.summary.averageDays > 0 ? String(history.summary.averageDays) : "-"}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent>
              <h2 className="erp-text-body-sm font-black">Contacto</h2>
              {line("Teléfono", customer.phone)}
              {line("Dirección", customer.address)}
              {line("Localidad", customer.city)}
              {line("Provincia", customer.province)}
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <h2 className="erp-text-body-sm font-black">Fiscal</h2>
              {line("Tipo ID", customer.taxIdType)}
              {line("CUIT/DNI", customer.taxId)}
              {line("Cond. IVA", customer.vatCondition)}
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <h2 className="erp-text-body-sm font-black">Comercial</h2>
              {line("Lista de precios", customer.priceList)}
              {line("Estado", customer.status)}
              {line("Vendedor propio", customer.seller)}
              {line("Vendedor a cargo", customer.assignedSeller)}
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <h2 className="erp-text-body-sm font-black">Notas</h2>
              <p className="erp-text-body-sm">{customer.observation || "Sin notas."}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-[color:var(--border)] p-4">
            <h2 className="erp-text-body-sm font-black">Historial de compras</h2>
          </div>
          <DataTable caption="Historial de compras del cliente" minWidth="640px" tableLabel="Compras">
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Comprobante</DataTableHead>
                <DataTableHead>Fecha</DataTableHead>
                <DataTableHead>Monto</DataTableHead>
                <DataTableHead>Estado pedido</DataTableHead>
                <DataTableHead>Cobro</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {history.orders.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={5}>
                    <EmptyState description="Este cliente todavía no tiene compras." title="Sin compras registradas" />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                history.orders.map((order) => (
                  <DataTableRow key={order.id}>
                    <DataTableCell className="font-mono text-xs">{order.number || "-"}</DataTableCell>
                    <DataTableCell className="whitespace-nowrap">{order.date ?? "-"}</DataTableCell>
                    <DataTableCell>{formatCurrency(order.amount)}</DataTableCell>
                    <DataTableCell><StatusBadge tone="neutral">{order.orderStatus || "-"}</StatusBadge></DataTableCell>
                    <DataTableCell>{order.collectionStatus}</DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
        </Card>
      </div>
    </ModulePage>
  );
}
