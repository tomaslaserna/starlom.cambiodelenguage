import { ModulePage } from "@/components/module-page";
import { Button, ButtonLink, Card, DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow, EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { createCustomerFollowUpTaskAction } from "@/app/customers/follow-up/actions";
import { getCustomerFollowUp } from "@/lib/messages";
import { formatDate, formatNumber } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { CUSTOMERS_READ_PERMISSION } from "@/lib/route-auth";
import { localDateIso } from "@/lib/timezone";

type FollowUpRow = {
  customerId: string;
  customerName: string;
  phone: string;
  seller: string;
  purchases: number;
  lastPurchase: string | null;
  expectedNextPurchase?: string;
  daysSinceLastPurchase?: number;
  delayDays?: number;
  reason?: string;
};

const groupLabels: Record<string, string> = {
  contactar: "Contactar",
  riesgo: "En riesgo",
  perdido: "Perdidos",
  sin_historial: "Sin historial",
};

function normalizePhoneForWhatsapp(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("54")) return digits;
  return `54${digits}`;
}

function rowsFromGroup(data: Awaited<ReturnType<typeof getCustomerFollowUp>>, key: string) {
  return (data.groups[key] ?? []) as FollowUpRow[];
}

type CustomerFollowUpPageProps = {
  searchParams: Promise<{
    task?: string;
  }>;
};

function reminderPriority(group: string) {
  if (group === "perdido") return "urgente";
  if (group === "riesgo") return "alta";
  return "normal";
}

function reminderDeadline(row: FollowUpRow & { group: string }, today: string) {
  if (row.group === "perdido" || row.group === "riesgo") return today;
  return row.expectedNextPurchase ?? today;
}

export default async function CustomerFollowUpPage({ searchParams }: CustomerFollowUpPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [CUSTOMERS_READ_PERMISSION]);
  const params = await searchParams;
  const today = localDateIso();
  const followUp = await getCustomerFollowUp(session.companyId);
  const rows = ["contactar", "riesgo", "perdido", "sin_historial"].flatMap((key) =>
    rowsFromGroup(followUp, key).slice(0, 80).map((row) => ({ ...row, group: key })),
  );

  return (
    <ModulePage
      active="database"
      description="Seguimiento de clientes por recompra esperada, riesgo y falta de historial."
      session={session}
      title="Seguimiento clientes"
    >
      <div className="grid gap-5">
        <PageHeader
          title="Seguimiento clientes"
          description="Prioriza clientes a contactar segun historial de compras entregadas."
          moduleIntro
        />

        {params.task ? (
          <div className="rounded-lg border border-[color:var(--success)] bg-[color:var(--success-subtle)] px-4 py-3 text-sm font-semibold text-[color:var(--success)]">
            Recordatorio creado en Inicio y Calendario.
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Contactar" value={formatNumber(Number(followUp.counts.contactar ?? 0))} />
          <StatCard label="En riesgo" value={formatNumber(Number(followUp.counts.riesgo ?? 0))} />
          <StatCard label="Perdidos" value={formatNumber(Number(followUp.counts.perdido ?? 0))} />
          <StatCard label="Sin historial" value={formatNumber(Number(followUp.counts.sin_historial ?? 0))} />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Clientes priorizados para seguimiento"
            className="rounded-none border-0 shadow-none"
            minWidth="980px"
            tableLabel="Seguimiento clientes"
            tableProps={{ className: "table-fixed" }}
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead className="w-[12%]">Estado</DataTableHead>
                <DataTableHead className="w-[24%]">Cliente</DataTableHead>
                <DataTableHead className="w-[13%]">Vendedor</DataTableHead>
                <DataTableHead className="w-[12%]">Ultima compra</DataTableHead>
                <DataTableHead className="w-[13%]">Proxima estimada</DataTableHead>
                <DataTableHead align="right" className="w-[10%]">Demora</DataTableHead>
                <DataTableHead className="w-[16%]">Acciones</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {rows.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={7}>
                    <EmptyState title="No hay clientes para seguimiento" />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                rows.map((row, index) => {
                  const whatsappPhone = normalizePhoneForWhatsapp(row.phone);
                  const message = encodeURIComponent(`Hola ${row.customerName}, te escribimos de Starlim para revisar reposicion y necesidades de compra.`);
                  const deadline = reminderDeadline(row, today);
                  return (
                    <DataTableRow key={`${row.group}-${row.customerName}-${index}`}>
                      <DataTableCell>
                        <StatusBadge tone={row.group === "perdido" ? "danger" : row.group === "riesgo" ? "warning" : "info"}>
                          {groupLabels[row.group] ?? row.group}
                        </StatusBadge>
                      </DataTableCell>
                      <DataTableCell>
                        <div className="font-medium">{row.customerName}</div>
                        <div className="text-xs text-[color:var(--muted)]">{row.phone || row.reason || "-"}</div>
                      </DataTableCell>
                      <DataTableCell>{row.seller || "-"}</DataTableCell>
                      <DataTableCell>{row.lastPurchase ? formatDate(row.lastPurchase) : "-"}</DataTableCell>
                      <DataTableCell>{row.expectedNextPurchase ? formatDate(row.expectedNextPurchase) : "-"}</DataTableCell>
                      <DataTableCell align="right">{row.delayDays !== undefined ? `${formatNumber(row.delayDays)} dias` : "-"}</DataTableCell>
                      <DataTableCell>
                        <div className="grid gap-2">
                          {whatsappPhone ? (
                            <ButtonLink href={`https://wa.me/${whatsappPhone}?text=${message}`} target="_blank" rel="noreferrer" size="sm">
                              WhatsApp
                            </ButtonLink>
                          ) : (
                            <span className="text-xs text-[color:var(--muted)]">Sin telefono</span>
                          )}
                          <form action={createCustomerFollowUpTaskAction}>
                            <input name="title" type="hidden" value={`Seguimiento ${row.customerName}`} />
                            <input
                              name="description"
                              type="hidden"
                              value={`Cliente ${row.customerName}. Estado ${groupLabels[row.group] ?? row.group}. Ultima compra ${row.lastPurchase ?? "-"}. Proxima estimada ${row.expectedNextPurchase ?? "-"}.`}
                            />
                            <input name="priority" type="hidden" value={reminderPriority(row.group)} />
                            <input name="deadline" type="hidden" value={deadline} />
                            <Button className="w-full" size="sm" type="submit" variant="secondary">
                              Recordar
                            </Button>
                          </form>
                        </div>
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
