import { handleApiError, ok } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { requirePortalIdentity } from "@/lib/portal-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const identity = await requirePortalIdentity(request);
    const ids = identity.clientIds;
    const [clients, sales, movements] = await Promise.all([
      queryWithCompanyContext<{ id: string; name: string; address: string; locality: string }>(identity.companyId, `SELECT id::text, display_name AS name, COALESCE(address,'') AS address, COALESCE(locality,'') AS locality FROM clients WHERE empresa_id=$1 AND id=ANY($2::uuid[]) ORDER BY display_name`, [identity.companyId, ids], { cache: false }),
      queryWithCompanyContext<{ id: string; client_id: string; number: string; date: string; status: string; total: string }>(identity.companyId, `SELECT id::text, client_id::text, COALESCE(sale_number,'') AS number, sale_date::text AS date, COALESCE(order_status,status,'') AS status, COALESCE(total_amount,0)::text AS total FROM sales WHERE empresa_id=$1 AND client_id=ANY($2::uuid[]) ORDER BY sale_date DESC, created_at DESC LIMIT 100`, [identity.companyId, ids], { cache: false }),
      queryWithCompanyContext<{ id: string; client_id: string; date: string; description: string; debit: string; credit: string }>(identity.companyId, `SELECT id::text, client_id::text, movement_date::text AS date, COALESCE(description,'') AS description, COALESCE(debit,0)::text AS debit, COALESCE(credit,0)::text AS credit FROM current_account_movements WHERE empresa_id=$1 AND client_id=ANY($2::uuid[]) ORDER BY movement_date DESC, created_at DESC LIMIT 200`, [identity.companyId, ids], { cache: false }),
    ]);
    const balance = movements.rows.reduce((sum, row) => sum + Number(row.debit) - Number(row.credit), 0);
    const preferences = await queryWithCompanyContext<{ notify_orders: boolean; notify_invoices: boolean; notify_offers: boolean }>(identity.companyId, `SELECT notify_orders, notify_invoices, notify_offers FROM customer_portal_accounts WHERE empresa_id=$1 AND id=$2::uuid`, [identity.companyId, identity.accountId], { cache: false });
    return ok({ data: { profile: { email: identity.email, displayName: identity.displayName }, preferences: preferences.rows[0], clients: clients.rows, sales: sales.rows, movements: movements.rows, balance } });
  } catch (error) { return handleApiError(error); }
}
