import { getAccountsPayable, getAdminMetrics, getCashflow } from "@/lib/admin-metrics";
import { queryWithCompanyContext } from "@/lib/db";
import { parsePagination } from "@/lib/pagination";

export async function getBalanceDashboard(companyId: number) {
  const [metrics, payables, cashflow] = await Promise.all([
    getAdminMetrics(companyId),
    getAccountsPayable(companyId),
    getCashflow(companyId),
  ]);

  return {
    metrics,
    payables,
    cashflow,
  };
}

export async function getSalaryPlan(companyId: number) {
  const result = await queryWithCompanyContext<{
    id: number;
    employee_id: number | null;
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
             c.id_usuario AS employee_id,
             COALESCE(u.nombre_completo, u.usuario, 'Empleado #' || c.id_usuario::text) AS employee,
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
      LEFT JOIN usuarios u ON u.id = c.id_usuario
      LEFT JOIN admin_sueldo_movimientos m
        ON m.empresa_id = c.empresa_id AND m.id_usuario = c.id_usuario
      WHERE c.empresa_id = $1
      GROUP BY c.id, c.id_usuario, u.nombre_completo, u.usuario, c.sueldo_mensual,
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
          COALESCE(NULLIF(cobro_destino, ''), CASE
            WHEN cobro_metodo = 'efectivo' THEN 'Efectivo'
            WHEN cobro_metodo = 'transferencia' THEN 'Cuenta bancaria'
            ELSE 'Otra'
          END) AS account,
          CASE
            WHEN cobro_metodo = 'efectivo' THEN 'efectivo'
            WHEN cobro_metodo = 'transferencia' THEN 'bancaria'
            ELSE 'otra'
          END AS account_type,
          COALESCE(cobro_monto_registrado, monto) AS amount
        FROM ventas
        WHERE empresa_id = $1
          AND COALESCE(estado_cobro, 'pendiente') = 'recibido'
      ),
      provider_payments AS (
        SELECT 'Pagos proveedores aprobados' AS account,
               'otra' AS account_type,
               -monto AS amount
        FROM pagos_registro
        WHERE empresa_id = $1 AND tipo = 'pago'
      ),
      bank_lines AS (
        SELECT COALESCE(a.nombre, 'Banco') AS account,
               'bancaria' AS account_type,
               l.amount
        FROM admin_bank_statement_lines l
        JOIN admin_bank_accounts a ON a.id = l.bank_account_id AND a.empresa_id = l.empresa_id
        WHERE l.empresa_id = $1 AND l.status <> 'ignored'
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

export async function getMovementRegister(input: {
  companyId: number;
  type?: string | null;
  page?: string | null;
  pageSize?: string | null;
}) {
  const pagination = parsePagination(input);
  const type = input.type?.trim() ?? "";
  const params: unknown[] = [input.companyId];
  const paymentFilter = type && ["cobro", "pago"].includes(type) ? `AND tipo = $2` : "";
  if (paymentFilter) params.push(type);

  const count = await queryWithCompanyContext<{ total: string }>(
    input.companyId,
    `SELECT COUNT(*)::text AS total FROM pagos_registro WHERE empresa_id = $1 ${paymentFilter}`,
    params,
  );

  const rows = await queryWithCompanyContext<{
    id: number;
    tipo: string;
    entidad_nombre: string;
    concepto: string;
    monto: string;
    fecha: string | null;
    comprobante_nombre: string;
    notas: string;
  }>(
    input.companyId,
    `
      SELECT id, tipo, entidad_nombre, concepto, monto::text, fecha::text,
             comprobante_nombre, notas
      FROM pagos_registro
      WHERE empresa_id = $1 ${paymentFilter}
      ORDER BY fecha DESC NULLS LAST, id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `,
    [...params, pagination.pageSize, pagination.offset],
  );

  const total = Number(count.rows[0]?.total ?? 0);
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
