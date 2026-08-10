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
import type { Period } from "@/lib/period-range";

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
               c.modalidad, c.activo, c.aguinaldo_aplica, c.cargas_pct
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
    account: string;
    account_type: string;
    balance: string;
    movements: string;
  }>(
    companyId,
    `
      WITH collection_accounts AS (
        SELECT
          COALESCE(NULLIF(collection_destination, ''), CASE
            WHEN collection_method = 'efectivo' THEN 'Efectivo'
            WHEN collection_method = 'transferencia' THEN 'Cuenta bancaria'
            ELSE 'Otra'
          END) AS account,
          CASE
            WHEN collection_method = 'efectivo' THEN 'efectivo'
            WHEN collection_method = 'transferencia' THEN 'bancaria'
            ELSE 'otra'
          END AS account_type,
          COALESCE(collection_registered_amount, total_amount) AS amount
        FROM sales
        WHERE empresa_id = $1
          AND COALESCE(collection_status, 'pendiente') = 'recibido'
      ),
      provider_payments AS (
        SELECT 'Pagos proveedores aprobados' AS account,
               'otra' AS account_type,
               -amount AS amount
        FROM payments
        WHERE empresa_id = $1 AND entity_type = 'pago'
      ),
      bank_lines AS (
        SELECT COALESCE(a.nombre, 'Banco') AS account,
               'bancaria' AS account_type,
               l.amount
        FROM admin_bank_statement_lines l
        JOIN admin_bank_accounts a ON a.id = l.bank_account_id AND a.empresa_id = l.empresa_id
        WHERE l.empresa_id = $1 AND l.status <> 'ignored'
      ),
      manual_cash_movements AS (
        SELECT 'Movimientos manuales de caja' AS account,
               'efectivo' AS account_type,
               CASE WHEN entity_type = 'caja_entrada' THEN amount ELSE -amount END AS amount
        FROM payments
        WHERE empresa_id = $1 AND entity_type IN ('caja_entrada', 'caja_salida')
      )
      SELECT account,
             account_type,
             COALESCE(SUM(amount), 0)::text AS balance,
             COUNT(*)::text AS movements
      FROM (
        SELECT * FROM collection_accounts
        UNION ALL
        SELECT * FROM provider_payments
        UNION ALL
        SELECT * FROM bank_lines
        UNION ALL
        SELECT * FROM manual_cash_movements
      ) data
      GROUP BY account, account_type
      ORDER BY account_type ASC, account ASC
    `,
    [companyId],
  );

  const accounts = result.rows.map((row) => ({
    account: row.account,
    accountType: row.account_type,
    balance: Number(row.balance),
    movements: Number(row.movements),
  }));

  return {
    accounts,
    meta: {
      total: accounts.reduce((sum, item) => sum + item.balance, 0),
      cash: accounts.filter((item) => item.accountType === "efectivo").reduce((sum, item) => sum + item.balance, 0),
      bank: accounts.filter((item) => item.accountType === "bancaria").reduce((sum, item) => sum + item.balance, 0),
      other: accounts.filter((item) => item.accountType === "otra").reduce((sum, item) => sum + item.balance, 0),
    },
  };
}

export function cashMovementInputFromBody(body: RequestBody): CashMovementInput {
  try {
    return parseCashMovementInput(body);
  } catch (error) {
    throw new ApiError(400, error instanceof Error ? error.message : "Datos invalidos");
  }
}

export async function createCashMovement(session: AuthSession, input: CashMovementInput) {
  const entityType = input.direction === "entrada" ? "caja_entrada" : "caja_salida";

  const result = await queryWithCompanyContext<{ id: string }>(
    session.companyId,
    `
      INSERT INTO payments (
        payment_date, amount, method, status, registered_by,
        entity_type, concept, notes, empresa_id
      )
      VALUES ($1, $2, 'ajuste_caja', 'registrado', $3::uuid, $4, $5, $6, $7)
      RETURNING id::text AS id
    `,
    [input.date, input.amount, session.userId, entityType, input.concept, input.notes, session.companyId],
  );

  return { id: result.rows[0].id };
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
    `SELECT COUNT(*)::text AS total FROM payments WHERE empresa_id = $1 AND entity_type = ANY($2)`,
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
      SELECT id::text AS id, entity_type, entity_name AS entidad_nombre,
             COALESCE(concept, reference, '') AS concepto,
             amount::text AS monto, payment_date::text AS fecha, notes AS notas
      FROM payments
      WHERE empresa_id = $1 AND entity_type = ANY($2)
      ORDER BY payment_date DESC NULLS LAST, created_at DESC
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
