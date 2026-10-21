import { ApiError } from "@/lib/api-response";
import { activeAccountMovementWhereSql, visibleAccountMovementWhereSql } from "@/lib/accounts";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { COLLECTION_METHODS, collectionMethodRequiresOperation } from "@/lib/collection-methods";
import { numberField, textField, type RequestBody } from "@/lib/request-body";
import { COLLECTIONS_APPROVE_PERMISSION, sessionAllows } from "@/lib/route-auth";
import { localDateIso } from "@/lib/timezone";
import type { AuthSession } from "@/lib/auth";
import type { PoolClient } from "pg";

export type AgingDebit = { amount: number; date: string; dueDate: string | null };
export type AgingBuckets = { current: number; d7: number; d15: number; d30: number; d30Plus: number; overdueTotal: number };
export type StatementMovement = {
  id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  kind: string;
  saleId?: string | null;
  saleNumber?: string | null;
  deliveryNumber?: number | null;
  hasPricedItems?: boolean;
  hasFiscalPdf?: boolean;
  internalDocumentId?: string | null;
  internalDocumentNumber?: number | null;
  fiscalDocumentId?: string | null;
  fiscalDocumentNumber?: number | null;
  paymentReceiptId?: string | null;
};
export type AccountMovementRow = StatementMovement & { paymentId?: string | null };
export type StatementLine = StatementMovement & { balance: number };
export type CustomerStatement = { openingBalance: number; lines: StatementLine[]; finalBalance: number };
export type OpenCustomerAccount = { clientId: string; name: string; sellerName: string; taxId: string; lastMovementDate: string | null; balance: number; aging: AgingBuckets };
export type CustomerStatementResult = {
  customer: { id: string; name: string; taxId: string; sellerName: string };
  statement: CustomerStatement;
  unappliedPayments: Array<{
    id: string;
    date: string;
    amount: number;
    appliedAmount: number;
    method: string;
    reference: string;
    notes: string;
  }>;
};

function money(value: number) {
  return Math.round(value * 100) / 100;
}

export function capOpenSalesToAccountBalance<T extends { outstanding: number | string }>(
  sales: T[],
  accountBalance: number,
): Array<Omit<T, "outstanding"> & { outstanding: number }> {
  let remainingBalance = Math.max(0, money(accountBalance));
  const result: Array<Omit<T, "outstanding"> & { outstanding: number }> = [];
  for (const sale of sales) {
    if (remainingBalance <= 0.005) break;
    const saleOutstanding = Math.max(0, money(Number(sale.outstanding)));
    const outstanding = money(Math.min(saleOutstanding, remainingBalance));
    if (outstanding <= 0.005) continue;
    result.push({ ...sale, outstanding });
    remainingBalance = money(remainingBalance - outstanding);
  }
  return result;
}

export function agingDebitsFromOpenSales(
  sales: Array<{ outstanding: number | string; date: string; dueDate: string | null }>,
  accountBalance: number,
): AgingDebit[] | null {
  const positiveBalance = Math.max(0, money(accountBalance));
  const direct = sales.map((sale) => ({ ...sale, outstanding: Math.max(0, money(Number(sale.outstanding))) })).filter((sale) => sale.outstanding > 0.005);
  const covered = money(direct.reduce((sum, sale) => sum + sale.outstanding, 0));
  if (Math.abs(covered - positiveBalance) > 0.005) return null;
  return direct.map((sale) => ({
    amount: sale.outstanding,
    date: sale.date,
    dueDate: sale.dueDate,
  }));
}

export function collapsePaymentAllocations(movements: AccountMovementRow[]): StatementMovement[] {
  const result: Array<StatementMovement & { allocationCount?: number }> = [];
  const groupedIndexes = new Map<string, number>();

  for (const movement of movements) {
    if (!movement.paymentId) {
      result.push(movement);
      continue;
    }

    const direction = movement.credit > 0 ? "credit" : "debit";
    const key = `${movement.paymentId}:${movement.date}:${direction}`;
    const existingIndex = groupedIndexes.get(key);
    if (existingIndex === undefined) {
      groupedIndexes.set(key, result.length);
      result.push({
        ...movement,
        id: `payment:${movement.paymentId}:${movement.date}:${direction}`,
        description: movement.description
          .replace(/\s*\|\s*Imputaci[oó]n hist[oó]rica FIFO\s*$/i, "")
          .replace(/\s*\|\s*$/, ""),
        allocationCount: 1,
      });
      continue;
    }

    const existing = result[existingIndex];
    existing.debit = money(existing.debit + movement.debit);
    existing.credit = money(existing.credit + movement.credit);
    existing.allocationCount = (existing.allocationCount ?? 1) + 1;
  }

  return result.map(({ allocationCount, ...movement }) => ({
    ...movement,
    description: allocationCount && allocationCount > 1
      ? `${movement.description} (distribuido en ${allocationCount} imputaciones)`
      : movement.description,
  }));
}

function daysBetween(fromIso: string, toIso: string) {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

export function computeAgingBuckets(debits: AgingDebit[], creditTotal: number, asOf: string): AgingBuckets {
  const buckets: AgingBuckets = { current: 0, d7: 0, d15: 0, d30: 0, d30Plus: 0, overdueTotal: 0 };
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
      if (overdueDays <= 7) buckets.d7 = money(buckets.d7 + outstanding);
      else if (overdueDays <= 15) buckets.d15 = money(buckets.d15 + outstanding);
      else if (overdueDays <= 30) buckets.d30 = money(buckets.d30 + outstanding);
      else buckets.d30Plus = money(buckets.d30Plus + outstanding);
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
  WHEN m.sale_id IS NOT NULL THEN (s.sale_date::date + COALESCE(
    s.source_payment_term_days,
    CASE
      WHEN COALESCE(s.payment_condition, '') ~ '[0-9]'
        THEN (regexp_match(s.payment_condition, '([0-9]+)'))[1]::int
      WHEN LOWER(BTRIM(COALESCE(s.payment_condition, ''))) IN ('pendiente', 'contado', 'pago al recibir') THEN 0
      ELSE c.payment_term_days
    END,
    0
  ))
  ELSE m.movement_date::date END`;

const OPEN_SALES_FOR_AGING_SQL = `
  SELECT s.client_id::text AS client_id,
         s.sale_date::text AS date,
         (s.sale_date::date + COALESCE(s.source_payment_term_days, 0))::text AS due_date,
         GREATEST(
           COALESCE(movements.total_debit, 0)
           - COALESCE(movements.total_credit, 0),
           0
         )::text AS outstanding
  FROM sales s
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(cam.credit), 0) AS total_credit,
           COALESCE(SUM(cam.debit), 0) AS total_debit
    FROM current_account_movements cam
    WHERE cam.empresa_id = s.empresa_id AND cam.sale_id = s.id
  ) movements ON true
  WHERE s.empresa_id = $1
    AND s.client_id = ANY($2::uuid[])
    AND COALESCE(s.order_status, s.status, 'cargado') IN ('entregado')
    AND (
      s.source_sheet IS NULL OR s.source_sheet = ''
      OR s.source_sheet = '12lzgmYiRh-sIAFv-EnhPVnbAfZMuNZYi8uwTj-ooJIE:ENTREGAS MACRO'
      OR (s.sale_date < DATE '2026-07-01' AND s.source_sheet = '1Ocl4Y9gcTS5LqNIePCebV3mtgYk7v6pa5Vy8uHDc75M:VENTAS ANUAL')
    )
    AND GREATEST(
      COALESCE(movements.total_debit, 0)
      - COALESCE(movements.total_credit, 0),
      0
    ) > 0.005
  ORDER BY s.client_id, s.sale_date ASC, s.created_at ASC, s.id ASC
`;

export async function listOpenCustomerAccounts(
  companyId: number,
  options: { query?: string | null; sellerNames?: string[] | null; includeSettled?: boolean } = {},
): Promise<{ accounts: OpenCustomerAccount[]; totals: { debit: number; credit: number } }> {
  const params: unknown[] = [companyId];
  const filters = [
    "m.empresa_id = $1",
    "m.entity_type = 'cliente'",
    "m.client_id IS NOT NULL",
    activeAccountMovementWhereSql("m", "s"),
  ];

  const query = options.query?.trim() ?? "";
  const includeSettled = Boolean(query && options.includeSettled);
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
      ${includeSettled ? "" : "WHERE ABS(total_debit - total_credit) > 0.005"}
      ORDER BY (total_debit - total_credit) DESC, name ASC, client_id ASC
    `,
    params,
  );

  const today = localDateIso();
  const openSalesByClient = new Map<string, Array<{ outstanding: string; date: string; dueDate: string | null }>>();
  if (rows.rows.length) {
    const openSales = await queryWithCompanyContext<{
      client_id: string; outstanding: string; date: string; due_date: string | null;
    }>(
      companyId,
      OPEN_SALES_FOR_AGING_SQL,
      [companyId, rows.rows.map((row) => row.client_id)],
    );
    for (const sale of openSales.rows) {
      const current = openSalesByClient.get(sale.client_id) ?? [];
      current.push({
        outstanding: sale.outstanding,
        date: sale.date,
        dueDate: sale.due_date,
      });
      openSalesByClient.set(sale.client_id, current);
    }
  }
  let totalDebit = 0;
  let totalCredit = 0;
  const accounts = rows.rows.map((row) => {
    const debits = (row.debits ?? []).map((d) => ({ amount: Number(d.amount), date: d.date, dueDate: d.due }));
    const balance = money(Number(row.total_debit) - Number(row.total_credit));
    const saleDebits = agingDebitsFromOpenSales(openSalesByClient.get(row.client_id) ?? [], balance);
    totalDebit = money(totalDebit + Number(row.total_debit));
    totalCredit = money(totalCredit + Number(row.total_credit));
    return {
      clientId: row.client_id,
      name: row.name,
      sellerName: row.seller_name,
      taxId: row.tax_id,
      lastMovementDate: row.last_movement,
      balance,
      aging: saleDebits
        ? computeAgingBuckets(saleDebits, 0, today)
        : computeAgingBuckets(debits, Number(row.total_credit), today),
    };
  });

  return { accounts, totals: { debit: totalDebit, credit: totalCredit } };
}

function movementKind(description: string, debit: number): string {
  const lower = description.toLowerCase();
  if (lower.startsWith("nota de debito")) return "nota_debito";
  if (lower.includes("nota de credito") || lower.includes("devolucion")) return "nota_credito";
  if (debit > 0) return "remito";
  return "pago";
}

export async function getCustomerStatement(
  companyId: number,
  clientId: string,
  options: { from?: string | null; to?: string | null } = {},
): Promise<CustomerStatementResult> {
  const info = await queryWithCompanyContext<{ name: string; tax_id: string; seller_name: string }>(
    companyId,
    `SELECT COALESCE(display_name, '') AS name, COALESCE(tax_id, '') AS tax_id, COALESCE(seller_name, '') AS seller_name
     FROM clients WHERE id = $1::uuid AND empresa_id = $2 LIMIT 1`,
    [clientId, companyId],
  );
  if (!info.rows[0]) throw new ApiError(404, "Cliente no encontrado");

  const rows = await queryWithCompanyContext<{
    id: string; movement_date: string; description: string; debit: string; credit: string; payment_id: string | null;
    sale_id: string | null; sale_number: string | null; delivery_number: number | null; has_priced_items: boolean;
    has_fiscal_pdf: boolean;
    payment_receipt_id: string | null;
    internal_document_id: string | null; internal_document_number: number | null;
    fiscal_document_id: string | null; fiscal_document_number: number | null;
  }>(
    companyId,
    `
      SELECT m.id::text AS id, m.movement_date::text AS movement_date,
             COALESCE(m.description, '') AS description, m.debit::text, m.credit::text,
             m.payment_id::text AS payment_id, m.sale_id::text AS sale_id,
             s.sale_number,
             CASE WHEN receipt_payment.receipt_url LIKE 'starlim-storage://%' THEN receipt_payment.id::text END AS payment_receipt_id,
             (
               SELECT dd.delivery_number
               FROM delivery_documents dd
               WHERE dd.empresa_id = m.empresa_id AND dd.sale_id = m.sale_id
               ORDER BY dd.created_at DESC, dd.id DESC
               LIMIT 1
             ) AS delivery_number,
             EXISTS (
               SELECT 1
               FROM sale_items si
               WHERE si.empresa_id = m.empresa_id AND si.sale_id = m.sale_id
                 AND si.quantity > 0 AND si.unit_price >= 0
             ) AS has_priced_items,
             (COALESCE(s.fiscal_status, 'no_enviado') = 'aprobado'
               AND COALESCE(s.cae, '') NOT IN ('', 'manual')
               AND s.fiscal_point_of_sale IS NOT NULL
               AND s.fiscal_receipt_type IS NOT NULL
               AND s.fiscal_receipt_number IS NOT NULL) AS has_fiscal_pdf,
              internal_note.id::text AS internal_document_id,
              internal_note.receipt_number::int AS internal_document_number,
              fiscal_note.id::text AS fiscal_document_id,
              fiscal_note.fiscal_receipt_number::int AS fiscal_document_number
      FROM current_account_movements m
      LEFT JOIN sales s ON s.id = m.sale_id AND s.empresa_id = m.empresa_id
      LEFT JOIN payments receipt_payment ON receipt_payment.id = m.payment_id AND receipt_payment.empresa_id = m.empresa_id
      LEFT JOIN sales_internal_documents internal_note
        ON internal_note.id = m.sales_internal_document_id
       AND internal_note.empresa_id = m.empresa_id
       AND internal_note.fiscal = false
      LEFT JOIN LATERAL (
        SELECT fiscal.id, fiscal.fiscal_receipt_number
        FROM sales_internal_documents fiscal
        WHERE fiscal.empresa_id = internal_note.empresa_id
          AND fiscal.operational_document_id = internal_note.id
          AND fiscal.fiscal = true
          AND fiscal.fiscal_status = 'aprobado'
          AND COALESCE(fiscal.cae, '') <> ''
        ORDER BY fiscal.fiscal_authorized_at DESC NULLS LAST, fiscal.created_at DESC
        LIMIT 1
      ) fiscal_note ON true
      WHERE m.empresa_id = $1 AND m.client_id = $2::uuid
        AND ${activeAccountMovementWhereSql("m", "s")}
        AND ${visibleAccountMovementWhereSql("m")}
      ORDER BY m.movement_date ASC, m.created_at ASC
    `,
    [companyId, clientId],
  );

  const movements = collapsePaymentAllocations(rows.rows.map((row) => ({
    id: row.id,
    date: row.movement_date,
    description: row.description,
    debit: Number(row.debit),
    credit: Number(row.credit),
    kind: movementKind(row.description, Number(row.debit)),
    paymentId: row.payment_id,
    paymentReceiptId: row.payment_receipt_id ?? null,
    saleId: row.sale_id,
    saleNumber: row.sale_number,
    deliveryNumber: row.delivery_number === null ? null : Number(row.delivery_number),
    hasPricedItems: row.has_priced_items,
    hasFiscalPdf: row.has_fiscal_pdf,
    internalDocumentId: row.internal_document_id,
    internalDocumentNumber: row.internal_document_number === null ? null : Number(row.internal_document_number),
    fiscalDocumentId: row.fiscal_document_id,
    fiscalDocumentNumber: row.fiscal_document_number === null ? null : Number(row.fiscal_document_number),
  })));

  const pendingRows = await queryWithCompanyContext<{
    id: string; payment_date: string; amount: string; applied_amount: string;
    method: string; reference: string; notes: string;
  }>(
    companyId,
    `
      SELECT p.id::text AS id, p.payment_date::text AS payment_date,
             p.amount::text,
             COALESCE(allocation.applied_amount, 0)::text AS applied_amount,
             COALESCE(p.method, '') AS method,
             COALESCE(p.reference, '') AS reference,
             COALESCE(p.notes, '') AS notes
      FROM payments p
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(m.credit), 0) AS applied_amount
        FROM current_account_movements m
        WHERE m.empresa_id = p.empresa_id AND m.payment_id = p.id AND m.credit > 0
      ) allocation ON true
      WHERE p.empresa_id = $1 AND p.client_id = $2::uuid
        AND p.entity_type = 'cliente' AND p.status::text = 'registrado'
        AND p.allocation_reconciled_at IS NULL
        AND ROUND(GREATEST(p.amount - COALESCE(allocation.applied_amount, 0), 0), 0) > 0
      ORDER BY p.payment_date DESC, p.created_at DESC
    `,
    [companyId, clientId],
  );

  return {
    customer: { id: clientId, name: info.rows[0].name, taxId: info.rows[0].tax_id, sellerName: info.rows[0].seller_name },
    statement: buildCustomerStatement(movements, options),
    unappliedPayments: pendingRows.rows.map((row) => ({
      id: row.id,
      date: row.payment_date,
      amount: Number(row.amount),
      appliedAmount: Number(row.applied_amount),
      method: row.method,
      reference: row.reference,
      notes: row.notes,
    })),
  };
}

const PAYMENT_METHODS = new Set<string>(COLLECTION_METHODS);

export type CustomerPaymentInput = {
  clientId: string; amount: number; date: string; method: string;
  treasuryAccountId: string; operation: string; chequeDueDate: string; notes: string;
  allocations: CustomerPaymentAllocation[];
  receiptUrl?: string;
  receiptHash?: string;
};

export type CustomerPaymentAllocation = { saleId: string; amount: number };

export type OpenCustomerRemittance = {
  saleId: string;
  number: string;
  date: string;
  total: number;
  outstanding: number;
};

type OpenSaleForAllocation = {
  id: string;
  outstanding: string | number;
  receipt_number: number;
};

const OPEN_SALES_FOR_ALLOCATION_SQL = `
  SELECT s.id::text AS id,
         GREATEST(
           COALESCE(movements.total_debit, 0)
           - COALESCE(movements.total_credit, 0),
           0
         )::text AS outstanding,
         COALESCE(
           s.receipt_number,
           NULLIF(regexp_replace(COALESCE(s.sale_number, ''), '\\D', '', 'g'), '')::bigint,
           0
         )::int AS receipt_number,
         COALESCE(NULLIF(s.sale_number, ''), 'Remito #' || COALESCE(
           s.receipt_number,
           NULLIF(regexp_replace(COALESCE(s.sale_number, ''), '\\D', '', 'g'), '')::bigint,
           0
         )::text) AS sale_number,
         s.sale_date::text AS sale_date,
         COALESCE(s.total_amount, 0)::text AS total
  FROM sales s
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(cam.credit), 0) AS total_credit,
           COALESCE(SUM(cam.debit), 0) AS total_debit
    FROM current_account_movements cam
    WHERE cam.empresa_id = s.empresa_id AND cam.sale_id = s.id
  ) movements ON true
  WHERE s.empresa_id = $1
    AND s.client_id = $2::uuid
    AND COALESCE(s.order_status, s.status, 'cargado') IN ('entregado')
    AND (
      s.source_sheet IS NULL OR s.source_sheet = ''
      OR s.source_sheet = '12lzgmYiRh-sIAFv-EnhPVnbAfZMuNZYi8uwTj-ooJIE:ENTREGAS MACRO'
      OR (s.sale_date < DATE '2026-07-01' AND s.source_sheet = '1Ocl4Y9gcTS5LqNIePCebV3mtgYk7v6pa5Vy8uHDc75M:VENTAS ANUAL')
    )
    AND GREATEST(
      COALESCE(movements.total_debit, 0)
      - COALESCE(movements.total_credit, 0),
      0
    ) > 0.005
`;

export async function listOpenCustomerRemittances(companyId: number, clientId: string): Promise<OpenCustomerRemittance[]> {
  const rows = await queryWithCompanyContext<OpenSaleForAllocation & {
      sale_number: string; sale_date: string; total: string;
    }>(
      companyId,
      `${OPEN_SALES_FOR_ALLOCATION_SQL} ORDER BY s.sale_date ASC, s.created_at ASC, s.id ASC`,
      [companyId, clientId],
      { cache: false },
    );
  return rows.rows.map((row) => ({
    saleId: row.id,
    number: row.sale_number,
    date: row.sale_date,
    total: Number(row.total),
    outstanding: Number(row.outstanding),
  }));
}

export function allocatePaymentAmount(
  amount: number,
  sales: { id: string; outstanding: number; receiptNumber: number }[],
) {
  let remaining = money(amount);
  const allocations: { saleId: string; receiptNumber: number; amount: number }[] = [];
  for (const sale of sales) {
    if (remaining <= 0.005) break;
    const outstanding = Number.isFinite(sale.outstanding) ? Math.max(0, sale.outstanding) : 0;
    const allocated = money(Math.min(remaining, outstanding));
    if (allocated <= 0.005) continue;
    allocations.push({ saleId: sale.id, receiptNumber: sale.receiptNumber, amount: allocated });
    remaining = money(remaining - allocated);
  }
  return { allocations, allocated: money(amount - remaining), unallocated: remaining };
}

function validateExplicitAllocations(
  amount: number,
  requestedAllocations: CustomerPaymentAllocation[],
  sales: OpenSaleForAllocation[],
) {
  if (!Number.isFinite(amount) || amount < 0 || new Set(requestedAllocations.map((item) => item.saleId)).size !== requestedAllocations.length
    || requestedAllocations.some((item) => !Number.isFinite(item.amount) || item.amount <= 0)) {
    throw new ApiError(400, "La imputacion de remitos no es valida");
  }
  const byId = new Map(sales.map((sale) => [sale.id, sale]));
  if (byId.size !== requestedAllocations.length) {
    throw new ApiError(409, "Uno de los remitos seleccionados ya no tiene saldo pendiente");
  }
  const allocations = requestedAllocations.map((requested) => {
    const sale = byId.get(requested.saleId)!;
    const outstanding = money(Number(sale.outstanding));
    if (requested.amount - outstanding > 0.005) {
      throw new ApiError(409, `El importe aplicado al remito #${String(sale.receipt_number).padStart(4, "0")} supera su saldo pendiente`);
    }
    return { saleId: sale.id, receiptNumber: sale.receipt_number, amount: money(requested.amount) };
  });
  const allocated = money(allocations.reduce((sum, item) => sum + item.amount, 0));
  if (allocated - amount > 0.005) {
    throw new ApiError(400, "El total imputado a los remitos no puede superar el monto recibido");
  }
  return { allocations, allocated, unallocated: money(amount - allocated) };
}

export type CustomerAvailableCredit = { sourceId: string; label: string; amount: number };

// Sólo créditos netos que ya existen en el mayor, nunca el importe nominal de una NC.
const AVAILABLE_CUSTOMER_CREDITS_SQL = `
  SELECT COALESCE(m.sale_id::text, 'general') AS source_id,
         CASE WHEN m.sale_id IS NULL THEN 'Saldo a favor sin remito'
              ELSE 'Crédito en ' || COALESCE(NULLIF(s.sale_number, ''), 'remito #' || s.receipt_number::text) END AS label,
         SUM(m.credit - m.debit)::text AS amount
  FROM current_account_movements m
  LEFT JOIN sales s ON s.id = m.sale_id AND s.empresa_id = m.empresa_id
  WHERE m.empresa_id = $1 AND m.client_id = $2::uuid AND m.entity_type = 'cliente'
    AND ${activeAccountMovementWhereSql("m", "s")}
  GROUP BY m.sale_id, s.sale_number, s.receipt_number
  HAVING SUM(m.credit - m.debit) > 0.005
    -- Un cobro sin débito de apertura no demuestra un crédito real del cliente.
    -- Los asientos de traslado de crédito tampoco pueden legitimar su propio origen.
    AND (m.sale_id IS NULL OR BOOL_OR(m.debit > 0 AND m.payment_id IS NULL AND (
      m.description ILIKE 'Remito #%'
      OR m.description ILIKE 'Factura #%'
      OR m.description ILIKE 'Saldo pendiente - Remito %'
    )))
  ORDER BY m.sale_id NULLS FIRST
`;

export async function listCustomerAvailableCredits(companyId: number, clientId: string): Promise<CustomerAvailableCredit[]> {
  const result = await queryWithCompanyContext<{ source_id: string; label: string; amount: string }>(
    companyId, AVAILABLE_CUSTOMER_CREDITS_SQL, [companyId, clientId], { cache: false },
  );
  return result.rows.map((row) => ({ sourceId: row.source_id, label: row.label, amount: Number(row.amount) }));
}

export type CustomerAccountReconciliation = {
  accountBalance: number; pendingRemittances: number; availableCredit: number;
  difference: number; needsReview: boolean;
};

export function reconcileCustomerAccount(accountBalance: number, pendingRemittances: number, availableCredit: number): CustomerAccountReconciliation {
  const difference = money(accountBalance - money(pendingRemittances - availableCredit));
  return { accountBalance: money(accountBalance), pendingRemittances: money(pendingRemittances),
    availableCredit: money(availableCredit), difference, needsReview: Math.abs(difference) > 0.005 };
}

// Una sola instantánea para el modal: saldo, remitos y créditos no se consultan
// por separado mientras otros operadores pueden estar registrando cobros.
export async function getCustomerPaymentContext(companyId: number, clientId: string) {
  const result = await queryWithCompanyContext<{
    remittances: (OpenSaleForAllocation & { sale_number: string; sale_date: string; total: string })[];
    credits: { source_id: string; label: string; amount: string }[];
    account_balance: string;
  }>(companyId, `
    WITH open_remittances AS (${OPEN_SALES_FOR_ALLOCATION_SQL}),
         available_credits AS (${AVAILABLE_CUSTOMER_CREDITS_SQL})
    SELECT COALESCE((SELECT json_agg(r ORDER BY r.sale_date, r.id) FROM open_remittances r), '[]'::json) AS remittances,
           COALESCE((SELECT json_agg(c) FROM available_credits c), '[]'::json) AS credits,
           COALESCE((SELECT SUM(m.debit - m.credit)
             FROM current_account_movements m
             LEFT JOIN sales s ON s.id = m.sale_id AND s.empresa_id = m.empresa_id
             WHERE m.empresa_id = $1 AND m.client_id = $2::uuid
               AND ${activeAccountMovementWhereSql("m", "s")}
               AND ${visibleAccountMovementWhereSql("m")}), 0)::text AS account_balance
    FROM clients c WHERE c.empresa_id = $1 AND c.id = $2::uuid
  `, [companyId, clientId], { cache: false });
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "Cliente no encontrado");
  const data: OpenCustomerRemittance[] = row.remittances.map((r) => ({
    saleId: r.id, number: r.sale_number, date: r.sale_date, total: Number(r.total), outstanding: Number(r.outstanding),
  }));
  const credits: CustomerAvailableCredit[] = row.credits.map((c) => ({ sourceId: c.source_id, label: c.label, amount: Number(c.amount) }));
  return { data, credits, reconciliation: reconcileCustomerAccount(Number(row.account_balance),
    money(data.reduce((sum, r) => sum + r.outstanding, 0)), money(credits.reduce((sum, c) => sum + c.amount, 0))) };
}

export async function applyCustomerCredit(session: AuthSession, input: {
  clientId: string; sourceId: string; allocations: CustomerPaymentAllocation[]; requestId: string;
}) {
  if (!(await sessionAllows(session, [COLLECTIONS_APPROVE_PERMISSION]))) throw new ApiError(403, "Sin permiso para aplicar créditos");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(input.clientId) || !uuid.test(input.requestId) || (input.sourceId !== "general" && !uuid.test(input.sourceId))) {
    throw new ApiError(400, "La solicitud de crédito no es válida");
  }
  if (!Array.isArray(input.allocations) || !input.allocations.length || input.allocations.length > 500 || input.allocations.some((item) => !item || !uuid.test(item.saleId))) {
    throw new ApiError(400, "Seleccioná los remitos que reciben el crédito");
  }
  const result = await withCompanyContext(session.companyId, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${session.companyId}:${input.clientId}`]);
    const prior = await client.query<{ new_data: { requestId: string; clientId: string; sourceId: string; allocations: CustomerPaymentAllocation[]; applied: number } }>(
      `SELECT new_data FROM audit_log WHERE empresa_id = $1 AND action = 'customer_credit.applied'
       AND new_data->>'requestId' = $2 LIMIT 1`, [session.companyId, input.requestId],
    );
    if (prior.rows[0]) {
      const saved = prior.rows[0].new_data;
      if (saved.clientId !== input.clientId || saved.sourceId !== input.sourceId || JSON.stringify(saved.allocations) !== JSON.stringify(input.allocations)) {
        throw new ApiError(409, "Esta solicitud ya se usó con otros importes");
      }
      return { applied: saved.applied };
    }
    const customer = await client.query<{ name: string }>(
      `SELECT COALESCE(display_name,'') AS name FROM clients WHERE empresa_id = $1 AND id = $2::uuid FOR KEY SHARE`,
      [session.companyId, input.clientId],
    );
    if (!customer.rows[0]) throw new ApiError(404, "Cliente no encontrado");
    // Serializar con pagos y bloquear los movimientos existentes antes de recalcular.
    await client.query(`SELECT id FROM current_account_movements WHERE empresa_id = $1 AND client_id = $2::uuid ORDER BY id FOR UPDATE`, [session.companyId, input.clientId]);
    const sources = await client.query<{ source_id: string; label: string; amount: string }>(AVAILABLE_CUSTOMER_CREDITS_SQL, [session.companyId, input.clientId]);
    const source = sources.rows.find((row) => row.source_id === input.sourceId);
    if (!source) throw new ApiError(409, "El crédito ya no está disponible. Actualizá la cuenta.");
    const sales = await client.query<OpenSaleForAllocation>(`${OPEN_SALES_FOR_ALLOCATION_SQL} ORDER BY s.id FOR UPDATE OF s`, [session.companyId, input.clientId]);
    const selected = new Set(input.allocations.map((item) => item.saleId));
    const allocation = validateExplicitAllocations(Number(source.amount), input.allocations, sales.rows.filter((sale) => selected.has(sale.id)));
    const description = `Ajuste de imputación de crédito | ${source.label} | Ref. ${input.requestId}`;
    const date = localDateIso();
    const name = customer.rows[0].name;
    await client.query(
      `INSERT INTO current_account_movements (client_id, sale_id, movement_date, debit, credit, description, entity_type, entity_name, empresa_id)
       VALUES ($1::uuid, $2::uuid, $3, $4, 0, $5, 'cliente', $6, $7)`,
      [input.clientId, input.sourceId === "general" ? null : input.sourceId, date, allocation.allocated, description, name, session.companyId],
    );
    for (const item of allocation.allocations) {
      await client.query(
        `INSERT INTO current_account_movements (client_id, sale_id, movement_date, debit, credit, description, entity_type, entity_name, empresa_id)
         VALUES ($1::uuid, $2::uuid, $3, 0, $4, $5, 'cliente', $6, $7)`,
        [input.clientId, item.saleId, date, item.amount, `${description} | Aplicado a #${String(item.receiptNumber).padStart(4, "0")}`, name, session.companyId],
      );
      const before = Number(sales.rows.find((sale) => sale.id === item.saleId)!.outstanding);
      await client.query(`UPDATE sales SET collection_status = $1, updated_at = now() WHERE id = $2::uuid AND empresa_id = $3`,
        [before - item.amount <= 0.005 ? "recibido" : "pendiente", item.saleId, session.companyId]);
    }
    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1,$2,$3,$4,$5,$6)",
      [session.userId, "customer_credit.applied", "clients", input.clientId,
        JSON.stringify({ ...input, applied: allocation.allocated, cashReceived: 0, treasuryEffect: 0 }), session.companyId],
    );
    return { applied: allocation.allocated };
  });
  clearReadQueryCache();
  return result;
}

async function postAllocatedCustomerPayment(
  client: PoolClient,
  companyId: number,
  input: {
    clientId: string;
    paymentId: string;
    amount: number;
    date: string;
    description: string;
    clientName: string;
    allocations: CustomerPaymentAllocation[];
  },
) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`${companyId}:${input.clientId}`],
  );
  const sales = await client.query<OpenSaleForAllocation>(
    `${OPEN_SALES_FOR_ALLOCATION_SQL}
      ORDER BY s.sale_date ASC, s.created_at ASC, s.id ASC
      FOR UPDATE OF s`,
    [companyId, input.clientId],
  );
  const effectiveSales = sales.rows.map((sale) => ({ ...sale, outstanding: Number(sale.outstanding) }));
  const requestedIds = new Set(input.allocations.map((item) => item.saleId));
  const payableSales = effectiveSales.filter((sale) => requestedIds.has(sale.id));
  // Una selección vacía es explícita: todo queda a favor. Nunca distribuir por FIFO.
  const allocation = validateExplicitAllocations(input.amount, input.allocations, payableSales);
  for (const item of allocation.allocations) {
    await client.query(
      `
        INSERT INTO current_account_movements (
          client_id, sale_id, payment_id, movement_date, debit, credit,
          description, entity_type, entity_name, empresa_id
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 0, $5, $6, 'cliente', $7, $8)
      `,
      [
        input.clientId,
        item.saleId,
        input.paymentId,
        input.date,
        item.amount,
        `${input.description} | Imputado a #${String(item.receiptNumber).padStart(4, "0")}`,
        input.clientName,
        companyId,
      ],
    );
    const originalOutstanding = Number(
      payableSales.find((sale) => sale.id === item.saleId)?.outstanding ?? 0,
    );
    await client.query(
      `UPDATE sales
       SET collection_status = $1, updated_at = now()
       WHERE id = $2::uuid AND empresa_id = $3`,
      [originalOutstanding - item.amount <= 0.005 ? "recibido" : "pendiente", item.saleId, companyId],
    );
  }

  if (allocation.unallocated > 0.005) {
    await client.query(
      `
        INSERT INTO current_account_movements (
          client_id, payment_id, movement_date, debit, credit,
          description, entity_type, entity_name, empresa_id
        )
        VALUES ($1::uuid, $2::uuid, $3, 0, $4, $5, 'cliente', $6, $7)
      `,
      [
        input.clientId,
        input.paymentId,
        input.date,
        allocation.unallocated,
        `Saldo a favor | ${input.description}`,
        input.clientName,
        companyId,
      ],
    );
  }

  return { allocated: allocation.allocated, unallocated: allocation.unallocated };
}

type PaymentTreasuryTarget = {
  accountId: string;
  accountName: string;
};

async function resolvePaymentTreasuryTarget(
  client: PoolClient,
  companyId: number,
  input: Pick<CustomerPaymentInput, "method" | "treasuryAccountId" | "chequeDueDate">,
): Promise<PaymentTreasuryTarget | null> {
  if (input.method === "echeck") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.chequeDueDate)) {
      throw new ApiError(400, "La fecha de cobro del E-cheq es obligatoria");
    }
    return null;
  }
  if (!/^\d+$/.test(input.treasuryAccountId)) {
    throw new ApiError(400, "Selecciona una cuenta de Tesoreria");
  }
  const account = await client.query<{ id: string; name: string; account_type: string }>(
    `SELECT id::text, name, account_type
       FROM admin_treasury_accounts
      WHERE id = $1::bigint AND empresa_id = $2 AND active = TRUE
      FOR SHARE`,
    [input.treasuryAccountId, companyId],
  );
  const target = account.rows[0];
  if (!target) throw new ApiError(400, "La cuenta de Tesoreria no existe o esta inactiva");
  if (input.method === "efectivo" && target.account_type !== "cash") {
    throw new ApiError(400, "El efectivo debe ingresar a una cuenta de Caja");
  }
  if (input.method === "transferencia" && !["bank", "wallet"].includes(target.account_type)) {
    throw new ApiError(400, "La transferencia debe ingresar a un banco o billetera");
  }
  return { accountId: target.id, accountName: target.name };
}

async function postCustomerPaymentToTreasury(
  client: PoolClient,
  companyId: number,
  input: {
    paymentId: string;
    clientName: string;
    clientTaxId: string;
    amount: number;
    date: string;
    method: string;
    operation: string;
    chequeDueDate: string;
    notes: string;
    target: PaymentTreasuryTarget | null;
    actorId: string;
  },
) {
  if (input.method === "echeck") {
    await client.query(
      `INSERT INTO admin_echeqs (
         empresa_id, cheque_number, received_from, received_from_cuit,
         issuer, issuer_cuit, due_date, amount, status, payment_id, notes, created_by
       ) VALUES ($1, $2, $3, $4, $3, $4, $5::date, $6, 'accepted', $7::uuid, $8, $9::uuid)`,
      [
        companyId,
        input.operation,
        input.clientName,
        input.clientTaxId,
        input.chequeDueDate,
        input.amount,
        input.paymentId,
        input.notes,
        input.actorId,
      ],
    );
    return;
  }

  if (!input.target) throw new ApiError(400, "Falta la cuenta de destino del cobro");
  await client.query(
    `INSERT INTO admin_treasury_movements (
       empresa_id, account_id, movement_date, direction, amount, concept,
       source_type, source_id, reference, notes, created_by
     ) VALUES ($1, $2::bigint, $3::date, 'inflow', $4, $5,
               'customer_payment', $6, $7, $8, $9::uuid)`,
    [
      companyId,
      input.target.accountId,
      input.date,
      input.amount,
      `Cobro de ${input.clientName}`,
      input.paymentId,
      input.operation,
      input.notes,
      input.actorId,
    ],
  );
}

export function customerPaymentFromBody(body: RequestBody, evidence: { hasValidatedReceipt?: boolean } = {}): CustomerPaymentInput {
  const clientId = textField(body, "clientId") || textField(body, "cliente_id");
  const amount = numberField(body, "amount", numberField(body, "monto", 0));
  const method = (textField(body, "method") || textField(body, "metodo")).toLowerCase();
  const treasuryAccountId = textField(body, "treasuryAccountId").trim();
  const operation = (textField(body, "operation") || textField(body, "operacion")).trim();
  const chequeDueDate = textField(body, "chequeDueDate").trim();
  const notes = textField(body, "notes") || textField(body, "notas");
  const date = textField(body, "date") || textField(body, "fecha") || localDateIso();

  let allocations: CustomerPaymentAllocation[] = [];
  try {
    const parsed = JSON.parse(textField(body, "allocations") || "[]") as unknown;
    if (!Array.isArray(parsed)) throw new Error("invalid");
    const seen = new Set<string>();
    allocations = parsed.map((item) => {
      if (!item || typeof item !== "object") throw new Error("invalid");
      const saleId = String((item as { saleId?: unknown }).saleId ?? "");
      const allocationAmount = money(Number((item as { amount?: unknown }).amount));
      if (!/^[0-9a-fA-F-]{36}$/.test(saleId) || !Number.isFinite(allocationAmount) || allocationAmount <= 0 || seen.has(saleId)) {
        throw new Error("invalid");
      }
      seen.add(saleId);
      return { saleId, amount: allocationAmount };
    });
  } catch {
    throw new ApiError(400, "La imputacion de remitos no es valida");
  }

  if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(400, "El monto debe ser mayor a cero");
  if (!PAYMENT_METHODS.has(method)) throw new ApiError(400, "Metodo de cobro invalido");
  if (collectionMethodRequiresOperation(method) && !operation && !(method === "transferencia" && evidence.hasValidatedReceipt)) {
    throw new ApiError(400, "Ingresá el número de operacion o adjuntá el comprobante de transferencia");
  }
  if (method === "echeck" && !/^\d{1,20}$/.test(operation)) {
    throw new ApiError(400, "El numero de E-cheq debe contener solo digitos");
  }
  if (method !== "echeck" && !/^\d+$/.test(treasuryAccountId)) {
    throw new ApiError(400, "Selecciona una cuenta de Tesoreria");
  }
  if (method === "echeck" && !/^\d{4}-\d{2}-\d{2}$/.test(chequeDueDate)) {
    throw new ApiError(400, "La fecha de cobro del E-cheq es obligatoria");
  }
  const allocatedTotal = money(allocations.reduce((sum, item) => sum + item.amount, 0));
  if (allocatedTotal - amount > 0.005) {
    throw new ApiError(400, "El total imputado a los remitos no puede superar el monto recibido");
  }

  return { clientId, amount, date, method, treasuryAccountId, operation, chequeDueDate, notes, allocations };
}

export async function registerCustomerPayment(session: AuthSession, input: CustomerPaymentInput) {
  if (!input.clientId) throw new ApiError(400, "El cliente es obligatorio");
  if (input.receiptUrl && !new RegExp(`^starlim-storage://[^/]+/recibos/recibo_${session.companyId}_pago_[a-zA-Z0-9._-]+$`).test(input.receiptUrl)) {
    throw new ApiError(400, "Comprobante de pago no válido para esta empresa");
  }
  const canApprove = await sessionAllows(session, [COLLECTIONS_APPROVE_PERMISSION]);
  const status = canApprove ? "registrado" : "pendiente_aprobacion";

  const result = await withCompanyContext(session.companyId, async (client) => {
    if (input.receiptHash) {
      if (!/^[0-9a-f]{64}$/.test(input.receiptHash)) throw new ApiError(400, "Comprobante inválido");
      // Serialize retries of exactly the same image within this company.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`payment-receipt:${session.companyId}:${input.receiptHash}`]);
      const duplicate = await client.query(
        "SELECT id FROM payments WHERE empresa_id = $1 AND status::text <> 'anulado' AND receipt_url LIKE $2 LIMIT 1",
        [session.companyId, `%_${input.receiptHash}.%`],
      );
      if (duplicate.rows.length) throw new ApiError(409, "Este comprobante ya está vinculado a un pago. Revisá los pagos registrados antes de continuar.");
    }
    const clientInfo = await client.query(
      `SELECT COALESCE(display_name,'') AS name, COALESCE(tax_id,'') AS tax_id
         FROM clients WHERE id = $1::uuid AND empresa_id = $2 LIMIT 1`,
      [input.clientId, session.companyId],
    );
    if (clientInfo.rows.length === 0) throw new ApiError(404, "Cliente no encontrado");
    const clientName = clientInfo.rows[0]?.name ?? "";
    const clientTaxId = clientInfo.rows[0]?.tax_id ?? "";
    const reference = [input.operation, input.notes].filter(Boolean).join(" | ");
    const explicitAllocations = input.allocations ?? [];
    const treasuryTarget = await resolvePaymentTreasuryTarget(client, session.companyId, input);

    const payment = await client.query(
      `
        INSERT INTO payments (
          client_id, payment_date, amount, method, reference, status,
          registered_by, entity_type, entity_name, concept, notes, empresa_id,
          treasury_account_id, treasury_reference, cheque_due_date, receipt_url
        )
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::uuid, 'cliente', $8, $9, $10, $11,
                $12::bigint, $13, $14::date, $15)
        RETURNING id::text AS id
      `,
      [
        input.clientId, input.date, input.amount, input.method, reference, status,
        session.userId, clientName, `Cobro ${input.method}`, input.notes, session.companyId,
        treasuryTarget?.accountId ?? null, input.operation, input.chequeDueDate || null,
        // Legacy payments.receipt_url is NOT NULL DEFAULT ''; no attachment is empty text.
        input.receiptUrl || "",
      ],
    );
    const paymentId = payment.rows[0].id as string;

    for (const requested of explicitAllocations) {
      await client.query(
        `INSERT INTO customer_payment_allocation_requests (
           empresa_id, payment_id, sale_id, requested_amount
         ) VALUES ($1, $2::uuid, $3::uuid, $4)`,
        [session.companyId, paymentId, requested.saleId, requested.amount],
      );
    }

    let allocation = { allocated: 0, unallocated: input.amount };
    if (status === "registrado") {
      allocation = await postAllocatedCustomerPayment(client, session.companyId, {
        clientId: input.clientId,
        paymentId,
        amount: input.amount,
        date: input.date,
        description: `Cobro - ${input.method} | Destino ${treasuryTarget?.accountName ?? "E-cheq en cartera"} | ${reference}`.trim(),
        clientName,
        allocations: explicitAllocations,
      });
      await postCustomerPaymentToTreasury(client, session.companyId, {
        paymentId,
        clientName,
        clientTaxId,
        amount: input.amount,
        date: input.date,
        method: input.method,
        operation: input.operation,
        chequeDueDate: input.chequeDueDate,
        notes: input.notes,
        target: treasuryTarget,
        actorId: session.userId,
      });
    }

    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1,$2,$3,$4,$5,$6)",
      [session.userId, "customer_payment.registered", "payments", paymentId, JSON.stringify({ status, amount: input.amount, ...allocation }), session.companyId],
    );

    return { id: paymentId, status, ...allocation };
  });

  clearReadQueryCache();
  return result as { id: string; status: "registrado" | "pendiente_aprobacion" };
}

export type PendingCustomerPayment = {
  id: string; clientId: string; customerName: string; amount: number;
  method: string; reference: string; destination: string; chequeDueDate: string | null;
  registeredBy: string; createdAt: string | null;
};

export async function listPendingCustomerPayments(companyId: number): Promise<PendingCustomerPayment[]> {
  const rows = await queryWithCompanyContext<{
    id: string; client_id: string; name: string; amount: string; method: string;
    reference: string; destination: string; cheque_due_date: string | null;
    registered_by: string; created_at: string | null;
  }>(
    companyId,
    `
      SELECT p.id::text AS id, p.client_id::text AS client_id,
             COALESCE(c.display_name, p.entity_name, '') AS name,
             p.amount::text, COALESCE(p.method,'') AS method, COALESCE(p.reference,'') AS reference,
             CASE WHEN p.method = 'echeck' THEN 'E-cheq en cartera'
                  ELSE COALESCE(account.name, 'Cuenta no identificada') END AS destination,
             p.cheque_due_date::text,
             COALESCE(u.full_name, u.username, '') AS registered_by, p.created_at::text
      FROM payments p
      LEFT JOIN clients c ON c.id = p.client_id AND c.empresa_id = p.empresa_id
      LEFT JOIN profiles u ON u.id::text = p.registered_by::text
      LEFT JOIN admin_treasury_accounts account
        ON account.id = p.treasury_account_id AND account.empresa_id = p.empresa_id
      WHERE p.empresa_id = $1 AND p.status::text = 'pendiente_aprobacion' AND p.entity_type = 'cliente'
      ORDER BY p.created_at DESC
    `,
    [companyId],
  );
  return rows.rows.map((row) => ({
    id: row.id, clientId: row.client_id, customerName: row.name, amount: Number(row.amount),
    method: row.method, reference: row.reference, destination: row.destination,
    chequeDueDate: row.cheque_due_date, registeredBy: row.registered_by, createdAt: row.created_at,
  }));
}

export async function approveCustomerPayment(session: AuthSession, paymentId: string) {
  const result = await withCompanyContext(session.companyId, async (client) => {
    const found = await client.query(
      `SELECT p.id::text AS id, p.client_id::text AS client_id, p.amount::text AS amount,
              p.payment_date::text AS payment_date, COALESCE(p.method,'') AS method,
              COALESCE(p.reference,'') AS reference, COALESCE(p.entity_name,'') AS entity_name,
              COALESCE(c.tax_id,'') AS tax_id,
              COALESCE(p.treasury_account_id::text,'') AS treasury_account_id,
              COALESCE(p.treasury_reference,'') AS treasury_reference,
              COALESCE(p.cheque_due_date::text,'') AS cheque_due_date,
              COALESCE(p.notes,'') AS notes
       FROM payments p
       LEFT JOIN clients c ON c.id = p.client_id AND c.empresa_id = p.empresa_id
       WHERE p.id = $1::uuid AND p.empresa_id = $2 AND p.status::text = 'pendiente_aprobacion' FOR UPDATE OF p`,
      [paymentId, session.companyId],
    );
    const payment = found.rows[0];
    if (!payment) throw new ApiError(409, "El pago ya no esta pendiente de aprobacion");
    const treasuryTarget = await resolvePaymentTreasuryTarget(client, session.companyId, {
      method: payment.method,
      treasuryAccountId: payment.treasury_account_id,
      chequeDueDate: payment.cheque_due_date || payment.payment_date,
    });

    const requested = await client.query<{ sale_id: string; amount: string }>(
      `SELECT sale_id::text AS sale_id, requested_amount::text AS amount
       FROM customer_payment_allocation_requests
       WHERE empresa_id = $1 AND payment_id = $2::uuid
       ORDER BY created_at ASC, id ASC`,
      [session.companyId, paymentId],
    );

    const allocation = await postAllocatedCustomerPayment(client, session.companyId, {
      clientId: payment.client_id,
      paymentId,
      amount: Number(payment.amount),
      date: payment.payment_date,
      description: `Cobro aprobado - ${payment.method} | Destino ${treasuryTarget?.accountName ?? "E-cheq en cartera"} | ${payment.reference}`.trim(),
      clientName: payment.entity_name,
      allocations: requested.rows.map((item) => ({ saleId: item.sale_id, amount: Number(item.amount) })),
    });
    await postCustomerPaymentToTreasury(client, session.companyId, {
      paymentId,
      clientName: payment.entity_name,
      clientTaxId: payment.tax_id,
      amount: Number(payment.amount),
      date: payment.payment_date,
      method: payment.method,
      operation: payment.treasury_reference || String(payment.reference).split("|")[0].trim(),
      chequeDueDate: payment.cheque_due_date || payment.payment_date,
      notes: payment.notes,
      target: treasuryTarget,
      actorId: session.userId,
    });
    await client.query(
      `UPDATE payments SET status = 'registrado', updated_at = now() WHERE id = $1::uuid AND empresa_id = $2`,
      [paymentId, session.companyId],
    );
    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1,$2,$3,$4,$5,$6)",
      [session.userId, "customer_payment.approved", "payments", paymentId, JSON.stringify({ amount: Number(payment.amount), ...allocation }), session.companyId],
    );
    return { id: paymentId, status: "registrado" as const, ...allocation };
  });
  clearReadQueryCache();
  return result;
}

export async function rejectCustomerPayment(session: AuthSession, paymentId: string, reason: string) {
  const result = await withCompanyContext(session.companyId, async (client) => {
    const updated = await client.query<{ id: string }>(
      `UPDATE payments SET status = 'rechazado', notes = CASE WHEN $3 = '' THEN notes ELSE CONCAT_WS(' | ', NULLIF(notes,''), 'Rechazo: ' || $3) END, updated_at = now()
       WHERE id = $1::uuid AND empresa_id = $2 AND status::text = 'pendiente_aprobacion' RETURNING id::text AS id`,
      [paymentId, session.companyId, reason.trim()],
    );
    if (!updated.rows[0]) throw new ApiError(409, "El pago ya no esta pendiente de aprobacion");
    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1,$2,$3,$4,$5,$6)",
      [session.userId, "customer_payment.rejected", "payments", paymentId, JSON.stringify({ reason: reason.trim() }), session.companyId],
    );
    return { id: paymentId, status: "rechazado" as const };
  });
  clearReadQueryCache();
  return result;
}

export type CustomerPaymentRow = {
  id: string; date: string | null; customerName: string; method: string;
  reference: string; registeredBy: string; amount: number; status: string;
  allocatedAmount: number; unallocatedAmount: number;
};

export async function listCustomerPayments(
  companyId: number,
  options: { query?: string | null; status?: string | null; from?: string | null; to?: string | null } = {},
): Promise<CustomerPaymentRow[]> {
  const params: unknown[] = [companyId];
  const filters = ["p.empresa_id = $1", "p.entity_type = 'cliente'"];
  const status = options.status?.trim() ?? "";
  if (status) { params.push(status); filters.push(`p.status::text = $${params.length}`); }
  const query = options.query?.trim() ?? "";
  if (query) {
    params.push(`%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
    filters.push(`COALESCE(c.display_name, p.entity_name, '') ILIKE $${params.length} ESCAPE '\\'`);
  }
  if (options.from?.trim()) { params.push(options.from.trim()); filters.push(`p.payment_date >= $${params.length}`); }
  if (options.to?.trim()) { params.push(options.to.trim()); filters.push(`p.payment_date <= $${params.length}`); }

  const rows = await queryWithCompanyContext<{
    id: string; date: string | null; name: string; method: string; reference: string;
    registered_by: string; amount: string; status: string;
    allocated_amount: string; unallocated_amount: string;
  }>(
    companyId,
    `
      SELECT p.id::text AS id, p.payment_date::text AS date,
             COALESCE(c.display_name, p.entity_name, '') AS name,
             COALESCE(p.method,'') AS method, COALESCE(p.reference,'') AS reference,
             COALESCE(u.full_name, u.username, '') AS registered_by, p.amount::text,
             COALESCE(p.status::text,'') AS status,
             COALESCE(allocation.allocated_amount, 0)::text AS allocated_amount,
             GREATEST(p.amount - COALESCE(allocation.allocated_amount, 0), 0)::text AS unallocated_amount
      FROM payments p
      LEFT JOIN clients c ON c.id = p.client_id AND c.empresa_id = p.empresa_id
      LEFT JOIN profiles u ON u.id::text = p.registered_by::text
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(cam.credit) FILTER (WHERE cam.sale_id IS NOT NULL), 0) AS allocated_amount
        FROM current_account_movements cam
        WHERE cam.empresa_id = p.empresa_id AND cam.payment_id = p.id AND cam.credit > 0
      ) allocation ON true
      WHERE ${filters.join(" AND ")}
      ORDER BY p.payment_date DESC NULLS LAST, p.created_at DESC
      LIMIT 500
    `,
    params,
  );
  return rows.rows.map((row) => ({
    id: row.id, date: row.date, customerName: row.name, method: row.method,
    reference: row.reference, registeredBy: row.registered_by, amount: Number(row.amount), status: row.status,
    allocatedAmount: Number(row.allocated_amount), unallocatedAmount: Number(row.unallocated_amount),
  }));
}

export type CustomerOption = { id: string; name: string };

export async function listCustomerOptions(companyId: number): Promise<CustomerOption[]> {
  const rows = await queryWithCompanyContext<{ id: string; name: string }>(
    companyId,
    `
      SELECT id::text AS id, COALESCE(display_name, '') AS name
      FROM clients
      WHERE empresa_id = $1
      ORDER BY display_name ASC, id ASC
    `,
    [companyId],
  );
  return rows.rows.map((row) => ({ id: row.id, name: row.name }));
}

export async function voidCustomerPayment(session: AuthSession, paymentId: string) {
  const result = await withCompanyContext(session.companyId, async (client) => {
    const found = await client.query(
      `SELECT id::text AS id, client_id::text AS client_id, amount::text AS amount,
              COALESCE(status::text,'') AS status, COALESCE(entity_name,'') AS entity_name,
              COALESCE(method,'') AS method,
              treasury_account_id::text AS treasury_account_id,
              COALESCE(treasury_reference,'') AS treasury_reference
       FROM payments WHERE id = $1::uuid AND empresa_id = $2 FOR UPDATE`,
      [paymentId, session.companyId],
    );
    const payment = found.rows[0];
    if (!payment) throw new ApiError(404, "Pago no encontrado");
    if (payment.status === "anulado") throw new ApiError(409, "El pago ya esta anulado");
    if (payment.status === "pendiente_aprobacion") {
      throw new ApiError(409, "Un pago pendiente de aprobacion se rechaza, no se anula");
    }

    const hadMovement = payment.status === "registrado";

    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${session.companyId}:${payment.client_id}`]);

    await client.query(
      `UPDATE payments SET status = 'anulado', updated_at = now() WHERE id = $1::uuid AND empresa_id = $2`,
      [paymentId, session.companyId],
    );

    if (hadMovement) {
      await client.query(
        `
          INSERT INTO current_account_movements (
            client_id, sale_id, payment_id, movement_date, debit, credit,
            description, entity_type, entity_name, empresa_id
          )
          SELECT client_id, sale_id, payment_id, CURRENT_DATE, credit, 0,
                 $3, entity_type, entity_name, empresa_id
          FROM current_account_movements
          WHERE payment_id = $1::uuid AND empresa_id = $2 AND credit > 0
        `,
        [paymentId, session.companyId, `Anulacion de cobro (pago ${paymentId})`],
      );
      await client.query(
        `
          UPDATE sales s
          SET collection_status = CASE
                WHEN GREATEST(
                  COALESCE(s.total_amount, 0)
                  + COALESCE((
                      SELECT SUM(cam.debit)
                      FROM current_account_movements cam
                      WHERE cam.empresa_id = s.empresa_id
                        AND cam.sale_id = s.id
                        AND (
                          cam.description ILIKE 'nota de debito%'
                          OR cam.description ILIKE 'anulacion de cobro%'
                        )
                    ), 0)
                  - COALESCE((
                      SELECT SUM(cam.credit)
                      FROM current_account_movements cam
                      WHERE cam.empresa_id = s.empresa_id AND cam.sale_id = s.id
                    ), 0),
                  0
                ) <= 0.005 THEN 'recibido'
                ELSE 'pendiente'
              END,
              updated_at = now()
          WHERE s.empresa_id = $2
            AND s.id IN (
              SELECT DISTINCT cam.sale_id
              FROM current_account_movements cam
              WHERE cam.payment_id = $1::uuid
                AND cam.empresa_id = $2
                AND cam.sale_id IS NOT NULL
            )
        `,
        [paymentId, session.companyId],
      );

      if (["efectivo", "transferencia"].includes(payment.method) && payment.treasury_account_id) {
        await client.query(
          `INSERT INTO admin_treasury_movements (
             empresa_id, account_id, movement_date, direction, amount, concept,
             source_type, source_id, reference, notes, created_by
           ) VALUES ($1, $2::bigint, CURRENT_DATE, 'outflow', $3, $4,
                     'customer_payment_void', $5, $6, $7, $8::uuid)`,
          [
            session.companyId,
            payment.treasury_account_id,
            payment.amount,
            `Anulacion de cobro de ${payment.entity_name}`,
            paymentId,
            payment.treasury_reference,
            `Reversion del pago ${paymentId}`,
            session.userId,
          ],
        );
      }

      if (payment.method === "echeck") {
        const echecks = await client.query<{
          id: string;
          cheque_number: string;
          amount: string;
          status: string;
          deposited_to_account_id: string | null;
        }>(
          `SELECT id::text, cheque_number, amount::text, status,
                  deposited_to_account_id::text
             FROM admin_echeqs
            WHERE empresa_id = $1 AND payment_id = $2::uuid
              AND status IN ('accepted', 'deposited', 'cleared')
            FOR UPDATE`,
          [session.companyId, paymentId],
        );
        for (const echeq of echecks.rows) {
          if (echeq.status === "cleared" && echeq.deposited_to_account_id) {
            await client.query(
              `INSERT INTO admin_treasury_movements (
                 empresa_id, account_id, movement_date, direction, amount, concept,
                 source_type, source_id, reference, notes, created_by
               ) VALUES ($1, $2::bigint, CURRENT_DATE, 'outflow', $3, $4,
                         'echeq_payment_void', $5, $6, $7, $8::uuid)`,
              [
                session.companyId,
                echeq.deposited_to_account_id,
                echeq.amount,
                `Anulacion de E-cheq ${echeq.cheque_number}`,
                echeq.id,
                echeq.cheque_number,
                `Reversion del pago ${paymentId}`,
                session.userId,
              ],
            );
          }
          await client.query(
            `UPDATE admin_echeqs
                SET status = 'cancelled', settled_on = CURRENT_DATE, updated_at = now()
              WHERE id = $1::bigint AND empresa_id = $2`,
            [echeq.id, session.companyId],
          );
        }
      }
    }

    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1,$2,$3,$4,$5,$6)",
      [session.userId, "customer_payment.voided", "payments", paymentId, JSON.stringify({ amount: Number(payment.amount) }), session.companyId],
    );

    return { id: paymentId, status: "anulado" as const };
  });

  clearReadQueryCache();
  return result;
}
