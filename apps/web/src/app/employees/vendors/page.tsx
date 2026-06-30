import { ModulePage } from "@/components/module-page";
import {
  Button,
  Card,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  EmptyState,
  Input,
  PageHeader,
  StatCard,
} from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { getVendorManagement } from "@/lib/vendors-management";
import { requireStaffSession } from "@/lib/auth";
import { sessionCanReadEmployees } from "@/lib/route-auth";
import { saveVendorGoalAction } from "@/app/employees/vendors/actions";
import { redirect } from "next/navigation";

export default async function VendorsManagementPage() {
  const session = await requireStaffSession();
  if (!(await sessionCanReadEmployees(session))) redirect("/");

  const data = await getVendorManagement(session.companyId);

  return (
    <ModulePage
      active="employees"
      description="Gestion de vendedores con metas, clientes asignados, presupuestos y tasa de cierre."
      session={session}
      title="Gestion de vendedores"
    >
      <div className="grid gap-5">
        <PageHeader
          title="Vendedores"
          description="Gestiona metas comerciales, clientes asignados, presupuestos y tasa de cierre."
        />

        <div className="grid gap-3 md:grid-cols-3">
          <StatCard label="Vendedores" value={data.meta.count} />
          <StatCard label="Clientes a cargo" value={data.meta.clients} />
          <StatCard label="Ventas del mes" value={formatCurrency(data.meta.salesTotal)} />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Listado de vendedores y metas comerciales"
            minWidth="980px"
            tableLabel="Vendedores"
            className="rounded-none border-0 shadow-none"
          >
            <DataTableHeader>
              <DataTableRow>
                <DataTableHead>Vendedor</DataTableHead>
                <DataTableHead>Metas</DataTableHead>
                <DataTableHead align="right">Venta mes</DataTableHead>
                <DataTableHead align="right">Clientes</DataTableHead>
                <DataTableHead align="right">Presupuestos</DataTableHead>
                <DataTableHead align="right">Tasa cierre</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {data.vendors.length === 0 ? (
                <DataTableRow>
                  <DataTableCell colSpan={6} className="py-10">
                    <EmptyState
                      title="No hay vendedores configurados"
                      description="Cuando existan vendedores asociados a empleados, clientes, ventas o presupuestos, apareceran en este listado."
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                data.vendors.map((vendor) => (
                  <DataTableRow key={vendor.vendor}>
                    <DataTableCell className="min-w-[220px] font-medium text-[color:var(--foreground)]">
                      {vendor.vendor}
                    </DataTableCell>
                    <DataTableCell className="min-w-[300px]">
                      <form action={saveVendorGoalAction} className="flex flex-wrap items-center gap-2">
                        <input name="vendor" type="hidden" value={vendor.vendor} />
                        <Input
                          aria-label="Meta de ventas"
                          className="w-28"
                          defaultValue={vendor.goalSales}
                          min="0"
                          name="goalSales"
                          type="number"
                        />
                        <Input
                          aria-label="Meta de clientes"
                          className="w-24"
                          defaultValue={vendor.goalClients}
                          min="0"
                          name="goalClients"
                          type="number"
                        />
                        <Button size="sm" type="submit" variant="secondary">
                          Guardar
                        </Button>
                      </form>
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap font-mono tabular-nums">
                      {formatCurrency(vendor.salesTotal)}
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap tabular-nums">
                      {vendor.clients}
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap tabular-nums">
                      {vendor.quotes}
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap tabular-nums">
                      {vendor.closeRate.toFixed(1)}%
                    </DataTableCell>
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
