import Link from "next/link";
import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { PaginationLinks } from "@/components/pagination-links";
import {
  Button,
  ButtonLink,
  AppIcon,
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
  StatusBadge,
  Toolbar,
  type StatusBadgeTone,
} from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { getVendorCustomers } from "@/lib/crm";
import { sessionCanUseCrm } from "@/lib/route-auth";

type CrmClientesPageProps = {
  searchParams: Promise<{ q?: string; page?: string }>;
};

function clientStatusTone(status: string): StatusBadgeTone {
  return status.trim().toLowerCase() === "activo" ? "success" : "neutral";
}

function whatsappHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  const international = digits.startsWith("54") ? digits : `54${digits}`;
  return `https://wa.me/${international}`;
}

export default async function CrmClientesPage({ searchParams }: CrmClientesPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanUseCrm(session))) redirect("/");

  const params = await searchParams;
  const customers = await getVendorCustomers(session, { query: params.q, page: params.page });

  const vendor = session.displayName || session.username || "vendedor";

  return (
    <ModulePage
      active="crm"
      description="Tu base de datos de clientes propios y a cargo."
      session={session}
      title="CRM · Clientes"
    >
      <div className="grid gap-5">
        <PageHeader
          actions={<ButtonLink href="/customers#crear-cliente" leadingIcon={<AppIcon className="h-4 w-4" name="user" />}>Nuevo cliente</ButtonLink>}
          title={`Cartera de ${vendor}`}
          description={`${customers.meta.total} ${customers.meta.total === 1 ? "cliente disponible" : "clientes disponibles"}. Buscá una cuenta y resolvé el próximo paso desde la misma fila.`}
        />

        <div className="grid gap-3 md:grid-cols-3">
          <Link className="group rounded-[16px] border border-[#cfe0f7] bg-[linear-gradient(135deg,#edf5ff,#ffffff)] p-4 shadow-[var(--shadow-xs)] transition hover:-translate-y-0.5 hover:border-[#8ebbf0] hover:shadow-[var(--shadow-sm)]" href="/crm/perfil">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#075ac7] text-white"><AppIcon className="h-4 w-4" name="clock" /></span>
            <strong className="mt-3 block text-base font-extrabold text-[#0f172a]">¿A quién contacto hoy?</strong>
            <span className="mt-1 block text-sm font-medium text-[#64748b]">Abrí la agenda priorizada por recompra y seguimiento.</span>
          </Link>
          <Link className="group rounded-[16px] border border-[#f4ddb0] bg-[linear-gradient(135deg,#fff8e9,#ffffff)] p-4 shadow-[var(--shadow-xs)] transition hover:-translate-y-0.5 hover:border-[#eec66f] hover:shadow-[var(--shadow-sm)]" href="/quotes/new">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f59e0b] text-white"><AppIcon className="h-4 w-4" name="quote" /></span>
            <strong className="mt-3 block text-base font-extrabold text-[#0f172a]">Presupuestar en el acto</strong>
            <span className="mt-1 block text-sm font-medium text-[#64748b]">Pasá de la consulta del cliente a una propuesta concreta.</span>
          </Link>
          <Link className="group rounded-[16px] border border-[#cde9df] bg-[linear-gradient(135deg,#edfdf7,#ffffff)] p-4 shadow-[var(--shadow-xs)] transition hover:-translate-y-0.5 hover:border-[#80cfb2] hover:shadow-[var(--shadow-sm)]" href="/crm/cobros">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0f9f6e] text-white"><AppIcon className="h-4 w-4" name="wallet" /></span>
            <strong className="mt-3 block text-base font-extrabold text-[#0f172a]">Gestionar cobranzas</strong>
            <span className="mt-1 block text-sm font-medium text-[#64748b]">Consultá saldos y registrá el seguimiento del cobro.</span>
          </Link>
        </div>

        {/* Base de datos de tus clientes */}
        <Toolbar ariaLabel="Busqueda de clientes">
          <form action="/crm/clientes" className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end">
            <Field htmlFor="crm-clientes-query" label="Buscar">
              <Input
                defaultValue={customers.meta.query}
                id="crm-clientes-query"
                name="q"
                placeholder="Nombre, razon social, CUIT o telefono"
                type="search"
              />
            </Field>
            <Button type="submit">Buscar</Button>
          </form>
        </Toolbar>

        <Card className="overflow-hidden">
          <DataTable
            caption="Tus clientes (propios y a cargo)"
            className="rounded-none border-0 shadow-none"
            minWidth="1080px"
            tableLabel="Clientes del vendedor"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Cliente</DataTableHead>
                <DataTableHead>CUIT</DataTableHead>
                <DataTableHead>Contacto</DataTableHead>
                <DataTableHead>Ubicacion</DataTableHead>
                <DataTableHead>Lista</DataTableHead>
                <DataTableHead>Relacion</DataTableHead>
                <DataTableHead>Estado</DataTableHead>
                <DataTableHead className="text-right">Acciones</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {customers.data.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={8}>
                    <EmptyState
                      description={customers.meta.query
                        ? "Ajusta la busqueda para encontrar tus clientes."
                        : "Todavia no tenes clientes propios ni a cargo cargados."}
                      title={customers.meta.query ? "Sin resultados" : "Sin clientes asignados"}
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                customers.data.map((customer) => (
                  <DataTableRow key={customer.id}>
                    <DataTableCell>
                      <Link className="max-w-[260px] break-words font-medium text-[color:var(--accent)] hover:underline" href={`/customers/${customer.id}`}>
                        {customer.name || "Sin nombre"}
                      </Link>
                      <div className="mt-1 max-w-[260px] break-words text-xs text-[color:var(--muted)]">
                        {customer.businessName || `ID ${customer.id}`}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="whitespace-nowrap font-mono text-xs">{customer.taxId || "-"}</DataTableCell>
                    <DataTableCell className="whitespace-nowrap">{customer.phone || "-"}</DataTableCell>
                    <DataTableCell className="text-[color:var(--muted)]">
                      <div className="max-w-[220px] break-words">
                        {[customer.city, customer.province].filter(Boolean).join(", ") || "-"}
                      </div>
                    </DataTableCell>
                    <DataTableCell>{customer.priceList || "-"}</DataTableCell>
                    <DataTableCell>
                      <StatusBadge tone={customer.relation === "propio" ? "success" : "neutral"}>
                        {customer.relation}
                      </StatusBadge>
                    </DataTableCell>
                    <DataTableCell>
                      <StatusBadge tone={clientStatusTone(customer.status)}>{customer.status}</StatusBadge>
                    </DataTableCell>
                    <DataTableCell>
                      <div className="flex justify-end gap-2">
                        {whatsappHref(customer.phone) ? (
                          <ButtonLink href={whatsappHref(customer.phone)!} rel="noreferrer" size="sm" target="_blank" variant="secondary">WhatsApp</ButtonLink>
                        ) : null}
                        <ButtonLink href={`/customers/${customer.id}`} size="sm">Ver ficha</ButtonLink>
                      </div>
                    </DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
          <PaginationLinks
            basePath="/crm/clientes"
            page={customers.meta.page}
            query={customers.meta.query}
            totalPages={customers.meta.totalPages}
          />
        </Card>
      </div>
    </ModulePage>
  );
}
