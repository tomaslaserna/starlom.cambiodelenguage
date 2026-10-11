import { getAccountsPayable, getAdminMetrics, getCashflow } from "@/lib/admin-metrics";
import { ApiError } from "@/lib/api-response";
import type { AuthSession } from "@/lib/auth";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import {
  cashMovementInputFromBody as parseCashMovementInput,
  partnerInputFromBody as parsePartnerInput,
  salaryPlanInputFromBody as parseSalaryPlanInput,
  type CashMovementInput,
  type PartnerInput,
  type RequestBody,
  type SalaryPlanInput,
} from "@/lib/finance-inputs";
import { parsePagination } from "@/lib/pagination";
import { periodBounds, type Period } from "@/lib/period-range";

export type { CashMovementInput, PartnerInput, SalaryPlanInput };

export async function getBalanceDashboard(companyId: number, period?: Period) {
  const [metrics, payables, cashflow] = await Promise.all([
    getAdminMetrics(companyId, period),
    getAccountsPayable(companyId),
    getCashflow(companyId),
  ]);

  return {
    metrics,
    payables,
    cashflow,
  };
}

export function salaryPlanInputFromBody(body: RequestBody): SalaryPlanInput {
  try {
    return parseSalaryPlanInput(body);
  } catch (error) {
    throw new ApiError(400, error instanceof Error ? error.message : "Datos invalidos");
  }
}

export async function createSalaryPlan(companyId: number, input: SalaryPlanInput) {
  return withCompanyContext(companyId, async (client) => {
    const duplicate = await client.query<{ id: number }>(
      `SELECT id FROM admin_sueldos_config WHERE empresa_id = $1 AND profile_id = $2::uuid LIMIT 1`,
      [companyId, input.employeeId],
    );
    if (duplicate.rows[0]) {
      throw new ApiError(409, "Ese empleado ya tiene un sueldo configurado");
    }

    const result = await client.query<{ id: number }>(
      `
        INSERT INTO admin_sueldos_config (
          empresa_id, profile_id, sueldo_mensual, modalidad, activo, aguinaldo_aplica, cargas_pct, notas
        )
        VALUES ($1, $2::uuid, $3, $4, TRUE, $5, $6, $7)
        RETURNING id
      `,
      [companyId, input.employeeId, input.monthly, input.modality, input.bonusEnabled, input.chargesPercent, input.notes],
    );

    return { id: result.rows[0].id };
  });
}

export function partnerInputFromBody(body: RequestBody): PartnerInput {
  try {
    return parsePartnerInput(body);
  } catch (error) {
    throw new ApiError(400, error instanceof Error ? error.message : "Datos invalidos");
  }
}

export async function createPartner(companyId: number, input: PartnerInput) {
  const result = await queryWithCompanyContext<{ id: number }>(
    companyId,
    `
      INSERT INTO admin_socios (empresa_id, nombre, participacion, activo, notas)
      VALUES ($1, $2, $3, TRUE, $4)
      RETURNING id
    `,
    [companyId, input.name, input.share, input.notes],
  );

  return { id: result.rows[0].id };
}

export async function getSalaryPlan(companyId: number) {
  const result = await queryWithCompanyContext<{
    id: number;
    employee_id: string | null;
    employee: string;
    monthly: string;
    modality: string;
    active: boolean;
    bonus_enabled: boolean;
    charges_percent: string;
    paid_current: string;
    notes: string;
  }>(
    companyId,
    `
      SELECT c.id,
             c.profile_id::text AS employee_id,
             COALESCE(p.full_name, p.username, c.employee_name, 'Empleado #' || c.id::text) AS employee,
             c.sueldo_mensual::text AS monthly,
             c.modalidad AS modality,
             c.activo AS active,
             COALESCE(c.aguinaldo_aplica, TRUE) AS bonus_enabled,
             COALESCE(c.cargas_pct, 0)::text AS charges_percent,
             COALESCE(c.notas, '') AS notes,
             COALESCE(SUM(m.monto) FILTER (
               WHERE m.periodo >= date_trunc('month', CURRENT_DATE)::date
                 AND m.periodo < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
                 AND m.tipo IN ('pago','retiro')
             ), 0)::text AS paid_current
      FROM admin_sueldos_config c
      LEFT JOIN profiles p ON p.id = c.profile_id
      LEFT JOIN admin_sueldo_movimientos m
        ON m.empresa_id = c.empresa_id AND m.profile_id IS NOT DISTINCT FROM c.profile_id
      WHERE c.empresa_id = $1
      GROUP BY c.id, c.profile_id, p.full_name, p.username, c.employee_name, c.sueldo_mensual,
               c.modalidad, c.activo, c.aguinaldo_aplica, c.cargas_pct, c.notas
      ORDER BY c.activo DESC, employee ASC
    `,
    [companyId],
  );

  const employees = result.rows.map((row) => {
    const monthly = Number(row.monthly);
    const bonusProvision = row.bonus_enabled ? monthly / 12 : 0;
    const charges = monthly * (Number(row.charges_percent) / 100);
    const totalCost = monthly + bonusProvision + charges;
    const paid = Number(row.paid_current);

    return {
      id: row.id,
      employeeId: row.employee_id,
      employee: row.employee,
      monthly,
      modality: row.modality,
      active: row.active,
      bonusEnabled: row.bonus_enabled,
      bonusProvision,
      chargesPercent: Number(row.charges_percent),
      charges,
      notes: row.notes,
      totalCost,
      paid,
      payable: Math.max(0, totalCost - paid),
    };
  });

  return {
    employees,
    meta: {
      activeCount: employees.filter((item) => item.active).length,
      monthlyCost: employees.filter((item) => item.active).reduce((sum, item) => sum + item.totalCost, 0),
      payable: employees.reduce((sum, item) => sum + item.payable, 0),
    },
  };
}

export async function getDividendSheet(companyId: number) {
  const result = await queryWithCompanyContext<{
    id: number;
    partner: string;
    share: string;
    active: boolean;
    owed: string;
    withdrawn: string;
  }>(
    companyId,
    `
      SELECT s.id,
             s.nombre AS partner,
             s.participacion::text AS share,
             s.activo AS active,
             COALESCE(SUM(d.monto) FILTER (WHERE d.tipo IN ('dividendo','ajuste')), 0)::text AS owed,
             COALESCE(SUM(d.monto) FILTER (WHERE d.tipo = 'retiro'), 0)::text AS withdrawn
      FROM admin_socios s
      LEFT JOIN admin_dividendos d
        ON d.empresa_id = s.empresa_id AND d.socio_id = s.id
      WHERE s.empresa_id = $1
      GROUP BY s.id, s.nombre, s.participacion, s.activo
      ORDER BY s.activo DESC, s.nombre ASC
    `,
    [companyId],
  );

  const partners = result.rows.map((row) => ({
    id: row.id,
    partner: row.partner,
    share: Number(row.share),
    active: row.active,
    owed: Number(row.owed),
    withdrawn: Number(row.withdrawn),
    balance: Number(row.owed) - Number(row.withdrawn),
  }));

  return {
    partners,
    meta: {
      totalShare: partners.filter((item) => item.active).reduce((sum, item) => sum + item.share, 0),
      owed: partners.reduce((sum, item) => sum + item.owed, 0),
      withdrawn: partners.reduce((sum, item) => sum + item.withdrawn, 0),
      balance: partners.reduce((sum, item) => sum + item.balance, 0),
    },
  };
}

export async function getTreasuryBalances(companyId: number) {
  const result = await queryWithCompanyContext<{
    account_id: string;
    account: string;
    account_type: string;
    balance: string;
    movements: string;
  }>(
    companyId,
    `
      SELECT account.id::text AS account_id,
             account.name AS account,
             account.account_type,
             (
               COALESCE(reconciliation.statement_balance, 0)
               + COALESCE(movements.signed_amount, 0)
             )::text AS balance,
             COALESCE(movements.movement_count, 0)::text AS movements
      FROM admin_treasury_accounts account
      LEFT JOIN LATERAL (
        SELECT item.statement_balance, item.reconciled_at
        FROM admin_treasury_reconciliations item
        WHERE item.empresa_id = account.empresa_id
          AND item.account_id = account.id
        ORDER BY item.reconciled_at DESC, item.id DESC
        LIMIT 1
      ) reconciliation ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(CASE WHEN movement.direction = 'inflow' THEN movement.amount ELSE -movement.amount END), 0) AS signed_amount,
               COUNT(*) AS movement_count
        FROM admin_treasury_movements movement
        WHERE movement.empresa_id = account.empresa_id
          AND movement.account_id = account.id
          AND movement.created_at > COALESCE(reconciliation.reconciled_at, '-infinity'::timestamptz)
      ) movements ON TRUE
      WHERE account.empresa_id = $1 AND account.active = TRUE
      ORDER BY account.account_type, account.name
    `,
    [companyId],
  );

  const [echeqResult, issueResult] = await Promise.all([
    queryWithCompanyContext<{
      id: string;
      cheque_number: string;
      received_from: string;
      received_from_cuit: string;
      issuer: string;
      issuer_cuit: string;
      due_date: string;
      amount: string;
      status: string;
      payment_id: string | null;
      notes: string;
    }>(
      companyId,
      `SELECT id::text, cheque_number, received_from, received_from_cuit,
              issuer, issuer_cuit, due_date::text, amount::text, status,
              payment_id::text, notes
         FROM admin_echeqs
        WHERE empresa_id = $1
          AND status IN ('accepted', 'deposited')
        ORDER BY due_date, id`,
      [companyId],
    ),
    queryWithCompanyContext<{
      payment_id: string;
      reference: string;
      payment_amount: string;
      cheque_amount: string;
      difference: string;
    }>(
      companyId,
      `SELECT payment.id::text AS payment_id,
              COALESCE(payment.reference, '') AS reference,
              payment.amount::text AS payment_amount,
              SUM(cheque.amount)::text AS cheque_amount,
              (SUM(cheque.amount) - payment.amount)::text AS difference
         FROM admin_echeqs cheque
         JOIN payments payment
           ON payment.empresa_id = cheque.empresa_id AND payment.id = cheque.payment_id
        WHERE cheque.empresa_id = $1
        GROUP BY payment.id, payment.reference, payment.amount
       HAVING ABS(SUM(cheque.amount) - payment.amount) >= 0.01
        ORDER BY payment.payment_date, payment.id`,
      [companyId],
    ),
  ]);

  const accounts = result.rows.map((row) => ({
    accountId: row.account_id,
    account: row.account,
    accountType: row.account_type,
    balance: Number(row.balance),
    movements: Number(row.movements),
  }));

  const echecks = echeqResult.rows.map((row) => ({
    id: row.id,
    number: row.cheque_number,
    receivedFrom: row.received_from,
    receivedFromCuit: row.received_from_cuit,
    issuer: row.issuer,
    issuerCuit: row.issuer_cuit,
    dueDate: row.due_date,
    amount: Number(row.amount),
    status: row.status,
    paymentId: row.payment_id,
    notes: row.notes,
  }));

  const available = accounts.reduce((sum, item) => sum + item.balance, 0);
  const echeckBalance = echecks.reduce((sum, item) => sum + item.amount, 0);

  return {
    accounts,
    echecks,
    reconciliationIssues: issueResult.rows.map((row) => ({
      paymentId: row.payment_id,
      reference: row.reference,
      paymentAmount: Number(row.payment_amount),
      echeckAmount: Number(row.cheque_amount),
      difference: Number(row.difference),
    })),
    meta: {
      total: available + echeckBalance,
      available,
      echecks: echeckBalance,
      cash: accounts.filter((item) => item.accountType === "cash").reduce((sum, item) => sum + item.balance, 0),
      bank: accounts.filter((item) => item.accountType === "bank").reduce((sum, item) => sum + item.balance, 0),
      wallet: accounts.filter((item) => item.accountType === "wallet").reduce((sum, item) => sum + item.balance, 0),
      other: accounts.filter((item) => item.accountType === "other").reduce((sum, item) => sum + item.balance, 0),
    },
  };
}

export type TreasuryAccountOption = {
  id: string;
  name: string;
  accountType: "cash" | "bank" | "wallet" | "other";
};

/** Opciones activas que pueden recibir un cobro desde Cuentas corrientes. */
export async function getTreasuryAccountOptions(companyId: number): Promise<TreasuryAccountOption[]> {
  const result = await queryWithCompanyContext<{
    id: string;
    name: string;
    account_type: TreasuryAccountOption["accountType"];
  }>(
    companyId,
    `SELECT id::text, name, account_type
       FROM admin_treasury_accounts
      WHERE empresa_id = $1 AND active = TRUE
      ORDER BY CASE account_type WHEN 'cash' THEN 1 WHEN 'bank' THEN 2 WHEN 'wallet' THEN 3 ELSE 4 END,
               name, id`,
    [companyId],
  );

  return result.rows.map((row) => ({ id: row.id, name: row.name, accountType: row.account_type }));
}

export type BankReconciliationSummary = {
  activeAccounts: number;
  importedLines: number;
  matchedLines: number;
  partialLines: number;
  pendingLines: number;
  ignoredLines: number;
  statementAmount: number;
  matchedAmount: number;
  unmatchedAmount: number;
  coveragePercent: number;
  ready: boolean;
  lastImportedAt: string | null;
};

export async function getBankReconciliationSummary(
  companyId: number,
  period: Period,
): Promise<BankReconciliationSummary> {
  const bounds = periodBounds(period);
  const result = await queryWithCompanyContext<{
    active_accounts: string;
    imported_lines: string;
    matched_lines: string;
    partial_lines: string;
    pending_lines: string;
    ignored_lines: string;
    statement_amount: string;
    matched_amount: string;
    unmatched_amount: string;
    last_imported_at: string | null;
  }>(
    companyId,
    `
      WITH accounts AS (
        SELECT COUNT(*) AS active_accounts
        FROM admin_bank_accounts
        WHERE empresa_id = $1 AND activo = TRUE
      ),
      matched AS (
        SELECT statement_line_id,
               COALESCE(SUM(matched_amount) FILTER (WHERE status = 'confirmed'), 0) AS matched_amount
        FROM admin_bank_reconciliation_matches
        WHERE empresa_id = $1
        GROUP BY statement_line_id
      ),
      lines AS (
        SELECT l.id,
               l.status,
               ABS(l.amount) AS statement_amount,
               LEAST(ABS(l.amount), COALESCE(matched.matched_amount, 0)) AS matched_amount,
               GREATEST(ABS(l.amount) - COALESCE(matched.matched_amount, 0), 0) AS unmatched_amount,
               l.created_at
        FROM admin_bank_statement_lines l
        LEFT JOIN matched ON matched.statement_line_id = l.id
        WHERE l.empresa_id = $1
          AND l.fecha >= $2::date
          AND l.fecha < $3::date
      )
      SELECT accounts.active_accounts::text,
             COUNT(lines.id)::text AS imported_lines,
             COUNT(lines.id) FILTER (WHERE lines.status = 'matched')::text AS matched_lines,
             COUNT(lines.id) FILTER (WHERE lines.status = 'partial')::text AS partial_lines,
             COUNT(lines.id) FILTER (WHERE lines.status = 'pending')::text AS pending_lines,
             COUNT(lines.id) FILTER (WHERE lines.status = 'ignored')::text AS ignored_lines,
             COALESCE(SUM(lines.statement_amount) FILTER (WHERE lines.status <> 'ignored'), 0)::text AS statement_amount,
             COALESCE(SUM(lines.matched_amount) FILTER (WHERE lines.status <> 'ignored'), 0)::text AS matched_amount,
             COALESCE(SUM(lines.unmatched_amount) FILTER (WHERE lines.status <> 'ignored'), 0)::text AS unmatched_amount,
             MAX(lines.created_at)::text AS last_imported_at
      FROM accounts
      LEFT JOIN lines ON TRUE
      GROUP BY accounts.active_accounts
    `,
    [companyId, bounds.currentStart, bounds.nextStart],
  );

  const row = result.rows[0];
  const activeAccounts = Number(row?.active_accounts ?? 0);
  const importedLines = Number(row?.imported_lines ?? 0);
  const matchedLines = Number(row?.matched_lines ?? 0);
  const partialLines = Number(row?.partial_lines ?? 0);
  const pendingLines = Number(row?.pending_lines ?? 0);
  const ignoredLines = Number(row?.ignored_lines ?? 0);
  const statementAmount = Number(row?.statement_amount ?? 0);
  const matchedAmount = Number(row?.matched_amount ?? 0);
  const unmatchedAmount = Number(row?.unmatched_amount ?? 0);
  const coveragePercent = statementAmount > 0 ? Math.min(100, (matchedAmount / statementAmount) * 100) : 0;

  return {
    activeAccounts,
    importedLines,
    matchedLines,
    partialLines,
    pendingLines,
    ignoredLines,
    statementAmount,
    matchedAmount,
    unmatchedAmount,
    coveragePercent,
    ready: activeAccounts > 0 && importedLines > 0 && partialLines === 0 && pendingLines === 0 && unmatchedAmount < 0.01,
    lastImportedAt: row?.last_imported_at ?? null,
  };
}

export type BankReconciliationWorkspace = {
  accounts: Array<{ id: string; name: string; bank: string; currency: string }>;
  lines: Array<{
    id: string;
    accountName: string;
    date: string;
    description: string;
    reference: string;
    amount: number;
    status: string;
    matchedAmount: number;
    remainingAmount: number;
  }>;
  candidates: Array<{
    id: string;
    date: string | null;
    entityName: string;
    concept: string;
    amount: number;
    remainingAmount: number;
  }>;
};

export async function getBankReconciliationWorkspace(
  companyId: number,
  period: Period,
): Promise<BankReconciliationWorkspace> {
  const bounds = periodBounds(period);
  const [accounts, lines, candidates] = await Promise.all([
    queryWithCompanyContext<{ id: string; nombre: string; banco: string; moneda: string }>(
      companyId,
      `SELECT id::text, nombre, banco, moneda
         FROM admin_bank_accounts
        WHERE empresa_id = $1 AND activo = TRUE
        ORDER BY nombre`,
      [companyId],
    ),
    queryWithCompanyContext<{
      id: string;
      account_name: string;
      fecha: string;
      descripcion: string;
      referencia: string;
      amount: string;
      status: string;
      matched_amount: string;
    }>(
      companyId,
      `SELECT l.id::text, a.nombre AS account_name, l.fecha::text, l.descripcion,
              l.referencia, l.amount::text, l.status,
              COALESCE(SUM(m.matched_amount) FILTER (WHERE m.status = 'confirmed'), 0)::text AS matched_amount
         FROM admin_bank_statement_lines l
         JOIN admin_bank_accounts a ON a.id = l.bank_account_id AND a.empresa_id = l.empresa_id
         LEFT JOIN admin_bank_reconciliation_matches m
           ON m.statement_line_id = l.id AND m.empresa_id = l.empresa_id
        WHERE l.empresa_id = $1 AND l.fecha >= $2::date AND l.fecha < $3::date
        GROUP BY l.id, a.nombre
        ORDER BY l.fecha DESC, l.id DESC`,
      [companyId, bounds.currentStart, bounds.nextStart],
    ),
    queryWithCompanyContext<{
      id: string;
      payment_date: string | null;
      entity_name: string;
      concept: string;
      amount: string;
      matched_amount: string;
    }>(
      companyId,
      `SELECT p.id::text, p.payment_date::text,
              COALESCE(NULLIF(p.entity_name, ''), 'Movimiento sin entidad') AS entity_name,
              COALESCE(NULLIF(p.concept, ''), NULLIF(p.reference, ''), p.entity_type, 'Movimiento') AS concept,
              ABS(p.amount)::text AS amount,
              COALESCE(SUM(m.matched_amount) FILTER (WHERE m.status = 'confirmed'), 0)::text AS matched_amount
         FROM payments p
         LEFT JOIN admin_bank_reconciliation_matches m
           ON m.payment_id = p.id AND m.empresa_id = p.empresa_id
        WHERE p.empresa_id = $1
          AND p.payment_date >= ($2::date - INTERVAL '45 days')
          AND p.payment_date < ($3::date + INTERVAL '45 days')
          AND COALESCE(p.status::text, '') NOT IN ('anulado', 'rechazado')
          AND ABS(p.amount) > 0
        GROUP BY p.id
       HAVING ABS(p.amount) - COALESCE(SUM(m.matched_amount) FILTER (WHERE m.status = 'confirmed'), 0) > 0.009
        ORDER BY p.payment_date DESC, p.created_at DESC
        LIMIT 120`,
      [companyId, bounds.currentStart, bounds.nextStart],
    ),
  ]);

  return {
    accounts: accounts.rows.map((row) => ({ id: row.id, name: row.nombre, bank: row.banco, currency: row.moneda })),
    lines: lines.rows.map((row) => {
      const amount = Number(row.amount);
      const matchedAmount = Number(row.matched_amount);
      return {
        id: row.id,
        accountName: row.account_name,
        date: row.fecha,
        description: row.descripcion,
        reference: row.referencia,
        amount,
        status: row.status,
        matchedAmount,
        remainingAmount: Math.max(0, Math.abs(amount) - matchedAmount),
      };
    }),
    candidates: candidates.rows.map((row) => ({
      id: row.id,
      date: row.payment_date,
      entityName: row.entity_name,
      concept: row.concept,
      amount: Number(row.amount),
      remainingAmount: Math.max(0, Number(row.amount) - Number(row.matched_amount)),
    })),
  };
}

export async function createBankAccount(session: AuthSession, input: { name: string; bank: string; currency: string }) {
  const name = input.name.trim();
  if (!name) throw new ApiError(400, "Ingresá un nombre para la cuenta");
  const currency = input.currency.trim().toUpperCase() || "ARS";
  await queryWithCompanyContext(
    session.companyId,
    `INSERT INTO admin_bank_accounts (empresa_id, nombre, banco, moneda)
     VALUES ($1, $2, $3, $4)`,
    [session.companyId, name, input.bank.trim(), currency],
  );
}

export async function createBankStatementLine(session: AuthSession, input: {
  accountId: string;
  date: string;
  description: string;
  reference: string;
  movementType: "credit" | "debit";
  amount: number;
}) {
  if (!/^\d+$/.test(input.accountId)) throw new ApiError(400, "Cuenta bancaria inválida");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new ApiError(400, "Fecha inválida");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new ApiError(400, "El importe debe ser mayor a cero");
  const result = await queryWithCompanyContext<{ id: string }>(
    session.companyId,
    `INSERT INTO admin_bank_statement_lines
       (empresa_id, bank_account_id, fecha, descripcion, referencia, debit, credit, amount, imported_by)
     SELECT $1, id, $3::date, $4, $5,
            CASE WHEN $6 = 'debit' THEN $7 ELSE 0 END,
            CASE WHEN $6 = 'credit' THEN $7 ELSE 0 END,
            CASE WHEN $6 = 'debit' THEN -$7 ELSE $7 END,
            $8
       FROM admin_bank_accounts
      WHERE id = $2::bigint AND empresa_id = $1 AND activo = TRUE`,
    [session.companyId, input.accountId, input.date, input.description.trim(), input.reference.trim(), input.movementType, input.amount, session.username],
  );
  if (result.rowCount !== 1) throw new ApiError(404, "No se encontró la cuenta bancaria activa");
}

export async function matchBankStatementLine(session: AuthSession, input: {
  lineId: string;
  paymentId: string;
  amount: number;
  notes: string;
}) {
  if (!/^\d+$/.test(input.lineId)) throw new ApiError(400, "Movimiento bancario inválido");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new ApiError(400, "El importe conciliado debe ser mayor a cero");

  await withCompanyContext(session.companyId, async (client) => {
    const lineResult = await client.query<{ amount: string }>(
      `SELECT amount::text FROM admin_bank_statement_lines
        WHERE id = $1::bigint AND empresa_id = $2 FOR UPDATE`,
      [input.lineId, session.companyId],
    );
    const paymentResult = await client.query<{ amount: string }>(
      `SELECT ABS(amount)::text AS amount FROM payments
        WHERE id = $1::uuid AND empresa_id = $2 FOR UPDATE`,
      [input.paymentId, session.companyId],
    );
    if (!lineResult.rows[0] || !paymentResult.rows[0]) throw new ApiError(404, "No se encontró el movimiento a conciliar");

    const lineMatched = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(matched_amount) FILTER (WHERE status = 'confirmed'), 0)::text AS total
         FROM admin_bank_reconciliation_matches WHERE empresa_id = $1 AND statement_line_id = $2::bigint`,
      [session.companyId, input.lineId],
    );
    const paymentMatched = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(matched_amount) FILTER (WHERE status = 'confirmed'), 0)::text AS total
         FROM admin_bank_reconciliation_matches WHERE empresa_id = $1 AND payment_id = $2::uuid`,
      [session.companyId, input.paymentId],
    );
    const lineRemaining = Math.abs(Number(lineResult.rows[0].amount)) - Number(lineMatched.rows[0]?.total ?? 0);
    const paymentRemaining = Number(paymentResult.rows[0].amount) - Number(paymentMatched.rows[0]?.total ?? 0);
    if (input.amount - lineRemaining > 0.009 || input.amount - paymentRemaining > 0.009) {
      throw new ApiError(409, "El importe supera el saldo disponible del extracto o del movimiento interno");
    }

    await client.query(
      `INSERT INTO admin_bank_reconciliation_matches
         (empresa_id, statement_line_id, payment_id, matched_amount, notas, created_by)
       VALUES ($1, $2::bigint, $3::uuid, $4, $5, $6)
       ON CONFLICT (statement_line_id, payment_id) DO UPDATE
         SET matched_amount = admin_bank_reconciliation_matches.matched_amount + EXCLUDED.matched_amount,
             status = 'confirmed',
             notas = EXCLUDED.notas,
             created_by = EXCLUDED.created_by`,
      [session.companyId, input.lineId, input.paymentId, input.amount, input.notes.trim(), session.username],
    );
    const remaining = lineRemaining - input.amount;
    await client.query(
      `UPDATE admin_bank_statement_lines SET status = $1, updated_at = now()
        WHERE id = $2::bigint AND empresa_id = $3`,
      [remaining < 0.01 ? "matched" : "partial", input.lineId, session.companyId],
    );
  });
}

export async function updateSalaryPlan(companyId: number, id: number, input: SalaryPlanInput) {
  const result = await queryWithCompanyContext(
    companyId,
    `
      UPDATE admin_sueldos_config
      SET sueldo_mensual = $3,
          modalidad = $4,
          aguinaldo_aplica = $5,
          cargas_pct = $6,
          notas = $7,
          updated_at = NOW()
      WHERE empresa_id = $1 AND id = $2
    `,
    [companyId, id, input.monthly, input.modality, input.bonusEnabled, input.chargesPercent, input.notes],
  );
  if (result.rowCount === 0) throw new ApiError(404, "Configuración salarial no encontrada");
}

export async function setSalaryPlanActive(companyId: number, id: number, active: boolean) {
  const result = await queryWithCompanyContext(
    companyId,
    "UPDATE admin_sueldos_config SET activo = $3, updated_at = NOW() WHERE empresa_id = $1 AND id = $2",
    [companyId, id, active],
  );
  if (result.rowCount === 0) throw new ApiError(404, "Configuración salarial no encontrada");
}

export async function ignoreBankStatementLine(session: AuthSession, lineId: string, reason: string) {
  if (!/^\d+$/.test(lineId)) throw new ApiError(400, "Movimiento bancario inválido");
  if (!reason.trim()) throw new ApiError(400, "Indicá por qué no corresponde conciliarlo");
  const result = await queryWithCompanyContext<{ id: string }>(
    session.companyId,
    `UPDATE admin_bank_statement_lines l
        SET status = 'ignored', notas = $3, updated_at = now()
      WHERE l.id = $1::bigint AND l.empresa_id = $2
        AND NOT EXISTS (
          SELECT 1 FROM admin_bank_reconciliation_matches m
           WHERE m.empresa_id = l.empresa_id AND m.statement_line_id = l.id AND m.status = 'confirmed'
        )
      RETURNING l.id::text`,
    [lineId, session.companyId, reason.trim()],
  );
  if (!result.rows[0]) throw new ApiError(409, "Un movimiento parcialmente conciliado no puede ignorarse");
}

export function cashMovementInputFromBody(body: RequestBody): CashMovementInput {
  try {
    return parseCashMovementInput(body);
  } catch (error) {
    throw new ApiError(400, error instanceof Error ? error.message : "Datos invalidos");
  }
}

export async function createCashMovement(session: AuthSession, input: CashMovementInput) {
  const result = await queryWithCompanyContext<{ id: string }>(
    session.companyId,
    `
      INSERT INTO admin_treasury_movements (
        empresa_id, account_id, movement_date, direction, amount,
        concept, notes, created_by
      )
      SELECT $1, account.id, $3::date, $4, $5, $6, $7, $8::uuid
        FROM admin_treasury_accounts account
       WHERE account.id = $2::bigint AND account.empresa_id = $1 AND account.active = TRUE
      RETURNING id::text
    `,
    [
      session.companyId,
      input.accountId,
      input.date,
      input.direction === "entrada" ? "inflow" : "outflow",
      input.amount,
      input.concept,
      input.notes,
      session.userId,
    ],
  );

  if (!result.rows[0]) throw new ApiError(404, "La cuenta de tesoreria no existe o esta inactiva");

  return { id: result.rows[0].id };
}

export async function settleEcheq(session: AuthSession, input: {
  echeqId: string;
  accountId: string;
  settlementDate: string;
}) {
  if (!/^\d+$/.test(input.echeqId) || !/^\d+$/.test(input.accountId)) {
    throw new ApiError(400, "E-cheq o cuenta invalida");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.settlementDate)) {
    throw new ApiError(400, "La fecha de acreditacion es invalida");
  }

  return withCompanyContext(session.companyId, async (client) => {
    const cheque = await client.query<{ id: string; amount: string; cheque_number: string }>(
      `SELECT id::text, amount::text, cheque_number
         FROM admin_echeqs
        WHERE id = $1::bigint AND empresa_id = $2 AND status IN ('accepted', 'deposited')
        FOR UPDATE`,
      [input.echeqId, session.companyId],
    );
    if (!cheque.rows[0]) throw new ApiError(409, "El E-cheq ya fue procesado o no existe");

    const account = await client.query<{ id: string }>(
      `SELECT id::text FROM admin_treasury_accounts
        WHERE id = $1::bigint AND empresa_id = $2 AND active = TRUE
          AND account_type IN ('bank', 'wallet')`,
      [input.accountId, session.companyId],
    );
    if (!account.rows[0]) throw new ApiError(400, "Elegí una cuenta bancaria o billetera activa");

    await client.query(
      `INSERT INTO admin_treasury_movements (
         empresa_id, account_id, movement_date, direction, amount, concept,
         source_type, source_id, reference, notes, created_by
       ) VALUES ($1, $2::bigint, $3::date, 'inflow', $4, $5,
                 'echeq_settlement', $6, $7, $8, $9::uuid)`,
      [
        session.companyId,
        input.accountId,
        input.settlementDate,
        cheque.rows[0].amount,
        `Acreditación E-cheq ${cheque.rows[0].cheque_number}`,
        cheque.rows[0].id,
        cheque.rows[0].cheque_number,
        "Traspaso de E-cheq en cartera a saldo disponible",
        session.userId,
      ],
    );

    await client.query(
      `UPDATE admin_echeqs
          SET status = 'cleared', deposited_to_account_id = $1::bigint,
              settled_on = $2::date, updated_at = now()
        WHERE id = $3::bigint AND empresa_id = $4`,
      [input.accountId, input.settlementDate, input.echeqId, session.companyId],
    );

    return { id: cheque.rows[0].id };
  });
}

const CASH_MOVEMENT_ENTITY_TYPES = ["caja_entrada", "caja_salida", "pago", "compra_aprobada"];

const CASH_MOVEMENT_LABELS: Record<string, string> = {
  caja_entrada: "Entrada manual",
  caja_salida: "Salida manual",
  pago: "Pago a proveedor",
  compra_aprobada: "Compra aprobada (pendiente de pago)",
};

export async function getCashMovements(input: {
  companyId: number;
  page?: string | null;
  pageSize?: string | null;
}) {
  const pagination = parsePagination(input);

  const count = await queryWithCompanyContext<{ total: string }>(
    input.companyId,
    `SELECT (
       (SELECT COUNT(*) FROM payments WHERE empresa_id = $1 AND entity_type = ANY($2))
       + (SELECT COUNT(*) FROM admin_treasury_movements WHERE empresa_id = $1)
     )::text AS total`,
    [input.companyId, CASH_MOVEMENT_ENTITY_TYPES],
  );

  const rows = await queryWithCompanyContext<{
    id: string;
    entity_type: string;
    entidad_nombre: string;
    concepto: string;
    monto: string;
    fecha: string | null;
    notas: string;
  }>(
    input.companyId,
    `
      SELECT id, entity_type, entidad_nombre, concepto, monto, fecha, notas
      FROM (
        SELECT payment.id::text AS id, payment.entity_type,
               payment.entity_name AS entidad_nombre,
               COALESCE(payment.concept, payment.reference, '') AS concepto,
               payment.amount::text AS monto, payment.payment_date::text AS fecha,
               payment.notes AS notas, payment.created_at AS sort_at
        FROM payments payment
        WHERE payment.empresa_id = $1 AND payment.entity_type = ANY($2)

        UNION ALL

        SELECT movement.id::text,
               CASE WHEN movement.direction = 'inflow' THEN 'caja_entrada' ELSE 'caja_salida' END,
               account.name,
               movement.concept,
               movement.amount::text,
               movement.movement_date::text,
               movement.notes,
               movement.created_at
        FROM admin_treasury_movements movement
        JOIN admin_treasury_accounts account
          ON account.empresa_id = movement.empresa_id AND account.id = movement.account_id
        WHERE movement.empresa_id = $1
      ) movement_rows
      ORDER BY sort_at DESC
      LIMIT $3 OFFSET $4
    `,
    [input.companyId, CASH_MOVEMENT_ENTITY_TYPES, pagination.pageSize, pagination.offset],
  );

  const total = Number(count.rows[0]?.total ?? 0);
  return {
    data: rows.rows.map((row) => {
      const affectsBalance = row.entity_type !== "compra_aprobada";
      const signedAmount =
        row.entity_type === "caja_entrada" ? Number(row.monto) : affectsBalance ? -Number(row.monto) : Number(row.monto);
      return {
        id: row.id,
        type: row.entity_type,
        typeLabel: CASH_MOVEMENT_LABELS[row.entity_type] ?? row.entity_type,
        entityName: row.entidad_nombre,
        concept: row.concepto,
        amount: Number(row.monto),
        signedAmount,
        affectsBalance,
        date: row.fecha,
        notes: row.notas,
      };
    }),
    meta: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
    },
  };
}

export async function getMovementRegister(input: {
  companyId: number;
  type?: string | null;
  page?: string | null;
  pageSize?: string | null;
}) {
  const pagination = parsePagination(input);
  const type = input.type?.trim() ?? "";
  const normalizedType = ["cobro", "pago", "auditoria"].includes(type) ? type : "";

  const rows = await queryWithCompanyContext<{
    id: string;
    tipo: string;
    entidad_nombre: string;
    concepto: string;
    monto: string;
    fecha: string | null;
    comprobante_nombre: string;
    notas: string;
    total_count: string;
  }>(
    input.companyId,
    `
      WITH movement_rows AS (
        SELECT id::text AS id,
               entity_type AS tipo,
               entity_name AS entidad_nombre,
               COALESCE(concept, reference, '') AS concepto,
               amount::text AS monto,
               payment_date::text AS fecha,
               receipt_url AS comprobante_nombre,
               notes AS notas,
               created_at AS sort_at
        FROM payments
        WHERE empresa_id = $1

        UNION ALL

        SELECT a.id::text AS id,
               'auditoria' AS tipo,
               COALESCE(p.full_name, p.username, a.actor_id::text, 'Sistema') AS entidad_nombre,
               CONCAT_WS(' - ', NULLIF(a.action, ''), NULLIF(a.entity_table, ''), NULLIF(a.entity_id, '')) AS concepto,
               '0' AS monto,
               a.created_at::text AS fecha,
               '' AS comprobante_nombre,
               COALESCE(a.new_data::text, '') AS notas,
               a.created_at AS sort_at
        FROM audit_log a
        LEFT JOIN profiles p ON p.id = a.actor_id
        WHERE a.empresa_id = $1

        UNION ALL

        SELECT s.id::text AS id,
               'auditoria' AS tipo,
               COALESCE(NULLIF(s.employee, ''), 'Sistema') AS entidad_nombre,
               CONCAT_WS(' - ', NULLIF(s.action, ''), NULLIF(s.sale_label, '')) AS concepto,
               '0' AS monto,
               s.created_at::text AS fecha,
               '' AS comprobante_nombre,
               COALESCE(s.changes::text, '') AS notas,
               s.created_at AS sort_at
        FROM sales_admin_audit s
        WHERE s.empresa_id = $1
      )
      SELECT id, tipo, entidad_nombre, concepto, monto, fecha, comprobante_nombre, notas,
             COUNT(*) OVER()::text AS total_count
      FROM movement_rows
      WHERE ($2 = '' OR tipo = $2)
      ORDER BY sort_at DESC
      LIMIT $3 OFFSET $4
    `,
    [input.companyId, normalizedType, pagination.pageSize, pagination.offset],
  );

  const total = Number(rows.rows[0]?.total_count ?? 0);
  return {
    data: rows.rows.map((row) => ({
      id: row.id,
      type: row.tipo,
      entityName: row.entidad_nombre,
      concept: row.concepto,
      amount: Number(row.monto),
      date: row.fecha,
      receiptUrl: row.comprobante_nombre,
      notes: row.notas,
    })),
    meta: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
    },
  };
}
