import { readCostMonth } from "./monthly-costs.ts";

import type { ErpCostState } from "./monthly-cost-erp-domain.ts";

export interface CostSql {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export type CreateObligation = {
  costId: string;
  month: string;
  dueDate: string;
  expectedRevision: number;
};

export type PayObligation = {
  obligationId: string;
  requestId: string;
  accountId: string;
  date: string;
  amountCents: number;
  expectedPaidCents: number;
  existingMovementId?: string;
};

export type CostObligation = {
  id: string;
  costId: string;
  month: string;
  concept: string;
  amountCents: number;
  paidCents: number;
  balanceCents: number;
  dueDate: string;
};

function date(v: string) {
  if (
    typeof v !== "string" ||
    !/^20\d{2}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    throw Error("Fecha inválida");
}

function uuid(v: string) {
  if (
    typeof v !== "string" ||
    !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v)
  )
    throw Error("Identificador inválido");
}

function company(v: number) {
  if (!Number.isSafeInteger(v) || v <= 0) throw Error("Empresa inválida");
}

export async function createCostObligation(
  tx: CostSql,
  companyId: number,
  actor: string,
  input: CreateObligation,
  today: string,
) {
  company(companyId);
  uuid(actor);
  date(today);
  date(input.dueDate);

  const ledger = (
    await tx.query<{ state: ErpCostState }>(
      "SELECT state FROM admin_monthly_cost_ledger WHERE empresa_id=$1 FOR UPDATE",
      [companyId],
    )
  ).rows[0];

  if (!ledger || ledger.state.companyId !== companyId)
    throw Error("Primero iniciá los costos mensuales");

  if (input.month < ledger.state.baselineMonth)
    throw Error("No se modifica el histórico anterior al inicio");

  const row = readCostMonth(ledger.state, input.month).rows.find(
    (r) => r.id === input.costId,
  );

  if (
    !row ||
    row.source !== "expense" ||
    row.status !== "included" ||
    row.totalCents <= 0
  )
    throw Error(
      "El gasto debe estar incluido en el mes. Sueldos conservan su circuito propio.",
    );

  const prior = (
    await tx.query<{ id: string; due_date: string; amount_cents: string }>(
      "SELECT id,due_date::text,amount_cents::text FROM admin_cost_obligations WHERE empresa_id=$1 AND cost_id=$2 AND month=$3",
      [companyId, input.costId, input.month],
    )
  ).rows[0];

  if (prior) {
    if (
      prior.due_date !== input.dueDate ||
      Number(prior.amount_cents) !== row.totalCents
    )
      throw Error("Este costo ya tiene una obligación con otros datos");
    return { id: prior.id };
  }

  if (input.expectedRevision !== ledger.state.revision)
    throw Error("Los costos cambiaron. Actualizá antes de continuar");

  if (input.dueDate < ledger.state.baselineMonth + "-01")
    throw Error("No se puede crear una obligación en el histórico");

  if (
    (
      await tx.query(
        "SELECT id FROM admin_finance_monthly_closures WHERE empresa_id=$1 AND month=($2||'-01')::date AND status='closed'",
        [companyId, input.month],
      )
    ).rows.length
  )
    throw Error("El mes del costo está cerrado");
  const id = crypto.randomUUID();

  await tx.query(
    "INSERT INTO admin_cost_obligations(id,empresa_id,cost_id,month,concept,amount_cents,due_date,source_revision,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      id,
      companyId,
      row.id,
      input.month,
      row.name,
      row.totalCents,
      input.dueDate,
      ledger.state.revision,
      actor,
    ],
  );
  return { id };
}

export async function payCostObligation(
  tx: CostSql,
  companyId: number,
  actor: string,
  input: PayObligation,
  today: string,
) {
  company(companyId);
  uuid(actor);
  uuid(input.obligationId);
  uuid(input.requestId);
  date(input.date);
  date(today);

  if (
    !Number.isSafeInteger(input.amountCents) ||
    input.amountCents <= 0 ||
    input.amountCents > 999999999999
  )
    throw Error("Importe inválido");

  if (
    !/^\d+$/.test(input.accountId) ||
    (input.existingMovementId && !/^\d+$/.test(input.existingMovementId))
  )
    throw Error("Cuenta o movimiento inválido");

  const payload = {
    obligationId: input.obligationId,
    accountId: input.accountId,
    date: input.date,
    amountCents: input.amountCents,
    expectedPaidCents: input.expectedPaidCents,
    existingMovementId: input.existingMovementId ?? null,
  };

  await tx.query("SELECT pg_advisory_xact_lock($1::integer,hashtext($2))", [
    companyId,
    input.requestId,
  ]);

  const prior = (
    await tx.query<{ movement_id: string; request_payload: typeof payload }>(
      "SELECT movement_id::text,request_payload FROM admin_cost_obligation_payments WHERE empresa_id=$1 AND request_id=$2",
      [companyId, input.requestId],
    )
  ).rows[0];

  if (prior) {
    if (
      Object.keys(payload).some(
        (k) =>
          payload[k as keyof typeof payload] !==
          prior.request_payload[k as keyof typeof payload],
      )
    )
      throw Error("El reintento tiene datos diferentes");
    return { movementId: prior.movement_id, replayed: true };
  }

  const o = (
    await tx.query<{
      id: string;
      amount_cents: string;
      concept: string;
      month: string;
    }>(
      "SELECT id,amount_cents::text,concept,month FROM admin_cost_obligations WHERE empresa_id=$1 AND id=$2 FOR UPDATE",
      [companyId, input.obligationId],
    )
  ).rows[0];

  if (!o) throw Error("Obligación no encontrada");

  const baseline = (
    await tx.query<{ baseline: string }>(
      "SELECT state->>'baselineMonth' as baseline FROM admin_monthly_cost_ledger WHERE empresa_id=$1",
      [companyId],
    )
  ).rows[0]?.baseline;

  if (!baseline || input.date < baseline + "-01" || input.date > today)
    throw Error(
      "La fecha de pago debe estar entre el inicio del circuito y hoy",
    );

  if (
    (
      await tx.query(
        "SELECT id FROM admin_finance_monthly_closures WHERE empresa_id=$1 AND month=($2||'-01')::date AND status='closed'",
        [companyId, input.date.slice(0, 7)],
      )
    ).rows.length
  )
    throw Error("El mes de pago está cerrado");

  if (
    !(
      await tx.query(
        "SELECT id FROM admin_treasury_accounts WHERE empresa_id=$1 AND id=$2 AND active AND currency='ARS' FOR SHARE",
        [companyId, input.accountId],
      )
    ).rows.length
  )
    throw Error("Seleccioná una cuenta activa en pesos de esta empresa");

  const paid = (
    await tx.query<{ paid: string }>(
      "SELECT COALESCE(SUM(amount_cents),0)::text AS paid FROM admin_cost_obligation_payments WHERE empresa_id=$1 AND obligation_id=$2",
      [companyId, input.obligationId],
    )
  ).rows[0];

  if (
    !Number.isSafeInteger(input.expectedPaidCents) ||
    Number(paid.paid) !== input.expectedPaidCents
  )
    throw Error("El pendiente cambió. Actualizá antes de pagar");

  if (input.amountCents > Number(o.amount_cents) - Number(paid.paid))
    throw Error("El importe supera el pendiente de la obligación");

  let movementId = input.existingMovementId;

  if (movementId) {
    const m = (
      await tx.query<{
        account_id: string;
        movement_date: string;
        amount: string;
        direction: string;
        source_type: string;
      }>(
        "SELECT account_id::text,movement_date::text,amount::text,direction,source_type FROM admin_treasury_movements WHERE empresa_id=$1 AND id=$2 FOR UPDATE",
        [companyId, movementId],
      )
    ).rows[0];

    if (
      !m ||
      m.direction !== "outflow" ||
      m.source_type !== "manual" ||
      m.account_id !== input.accountId ||
      m.movement_date !== input.date ||
      Math.round(Number(m.amount) * 100) !== input.amountCents
    )
      throw Error("El egreso manual no coincide en cuenta, fecha e importe");

    if (
      (
        await tx.query(
          "SELECT id FROM admin_cost_obligation_payments WHERE movement_id=$1",
          [movementId],
        )
      ).rows.length
    )
      throw Error("Este egreso ya está vinculado");
  } else {
    movementId = (
      await tx.query<{ id: string }>(
        `INSERT INTO admin_treasury_movements(empresa_id,account_id,movement_date,direction,amount,concept,source_type,source_id,reference,notes,created_by)

   VALUES($1,$2,$3,'outflow',$4,$5,'monthly_cost_payment',$6,$7,'Pago de obligación mensual',$8) RETURNING id::text`,
        [
          companyId,
          input.accountId,
          input.date,
          input.amountCents / 100,
          `${o.concept} · ${o.month}`.slice(0, 240),
          input.requestId,
          o.id,
          actor,
        ],
      )
    ).rows[0].id;
  }

  await tx.query(
    "INSERT INTO admin_cost_obligation_payments(id,empresa_id,obligation_id,request_id,request_payload,movement_id,amount_cents,created_by) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8)",
    [
      crypto.randomUUID(),
      companyId,
      o.id,
      input.requestId,
      JSON.stringify(payload),
      movementId,
      input.amountCents,
      actor,
    ],
  );
  return { movementId, replayed: false };
}

export async function readCostObligations(
  tx: CostSql,
  companyId: number,
): Promise<CostObligation[]> {
  const r = await tx.query<{
    id: string;
    cost_id: string;
    month: string;
    concept: string;
    amount_cents: string;
    paid_cents: string;
    due_date: string;
  }>(
    `SELECT o.id,o.cost_id,o.month,o.concept,o.amount_cents::text,o.due_date::text,COALESCE(SUM(p.amount_cents),0)::text AS paid_cents FROM admin_cost_obligations o LEFT JOIN admin_cost_obligation_payments p ON p.obligation_id=o.id AND p.empresa_id=o.empresa_id WHERE o.empresa_id=$1 GROUP BY o.id ORDER BY o.due_date,o.id`,
    [companyId],
  );

  return r.rows.map((o) => ({
    id: o.id,
    costId: o.cost_id,
    month: o.month,
    concept: o.concept,
    amountCents: Number(o.amount_cents),
    paidCents: Number(o.paid_cents),
    balanceCents: Number(o.amount_cents) - Number(o.paid_cents),
    dueDate: o.due_date,
  }));
}
