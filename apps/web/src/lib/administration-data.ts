import { queryWithCompanyContext } from "@/lib/db";

export type AdministrationDataSource = {
  key: string;
  label: string;
  purpose: string;
  mode: "automatic" | "administrative";
  required: boolean;
  count: number;
  firstDate: string | null;
  lastDate: string | null;
};

type DataCouplingRow = {
  source_key: string;
  total: string;
  first_date: string | null;
  last_date: string | null;
};

const sourceDefinitions = [
  { key: "sales", label: "Ventas y remitos", purpose: "Ventas, margen y cuentas por cobrar", mode: "automatic", required: true },
  { key: "payments", label: "Cobros y pagos", purpose: "Caja operativa y trazabilidad de fondos", mode: "automatic", required: true },
  { key: "current_accounts", label: "Cuentas corrientes", purpose: "Saldos históricos por cliente", mode: "automatic", required: true },
  { key: "purchases", label: "Compras", purpose: "Costos, proveedores y obligaciones", mode: "automatic", required: false },
  { key: "products", label: "Productos y stock", purpose: "Inventario y activo valorizado", mode: "automatic", required: true },
  { key: "clients", label: "Clientes", purpose: "Identidad comercial y cartera", mode: "automatic", required: true },
  { key: "operating_costs", label: "Costos administrativos", purpose: "Resultado operativo y proyecciones", mode: "administrative", required: false },
  { key: "bank_statements", label: "Extractos bancarios", purpose: "Conciliación y certificación de caja", mode: "administrative", required: false },
] as const;

export async function getAdministrationDataCoupling(companyId: number) {
  const result = await queryWithCompanyContext<DataCouplingRow>(
    companyId,
    `
      SELECT 'sales' AS source_key, COUNT(*)::text AS total,
             MIN(sale_date)::text AS first_date, MAX(sale_date)::text AS last_date
      FROM sales WHERE empresa_id = $1
      UNION ALL
      SELECT 'payments', COUNT(*)::text, MIN(payment_date)::text, MAX(payment_date)::text
      FROM payments WHERE empresa_id = $1
      UNION ALL
      SELECT 'current_accounts', COUNT(*)::text, MIN(movement_date)::text, MAX(movement_date)::text
      FROM current_account_movements WHERE empresa_id = $1
      UNION ALL
      SELECT 'purchases', COUNT(*)::text, MIN(purchase_date)::text, MAX(purchase_date)::text
      FROM purchases WHERE empresa_id = $1
      UNION ALL
      SELECT 'products', COUNT(*)::text, NULL::text, NULL::text
      FROM products WHERE empresa_id = $1 AND active = TRUE
      UNION ALL
      SELECT 'clients', COUNT(*)::text, NULL::text, NULL::text
      FROM clients WHERE empresa_id = $1
      UNION ALL
      SELECT 'operating_costs', COUNT(*)::text, MIN(fecha)::text, MAX(fecha)::text
      FROM costos_operativos WHERE empresa_id = $1
      UNION ALL
      SELECT 'bank_statements', COUNT(*)::text, MIN(fecha)::text, MAX(fecha)::text
      FROM admin_bank_statement_lines WHERE empresa_id = $1
    `,
    [companyId],
  );

  const counts = new Map(result.rows.map((row) => [row.source_key, row]));
  const sources: AdministrationDataSource[] = sourceDefinitions.map((definition) => {
    const row = counts.get(definition.key);
    return {
      ...definition,
      count: Number(row?.total ?? 0),
      firstDate: row?.first_date ?? null,
      lastDate: row?.last_date ?? null,
    };
  });

  return {
    sources,
    totalRecords: sources.reduce((sum, source) => sum + source.count, 0),
    missingRequiredSources: sources.filter((source) => source.required && source.count === 0).length,
  };
}
