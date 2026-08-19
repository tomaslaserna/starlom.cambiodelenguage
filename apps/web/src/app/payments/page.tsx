import Link from "next/link";
import { redirect } from "next/navigation";
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
  Field,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  Toolbar,
  type StatusBadgeTone,
} from "@/components/ui";
import { listCustomerOptions, listCustomerPayments, listPendingCustomerPayments } from "@/lib/customer-accounts";
import { formatCurrency, formatDate } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";
import { COLLECTIONS_APPROVE_PERMISSION, COLLECTIONS_CREATE_PERMISSION, sessionAllows, sessionCanReadCollections } from "@/lib/route-auth";
import { localDateIso } from "@/lib/timezone";
import { registerCustomerPaymentAction, voidCustomerPaymentAction } from "@/app/payments/actions";
import { RegisterPaymentDialog } from "@/app/payments/register-payment-dialog";

type PaymentsPageProps = {
  searchParams: Promise<{ q?: string; status?: string }>;
};

const paymentStates = [
  { value: "", label: "Todos" },
  { value: "registrado", label: "Registrado" },
  { value: "pendiente_aprobacion", label: "Pendiente de aprobacion" },
  { value: "anulado", label: "Anulado" },
];

const statusLabels: Record<string, string> = {
  registrado: "Registrado",
  pendiente_aprobacion: "Pendiente de aprobacion",
  anulado: "Anulado",
  rechazado: "Rechazado",
};

function paymentStatusTone(value: string): StatusBadgeTone {
  if (value === "registrado") return "success";
  if (value === "pendiente_aprobacion") return "warning";
  if (value === "rechazado") return "danger";
  return "neutral";
}

export default async function PaymentsPage({ searchParams }: PaymentsPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanReadCollections(session))) redirect("/");

  const params = await searchParams;
  const query = params.q ?? "";
  const status = params.status ?? "";
  const today = localDateIso();

  // DIAGNOSTICO TEMPORAL: corre cada fuente por separado y, si alguna falla,
  // imprime el mensaje real en pantalla en vez de un 500 generico.
  const diag: string[] = [];
  async function probe<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch (error) {
      diag.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }
  const payments = (await probe("listCustomerPayments", () => listCustomerPayments(session.companyId, { query, status }))) ?? [];
  const customers = (await probe("listCustomerOptions", () => listCustomerOptions(session.companyId))) ?? [];
  const pendingPayments = (await probe("listPendingCustomerPayments", () => listPendingCustomerPayments(session.companyId))) ?? [];
  const canRegister = (await probe("canRegister", () => sessionAllows(session, [COLLECTIONS_CREATE_PERMISSION]))) ?? false;
  const canVoid = (await probe("canVoid", () => sessionAllows(session, [COLLECTIONS_APPROVE_PERMISSION]))) ?? false;

  if (diag.length > 0) {
    return (
      <pre style={{ whiteSpace: "pre-wrap", padding: 16, margin: 16, border: "2px solid crimson", color: "crimson", fontSize: 13, fontFamily: "monospace" }}>
        {"DIAGNOSTICO /payments — errores:\n\n" + diag.join("\n\n")}
      </pre>
    );
  }

  return (
    <ModulePage
      active="collections"
      description="Alta y anulacion de pagos de clientes."
      session={session}
      title="Registro de pagos"
    >
      <div className="grid gap-5">
        <PageHeader
          actions={
            canRegister ? (
              <RegisterPaymentDialog action={registerCustomerPaymentAction} customers={customers} today={today} />
            ) : null
          }
          description="Diario de pagos registrados, pendientes de aprobacion y anulados."
          meta={
            pendingPayments.length > 0 ? (
              <Link className="font-semibold text-[color:var(--accent-strong)] underline-offset-2 hover:underline" href="/admin/approvals">
                {`● ${pendingPayments.length} pendientes de aprobacion`}
              </Link>
            ) : null
          }
          title="Pagos de clientes"
        />

        <Toolbar ariaLabel="Filtros de pagos">
          <form
            action="/payments"
            className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_220px_auto] lg:items-end"
          >
            <Field htmlFor="payments-query" label="Buscar">
              <Input
                defaultValue={query}
                id="payments-query"
                name="q"
                placeholder="Cliente"
                type="search"
              />
            </Field>
            <Field htmlFor="payments-status" label="Estado">
              <Select defaultValue={status} id="payments-status" name="status">
                {paymentStates.map((state) => (
                  <option key={state.value} value={state.value}>
                    {state.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit">Filtrar</Button>
          </form>
        </Toolbar>

        <Card className="overflow-hidden">
          <DataTable
            caption="Pagos de clientes registrados"
            className="rounded-none border-0 shadow-none"
            minWidth="1080px"
            tableLabel="Registro de pagos"
            tableProps={{ className: "table-fixed" }}
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead className="w-[10%] px-2">Fecha</DataTableHead>
                <DataTableHead className="w-[22%] px-2">Cliente</DataTableHead>
                <DataTableHead className="w-[12%] px-2">Metodo</DataTableHead>
                <DataTableHead className="w-[18%] px-2">Operacion/Ref.</DataTableHead>
                <DataTableHead className="w-[14%] px-2">Cargo</DataTableHead>
                <DataTableHead align="right" className="w-[10%] px-2">Monto</DataTableHead>
                <DataTableHead className="w-[9%] px-2">Estado</DataTableHead>
                <DataTableHead className="w-[5%] px-2">Accion</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {payments.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={8}>
                    <EmptyState
                      description="No hay pagos registrados para la busqueda actual."
                      title="Sin pagos"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                payments.map((payment) => {
                  const isVoided = payment.status === "anulado";
                  return (
                    <DataTableRow className={isVoided ? "line-through opacity-70" : undefined} key={payment.id}>
                      <DataTableCell className="whitespace-nowrap px-2 py-2 text-xs">
                        {formatDate(payment.date)}
                      </DataTableCell>
                      <DataTableCell className="truncate px-2 py-2 font-medium">
                        {payment.customerName || "Sin cliente"}
                      </DataTableCell>
                      <DataTableCell className="px-2 py-2 text-xs">{payment.method || "-"}</DataTableCell>
                      <DataTableCell className="truncate px-2 py-2 text-xs">
                        {payment.reference || "-"}
                      </DataTableCell>
                      <DataTableCell className="truncate px-2 py-2 text-xs">
                        {payment.registeredBy || "-"}
                      </DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap px-2 py-2 font-mono text-xs">
                        {formatCurrency(payment.amount)}
                      </DataTableCell>
                      <DataTableCell className="px-2 py-2">
                        <StatusBadge tone={paymentStatusTone(payment.status)}>
                          {statusLabels[payment.status] ?? payment.status}
                        </StatusBadge>
                      </DataTableCell>
                      <DataTableCell className="px-2 py-2">
                        {payment.status === "registrado" && canVoid ? (
                          <form action={voidCustomerPaymentAction}>
                            <input name="id" type="hidden" value={payment.id} />
                            <Button size="sm" type="submit" variant="danger">
                              Anular
                            </Button>
                          </form>
                        ) : null}
                      </DataTableCell>
                    </DataTableRow>
                  );
                })
              )}
            </DataTableBody>
          </DataTable>
        </Card>
      </div>
    </ModulePage>
  );
}
