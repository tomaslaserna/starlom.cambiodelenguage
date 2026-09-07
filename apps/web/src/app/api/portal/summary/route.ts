import { handleApiError, ok } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { requirePortalIdentity } from "@/lib/portal-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await requirePortalIdentity(request);
    const ids = identity.clientIds;
    const [clients, sales, payments, invoices] = await Promise.all([
      queryWithCompanyContext<{ id: string; name: string; address: string; locality: string }>(identity.companyId, `SELECT id::text, display_name AS name, COALESCE(address,'') AS address, COALESCE(locality,'') AS locality FROM clients WHERE empresa_id=$1 AND id=ANY($2::uuid[]) ORDER BY display_name`, [identity.companyId, ids], { cache: false }),
      queryWithCompanyContext<{ id: string; client_id: string; number: string; date: string; status: string; total: string; item_count: number; collection_status: string }>(identity.companyId, `SELECT s.id::text, s.client_id::text, COALESCE(s.sale_number,'') AS number, s.sale_date::text AS date, COALESCE(s.order_status,s.status,'') AS status, COALESCE(s.total_amount,0)::text AS total, (SELECT COUNT(*)::int FROM sale_items si WHERE si.empresa_id=s.empresa_id AND si.sale_id=s.id) AS item_count, COALESCE(s.collection_status,'pendiente') AS collection_status FROM sales s WHERE s.empresa_id=$1 AND s.client_id=ANY($2::uuid[]) ORDER BY s.sale_date DESC, s.created_at DESC LIMIT 100`, [identity.companyId, ids], { cache: false }),
      queryWithCompanyContext<{ id: string; client_id: string; sale_id: string; date: string; description: string; amount: string }>(identity.companyId, `SELECT id::text, client_id::text, COALESCE(sale_id::text,'') AS sale_id, movement_date::text AS date, COALESCE(description,'') AS description, COALESCE(credit,0)::text AS amount FROM current_account_movements WHERE empresa_id=$1 AND client_id=ANY($2::uuid[]) AND credit > 0 ORDER BY movement_date DESC, created_at DESC LIMIT 200`, [identity.companyId, ids], { cache: false }),
      queryWithCompanyContext<{ id: string; client_id: string; date: string; number: string; total: string }>(identity.companyId, `SELECT id::text, client_id::text, COALESCE(fiscal_issue_date,sale_date)::text AS date, CONCAT(LPAD(fiscal_point_of_sale::text,4,'0'),'-',LPAD(fiscal_receipt_number::text,8,'0')) AS number, COALESCE(total_amount,0)::text AS total FROM sales WHERE empresa_id=$1 AND client_id=ANY($2::uuid[]) AND fiscal_status='aprobado' AND fiscal_receipt_number IS NOT NULL ORDER BY COALESCE(fiscal_issue_date,sale_date) DESC, created_at DESC LIMIT 200`, [identity.companyId, ids], { cache: false }),
    ]);
    const balanceRows = await queryWithCompanyContext<{ balance: string }>(identity.companyId, `SELECT COALESCE(SUM(debit-credit),0)::text AS balance FROM current_account_movements WHERE empresa_id=$1 AND client_id=ANY($2::uuid[])`, [identity.companyId, ids], { cache: false });
    const balance = Number(balanceRows.rows[0]?.balance ?? 0);
    const preferences = await queryWithCompanyContext<{ notify_orders: boolean; notify_invoices: boolean; notify_offers: boolean }>(identity.companyId, `SELECT notify_orders, notify_invoices, notify_offers FROM customer_portal_accounts WHERE empresa_id=$1 AND id=$2::uuid`, [identity.companyId, identity.accountId], { cache: false });
    return ok({ data: { profile: { email: identity.email, displayName: identity.displayName }, preferences: preferences.rows[0], clients: clients.rows, sales: sales.rows, payments: payments.rows, invoices: invoices.rows, balance } });
  } catch (error) { return handleApiError(error); }
}
