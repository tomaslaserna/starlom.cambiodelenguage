import { handleApiError, ok } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { requirePortalIdentity } from "@/lib/portal-auth";
import { reconcileToAccountBalance } from "@/lib/portal-balances";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await requirePortalIdentity(request);
    const ids = identity.clientIds;
    const [clients, sales, payments, invoices, clientBalances] = await Promise.all([
      queryWithCompanyContext<{ id: string; name: string; address: string; locality: string }>(identity.companyId, `SELECT id::text, display_name AS name, COALESCE(address,'') AS address, COALESCE(locality,'') AS locality FROM clients WHERE empresa_id=$1 AND id=ANY($2::uuid[]) ORDER BY display_name`, [identity.companyId, ids], { cache: false }),
      queryWithCompanyContext<{ id: string; client_id: string; number: string; date: string; status: string; total: string; outstanding: string; invoice_number: string; item_count: number; collection_status: string }>(identity.companyId, `SELECT s.id::text, s.client_id::text, COALESCE(s.sale_number,'') AS number, s.sale_date::text AS date, COALESCE(s.order_status,s.status,'') AS status, COALESCE(s.total_amount,0)::text AS total, CASE WHEN COALESCE(s.order_status,s.status,'')='entregado' THEN GREATEST(COALESCE(s.total_amount,0)+COALESCE(m.debits,0)-COALESCE(m.credits,0),0) ELSE 0 END::text AS outstanding, CASE WHEN s.fiscal_status='aprobado' AND s.fiscal_receipt_number IS NOT NULL THEN CONCAT(LPAD(s.fiscal_point_of_sale::text,4,'0'),'-',LPAD(s.fiscal_receipt_number::text,8,'0')) ELSE '' END AS invoice_number, (SELECT COUNT(*)::int FROM sale_items si WHERE si.empresa_id=s.empresa_id AND si.sale_id=s.id) AS item_count, COALESCE(s.collection_status,'pendiente') AS collection_status FROM sales s LEFT JOIN LATERAL (SELECT COALESCE(SUM(debit) FILTER (WHERE description ILIKE 'nota de debito%' OR description ILIKE 'anulacion de cobro%'),0) debits,COALESCE(SUM(credit),0) credits FROM current_account_movements WHERE empresa_id=s.empresa_id AND sale_id=s.id) m ON true WHERE s.empresa_id=$1 AND s.client_id=ANY($2::uuid[]) ORDER BY s.sale_date ASC, s.created_at ASC LIMIT 100`, [identity.companyId, ids], { cache: false }),
      queryWithCompanyContext<{ id: string; client_id: string; sale_id: string; date: string; description: string; amount: string }>(identity.companyId, `SELECT id::text, client_id::text, COALESCE(sale_id::text,'') AS sale_id, movement_date::text AS date, COALESCE(description,'') AS description, COALESCE(credit,0)::text AS amount FROM current_account_movements WHERE empresa_id=$1 AND client_id=ANY($2::uuid[]) AND credit > 0 ORDER BY movement_date DESC, created_at DESC LIMIT 200`, [identity.companyId, ids], { cache: false }),
      queryWithCompanyContext<{ id: string; client_id: string; date: string; number: string; total: string }>(identity.companyId, `SELECT id::text, client_id::text, COALESCE(fiscal_issue_date,sale_date)::text AS date, CONCAT(LPAD(fiscal_point_of_sale::text,4,'0'),'-',LPAD(fiscal_receipt_number::text,8,'0')) AS number, COALESCE(total_amount,0)::text AS total FROM sales WHERE empresa_id=$1 AND client_id=ANY($2::uuid[]) AND fiscal_status='aprobado' AND fiscal_receipt_number IS NOT NULL ORDER BY COALESCE(fiscal_issue_date,sale_date) DESC, created_at DESC LIMIT 200`, [identity.companyId, ids], { cache: false }),
      queryWithCompanyContext<{ client_id: string; balance: string }>(identity.companyId, `SELECT c.id::text AS client_id, COALESCE(SUM(m.debit-m.credit),0)::text AS balance FROM clients c LEFT JOIN current_account_movements m ON m.empresa_id=c.empresa_id AND m.client_id=c.id WHERE c.empresa_id=$1 AND c.id=ANY($2::uuid[]) GROUP BY c.id`, [identity.companyId, ids], { cache: false }),
    ]);
    const reconciledSales = reconcileToAccountBalance(sales.rows, new Map(clientBalances.rows.map((row) => [row.client_id, Number(row.balance)]))).reverse();
    const balance = clientBalances.rows.reduce((sum, row) => sum + Number(row.balance), 0);
    const preferences = await queryWithCompanyContext<{ notify_orders: boolean; notify_invoices: boolean; notify_offers: boolean }>(identity.companyId, `SELECT notify_orders, notify_invoices, notify_offers FROM customer_portal_accounts WHERE empresa_id=$1 AND id=$2::uuid`, [identity.companyId, identity.accountId], { cache: false });
    return ok({ data: { profile: { email: identity.email, displayName: identity.displayName }, preferences: preferences.rows[0], clients: clients.rows, sales: reconciledSales, payments: payments.rows, invoices: invoices.rows, balance } });
  } catch (error) { return handleApiError(error); }
}
