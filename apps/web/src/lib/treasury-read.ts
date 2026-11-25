import {afterReconciliationSql} from './treasury-cutoff';
import { queryWithCompanyContext } from '@/lib/db';
import { localDateIso } from '@/lib/timezone';

export const validCustomerPaymentSql = (alias: string) => `COALESCE(${alias}.status::text, 'registrado') = 'registrado'
  AND COALESCE(${alias}.entity_type, 'cliente') = 'cliente'`;

export async function readTreasuryAccounts(companyId: number, asOf = localDateIso()) {
  const result = await queryWithCompanyContext<{
    account_id: string; account: string; account_type: string; balance: string;
    movements: string; statement_date: string | null; future_amount: string; operating_outflows: string;
  }>(companyId, `
    SELECT account.id::text AS account_id, account.name AS account, account.account_type,
      (COALESCE(reconciliation.statement_balance, 0) + COALESCE(movements.signed_amount, 0))::text AS balance,
      COALESCE(movements.movement_count, 0)::text AS movements,
      reconciliation.statement_date::text,
      COALESCE(movements.future_amount, 0)::text AS future_amount,
      COALESCE(movements.operating_outflows, 0)::text AS operating_outflows
    FROM admin_treasury_accounts account
    LEFT JOIN LATERAL (
      SELECT item.statement_balance, item.reconciled_at, item.statement_date
      FROM admin_treasury_reconciliations item
      WHERE item.empresa_id = account.empresa_id AND item.account_id = account.id
        AND item.statement_date <= $2::date
      ORDER BY item.reconciled_at DESC, item.id DESC LIMIT 1
    ) reconciliation ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(CASE WHEN movement.direction = 'inflow' THEN movement.amount ELSE -movement.amount END)
          FILTER (WHERE movement.movement_date <= $2::date) AS signed_amount,
        COUNT(*) FILTER (WHERE movement.movement_date <= $2::date) AS movement_count,
        SUM(CASE WHEN movement.direction = 'inflow' THEN movement.amount ELSE -movement.amount END)
          FILTER (WHERE movement.movement_date > $2::date) AS future_amount,
        COUNT(*) FILTER (WHERE movement.movement_date <= $2::date AND movement.direction = 'outflow'
          AND movement.source_type <> 'customer_payment_void') AS operating_outflows
      FROM admin_treasury_movements movement
      WHERE movement.empresa_id = account.empresa_id AND movement.account_id = account.id
        AND ${afterReconciliationSql('movement','reconciliation')}
    ) movements ON TRUE
    WHERE account.empresa_id = $1 AND account.active = TRUE
    ORDER BY account.account_type, account.name`, [companyId, asOf]);
  return result.rows;
}

export async function getCollectionsBreakdown(companyId: number, start: string, endExclusive: string, asOf = localDateIso()) {
  const result = await queryWithCompanyContext<{ total: string; cheques: string; cancelled: string }>(companyId, `
    SELECT COALESCE(SUM(p.amount) FILTER (WHERE ${validCustomerPaymentSql('p')}), 0)::text AS total,
      COALESCE(SUM(p.amount) FILTER (WHERE ${validCustomerPaymentSql('p')}
        AND LOWER(p.method) IN ('echeck', 'echeq', 'cheque')), 0)::text AS cheques,
      COALESCE(SUM(p.amount) FILTER (WHERE p.status::text = 'anulado'
        AND COALESCE(p.entity_type, 'cliente') = 'cliente'), 0)::text AS cancelled
    FROM payments p WHERE p.empresa_id = $1 AND p.payment_date >= $2::date
      AND p.payment_date < $3::date AND p.payment_date <= $4::date`, [companyId, start, endExclusive, asOf]);
  const row = result.rows[0];
  const total = Number(row?.total ?? 0), cheques = Number(row?.cheques ?? 0);
  return { total, cheques, otherMethods: Math.round((total - cheques) * 100) / 100, cancelled: Number(row?.cancelled ?? 0), asOf };
}
