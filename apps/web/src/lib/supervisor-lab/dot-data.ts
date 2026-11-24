import "server-only";
import type { AuthSession } from "@/lib/auth";
import { normalizeRole } from "@/lib/auth";
import { ApiError } from "@/lib/api-response";
import { hasAllCustomerAccess, sellerCandidates } from "@/lib/crm";
import { getDbPool } from "@/lib/db";
import { sessionAllows } from "@/lib/route-auth";
import { compileDotQuery } from "./dot-query.mjs";

// Explicit business datasets: credentials, profiles, authorization tables and OAuth state are never discoverable.
const datasets: Record<
  string,
  {
    resource: string;
    href: string;
    customer?: string;
    restrictedSeller?: boolean;
  }
> = {
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
  costos_operativos: { resource: "admin.balance", href: "/admin/balance" },
  admin_bank_accounts: { resource: "admin.tesoreria", href: "/admin/treasury" },
  admin_bank_statement_lines: {
    resource: "admin.tesoreria",
    href: "/admin/treasury",
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
export async function describeDotData(session: AuthSession) {
  const permitted = await Promise.all(
    Object.entries(datasets).map(async ([name, dataset]) =>
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
            !/(password|secret|token|credential|hash|key)/i.test(
              row.column_name,
            ),
        )
        .map((row) => ({ name: row.column_name, type: row.data_type })),
    }))
    .filter((table) =>
      table.columns.some((field) => field.name === "empresa_id"),
    );
}
export async function readDotData(
  session: AuthSession,
  input: Record<string, unknown>,
) {
  const tableName = String(input.dataset ?? "");
  const schema = (await describeDotData(session)).find(
    (table) => table.name === tableName,
  );
  if (!schema)
    throw new ApiError(
      403,
      "Este conjunto de datos no está disponible para el usuario",
    );
  const dataset = datasets[tableName];
  let scope = "";
  const scopeParams: unknown[] = [];
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
