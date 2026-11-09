import { queryWithCompanyContext } from "@/lib/db";
import { customerMetrics } from "@/lib/customer-rhythm";
import { canonicalSalesSourceSql } from "@/lib/sales-source-sql";
import { netSalesAmountSql } from "@/lib/sales-vat";
import { localDateIso } from "@/lib/timezone";
import type { CrmClientsResult } from "@/lib/crm";

const DAY = 86_400_000;
const MARGIN_TARGET = 25;

export type Reputation = {
  score: number | null;
  paymentDays: number | null;
  repeatDelay: number | null;
  cycle: number | null;
  margin: number | null;
};
type Row = { id: string; dates: string[]; delay: number | null; margin: number | null; has_order: boolean };

export function rateCustomer(row: Row, today: string): Reputation {
  const dates = row.dates.map(Date.parse);
  const cycle = dates.length >= 3 ? customerMetrics(dates).average : null;
  const repeatDelay = cycle === null || row.has_order ? null :
    (Date.parse(today) - dates[dates.length - 1]) / DAY - cycle;
  const paymentDays = row.delay;
  const margin = row.margin;
  const signals = [
    { weight: 70, value: paymentDays === null ? null : 100 * (1 - paymentDays / 30) },
    { weight: 20, value: repeatDelay === null ? null : 100 * (1 - Math.max(0, repeatDelay) / cycle!) },
    { weight: 10, value: margin === null ? null : 100 * margin / MARGIN_TARGET },
  ];
  let points = 0;
  let weight = 0;
  for (const signal of signals) {
    if (signal.value === null) continue;
    points += signal.weight * Math.min(100, Math.max(0, signal.value));
    weight += signal.weight;
  }
  return { score: weight ? Math.round(points / weight) : null, paymentDays, repeatDelay, cycle, margin };
}

export async function customerReputations(companyId: number, ids: string[]): Promise<Record<string, Reputation>> {
  if (!ids.length) return {};
  const today = localDateIso();
  const result = await queryWithCompanyContext<Row>(companyId, `
    WITH delivered AS (
      SELECT s.*, s.sale_date::date + COALESCE(s.source_payment_term_days,
        substring(s.payment_condition from '[0-9]+')::int,
        CASE WHEN lower(trim(s.payment_condition)) IN ('contado','pago al recibir','pendiente') THEN 0 END,
        c.payment_term_days) AS due
      FROM sales s JOIN clients c ON c.empresa_id=s.empresa_id AND c.id=s.client_id
      WHERE s.empresa_id=$1 AND s.client_id=ANY($2::uuid[]) AND s.sale_date <= $3::date
        AND COALESCE(s.order_status,s.status)='entregado' AND ${canonicalSalesSourceSql("s")}
    ), aging AS (
      SELECT d.client_id, d.due, GREATEST(sum(m.debit-m.credit),0) amount, $3::date AS day
      FROM delivered d JOIN current_account_movements m ON m.empresa_id=d.empresa_id AND m.sale_id=d.id
      WHERE m.movement_date <= $3::date AND d.due <= $3::date
      GROUP BY d.client_id,d.id,d.due
      UNION ALL
      SELECT d.client_id,d.due,m.credit,p.payment_date::date
      FROM delivered d JOIN current_account_movements m ON m.empresa_id=d.empresa_id AND m.sale_id=d.id
      JOIN payments p ON p.empresa_id=m.empresa_id AND p.id=m.payment_id
      WHERE p.status='registrado' AND m.credit>0 AND d.due IS NOT NULL
        AND p.payment_date BETWEEN $3::date-90 AND $3::date
    ), speed AS (
      SELECT client_id, (sum(amount*greatest(day-due,0))/nullif(sum(amount),0))::float8 AS delay
      FROM aging GROUP BY client_id
    ), month_bounds AS (
      SELECT date_trunc('month',$3::date)::date AS stop
    ), events AS (
      SELECT d.client_id,coalesce(d.source_net_amount,${netSalesAmountSql("d.total_amount","d")}) AS net,
        coalesce(d.source_cost_amount,lines.cost) AS cost
      FROM delivered d CROSS JOIN month_bounds b
      LEFT JOIN LATERAL (SELECT CASE WHEN bool_and(coalesce(i.unit_cost_snapshot,0)>0)
        THEN sum(i.quantity*i.unit_cost_snapshot) END cost FROM sale_items i
        WHERE i.sale_id=d.id AND i.empresa_id=d.empresa_id) lines ON true
      WHERE d.sale_date >= b.stop-interval '1 month' AND d.sale_date<b.stop
      UNION ALL
      SELECT d.client_id,${netSalesAmountSql("(CASE WHEN n.class_name='ND' THEN n.amount ELSE -n.amount END)","d")},
        CASE WHEN n.class_name='ND' THEN lines.cost ELSE -lines.cost END
      FROM delivered d JOIN sales_internal_documents n ON n.sale_id=d.id AND n.empresa_id=d.empresa_id
      CROSS JOIN month_bounds b LEFT JOIN LATERAL (
        SELECT CASE WHEN bool_and(coalesce(nullif(e->>'unitCost','')::numeric,0)>0)
          THEN sum((e->>'quantity')::numeric*(e->>'unitCost')::numeric) END cost
        FROM jsonb_array_elements(n.detail_json) e
      ) lines ON true
      WHERE (n.fiscal=false OR n.operational_document_id IS NULL)
        AND n.issue_date>=b.stop-interval '1 month' AND n.issue_date<b.stop
    ), margins AS (
      SELECT client_id,CASE WHEN count(cost)=count(*) AND sum(net)>0
        THEN (100*(sum(net)-sum(cost))/sum(net))::float8 END margin FROM events GROUP BY client_id
    )
    SELECT d.client_id::text id,array_agg(DISTINCT d.sale_date::text ORDER BY d.sale_date::text) dates,
      sp.delay,mg.margin,EXISTS(SELECT 1 FROM sales o WHERE o.empresa_id=$1 AND o.client_id=d.client_id
        AND coalesce(o.order_status,o.status) IN ('cargado','confirmado') AND ${canonicalSalesSourceSql("o")}) has_order
    FROM delivered d LEFT JOIN speed sp USING(client_id) LEFT JOIN margins mg USING(client_id)
    GROUP BY d.client_id,sp.delay,mg.margin`, [companyId, [...new Set(ids)].sort(), today]);
  return Object.fromEntries(result.rows.map(row => [row.id, rateCustomer(row,today)]));
}

export async function vendorReputationAlerts(companyId: number, clients: CrmClientsResult) {
  const portfolio = Object.values(clients.groups).flat();
  const scores = await customerReputations(companyId, portfolio.map(c => c.customerId));
  const month = localDateIso().slice(0,7);
  return portfolio.flatMap(c => {
    const r = scores[c.customerId];
    const alerts: { id: string; title: string; detail: string; href: string }[] = [];
    const href = "/crm/clientes/" + c.customerId;
    if (r?.repeatDelay === -1) alerts.push({ id: "repeat-"+c.customerId+"-"+localDateIso(),
      title: "Contactar a "+c.customerName, detail: "Mañana se cumple su ciclo de "+r.cycle+" días. Consultá si necesita pedido.", href });
    if (r?.margin != null && r.margin < MARGIN_TARGET) alerts.push({ id: "margin-"+c.customerId+"-"+month,
      title: "Revisar margen de "+c.customerName, detail: "Margen del mes anterior: "+r.margin.toFixed(1)+"% (objetivo "+MARGIN_TARGET+"%). Revisá precios y descuentos.", href });
    return alerts;
  });
}
