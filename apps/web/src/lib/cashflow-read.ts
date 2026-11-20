import { queryWithCompanyContext } from '@/lib/db';
import { activeAccountMovementWhereSql } from '@/lib/accounts';
import { localDateIso } from '@/lib/timezone';
import { summarizeCashProjection } from '@/lib/cash-projection';
import { readTreasuryAccounts } from '@/lib/treasury-read';
import { SALE_DUE_DATE_SQL } from '@/lib/customer-account-due-date';

export async function getCashflowSnapshot(companyId: number, asOf = localDateIso()) {
  const [accounts, result] = await Promise.all([
    readTreasuryAccounts(companyId, asOf),
    queryWithCompanyContext<{ id: string; label: string; amount: string; date: string | null; kind: string; source: string }>(companyId, `
      WITH ledger AS (
        SELECT m.client_id, m.sale_id, m.debit - m.credit AS amount
        FROM current_account_movements m
        LEFT JOIN sales s ON s.id=m.sale_id AND s.empresa_id=m.empresa_id
        WHERE m.empresa_id=$1 AND m.entity_type='cliente' AND m.client_id IS NOT NULL
          AND ${activeAccountMovementWhereSql('m', 's')}
      ), account_balances AS (
        SELECT client_id, SUM(amount) AS balance FROM ledger GROUP BY client_id
      ), sale_balances AS (
        SELECT client_id, sale_id, SUM(amount) AS balance FROM ledger WHERE sale_id IS NOT NULL
        GROUP BY client_id, sale_id HAVING SUM(amount) > 0.005
      ), open_totals AS (
        SELECT client_id, SUM(balance) AS total FROM sale_balances GROUP BY client_id
      ), matched AS (
        SELECT a.*, ABS(a.balance - COALESCE(o.total,0)) < 0.005 AS reconciled
        FROM account_balances a LEFT JOIN open_totals o USING(client_id)
      ), scheduled AS (
        SELECT p.id AS purchase_id, req.id::text AS id, req.titulo AS label,
          NULLIF(req.metadata->>'date','')::date AS date,
          LEAST(GREATEST(p.total_amount-COALESCE(p.paid_amount,0)-COALESCE(SUM(
            GREATEST(COALESCE(NULLIF(req.metadata->>'amount','')::numeric,req.monto,0),0)
          ) OVER (PARTITION BY p.id ORDER BY req.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0),0),
          GREATEST(COALESCE(NULLIF(req.metadata->>'amount','')::numeric,req.monto,0),0)) AS amount
        FROM app_solicitudes req JOIN purchases p ON req.metadata->>'purchaseId'=p.id::text AND p.empresa_id=req.empresa_id
        WHERE req.empresa_id=$1 AND req.estado='pendiente' AND req.metadata->>'action'='supplier_payment'
          AND p.status <> 'cancelada'
      ), flows AS (
        SELECT 'sale:'||s.id::text AS id, COALESCE(c.display_name,s.client_name,'Cliente')||' · '||COALESCE(s.sale_number,s.id::text) AS label,
          b.balance AS amount, ${SALE_DUE_DATE_SQL} AS date, 'inflow' AS kind, 'remito' AS source
        FROM sale_balances b JOIN matched a ON a.client_id=b.client_id AND a.reconciled
        JOIN sales s ON s.id=b.sale_id AND s.empresa_id=$1
        LEFT JOIN clients c ON c.id=b.client_id AND c.empresa_id=$1
        UNION ALL
        SELECT 'account:'||a.client_id::text, COALESCE(c.display_name,'Cliente')||' · imputación a revisar',
          a.balance, NULL::date, 'inflow', 'cuenta_sin_imputar'
        FROM matched a LEFT JOIN clients c ON c.id=a.client_id AND c.empresa_id=$1
        WHERE NOT a.reconciled AND a.balance>0.005
        UNION ALL
        SELECT 'credit:'||a.client_id::text, COALESCE(c.display_name,'Cliente')||' · saldo a favor',
          -a.balance, NULL::date, 'credit', 'saldo_a_favor'
        FROM matched a LEFT JOIN clients c ON c.id=a.client_id AND c.empresa_id=$1 WHERE a.balance < -0.005
        UNION ALL
        SELECT 'purchase:'||p.id::text, COALESCE(s.display_name,'Proveedor')||' · '||COALESCE(NULLIF(p.purchase_number,''),'Compra sin número'),
          GREATEST(p.total_amount-COALESCE(p.paid_amount,0)-COALESCE(sc.amount,0),0), p.due_date, 'outflow', 'proveedor'
        FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id AND s.empresa_id=p.empresa_id
        LEFT JOIN (SELECT purchase_id,SUM(amount) AS amount FROM scheduled GROUP BY purchase_id) sc ON sc.purchase_id=p.id
        WHERE p.empresa_id=$1 AND p.status <> 'cancelada'
        UNION ALL
        SELECT 'scheduled:'||id,COALESCE(label,'Pago proveedor programado'),amount,date,'outflow','proveedor_programado' FROM scheduled
        UNION ALL
        SELECT 'echeq-in:'||id::text,'E-cheq '||cheque_number||' · '||received_from,amount,due_date,'inflow','cheque_recibido'
        FROM admin_echeqs WHERE empresa_id=$1 AND status IN ('accepted','deposited')
        UNION ALL
        SELECT 'echeq-out:'||id::text,'E-cheq '||cheque_number||' · '||beneficiary,amount,due_date,'outflow','cheque_emitido'
        FROM admin_outgoing_echeqs WHERE empresa_id=$1 AND status IN ('issued','accepted')
        UNION ALL
        SELECT 'movement:'||m.id::text,m.concept,m.amount,m.movement_date,m.direction,'movimiento_futuro'
        FROM admin_treasury_movements m JOIN admin_treasury_accounts a ON a.id=m.account_id AND a.empresa_id=m.empresa_id AND a.active
        WHERE m.empresa_id=$1 AND m.movement_date>$2::date
          AND m.created_at>COALESCE((SELECT MAX(r.reconciled_at) FROM admin_treasury_reconciliations r
            WHERE r.empresa_id=m.empresa_id AND r.account_id=m.account_id AND r.statement_date<=$2::date),'-infinity'::timestamptz)
        UNION ALL
        SELECT 'salary:'||c.id::text,COALESCE(p.full_name,p.username,c.employee_name,'Empleado')||' · estimación mensual',
          GREATEST(c.sueldo_mensual + CASE WHEN COALESCE(c.aguinaldo_aplica,TRUE) THEN c.sueldo_mensual/12 ELSE 0 END
            +c.sueldo_mensual*COALESCE(c.cargas_pct,0)/100-COALESCE(paid.amount,0),0),
          (date_trunc('month',$2::date)+INTERVAL '1 month')::date,'outflow','sueldo_estimado'
        FROM admin_sueldos_config c LEFT JOIN profiles p ON p.id=c.profile_id
        LEFT JOIN LATERAL (SELECT SUM(m.monto) AS amount FROM admin_sueldo_movimientos m
          WHERE m.empresa_id=c.empresa_id AND c.profile_id IS NOT NULL AND m.profile_id=c.profile_id
            AND m.periodo>=date_trunc('month',$2::date) AND m.periodo<date_trunc('month',$2::date)+INTERVAL '1 month'
            AND m.tipo IN ('pago','retiro')) paid ON TRUE
        WHERE c.empresa_id=$1 AND c.activo
        UNION ALL
        SELECT 'tax:'||id::text,impuesto||' · '||periodo::text,monto_estimado,vencimiento,'outflow','impuesto'
        FROM admin_obligaciones_fiscales WHERE empresa_id=$1 AND estado IN ('pendiente','vencido','revisar')
      ) SELECT id,label,amount::text,date::text,kind,source FROM flows WHERE amount>0.005 ORDER BY date NULLS LAST,id
    `, [companyId, asOf]),
  ]);
  const rows = result.rows.map(row => ({ ...row, amount: Number(row.amount) }));
  const items = rows.filter(row => row.kind !== 'credit');
  const openingBalance = accounts.reduce((sum,row)=>sum+Math.round(Number(row.balance)*100),0)/100;
  const meta = summarizeCashProjection(items, openingBalance, asOf);
  const calendar = Array.from(items.reduce((map,item)=>{
    const key=item.date ?? 'sin_fecha';
    const day=map.get(key) ?? {date:item.date,inflow:0,outflow:0,net:0,items:[] as typeof items};
    if(item.kind==='inflow') day.inflow=Math.round((day.inflow+item.amount)*100)/100;
    else day.outflow=Math.round((day.outflow+item.amount)*100)/100;
    day.net=Math.round((day.inflow-day.outflow)*100)/100; day.items.push(item); map.set(key,day); return map;
  },new Map<string,{date:string|null;inflow:number;outflow:number;net:number;items:typeof items}>()).values());
  return { data:items, calendar, meta:{...meta,
    customerDebt: Math.round(items.filter(row=>['remito','cuenta_sin_imputar'].includes(row.source)).reduce((sum,row)=>sum+row.amount,0)*100)/100,
    customerCredits: Math.round(rows.filter(row=>row.kind==='credit').reduce((sum,row)=>sum+row.amount,0)*100)/100,
    unallocatedAccounts: items.filter(row=>row.source==='cuenta_sin_imputar').length,
  }};
}
