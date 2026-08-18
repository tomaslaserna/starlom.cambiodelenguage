import { ApiError } from "@/lib/api-response";
import { activeAccountMovementWhereSql } from "@/lib/accounts";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { COLLECTION_METHODS, collectionMethodRequiresOperation } from "@/lib/collection-methods";
import { numberField, textField, type RequestBody } from "@/lib/request-body";
import { COLLECTIONS_APPROVE_PERMISSION, sessionAllows } from "@/lib/route-auth";
import { localDateIso } from "@/lib/timezone";
import type { AuthSession } from "@/lib/auth";

export type AgingDebit = { amount: number; date: string; dueDate: string | null };
export type AgingBuckets = { current: number; d30: number; d60: number; d90: number; overdueTotal: number };
export type StatementMovement = { id: string; date: string; description: string; debit: number; credit: number; kind: string };
export type StatementLine = StatementMovement & { balance: number };
export type CustomerStatement = { openingBalance: number; lines: StatementLine[]; finalBalance: number };
export type OpenCustomerAccount = { clientId: string; name: string; sellerName: string; taxId: string; lastMovementDate: string | null; balance: number; aging: AgingBuckets };
export type CustomerStatementResult = {
  customer: { id: string; name: string; taxId: string; sellerName: string };
  statement: CustomerStatement;
};

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
    id: string; movement_date: string; description: string; debit: string; credit: string;
  }>(
    companyId,
    `
      SELECT m.id::text AS id, m.movement_date::text AS movement_date,
             COALESCE(m.description, '') AS description, m.debit::text, m.credit::text
      FROM current_account_movements m
      LEFT JOIN sales s ON s.id = m.sale_id AND s.empresa_id = m.empresa_id
      WHERE m.empresa_id = $1 AND m.client_id = $2::uuid
        AND ${activeAccountMovementWhereSql("m", "s")}
      ORDER BY m.movement_date ASC, m.created_at ASC
    `,
    [companyId, clientId],
  );

  const movements: StatementMovement[] = rows.rows.map((row) => ({
    id: row.id,
    date: row.movement_date,
    description: row.description,
    debit: Number(row.debit),
    credit: Number(row.credit),
    kind: movementKind(row.description, Number(row.debit)),
  }));

  return {
    customer: { id: clientId, name: info.rows[0].name, taxId: info.rows[0].tax_id, sellerName: info.rows[0].seller_name },
    statement: buildCustomerStatement(movements, options),
  };
}

const PAYMENT_METHODS = new Set<string>(COLLECTION_METHODS);

export type CustomerPaymentInput = {
  clientId: string; amount: number; date: string; method: string;
  destination: string; operation: string; notes: string;
};

export function customerPaymentFromBody(body: RequestBody): CustomerPaymentInput {
  const clientId = textField(body, "clientId") || textField(body, "cliente_id");
  const amount = numberField(body, "amount", numberField(body, "monto", 0));
  const method = (textField(body, "method") || textField(body, "metodo")).toLowerCase();
  const destination = textField(body, "destination") || textField(body, "destino");
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

    if (status === "registrado") {
      await client.query(
        `
          INSERT INTO current_account_movements (
            client_id, payment_id, movement_date, debit, credit, description, entity_type, entity_name, empresa_id
          )
          VALUES ($1::uuid, $2::uuid, $3, 0, $4, $5, 'cliente', $6, $7)
        `,
        [
          input.clientId, paymentId, input.date, input.amount,
          `Cobro - ${input.method} | Destino ${input.destination} | ${reference}`.trim(),
          clientName, session.companyId,
        ],
      );
    }

    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1,$2,$3,$4,$5,$6)",
      [session.userId, "customer_payment.registered", "payments", paymentId, JSON.stringify({ status, amount: input.amount }), session.companyId],
    );

    return { id: paymentId, status };
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
      LEFT JOIN profiles u ON u.id = p.registered_by
      WHERE p.empresa_id = $1 AND p.status = 'pendiente_aprobacion' AND p.entity_type = 'cliente'
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
       FROM payments WHERE id = $1::uuid AND empresa_id = $2 AND status = 'pendiente_aprobacion' FOR UPDATE`,
      [paymentId, session.companyId],
    );
    const payment = found.rows[0];
    if (!payment) throw new ApiError(409, "El pago ya no esta pendiente de aprobacion");

    await client.query(
      `INSERT INTO current_account_movements (client_id, payment_id, movement_date, debit, credit, description, entity_type, entity_name, empresa_id)
       VALUES ($1::uuid, $2::uuid, CURRENT_DATE, 0, $3, $4, 'cliente', $5, $6)`,
      [payment.client_id, paymentId, Number(payment.amount), `Cobro aprobado - ${payment.method} | ${payment.reference}`.trim(), payment.entity_name, session.companyId],
    );
    await client.query(
      `UPDATE payments SET status = 'registrado', updated_at = now() WHERE id = $1::uuid AND empresa_id = $2`,
      [paymentId, session.companyId],
    );
    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1,$2,$3,$4,$5,$6)",
      [session.userId, "customer_payment.approved", "payments", paymentId, JSON.stringify({ amount: Number(payment.amount) }), session.companyId],
    );
    return { id: paymentId, status: "registrado" as const };
  });
  clearReadQueryCache();
  return result;
}

export async function rejectCustomerPayment(session: AuthSession, paymentId: string, reason: string) {
  const result = await withCompanyContext(session.companyId, async (client) => {
    const updated = await client.query<{ id: string }>(
      `UPDATE payments SET status = 'rechazado', notes = CASE WHEN $3 = '' THEN notes ELSE CONCAT_WS(' | ', NULLIF(notes,''), 'Rechazo: ' || $3) END, updated_at = now()
       WHERE id = $1::uuid AND empresa_id = $2 AND status = 'pendiente_aprobacion' RETURNING id::text AS id`,
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

export async function voidCustomerPayment(session: AuthSession, paymentId: string) {
  const result = await withCompanyContext(session.companyId, async (client) => {
    const found = await client.query(
      `SELECT id::text AS id, client_id::text AS client_id, amount::text AS amount,
              COALESCE(status,'') AS status, COALESCE(entity_name,'') AS entity_name
       FROM payments WHERE id = $1::uuid AND empresa_id = $2 FOR UPDATE`,
      [paymentId, session.companyId],
    );
    const payment = found.rows[0];
    if (!payment) throw new ApiError(404, "Pago no encontrado");
    if (payment.status === "anulado") throw new ApiError(409, "El pago ya esta anulado");

    const hadMovement = payment.status === "registrado";

    await client.query(
      `UPDATE payments SET status = 'anulado', updated_at = now() WHERE id = $1::uuid AND empresa_id = $2`,
      [paymentId, session.companyId],
    );

    if (hadMovement) {
      await client.query(
        `
          INSERT INTO current_account_movements (
            client_id, payment_id, movement_date, debit, credit, description, entity_type, entity_name, empresa_id
          )
          VALUES ($1::uuid, $2::uuid, CURRENT_DATE, $3, 0, $4, 'cliente', $5, $6)
        `,
        [payment.client_id, paymentId, Number(payment.amount), `Anulacion de cobro (pago ${paymentId})`, payment.entity_name, session.companyId],
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
