import "server-only";

import type { AuthSession } from "@/lib/auth";
import { normalizeRole } from "@/lib/auth";
import { activeAccountMovementWhereSql } from "@/lib/accounts";
import { getVendorClients, hasAllCustomerAccess, sellerCandidates } from "@/lib/crm";
import { queryWithCompanyContext } from "@/lib/db";
import { getSupervisorOperationalSnapshot } from "@/lib/supervisor-lab/read-model";

export type SupervisorLandingCard = {
  label: string;
  value: number;
  detail: string;
  href: string;
  tone: "info" | "warning" | "success" | "neutral";
};

export type SupervisorLandingSummary = {
  mode: "sales" | "administrative";
  profileLabel: string;
  greeting: string;
  description: string;
  cards: SupervisorLandingCard[];
  quickPrompts: string[];
  details: Record<string, unknown>;
};

type CollectionPriority = {
  clientId: string;
  customerName: string;
  dueDate: string;
  amount: number;
  status: "overdue" | "today" | "this_week";
};

async function getCollectionPriorities(session: AuthSession): Promise<CollectionPriority[]> {
  const params: unknown[] = [session.companyId];
  let sellerFilter = "";
  if (normalizeRole(session.role) === "vendedor" && !(await hasAllCustomerAccess(session))) {
    params.push(sellerCandidates(session));
    sellerFilter = `AND (
      UPPER(BTRIM(COALESCE(c.seller_name, ''))) = ANY($2::text[])
      OR UPPER(BTRIM(COALESCE(c.assigned_seller, ''))) = ANY($2::text[])
    )`;
  }

  const result = await queryWithCompanyContext<{
    client_id: string;
    customer_name: string;
    due_date: string;
    remaining: string;
  }>(
    session.companyId,
    `
      WITH active_movements AS (
        SELECT m.*, c.display_name, c.seller_name, c.assigned_seller,
               CASE WHEN m.sale_id IS NOT NULL
                 THEN s.sale_date::date + COALESCE(s.source_payment_term_days, c.payment_term_days, 0)
                 ELSE m.movement_date::date
               END AS due_date
          FROM current_account_movements m
          LEFT JOIN sales s ON s.id = m.sale_id AND s.empresa_id = m.empresa_id
          LEFT JOIN clients c ON c.id = m.client_id AND c.empresa_id = m.empresa_id
         WHERE m.empresa_id = $1
           AND m.entity_type = 'cliente'
           AND m.client_id IS NOT NULL
           AND ${activeAccountMovementWhereSql("m", "s")}
           ${sellerFilter}
      ), credits AS (
        SELECT client_id, COALESCE(SUM(credit), 0) AS total_credit
          FROM active_movements
         GROUP BY client_id
      ), debits AS (
        SELECT m.client_id, COALESCE(m.display_name, m.entity_name, '') AS customer_name,
               m.due_date, m.debit,
               SUM(m.debit) OVER (
                 PARTITION BY m.client_id ORDER BY m.movement_date, m.id
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
               ) AS cumulative_debit,
               COALESCE(c.total_credit, 0) AS total_credit
          FROM active_movements m
          LEFT JOIN credits c ON c.client_id = m.client_id
         WHERE m.debit > 0
      )
      SELECT client_id::text, customer_name, due_date::text,
             GREATEST(0, LEAST(debit, cumulative_debit - total_credit))::text AS remaining
        FROM debits
       WHERE GREATEST(0, LEAST(debit, cumulative_debit - total_credit)) > 0.005
         AND due_date <= CURRENT_DATE + 6
       ORDER BY due_date ASC, customer_name ASC
    `,
    params,
    { cache: false },
  );

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  return result.rows.map((row) => ({
    clientId: row.client_id,
    customerName: row.customer_name,
    dueDate: row.due_date,
    amount: Number(row.remaining),
    status: row.due_date < today ? "overdue" : row.due_date === today ? "today" : "this_week",
  }));
}

export async function getSupervisorLandingSummary(session: AuthSession): Promise<SupervisorLandingSummary> {
  const firstName = (session.displayName || session.username || "equipo").trim().split(/\s+/)[0];
  if (normalizeRole(session.role) === "vendedor") {
    const [clients, collections] = await Promise.all([
      getVendorClients(session),
      getCollectionPriorities(session),
    ]);
    const approaching = clients.groups.contactar ?? [];
    const overdueCustomers = [...(clients.groups.riesgo ?? []), ...(clients.groups.perdido ?? [])];
    const todayCollections = collections.filter((item) => item.status === "today");
    const weekCollections = collections.filter((item) => item.status === "today" || item.status === "this_week");
    const unique = (items: CollectionPriority[]) => new Set(items.map((item) => item.clientId)).size;

    return {
      mode: "sales",
      profileLabel: (await hasAllCustomerAccess(session)) ? "Vendedor principal" : "Vendedor",
      greeting: `Hola, ${firstName}. Este es tu seguimiento comercial de hoy.`,
      description: "Recompra y cobranzas calculadas con el historial y las condiciones de pago del ERP.",
      cards: [
        { label: "Cerca de recomprar", value: approaching.length, detail: "Clientes dentro de su ventana habitual", href: "/crm/perfil", tone: "info" },
        { label: "Recompra atrasada", value: overdueCustomers.length, detail: "Clientes fuera de su ritmo habitual", href: "/crm/perfil", tone: overdueCustomers.length ? "warning" : "success" },
        { label: "Cobrar hoy", value: unique(todayCollections), detail: "Clientes con saldo que vence hoy", href: "/payments/accounts", tone: todayCollections.length ? "warning" : "success" },
        { label: "Cobrar esta semana", value: unique(weekCollections), detail: "Clientes con vencimiento en los próximos 7 días", href: "/payments/accounts", tone: "neutral" },
      ],
      quickPrompts: [
        "¿Qué clientes debería contactar hoy?",
        "¿Qué clientes debería cobrar esta semana?",
        "¿Qué clientes están atrasados respecto de su compra habitual?",
        "Quiero pasar en limpio un pedido informal de un cliente.",
      ],
      details: {
        approachingCustomers: approaching,
        overdueCustomers,
        collectionPriorities: collections,
      },
    };
  }

  const [snapshot, fiscal] = await Promise.all([
    getSupervisorOperationalSnapshot(session),
    queryWithCompanyContext<{ id: string; customer_name: string; number: string }>(
      session.companyId,
      `SELECT request.id::text,
              COALESCE(c.display_name, 'Cliente sin identificar') AS customer_name,
              COALESCE(NULLIF(s.sale_number, ''), 'P-' || COALESCE(s.commercial_number::text, '')) AS number
         FROM app_solicitudes request
         LEFT JOIN sales s
           ON s.id::text = request.metadata->>'saleId'
          AND s.empresa_id = request.empresa_id
         LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
        WHERE request.empresa_id = $1
          AND request.estado = 'pendiente'
          AND request.metadata->>'action' = 'fiscal_invoice'
        ORDER BY request.created_at ASC`,
      [session.companyId],
      { cache: false },
    ),
  ]);
  const pendingApproval = snapshot.orders.filter((order) => order.status === "pending_approval");
  const pendingDelivery = snapshot.orders.filter((order) => order.status === "authorized");
  const currentMonth = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  });
  const currentMonthFiscalDecisions = snapshot.sales.filter((sale) => sale.saleDate.startsWith(currentMonth));

  return {
    mode: "administrative",
    profileLabel: normalizeRole(session.role) === "operador" ? "Administrativo auxiliar" : "Administrador general",
    greeting: `Hola, ${firstName}. Estas son tus prioridades administrativas.`,
    description: "Pendientes operativos y fiscales obtenidos del estado actual del ERP.",
    cards: [
      { label: "Facturas solicitadas", value: fiscal.rows.length, detail: "Solicitudes pendientes de aprobación fiscal", href: "/billing", tone: fiscal.rows.length ? "warning" : "success" },
      { label: "Pedidos por autorizar", value: pendingApproval.length, detail: "Pedidos todavía cargados", href: "/orders", tone: pendingApproval.length ? "warning" : "success" },
      { label: "Entregas por confirmar", value: pendingDelivery.length, detail: "Pedidos autorizados aún no entregados", href: "/orders", tone: pendingDelivery.length ? "info" : "success" },
      { label: "Decisión fiscal del mes", value: currentMonthFiscalDecisions.length, detail: "Ventas del mes entregadas sin decisión fiscal", href: "/billing", tone: "neutral" },
    ],
    quickPrompts: [
      "¿Qué facturas solicitadas están pendientes de realizar?",
      "¿Qué pedidos están pendientes de autorizar?",
      "¿Qué pedidos debería revisar para marcar como entregados?",
      "¿Qué ventas todavía necesitan una decisión fiscal?",
    ],
    details: {
      pendingFiscalRequests: fiscal.rows,
      pendingApprovalOrders: pendingApproval,
      pendingDeliveryOrders: pendingDelivery,
      pendingFiscalDecisions: currentMonthFiscalDecisions,
    },
  };
}
