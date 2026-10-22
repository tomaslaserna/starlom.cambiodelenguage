import type { AuthSession } from "@/lib/auth";
import { listSalesToCollect } from "@/lib/collections";
import { getVendorClients, getVendorQuotes } from "@/lib/crm";
import { buildCrmMissions } from "@/lib/crm-missions";
import { queryWithCompanyContext } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { getLeadFollowupAgenda } from "@/lib/leads";
import type { NavigationAuthorization } from "@/lib/navigation";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import { getPriceListFollowupSignals } from "@/lib/price-list-followups";
import { getReplenishmentSuggestions } from "@/lib/replenishment";
import { canonicalSalesSourceSql } from "@/lib/sales-source-sql";
import { getSalesMissionStates } from "@/lib/sales-missions";
import { listTasks } from "@/lib/tasks";

export type OperationalNotificationPriority = "urgent" | "high" | "normal";

export type OperationalNotification = {
  id: string;
  title: string;
  detail: string;
  href: string;
  category: "missions" | "collections" | "deliveries" | "fiscal" | "purchases" | "tasks";
  priority: OperationalNotificationPriority;
  count: number;
};

export type OperationalNotificationSnapshot = {
  pendingCount: number;
  urgentCount: number;
  items: OperationalNotification[];
  generatedAt: string;
};

export function emptyOperationalNotificationSnapshot(): OperationalNotificationSnapshot {
  return { pendingCount: 0, urgentCount: 0, items: [], generatedAt: new Date().toISOString() };
}

function can(authorization: NavigationAuthorization, key: string) {
  return authorization.allowedPermissionKeys.has(key);
}

async function fallback<T>(promise: Promise<T>, value: T) {
  try {
    return await promise;
  } catch (error) {
    console.error("[Starlim notifications]", error);
    return value;
  }
}

async function missionNotification(session: AuthSession): Promise<OperationalNotification[]> {
  const [clients, leads, quotes, priceListSignals, missionStates] = await Promise.all([
    getVendorClients(session),
    getLeadFollowupAgenda(session),
    getVendorQuotes(session),
    getPriceListFollowupSignals(session),
    getSalesMissionStates(session),
  ]);
  const missions = buildCrmMissions({ clients, leads, quotes: quotes.buckets, priceListSignals, missionStates });
  if (!missions.length) return [];
  const urgent = missions.filter((mission) => mission.urgency === "ahora").length;
  const alreadyRecontacted = missions.filter((mission) => mission.completedBefore).length;
  return [{
    id: "sales-missions",
    title: urgent > 0 ? `${urgent} ${urgent === 1 ? "misión requiere" : "misiones requieren"} atención` : `Ya están tus ${missions.length} nuevas misiones`,
    detail: alreadyRecontacted > 0
      ? `${alreadyRecontacted} vuelven a aparecer porque llegó su fecha de recontacto.`
      : "Ordenadas por oportunidad, vencimiento y ritmo de compra.",
    href: "/sales-engine",
    category: "missions",
    priority: urgent > 0 ? "urgent" : "normal",
    count: missions.length,
  }];
}

async function collectionNotifications(companyId: number): Promise<OperationalNotification[]> {
  const overdue = (await listSalesToCollect(companyId)).filter((sale) => sale.overdue);
  const items = overdue.slice(0, 3).map<OperationalNotification>((sale) => ({
    id: `collection-${sale.id}`,
    title: `Cobrar a ${sale.customerName || "cliente sin identificar"}`,
    detail: `${formatCurrency(sale.outstandingAmount)} · venció hace ${sale.overdueDays} ${sale.overdueDays === 1 ? "día" : "días"}.`,
    href: "/payments/accounts",
    category: "collections",
    priority: sale.overdueDays >= 7 ? "urgent" : "high",
    count: 1,
  }));
  if (overdue.length > items.length) {
    items.push({
      id: "collections-more",
      title: `Hay ${overdue.length - items.length} cobranzas vencidas más`,
      detail: "Revisá la cola completa y priorizá las cuentas con mayor atraso.",
      href: "/payments/accounts",
      category: "collections",
      priority: "high",
      count: overdue.length - items.length,
    });
  }
  return items;
}

type OrderAlertRow = {
  id: string;
  sale_number: string;
  client_name: string;
  days_pending: number;
  order_status: string;
  desired_document: string;
  fiscal_status: string;
  has_pending_fiscal_request: boolean;
};

async function orderNotifications(companyId: number, includeOrders: boolean, includeFiscal: boolean) {
  if (!includeOrders && !includeFiscal) return [];
  const result = await queryWithCompanyContext<OrderAlertRow>(
    companyId,
    `
      SELECT s.id::text AS id,
             COALESCE(NULLIF(s.sale_number, ''), 'Pedido sin número') AS sale_number,
             COALESCE(NULLIF(s.client_name, ''), c.display_name, 'Cliente sin identificar') AS client_name,
             GREATEST(CURRENT_DATE - COALESCE(s.created_at::date, s.sale_date::date, CURRENT_DATE), 0)::int AS days_pending,
             ${normalizedOrderStatusSql("s")} AS order_status,
             COALESCE(s.desired_document, '') AS desired_document,
             COALESCE(s.fiscal_status, 'no_enviado') AS fiscal_status,
             EXISTS (
               SELECT 1
               FROM app_solicitudes sol
               WHERE sol.empresa_id = s.empresa_id
                 AND sol.estado = 'pendiente'
                 AND sol.metadata->>'action' = 'fiscal_invoice'
                 AND sol.metadata->>'saleId' = s.id::text
             ) AS has_pending_fiscal_request
      FROM sales s
      LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
      WHERE s.empresa_id = $1
        AND ${canonicalSalesSourceSql("s")}
        AND (
          (${includeOrders ? "TRUE" : "FALSE"} AND ${normalizedOrderStatusSql("s")} IN ('cargado', 'confirmado')
            AND COALESCE(s.created_at::date, s.sale_date::date, CURRENT_DATE) <= CURRENT_DATE - 3)
          OR
          (${includeFiscal ? "TRUE" : "FALSE"} AND ${normalizedOrderStatusSql("s")} = 'entregado'
            AND COALESCE(s.desired_document, '') IN ('factura_a', 'factura_b')
            AND COALESCE(s.fiscal_status, 'no_enviado') <> 'aprobado')
        )
      ORDER BY days_pending DESC, s.created_at ASC
      LIMIT 80
    `,
    [companyId],
  );

  const deliveries = result.rows.filter((row) => ["cargado", "confirmado"].includes(row.order_status));
  const missingFiscal = result.rows.filter((row) =>
    row.order_status === "entregado"
    && ["factura_a", "factura_b"].includes(row.desired_document)
    && !row.has_pending_fiscal_request,
  );
  const notifications: OperationalNotification[] = deliveries.slice(0, 3).map((row) => ({
    id: `delivery-${row.id}`,
    title: `${row.sale_number} lleva ${row.days_pending} días pendiente de entrega`,
    detail: `${row.client_name} · ${row.order_status === "confirmado" ? "confirmado y listo para entregar" : "todavía cargado"}.`,
    href: `/orders?q=${encodeURIComponent(row.sale_number)}`,
    category: "deliveries",
    priority: row.days_pending >= 5 ? "urgent" : "high",
    count: 1,
  }));
  if (deliveries.length > 3) {
    notifications.push({
      id: "deliveries-more",
      title: `${deliveries.length - 3} pedidos demorados más`,
      detail: "Llevan al menos 3 días sin registrarse como entregados.",
      href: "/orders?status=cargado",
      category: "deliveries",
      priority: "high",
      count: deliveries.length - 3,
    });
  }
  notifications.push(...missingFiscal.slice(0, 3).map((row) => ({
    id: `fiscal-${row.id}`,
    title: `Falta gestionar la factura de ${row.sale_number}`,
    detail: `${row.client_name} pidió factura y no hay una solicitud fiscal pendiente.`,
    href: `/billing?q=${encodeURIComponent(row.sale_number)}`,
    category: "fiscal" as const,
    priority: "urgent" as const,
    count: 1,
  })));
  if (missingFiscal.length > 3) {
    notifications.push({
      id: "fiscal-more",
      title: `${missingFiscal.length - 3} facturas sin gestionar más`,
      detail: "Son pedidos entregados que requieren comprobante fiscal.",
      href: "/billing",
      category: "fiscal",
      priority: "urgent",
      count: missingFiscal.length - 3,
    });
  }
  return notifications;
}

async function purchaseNotification(companyId: number): Promise<OperationalNotification[]> {
  const suggestions = await getReplenishmentSuggestions(companyId);
  const urgent = suggestions.items.filter((item) => item.priority === "critico" || item.priority === "alto");
  if (!urgent.length) return [];
  const critical = urgent.filter((item) => item.priority === "critico").length;
  return [{
    id: "urgent-purchases",
    title: `Hay ${urgent.length} ${urgent.length === 1 ? "compra urgente" : "compras urgentes"} a proveedores`,
    detail: critical > 0
      ? `${critical} ${critical === 1 ? "producto está" : "productos están"} sin cobertura de stock.`
      : "La cobertura estimada es de 7 días o menos.",
    href: "/purchases/replenishment",
    category: "purchases",
    priority: critical > 0 ? "urgent" : "high",
    count: urgent.length,
  }];
}

async function taskNotification(session: AuthSession): Promise<OperationalNotification[]> {
  const tasks = await listTasks(session);
  const pending = [...tasks.personal, ...tasks.received];
  if (!pending.length) return [];
  const overdue = pending.filter((task) => task.status === "vencido");
  const urgent = pending.filter((task) => task.priority === "urgente").length;
  return [{
    id: "pending-tasks",
    title: overdue.length > 0
      ? `Tenés ${overdue.length} ${overdue.length === 1 ? "recordatorio vencido" : "recordatorios vencidos"}`
      : `Tenés ${pending.length} ${pending.length === 1 ? "recordatorio pendiente" : "recordatorios pendientes"}`,
    detail: urgent > 0 ? `${urgent} ${urgent === 1 ? "está marcado" : "están marcados"} como urgente.` : "Abrí el calendario para completarlos.",
    href: "/calendar",
    category: "tasks",
    priority: overdue.length > 0 || urgent > 0 ? "urgent" : "normal",
    count: pending.length,
  }];
}

const PRIORITY_ORDER: Record<OperationalNotificationPriority, number> = { urgent: 0, high: 1, normal: 2 };

export async function getOperationalNotifications(
  session: AuthSession,
  authorization: NavigationAuthorization,
): Promise<OperationalNotificationSnapshot> {
  const canUseCrm = can(authorization, "crm.ver");
  const canReadCollections = can(authorization, "cobranzas.ver");
  const canReadOrders = can(authorization, "pedidos.ver");
  const canReadSales = can(authorization, "ventas.ver");
  const canReadPurchases = can(authorization, "compras.ver");
  const [missions, collections, orders, purchases, tasks] = await Promise.all([
    canUseCrm ? fallback(missionNotification(session), []) : Promise.resolve([]),
    canReadCollections ? fallback(collectionNotifications(session.companyId), []) : Promise.resolve([]),
    (canReadOrders || canReadSales)
      ? fallback(orderNotifications(session.companyId, canReadOrders, canReadSales), [])
      : Promise.resolve([]),
    canReadPurchases ? fallback(purchaseNotification(session.companyId), []) : Promise.resolve([]),
    fallback(taskNotification(session), []),
  ]);
  const actionable = [...missions, ...collections, ...orders, ...purchases, ...tasks]
    .sort((left, right) => PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority] || left.title.localeCompare(right.title));
  return {
    pendingCount: actionable.reduce((total, item) => total + item.count, 0),
    urgentCount: actionable.filter((item) => item.priority === "urgent").reduce((total, item) => total + item.count, 0),
    items: actionable.slice(0, 14),
    generatedAt: new Date().toISOString(),
  };
}
