import { normalizeRole, type AuthSession } from "@/lib/auth";
import { ApiError } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { CUSTOMERS_ALL_READ_PERMISSION, isFullAccessRole, sessionAllows } from "@/lib/route-auth";

// null means unrestricted; [] means no assigned customers (never unrestricted).
export async function customerAccessIds(session: AuthSession): Promise<string[] | null> {
  if (isFullAccessRole(session.role) || normalizeRole(session.role) !== "vendedor") return null;
  if (await sessionAllows(session, [CUSTOMERS_ALL_READ_PERMISSION])) return null;
  const names = [...new Set([session.username, session.displayName]
    .filter((name): name is string => Boolean(name?.trim()))
    .map(name => name.trim().toUpperCase()))];
  const result = await queryWithCompanyContext<{ id: string }>(session.companyId,
    `SELECT id::text FROM clients WHERE empresa_id = $1
       AND UPPER(BTRIM(COALESCE(assigned_seller, ''))) = ANY($2::text[])`,
    [session.companyId, names], { cache: false });
  return result.rows.map(row => row.id);
}

export async function filterCustomerAccess<T extends { id: string }>(session: AuthSession, customers: T[]): Promise<T[]> {
  const ids = await customerAccessIds(session);
  if (ids === null) return customers;
  const allowed = new Set(ids);
  return customers.filter(customer => allowed.has(customer.id));
}

export async function assertCustomerAccess(session: AuthSession, customerId: string) {
  const ids = await customerAccessIds(session);
  if (ids !== null && !ids.includes(customerId)) throw new ApiError(403, "Cliente fuera de tu cartera asignada");
}

export function quoteIsAccessible(quote: { clientId: string | null; sellerId: string | null }, ids: string[] | null, userId: string) {
  if (ids === null) return true;
  return quote.clientId ? ids.includes(quote.clientId) : quote.sellerId === userId;
}

export async function assertQuoteAccess(session: AuthSession, id: string) {
  const ids = await customerAccessIds(session);
  if (ids === null) return;
  const result = await queryWithCompanyContext<{ clientId: string | null; sellerId: string | null }>(session.companyId,
    `SELECT client_id::text AS "clientId", seller_id::text AS "sellerId" FROM quotes
     WHERE empresa_id = $1 AND (id::text = $2 OR quote_number = $2) LIMIT 1`, [session.companyId, id]);
  const quote = result.rows[0];
  if (!quote || !quoteIsAccessible(quote, ids, session.userId)) throw new ApiError(403, "Presupuesto fuera de tu cartera asignada");
}
