import { ApiError } from "@/lib/api-response";
import { activeAccountMovementWhereSql } from "@/lib/accounts";
import { queryWithCompanyContext } from "@/lib/db";

export type AgingDebit = { amount: number; date: string; dueDate: string | null };
export type AgingBuckets = { current: number; d30: number; d60: number; d90: number; overdueTotal: number };
export type StatementMovement = { id: string; date: string; description: string; debit: number; credit: number; kind: string };
export type StatementLine = StatementMovement & { balance: number };
export type CustomerStatement = { openingBalance: number; lines: StatementLine[]; finalBalance: number };
export type OpenCustomerAccount = { clientId: string; name: string; sellerName: string; taxId: string; lastMovementDate: string | null; balance: number; aging: AgingBuckets };

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function daysBetween(fromIso: string, toIso: string) {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

export function computeAgingBuckets(debits: AgingDebit[], creditTotal: number, asOf: string): AgingBuckets {
  const buckets: AgingBuckets = { current: 0, d30: 0, d60: 0, d90: 0, overdueTotal: 0 };
  let remainingCredit = Math.max(0, money(creditTotal));
  const ordered = [...debits].sort((a, b) => a.date.localeCompare(b.date));

  for (const debit of ordered) {
    let outstanding = money(debit.amount);
    if (remainingCredit > 0) {
      const applied = Math.min(outstanding, remainingCredit);
      outstanding = money(outstanding - applied);
      remainingCredit = money(remainingCredit - applied);
    }
    if (outstanding <= 0.005) continue;

    const overdueDays = daysBetween(debit.dueDate ?? debit.date, asOf);
    if (overdueDays <= 0) {
      buckets.current = money(buckets.current + outstanding);
    } else {
      if (overdueDays <= 30) buckets.d30 = money(buckets.d30 + outstanding);
      else if (overdueDays <= 60) buckets.d60 = money(buckets.d60 + outstanding);
      else buckets.d90 = money(buckets.d90 + outstanding);
      buckets.overdueTotal = money(buckets.overdueTotal + outstanding);
    }
  }
  return buckets;
}

export function buildCustomerStatement(
  movements: StatementMovement[],
  options: { from?: string | null; to?: string | null },
): CustomerStatement {
  const from = options.from?.trim() || null;
  const to = options.to?.trim() || null;

  let openingBalance = 0;
  const lines: StatementLine[] = [];

  for (const movement of movements) {
    const delta = money(movement.debit - movement.credit);
    if (from && movement.date < from) {
      openingBalance = money(openingBalance + delta);
      continue;
    }
    if (to && movement.date > to) continue;
    const previous = lines.length ? lines[lines.length - 1].balance : openingBalance;
    lines.push({ ...movement, balance: money(previous + delta) });
  }

  const finalBalance = lines.length ? lines[lines.length - 1].balance : openingBalance;
  return { openingBalance, lines, finalBalance };
}

const DUE_DATE_SQL = `CASE
  WHEN m.sale_id IS NOT NULL THEN (s.sale_date::date + COALESCE(s.source_payment_term_days, c.payment_term_days, 0))
  ELSE m.movement_date::date END`;

export async function listOpenCustomerAccounts(
  companyId: number,
  options: { query?: string | null; sellerNames?: string[] | null } = {},
): Promise<{ accounts: OpenCustomerAccount[]; totals: { debit: number; credit: number } }> {
  const params: unknown[] = [companyId];
  const filters = [
    "m.empresa_id = $1",
    "m.entity_type = 'cliente'",
    "m.client_id IS NOT NULL",
    activeAccountMovementWhereSql("m", "s"),
  ];

  const query = options.query?.trim() ?? "";
  if (query) {
    params.push(`%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
    filters.push(`(COALESCE(c.display_name, m.entity_name, '') ILIKE $${params.length} ESCAPE '\\'
      OR COALESCE(c.tax_id, '') ILIKE $${params.length} ESCAPE '\\')`);
  }
  const sellerNames = (options.sellerNames ?? []).filter(Boolean);
  if (sellerNames.length) {
    params.push(sellerNames);
    filters.push(`(UPPER(BTRIM(COALESCE(c.seller_name,''))) = ANY($${params.length}::text[])
      OR UPPER(BTRIM(COALESCE(c.assigned_seller,''))) = ANY($${params.length}::text[]))`);
  }

  const rows = await queryWithCompanyContext<{
    client_id: string; name: string; seller_name: string; tax_id: string;
    last_movement: string | null; total_debit: string; total_credit: string;
    debits: { amount: string; date: string; due: string | null }[] | null;
  }>(
    companyId,
    `
      WITH client_balances AS (
        SELECT m.client_id,
               COALESCE(c.display_name, MAX(m.entity_name), '') AS name,
               COALESCE(c.seller_name, '') AS seller_name,
               COALESCE(c.tax_id, '') AS tax_id,
               MAX(m.movement_date)::text AS last_movement,
               COALESCE(SUM(m.debit), 0) AS total_debit,
               COALESCE(SUM(m.credit), 0) AS total_credit,
               COALESCE(JSON_AGG(JSON_BUILD_OBJECT('amount', m.debit, 'date', m.movement_date::text, 'due', ${DUE_DATE_SQL}))
                 FILTER (WHERE m.debit > 0), '[]'::json) AS debits
        FROM current_account_movements m
        LEFT JOIN sales s ON s.id = m.sale_id AND s.empresa_id = m.empresa_id
        LEFT JOIN clients c ON c.id = m.client_id AND c.empresa_id = m.empresa_id
        WHERE ${filters.join(" AND ")}
        GROUP BY m.client_id, c.display_name, c.seller_name, c.tax_id
      )
      SELECT client_id::text AS client_id,
             name,
             seller_name,
             tax_id,
             last_movement,
             total_debit::text,
             total_credit::text,
             debits
      FROM client_balances
      WHERE ABS(total_debit - total_credit) > 0.005
      ORDER BY (total_debit - total_credit) DESC
    `,
    params,
  );

  const today = new Date().toISOString().slice(0, 10);
  let totalDebit = 0;
  let totalCredit = 0;
  const accounts = rows.rows.map((row) => {
    const debits = (row.debits ?? []).map((d) => ({ amount: Number(d.amount), date: d.date, dueDate: d.due }));
    totalDebit = money(totalDebit + Number(row.total_debit));
    totalCredit = money(totalCredit + Number(row.total_credit));
    return {
      clientId: row.client_id,
      name: row.name,
      sellerName: row.seller_name,
      taxId: row.tax_id,
      lastMovementDate: row.last_movement,
      balance: money(Number(row.total_debit) - Number(row.total_credit)),
      aging: computeAgingBuckets(debits, Number(row.total_credit), today),
    };
  });

  return { accounts, totals: { debit: totalDebit, credit: totalCredit } };
}
