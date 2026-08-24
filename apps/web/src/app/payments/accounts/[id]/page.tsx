import Link from "next/link";
import { notFound } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import {
  Button,
  ButtonLink,
  Card,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  EmptyState,
  Field,
  Input,
  PageHeader,
  StatCard,
  Toolbar,
} from "@/components/ui";
import { ApiError } from "@/lib/api-response";
import { requireStaffSession } from "@/lib/auth";
import { getCustomerStatement, listCustomerOptions } from "@/lib/customer-accounts";
import { formatCurrency, formatDate } from "@/lib/format";
import { requirePagePermission } from "@/lib/page-auth";
import { COLLECTIONS_READ_PERMISSION } from "@/lib/route-auth";
import { localDateIso } from "@/lib/timezone";
import { registerCustomerPaymentAction } from "@/app/payments/actions";
import { RegisterPaymentDialog } from "@/app/payments/register-payment-dialog";

type CustomerStatementPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
};

export default async function CustomerStatementPage({ params, searchParams }: CustomerStatementPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [COLLECTIONS_READ_PERMISSION]);

  const { id } = await params;
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) notFound();
  const query = await searchParams;
  const from = query.from ?? "";
  const to = query.to ?? "";

  const [periodResult, fullResult, customers] = await Promise.all([
    getCustomerStatement(session.companyId, id, { from, to }).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }),
    // Llamada sin fechas: el finalBalance del recorte por periodo no es el
    // saldo actual real, asi que necesitamos el saldo total sin filtro.
    getCustomerStatement(session.companyId, id, {}).catch(() => null),
    listCustomerOptions(session.companyId),
  ]);
  if (!periodResult) notFound();

  const { customer, statement } = periodResult;
  const currentBalance = fullResult?.statement.finalBalance ?? statement.finalBalance;
  const today = localDateIso();

  const pdfParams = new URLSearchParams();
  if (from) pdfParams.set("from", from);
  if (to) pdfParams.set("to", to);
  const pdfHref = `/api/pdfs/accounts/statement/${id}${pdfParams.toString() ? `?${pdfParams.toString()}` : ""}`;

  return (
    <ModulePage
      active="collections"
      description="Estado de cuenta del cliente con saldo anterior y saldo corrido."
      session={session}
      title={customer.name || "Cliente"}
    >
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PageHeader
            description={
              [customer.taxId ? `CUIT ${customer.taxId}` : "", customer.sellerName ? `Vendedor: ${customer.sellerName}` : ""]
                .filter(Boolean)
                .join(" · ") || "-"
            }
            title={customer.name || "Sin nombre"}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Link className="erp-text-body-sm text-[color:var(--accent)] hover:underline" href="/payments/accounts">
              ← Volver a Cuentas
            </Link>
            <RegisterPaymentDialog
              action={registerCustomerPaymentAction}
              customers={customers}
              defaultCustomerId={id}
              today={today}
              triggerLabel="+ Registrar pago"
            />
            <ButtonLink href={pdfHref} prefetch={false} target="_blank" variant="secondary">
              Exportar PDF
            </ButtonLink>
          </div>
        </div>

        <StatCard
          className="max-w-xs"
          detail="Saldo total sin filtro de fechas"
          label="Saldo actual"
          tone={currentBalance > 0 ? "danger" : currentBalance < 0 ? "success" : "neutral"}
          value={formatCurrency(currentBalance)}
        />

        <Toolbar ariaLabel="Filtro de fechas del estado de cuenta">
          <form
            action={`/payments/accounts/${id}`}
            className="grid w-full gap-3 md:grid-cols-[200px_200px_auto] md:items-end"
            method="GET"
          >
            <Field htmlFor="statement-from" label="Desde">
              <Input defaultValue={from} id="statement-from" name="from" type="date" />
            </Field>
            <Field htmlFor="statement-to" label="Hasta">
              <Input defaultValue={to} id="statement-to" name="to" type="date" />
            </Field>
            <Button type="submit">Filtrar</Button>
          </form>
        </Toolbar>

        <Card className="overflow-hidden">
          <DataTable
            caption="Estado de cuenta del cliente"
            className="rounded-none border-0 shadow-none"
            minWidth="860px"
            tableLabel="Estado de cuenta"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead className="w-[12%] px-2">Fecha</DataTableHead>
                <DataTableHead className="w-[46%] px-2">Comprobante / Detalle</DataTableHead>
                <DataTableHead align="right" className="w-[14%] px-2">Debe</DataTableHead>
                <DataTableHead align="right" className="w-[14%] px-2">Haber</DataTableHead>
                <DataTableHead align="right" className="w-[14%] px-2">Saldo</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              <DataTableRow className="hover:bg-transparent">
                <DataTableCell className="whitespace-nowrap px-2 py-2 text-xs">
                  {from ? formatDate(from) : "-"}
                </DataTableCell>
                <DataTableCell className="px-2 py-2 font-semibold">Saldo anterior</DataTableCell>
                <DataTableCell align="right" className="px-2 py-2 font-mono text-xs">-</DataTableCell>
                <DataTableCell align="right" className="px-2 py-2 font-mono text-xs">-</DataTableCell>
                <DataTableCell align="right" className="px-2 py-2 font-mono text-xs font-semibold">
                  {formatCurrency(statement.openingBalance)}
                </DataTableCell>
              </DataTableRow>
              {statement.lines.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={5}>
                    <EmptyState
                      description="No hay movimientos en el periodo seleccionado."
                      title="Sin movimientos"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                statement.lines.map((line) => (
                  <DataTableRow key={line.id}>
                    <DataTableCell className="whitespace-nowrap px-2 py-2 text-xs">
                      {formatDate(line.date)}
                    </DataTableCell>
                    <DataTableCell className="px-2 py-2 text-xs">
                      <div className="grid gap-1">
                        <span>{line.description || "-"}</span>
                        {line.debit > 0 && line.saleId ? (
                          line.hasPricedItems && line.deliveryNumber ? (
                            <Link
                              className="font-semibold text-[color:var(--accent)] hover:underline"
                              href={`/api/pdfs/orders/${line.saleId}/remito`}
                              prefetch={false}
                              target="_blank"
                            >
                              Abrir Remito #{String(line.deliveryNumber).padStart(4, "0")} con productos y precios
                            </Link>
                          ) : (
                            <span className="text-[color:var(--warning)]">
                              {line.saleNumber ?? "Venta histórica"} · detalle de productos no disponible en la migración
                            </span>
                          )
                        ) : null}
                      </div>
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap px-2 py-2 font-mono text-xs">
                      {line.debit > 0 ? formatCurrency(line.debit) : "-"}
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap px-2 py-2 font-mono text-xs">
                      {line.credit > 0 ? formatCurrency(line.credit) : "-"}
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap px-2 py-2 font-mono text-xs">
                      {formatCurrency(line.balance)}
                    </DataTableCell>
                  </DataTableRow>
                ))
              )}
              <DataTableRow className="hover:bg-transparent">
                <DataTableCell className="px-2 py-2 font-black" colSpan={4}>
                  Saldo final del periodo
                </DataTableCell>
                <DataTableCell align="right" className="px-2 py-2 font-mono text-xs font-black">
                  {formatCurrency(statement.finalBalance)}
                </DataTableCell>
              </DataTableRow>
            </DataTableBody>
          </DataTable>
        </Card>
      </div>
    </ModulePage>
  );
}
