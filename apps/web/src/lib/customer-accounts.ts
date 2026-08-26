import { ApiError } from "@/lib/api-response";
import { activeAccountMovementWhereSql } from "@/lib/accounts";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { COLLECTION_METHODS, collectionMethodRequiresOperation } from "@/lib/collection-methods";
import { numberField, textField, type RequestBody } from "@/lib/request-body";
import { COLLECTIONS_APPROVE_PERMISSION, sessionAllows } from "@/lib/route-auth";
import { localDateIso } from "@/lib/timezone";
import type { AuthSession } from "@/lib/auth";
import type { PoolClient } from "pg";

export type AgingDebit = { amount: number; date: string; dueDate: string | null };
export type AgingBuckets = { current: number; d30: number; d60: number; d90: number; overdueTotal: number };
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

  const today = localDateIso();
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
  }>(
    companyId,
    `
      SELECT m.id::text AS id, m.movement_date::text AS movement_date,
             COALESCE(m.description, '') AS description, m.debit::text, m.credit::text,
             m.payment_id::text AS payment_id, m.sale_id::text AS sale_id,
             s.sale_number,
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
               AND s.fiscal_receipt_number IS NOT NULL) AS has_fiscal_pdf
      FROM current_account_movements m
      LEFT JOIN sales s ON s.id = m.sale_id AND s.empresa_id = m.empresa_id
      WHERE m.empresa_id = $1 AND m.client_id = $2::uuid
        AND ${activeAccountMovementWhereSql("m", "s")}
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
    saleId: row.sale_id,
    saleNumber: row.sale_number,
    deliveryNumber: row.delivery_number === null ? null : Number(row.delivery_number),
    hasPricedItems: row.has_priced_items,
    hasFiscalPdf: row.has_fiscal_pdf,
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
        AND p.amount - COALESCE(allocation.applied_amount, 0) > 0.005
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
  destination: string; operation: string; notes: string;
};

type OpenSaleForAllocation = {
  id: string;
  outstanding: string;
  receipt_number: number;
};

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
  },
) {
  const sales = await client.query<OpenSaleForAllocation>(
    `
      SELECT s.id::text AS id,
             GREATEST(
               COALESCE(s.total_amount, 0)
               + COALESCE(movements.debit_notes, 0)
               - COALESCE(movements.total_credit, 0),
               0
             )::text AS outstanding,
             COALESCE(
               s.receipt_number,
               NULLIF(regexp_replace(COALESCE(s.sale_number, ''), '\\D', '', 'g'), '')::bigint,
               0
             )::int AS receipt_number
      FROM sales s
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(cam.credit), 0) AS total_credit,
               COALESCE(SUM(cam.debit) FILTER (
                 WHERE cam.description ILIKE 'nota de debito%'
                    OR cam.description ILIKE 'anulacion de cobro%'
               ), 0) AS debit_notes
        FROM current_account_movements cam
        WHERE cam.empresa_id = s.empresa_id AND cam.sale_id = s.id
      ) movements ON true
      WHERE s.empresa_id = $1
        AND s.client_id = $2::uuid
        AND COALESCE(s.order_status, s.status, 'cargado') IN ('entregado')
        AND COALESCE(s.collection_status, 'pendiente') IN (
          'pendiente', 'vencido', 'pendiente_aprobacion', 'en_proceso'
        )
        AND (
          s.source_sheet IS NULL OR s.source_sheet = ''
          OR s.source_sheet = '12lzgmYiRh-sIAFv-EnhPVnbAfZMuNZYi8uwTj-ooJIE:ENTREGAS MACRO'
          OR (s.sale_date < DATE '2026-07-01' AND s.source_sheet = '1Ocl4Y9gcTS5LqNIePCebV3mtgYk7v6pa5Vy8uHDc75M:VENTAS ANUAL')
        )
        AND GREATEST(
          COALESCE(s.total_amount, 0)
          + COALESCE(movements.debit_notes, 0)
          - COALESCE(movements.total_credit, 0),
          0
        ) > 0.005
      ORDER BY s.sale_date ASC, s.created_at ASC, s.id ASC
      FOR UPDATE OF s
    `,
    [companyId, input.clientId],
  );

  const allocation = allocatePaymentAmount(
    input.amount,
    sales.rows.map((sale) => ({
      id: sale.id,
      outstanding: Number(sale.outstanding),
      receiptNumber: sale.receipt_number,
    })),
  );
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
      sales.rows.find((sale) => sale.id === item.saleId)?.outstanding ?? 0,
    );
    await client.query(
      `UPDATE sales
       SET collection_status = $1, updated_at = now()
       WHERE id = $2::uuid AND empresa_id = $3`,
      [originalOutstanding - item.amount <= 0.005 ? "recibido" : "pendiente", item.saleId, companyId],
    );
  }

  return { allocated: allocation.allocated, unallocated: allocation.unallocated };
}

export function customerPaymentFromBody(body: RequestBody): CustomerPaymentInput {
  const clientId = textField(body, "clientId") || textField(body, "cliente_id");
  const amount = numberField(body, "amount", numberField(body, "monto", 0));
  const method = (textField(body, "method") || textField(body, "metodo")).toLowerCase();
  const destination = (textField(body, "destination") || textField(body, "destino")).trim();
  const operation = textField(body, "operation") || textField(body, "operacion");
  const notes = textField(body, "notes") || textField(body, "notas");
  const date = textField(body, "date") || textField(body, "fecha") || localDateIso();

  if (amount <= 0) throw new ApiError(400, "El monto debe ser mayor a cero");
  if (!PAYMENT_METHODS.has(method)) throw new ApiError(400, "Metodo de cobro invalido");
  if (!destination) throw new ApiError(400, "El destino es obligatorio");
  if (collectionMethodRequiresOperation(method) && !operation) throw new ApiError(400, "La operacion es obligatoria");

  return { clientId, amount, date, method, destination, operation, notes };
}

export async function registerCustomerPayment(session: AuthSession, input: CustomerPaymentInput) {
  if (!input.clientId) throw new ApiError(400, "El cliente es obligatorio");
  const canApprove = await sessionAllows(session, [COLLECTIONS_APPROVE_PERMISSION]);
  const status = canApprove ? "registrado" : "pendiente_aprobacion";

  const result = await withCompanyContext(session.companyId, async (client) => {
    const clientInfo = await client.query(
      `SELECT COALESCE(display_name,'') AS name FROM clients WHERE id = $1::uuid AND empresa_id = $2 LIMIT 1`,
      [input.clientId, session.companyId],
    );
    if (clientInfo.rows.length === 0) throw new ApiError(404, "Cliente no encontrado");
    const clientName = clientInfo.rows[0]?.name ?? "";
    const reference = [input.operation, input.notes].filter(Boolean).join(" | ");

    const payment = await client.query(
      `
        INSERT INTO payments (
          client_id, payment_date, amount, method, reference, status,
          registered_by, entity_type, entity_name, concept, notes, empresa_id
        )
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::uuid, 'cliente', $8, $9, $10, $11)
        RETURNING id::text AS id
      `,
      [
        input.clientId, input.date, input.amount, input.method, reference, status,
        session.userId, clientName, `Cobro ${input.method}`, input.notes, session.companyId,
      ],
    );
    const paymentId = payment.rows[0].id as string;

    let allocation = { allocated: 0, unallocated: input.amount };
    if (status === "registrado") {
      allocation = await postAllocatedCustomerPayment(client, session.companyId, {
        clientId: input.clientId,
        paymentId,
        amount: input.amount,
        date: input.date,
        description: `Cobro - ${input.method} | Destino ${input.destination} | ${reference}`.trim(),
        clientName,
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
  method: string; reference: string; registeredBy: string; createdAt: string | null;
};

export async function listPendingCustomerPayments(companyId: number): Promise<PendingCustomerPayment[]> {
  const rows = await queryWithCompanyContext<{
    id: string; client_id: string; name: string; amount: string; method: string;
    reference: string; registered_by: string; created_at: string | null;
  }>(
    companyId,
    `
      SELECT p.id::text AS id, p.client_id::text AS client_id,
             COALESCE(c.display_name, p.entity_name, '') AS name,
             p.amount::text, COALESCE(p.method,'') AS method, COALESCE(p.reference,'') AS reference,
             COALESCE(u.full_name, u.username, '') AS registered_by, p.created_at::text
      FROM payments p
      LEFT JOIN clients c ON c.id = p.client_id AND c.empresa_id = p.empresa_id
      LEFT JOIN profiles u ON u.id::text = p.registered_by::text
      WHERE p.empresa_id = $1 AND p.status::text = 'pendiente_aprobacion' AND p.entity_type = 'cliente'
      ORDER BY p.created_at DESC
    `,
    [companyId],
  );
  return rows.rows.map((row) => ({
    id: row.id, clientId: row.client_id, customerName: row.name, amount: Number(row.amount),
    method: row.method, reference: row.reference, registeredBy: row.registered_by, createdAt: row.created_at,
  }));
}

export async function approveCustomerPayment(session: AuthSession, paymentId: string) {
  const result = await withCompanyContext(session.companyId, async (client) => {
    const found = await client.query(
      `SELECT id::text AS id, client_id::text AS client_id, amount::text AS amount,
              COALESCE(method,'') AS method, COALESCE(reference,'') AS reference, COALESCE(entity_name,'') AS entity_name
       FROM payments WHERE id = $1::uuid AND empresa_id = $2 AND status::text = 'pendiente_aprobacion' FOR UPDATE`,
      [paymentId, session.companyId],
    );
    const payment = found.rows[0];
    if (!payment) throw new ApiError(409, "El pago ya no esta pendiente de aprobacion");

    const allocation = await postAllocatedCustomerPayment(client, session.companyId, {
      clientId: payment.client_id,
      paymentId,
      amount: Number(payment.amount),
      date: localDateIso(),
      description: `Cobro aprobado - ${payment.method} | ${payment.reference}`.trim(),
      clientName: payment.entity_name,
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
              COALESCE(status::text,'') AS status, COALESCE(entity_name,'') AS entity_name
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
