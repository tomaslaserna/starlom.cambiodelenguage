import { ModulePage } from "@/components/module-page";
import { ButtonLink, Card, CardContent, CardHeader, CardTitle, StatusBadge } from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { ORDERS_READ_PERMISSION } from "@/lib/route-auth";
import { storefrontDashboard } from "@/lib/order-requests";
import { formatCurrency } from "@/lib/format";

function Metric({label,value,detail}:{label:string;value:string|number;detail:string}){return <Card><CardContent className="p-5"><p className="text-xs font-black uppercase tracking-wider text-[color:var(--muted)]">{label}</p><strong className="mt-2 block text-3xl">{value}</strong><p className="mt-1 text-xs text-[color:var(--muted)]">{detail}</p></CardContent></Card>}

export default async function StoreDashboard(){
  const session=await requireStaffSession(); await requirePagePermission(session,[ORDERS_READ_PERMISSION]);
  const data=await storefrontDashboard(session.companyId,30);
  const conversion=data.unique_sessions?100*data.requests/data.unique_sessions:0;
  return <ModulePage active="store" description="Rendimiento comercial y circuito operativo de Tienda, Portal y Desafío Starlim." session={session} title="Tienda">
    <div className="grid gap-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-black">Últimos 30 días</h2><p className="text-sm text-[color:var(--muted)]">Una sola vista para detectar interés, abandono, solicitudes y ventas.</p></div><ButtonLink href="/orders/requests">Revisar solicitudes</ButtonLink></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Metric label="Visualizaciones" value={data.views} detail={`${data.unique_sessions} visitantes únicos`}/><Metric label="Solicitudes" value={data.requests} detail={`${conversion.toFixed(1)}% de conversión`}/><Metric label="Sin completar" value={data.incomplete} detail="Iniciaron el pedido y no lo enviaron"/><Metric label="Ventas aprobadas" value={formatCurrency(data.sales_amount)} detail={`${data.approved} solicitudes aprobadas`}/></div>
      <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>Estado operativo</CardTitle></CardHeader><CardContent className="grid gap-3"><div className="flex items-center justify-between rounded-xl bg-amber-50 p-4"><span>Solicitudes por revisar</span><StatusBadge tone={data.pending?"warning":"success"}>{data.pending}</StatusBadge></div><div className="flex items-center justify-between rounded-xl bg-orange-50 p-4"><span>Desafíos prioritarios</span><StatusBadge tone={data.challenge_pending?"warning":"success"}>{data.challenge_pending}</StatusBadge></div><div className="flex items-center justify-between rounded-xl bg-slate-50 p-4"><span>Checkouts iniciados</span><strong>{data.checkout_started}</strong></div></CardContent></Card><Card><CardHeader><CardTitle>Cómo leer el embudo</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm"><p><strong>Visualización</strong>: ingreso a Tienda.</p><p><strong>Sin completar</strong>: comenzó el checkout pero no generó solicitud.</p><p><strong>Solicitud</strong>: llegó a Operaciones y espera revisión.</p><p><strong>Venta</strong>: un operador aprobó y pasó a Pendientes de armado.</p></CardContent></Card></div>
    </div>
  </ModulePage>;
}
