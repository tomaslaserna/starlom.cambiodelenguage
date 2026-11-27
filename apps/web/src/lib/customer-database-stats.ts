import { queryWithCompanyContext } from "@/lib/db";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import { canonicalSalesSourceSql } from "@/lib/sales-source-sql";
import { localDateIso } from "@/lib/timezone";

type CustomerActivityRow = {
  client_id: string;
  last_purchase_date: string | null;
};

export type CustomerDatabaseStats = {
  total: number;
  active: number;
  habitual: number;
};

function subtractCalendarDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function summarizeCustomerActivity(rows: CustomerActivityRow[], asOfDate: string): CustomerDatabaseStats {
  const activeSince = subtractCalendarDays(asOfDate, 90);
  const habitualSince = subtractCalendarDays(asOfDate, 30);
  let active = 0;
  let habitual = 0;

  for (const row of rows) {
    if (!row.last_purchase_date) continue;
    const purchaseDate = row.last_purchase_date.slice(0, 10);
    if (purchaseDate >= activeSince && purchaseDate <= asOfDate) active += 1;
    if (purchaseDate >= habitualSince && purchaseDate <= asOfDate) habitual += 1;
  }

  return { total: rows.length, active, habitual };
}

export async function getCustomerDatabaseStats(
  companyId: number,
  customerIds: string[] | null,
  asOfDate = localDateIso(),
): Promise<CustomerDatabaseStats> {
  if (customerIds?.length === 0) return { total: 0, active: 0, habitual: 0 };

  const params: unknown[] = [companyId];
  const customerScope = customerIds == null
    ? ""
    : `AND c.id = ANY($${params.push(customerIds)}::uuid[])`;
  const result = await queryWithCompanyContext<CustomerActivityRow>(
    companyId,
    `
      SELECT c.id::text AS client_id, MAX(s.sale_date)::text AS last_purchase_date
      FROM clients c
      LEFT JOIN sales s
        ON s.empresa_id = c.empresa_id
       AND s.client_id = c.id
       AND ${canonicalSalesSourceSql("s")}
       AND ${normalizedOrderStatusSql("s")} = 'entregado'
      WHERE c.empresa_id = $1
        ${customerScope}
      GROUP BY c.id
    `,
    params,
  );

  return summarizeCustomerActivity(result.rows, asOfDate);
}
