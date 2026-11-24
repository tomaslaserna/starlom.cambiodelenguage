import "server-only";
import { z } from "zod";
import { tool, type ToolSet } from "ai";
import type { AuthSession } from "@/lib/auth";
import { isAdminRole, normalizeRole } from "@/lib/auth";
import { ApiError } from "@/lib/api-response";
import { hasAllCustomerAccess, sellerCandidates } from "@/lib/crm";
import { getDbPool } from "@/lib/db";
import { sessionAllows } from "@/lib/route-auth";
import { compileDotQuery } from "./dot-query.mjs";

export const queryInput = z.object({
  dataset: z.string().min(1).max(80),
  columns: z.array(z.string()).max(80).optional(),
  filters: z
    .array(
      z.object({
        column: z.string(),
        op: z.enum([
          "eq",
          "ne",
          "gt",
          "gte",
          "lt",
          "lte",
          "contains",
          "in",
          "isNull",
        ]),
        value: z
          .union([
            z.string(),
            z.number(),
            z.boolean(),
            z.array(z.union([z.string(), z.number(), z.boolean()])),
          ])
          .optional(),
      }),
    )
    .max(12)
    .optional(),
  orderBy: z.string().optional(),
  descending: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(100000).optional(),
  aggregate: z
    .object({
      function: z.enum(["sum", "avg", "min", "max"]),
      column: z.string(),
    })
    .optional(),
});
// Additional business records are available only to administration, using reviewed columns.
function adminDataset(href: string, fields: string, personalScope?: string) {
  return { href, resource: "admin", adminOnly: true, personalScope, fields: new Set(["empresa_id", ...fields.split(" ")]) };
}

const datasets: Record<
  string,
  {
    resource: string;
    href: string;
    customer?: string;
    restrictedSeller?: boolean;
    adminOnly?: boolean;
    personalScope?: string;
    fields?: ReadonlySet<string>;
  }
> = {
  bank_folders: adminDataset("/bank", "id name scope created_at", "((t.scope='shared' AND t.owner_username IS NULL) OR (t.scope='personal' AND t.owner_username=$2))"),
  bank_files: adminDataset("/bank", "id folder_id name scope mime size_bytes created_at", "((t.scope='shared' AND t.owner_username IS NULL) OR (t.scope='personal' AND t.owner_username=$2))"),
  board_notes: adminDataset("/", "id text color created_at updated_at", "t.owner_username=$2"),
  board_note_mentions: adminDataset("/", "id note_id mentioned_username", "EXISTS (SELECT 1 FROM public.board_notes n WHERE n.empresa_id=t.empresa_id AND n.id=t.note_id AND n.owner_username=$2)"),
  recordatorios: adminDataset("/", "id titulo descripcion prioridad fecha_creacion fecha_limite fecha_envio completado", "(t.usuario='' OR t.usuario=$2)"),
  tareas_asignadas: adminDataset("/", "id titulo descripcion prioridad fecha_creacion fecha_limite fecha_envio asignado_por asignado_a completado fecha_completado", "(t.asignado_por=$2 OR t.asignado_a=$2)"),
  admin_bank_reconciliation_matches: adminDataset("/administration", "id statement_line_id payment_id matched_amount status created_by created_at"),
  admin_echeqs: adminDataset("/administration", "id cheque_number received_from received_from_cuit issuer issuer_cuit due_date amount status payment_id deposited_to_account_id settled_on created_by created_at updated_at"),
  admin_finance_monthly_closures: adminDataset("/administration", "id month version status closed_by closed_by_username closed_at reopened_by reopened_at reopen_reason"),
  admin_operating_cost_month_status: adminDataset("/administration", "id cost_id month included created_by created_at updated_at"),
  admin_outgoing_echeqs: adminDataset("/administration", "id cheque_number beneficiary beneficiary_cuit account_id due_date amount status cleared_on created_by created_at updated_at"),
  admin_socios: adminDataset("/administration", "id nombre participacion activo created_at updated_at"),
  admin_treasury_accounts: adminDataset("/administration", "id name account_type currency active created_at updated_at"),
  admin_treasury_movements: adminDataset("/administration", "id account_id movement_date direction amount concept source_type source_id reference created_by created_at"),
  admin_treasury_reconciliations: adminDataset("/administration", "id account_id statement_date statement_balance created_by reconciled_at"),
  business_metrics_snapshots: adminDataset("/administration", "id period_start period_end sales_amount collections_rate stock_value quotes_rate cogs markup operating_costs created_at"),
  app_solicitudes: adminDataset("/admin/approvals", "id tipo titulo detalle monto solicitante estado resuelto_por resuelto_at created_at updated_at"),
  audit_log: adminDataset("/admin/audit", "id actor_id action entity_table entity_id created_at"),
  sales_admin_audit: adminDataset("/admin/audit", "id employee sale_id sale_label action created_at"),
  customer_payment_allocation_requests: adminDataset("/collections", "id payment_id sale_id requested_amount created_at"),
  customer_portal_payment_intents: adminDataset("/collections", "id portal_account_id client_id sale_ids amount status approved_at created_at updated_at"),
  customer_portal_accounts: adminDataset("/store", "id email display_name active notify_orders notify_invoices notify_offers created_at updated_at"),
  customer_portal_memberships: adminDataset("/store", "id portal_account_id client_id label is_default created_at"),
  storefront_checkout_sessions: adminDataset("/store", "id channel status contact_name contact_phone contact_email business_name business_type delivery_address item_count estimated_amount request_id started_at last_activity_at submitted_at"),
  storefront_events: adminDataset("/store", "id event_type channel request_id created_at"),
  storefront_payment_intents: adminDataset("/store", "id quote_id amount status approved_at created_at updated_at"),
  listas_precio: adminDataset("/prices", "id nombre activa orden created_at updated_at derivation_type parent_list_id percentage allowed_roles valid_from valid_to requires_authorization admits_offers floor_factor blocked_until"),
  margenes: adminDataset("/prices", "codigo nombre precio_0 precio_1 precio_2 precio_3 margen_minorista created_at updated_at"),
  margenes_listas: adminDataset("/prices", "codigo lista_id multiplicador created_at updated_at"),
  rubros: adminDataset("/prices", "codigo nombre created_at updated_at"),
  mrp_suggestions: adminDataset("/purchases/replenishment", "id product_id period_start period_end current_stock forecast_demand suggested_quantity source status created_at"),
  order_requests: adminDataset("/orders/requests", "id quote_id channel status payment_method payment_status payment_reference approved_order_id approved_by approved_at rejected_by rejected_at rejection_reason sla_due_at created_at updated_at"),
  order_status_history: adminDataset("/orders", "id order_id previous_status new_status changed_by changed_at"),
  operators: adminDataset("/employees", "id name email phone active source_sheet source_row created_at updated_at"),
  usuarios: adminDataset("/employees", "id usuario nombre_completo activo"),
  profiles: adminDataset("/employees", "id full_name active username title"),
  vendor_commissions: adminDataset("/employees/vendors", "id vendor commission_rate updated_by created_at updated_at"),
  vendor_goals: adminDataset("/employees/vendors", "id vendor period goal_sales goal_clients updated_by created_at updated_at"),
  sales_mission_completions: adminDataset("/crm", "id seller_id mission_key mission_kind entity_id customer_id next_followup_on completed_at created_at"),
  price_list_shares: adminDataset("/crm", "id seller_id price_list_id price_list_name recipient_type customer_id recipient_name recipient_phone purpose follow_up_on status shared_at resolved_at updated_at"),
  sale_documents: adminDataset("/sales", "id sale_id client_id document_type document_number document_date uploaded_by created_at updated_at"),
  empresas: adminDataset("/admin", "id nombre slug cuit plan activa afip_pto_vta created_at updated_at"),
  secuencias_empresa: adminDataset("/admin", "tipo valor created_at updated_at"),
  sheet_import_batches: adminDataset("/admin", "id sheet_name imported_by status started_at finished_at created_at"),
  sheet_import_rows: adminDataset("/admin", "id batch_id tab_name row_number mapped_table mapped_id created_at"),
  products: { resource: "productos", href: "/products" },
  price_lists: { resource: "productos", href: "/crm/listas" },
  price_list_items: { resource: "productos", href: "/crm/listas" },
  suppliers: { resource: "proveedores", href: "/suppliers" },
  purchases: { resource: "compras", href: "/purchases" },
  purchase_items: { resource: "compras", href: "/purchases" },
  stock_movements: { resource: "stock", href: "/stock" },
  stock_current: { resource: "stock", href: "/stock" },
  clients: { resource: "clientes", href: "/customers", customer: "t.id" },
  sales: { resource: "ventas", href: "/sales", customer: "t.client_id" },
  sale_items: {
    resource: "ventas",
    href: "/sales",
    customer:
      "(SELECT s.client_id FROM sales s WHERE s.id=t.sale_id AND s.empresa_id=t.empresa_id)",
  },
  delivery_documents: {
    resource: "pedidos",
    href: "/orders",
    customer:
      "(SELECT s.client_id FROM sales s WHERE s.id=t.sale_id AND s.empresa_id=t.empresa_id)",
  },
  delivery_document_items: {
    resource: "pedidos",
    href: "/orders",
    restrictedSeller: true,
  },
  orders: { resource: "pedidos", href: "/orders", restrictedSeller: true },
  current_account_movements: {
    resource: "cobranzas",
    href: "/payments/accounts",
    customer: "t.client_id",
  },
  payments: {
    resource: "cobranzas",
    href: "/collections",
    customer: "t.client_id",
  },
  quotes: {
    resource: "presupuestos",
    href: "/quotes",
    customer: "t.client_id",
  },
  quote_items: {
    resource: "presupuestos",
    href: "/quotes",
    restrictedSeller: true,
  },
  crm_leads: { resource: "crm", href: "/crm", restrictedSeller: true },
  crm_sales_activities: {
    resource: "crm",
    href: "/crm",
    restrictedSeller: true,
  },
  delivery_runs: {
    resource: "pedidos",
    href: "/orders",
    restrictedSeller: true,
  },
  delivery_run_sales: {
    resource: "pedidos",
    href: "/orders",
    restrictedSeller: true,
  },
  sales_internal_documents: {
    resource: "ventas",
    href: "/sales",
    customer:
      "(SELECT s.client_id FROM sales s WHERE s.id=t.sale_id AND s.empresa_id=t.empresa_id)",
  },
  offers: { resource: "productos", href: "/prices" },
  price_offers: { resource: "productos", href: "/prices" },
  price_offer_items: { resource: "productos", href: "/prices" },
  costos_operativos: { resource: "admin.balance", href: "/administration" },
  admin_bank_accounts: { resource: "admin.tesoreria", href: "/administration" },
  admin_bank_statement_lines: {
    resource: "admin.tesoreria",
    href: "/administration",
  },
  admin_dividendos: { resource: "admin.dividendos", href: "/admin" },
  admin_sueldos_config: { resource: "admin.sueldos", href: "/admin" },
  admin_sueldo_movimientos: { resource: "admin.sueldos", href: "/admin" },
  admin_obligaciones_fiscales: { resource: "admin.balance", href: "/admin" },
};
const safeTypes = new Set([
  "text",
  "character varying",
  "uuid",
  "numeric",
  "integer",
  "bigint",
  "smallint",
  "boolean",
  "date",
  "timestamp with time zone",
  "timestamp without time zone",
  "double precision",
  "real",
  "USER-DEFINED",
]);
export async function describeDotData(session: AuthSession, onlyDataset?: string) {
  const permitted = await Promise.all(
    Object.entries(datasets)
    .filter(([name, dataset]) => (!onlyDataset || name === onlyDataset) &&
      (!(dataset.adminOnly || dataset.resource.startsWith("admin.")) || isAdminRole(session.role)))
    .map(async ([name, dataset]) =>
      (await sessionAllows(session, [
        { resource: dataset.resource, action: "ver" },
      ]))
        ? ([name, dataset] as const)
        : null,
    ),
  );
  const seller =
    normalizeRole(session.role) === "vendedor" &&
    !(await hasAllCustomerAccess(session));
  const names = permitted
    .filter((item) => item && !(seller && item[1].restrictedSeller))
    .map((item) => item![0]);
  const result = await getDbPool().query<{
    table_name: string;
    column_name: string;
    data_type: string;
  }>(
    "SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[]) ORDER BY table_name,ordinal_position",
    [names],
  );
  return names
    .map((name) => ({
      name,
      source: datasets[name].href,
      columns: result.rows
        .filter(
          (row) =>
            row.table_name === name &&
            safeTypes.has(row.data_type) &&
            (!datasets[name].fields || datasets[name].fields.has(row.column_name)) &&
            !/(password|secret|token|credential|hash|key)/i.test(
              row.column_name,
            ),
        )
        .map((row) => ({ name: row.column_name, type: row.data_type })),
    }))
    .filter((table) =>
      table.columns.some((field) => field.name === (["empresas", "profiles"].includes(table.name) ? "id" : "empresa_id")),
    );
}
export async function readDotData(
  session: AuthSession,
  input: Record<string, unknown>,
) {
  const tableName = String(input.dataset ?? "");
  const schema = (await describeDotData(session, tableName)).find(
    (table) => table.name === tableName,
  );
  if (!schema)
    throw new ApiError(
      403,
      "Este conjunto de datos no está disponible para el usuario",
    );
  const dataset = datasets[tableName];
  let scope = dataset.personalScope ?? "";
  const scopeParams: unknown[] = scope ? [session.username] : [];
  if (
    normalizeRole(session.role) === "vendedor" &&
    !(await hasAllCustomerAccess(session)) &&
    dataset.customer
  ) {
    scopeParams.push(sellerCandidates(session));
    scope = `EXISTS (SELECT 1 FROM clients c WHERE c.id=${dataset.customer} AND c.empresa_id=t.empresa_id AND (UPPER(BTRIM(COALESCE(c.assigned_seller,'')))=ANY($2::text[]) OR UPPER(BTRIM(COALESCE(c.seller_name,'')))=ANY($2::text[])))`;
  }
  const aggregate = input.aggregate as
    | { function?: string; column?: string }
    | undefined;
  if (
    aggregate &&
    ["sum", "avg"].includes(aggregate.function ?? "") &&
    !schema.columns.some(
      (field) =>
        field.name === aggregate.column &&
        [
          "numeric",
          "integer",
          "bigint",
          "smallint",
          "double precision",
          "real",
        ].includes(field.type),
    )
  )
    throw new ApiError(400, "Esta columna no admite esa agregación");
  let query;
  try {
    query = compileDotQuery(
      tableName,
      schema.columns.map((field) => field.name),
      input,
      session.companyId,
      scope,
      scopeParams,
      schema.columns.filter((field) => field.type === "date").map((field) => field.name),
    );
  } catch (error) {
    throw new ApiError(
      400,
      error instanceof Error ? error.message : "Consulta inválida",
    );
  }
  const client = await getDbPool().connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(
      "SELECT set_config('app.current_empresa_id',$1,true),set_config('statement_timeout','8000',true)",
      [String(session.companyId)],
    );
    const count = await client.query(query.countSql, query.params);
    const rows = await client.query(query.sql, query.params);
    await client.query("COMMIT");
    return {
      dataset: tableName,
      rows: rows.rows,
      totalMatching: Number(count.rows[0]?.count ?? 0),
      aggregate: count.rows[0]?.value ?? null,
      offset: query.offset,
      nextOffset:
        query.offset + rows.rows.length < Number(count.rows[0]?.count)
          ? query.offset + rows.rows.length
          : null,
      source: dataset.href,
      interpretation:
        "Son registros de origen. Para deuda real usar getCustomerAccountBalance y getCustomerDebtDetail; para totales de ventas usar getSalesMetrics. No sumar remitos y facturas de una misma venta ni confundir una página con el total.",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** The ERP chat uses the same schema and row checks as the authenticated connector. */
export function createAdminDataTools(session: AuthSession): ToolSet {
  if (!isAdminRole(session.role)) return {};
  return {
    describeErpData: tool({
      description: "Lista los conjuntos de datos de la empresa. Indicá dataset para ver columnas antes de consultar un módulo.",
      inputSchema: z.object({ dataset: z.string().min(1).max(80).optional() }),
      execute: async ({ dataset }) => {
        const tables = await describeDotData(session, dataset);
        return dataset ? tables : tables.map(({ name, source }) => ({ name, source }));
      },
    }),
    readErpData: tool({
      description: "Lee datos reales de la empresa. Elegí solo las columnas necesarias, usá filtros o agregaciones y totalMatching para contar. Para saldos y ventas priorizá las herramientas especializadas.",
      inputSchema: queryInput,
      execute: async (input) => readDotData(session, input),
    }),
  };
}
