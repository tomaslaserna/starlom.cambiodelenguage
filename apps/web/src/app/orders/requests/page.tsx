import { ModulePage } from "@/components/module-page";
import { Button, ButtonLink, Card, DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow, EmptyState, StatusBadge } from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { ORDERS_READ_PERMISSION } from "@/lib/route-auth";
import { listOrderRequests } from "@/lib/order-requests";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { resolveOrderRequestAction } from "./actions";

export default async function OrderRequestsPage({searchParams}:{searchParams:Promise<{status?:string;error?:string;updated?:string}>}) {
  const session=await requireStaffSession(); await requirePagePermission(session,[ORDERS_READ_PERMISSION]);
  const params=await searchParams; const status=params.status??"solicitud"; const rows=await listOrderRequests(session.companyId,status);
  return <ModulePage active="orders" description="Revisión previa de pedidos digitales antes de enviarlos a armado." session={session} title="Solicitudes de pedido">
    <div className="grid gap-5">
      <nav className="flex flex-wrap gap-2" aria-label="Vistas de pedidos"><ButtonLink href="/orders">Registro</ButtonLink><ButtonLink href="/orders/requests" variant="primary">Solicitudes</ButtonLink><ButtonLink href="/orders?status=cargado">Pendientes</ButtonLink><ButtonLink href="/orders?status=entregado">Entregados</ButtonLink></nav>
      {params.error?<div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-bold text-red-700">{decodeURIComponent(params.error)}</div>:null}
      {params.updated?<div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">Solicitud procesada correctamente.</div>:null}
      <div className="flex gap-2"><ButtonLink href="/orders/requests" size="sm" variant={status==="solicitud"?"primary":"secondary"}>Por revisar</ButtonLink><ButtonLink href="/orders/requests?status=aprobada" size="sm" variant={status==="aprobada"?"primary":"secondary"}>Aprobadas</ButtonLink><ButtonLink href="/orders/requests?status=rechazada" size="sm" variant={status==="rechazada"?"primary":"secondary"}>Rechazadas</ButtonLink></div>
      <Card className="overflow-hidden"><DataTable caption="Solicitudes digitales" className="rounded-none border-0 shadow-none" minWidth="1050px" tableLabel="Solicitudes"><DataTableHeader><DataTableRow><DataTableHead>Solicitud</DataTableHead><DataTableHead>Canal</DataTableHead><DataTableHead>Cliente</DataTableHead><DataTableHead>Detalle</DataTableHead><DataTableHead>Pago</DataTableHead><DataTableHead align="right">Total</DataTableHead><DataTableHead>Acción</DataTableHead></DataTableRow></DataTableHeader><DataTableBody>
        {rows.length===0?<DataTableRow><DataTableCell colSpan={7}><EmptyState title="No hay solicitudes" description="No existen solicitudes en este estado."/></DataTableCell></DataTableRow>:rows.map(row=><DataTableRow key={row.id}><DataTableCell><strong>{row.quote_number}</strong><small className="block text-[color:var(--muted)]">{formatDateTime(row.created_at)}</small></DataTableCell><DataTableCell><StatusBadge tone={row.channel==="desafio"?"warning":row.channel==="portal"?"accent":"neutral"}>{row.channel==="desafio"?"Desafío Starlim":row.channel==="portal"?"Portal":"Tienda"}</StatusBadge></DataTableCell><DataTableCell><strong className="block">{row.client_name}</strong><small>{row.client_phone}</small></DataTableCell><DataTableCell>{row.itemCount} productos<small className="block max-w-72 truncate">{row.client_address}</small></DataTableCell><DataTableCell><StatusBadge tone={row.payment_status==="pagado"?"success":"neutral"}>{row.payment_status==="pagado"?"Pagado":"A confirmar"}</StatusBadge><small className="block">{row.payment_method}</small></DataTableCell><DataTableCell align="right" className="font-mono font-bold">{formatCurrency(row.totalAmount)}</DataTableCell><DataTableCell>{row.status==="solicitud"?<div className="flex gap-2"><form action={resolveOrderRequestAction}><input type="hidden" name="id" value={row.id}/><input type="hidden" name="intent" value="approve"/><Button size="sm" type="submit">Aprobar</Button></form><form action={resolveOrderRequestAction}><input type="hidden" name="id" value={row.id}/><input type="hidden" name="intent" value="reject"/><Button size="sm" type="submit" variant="outline">Rechazar</Button></form></div>:<StatusBadge tone={row.status==="aprobada"?"success":"danger"}>{row.status}</StatusBadge>}</DataTableCell></DataTableRow>)}
      </DataTableBody></DataTable></Card>
    </div>
  </ModulePage>;
}
