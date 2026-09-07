import { createClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api-response";
import { envValue } from "@/lib/env";
import { queryWithCompanyContext } from "@/lib/db";

const COMPANY_ID = 1;

function url() {
  const value = envValue("SUPABASE_URL") || envValue("NEXT_PUBLIC_SUPABASE_URL");
  if (!value) throw new Error("Missing Supabase URL");
  return value;
}

function publicKey() {
  const value = envValue("SUPABASE_PUBLISHABLE_KEY") || envValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || envValue("SUPABASE_ANON_KEY") || envValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!value) throw new Error("Missing Supabase publishable key");
  return value;
}

export type PortalIdentity = { accountId: string; userId: string; email: string; displayName: string; companyId: number; clientIds: string[] };

export async function requirePortalIdentity(request: Request): Promise<PortalIdentity> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new ApiError(401, "Iniciá sesión en el portal");
  const supabase = createClient(url(), publicKey(), { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, "La sesión del portal venció");

  const result = await queryWithCompanyContext<{
    account_id: string; email: string; display_name: string; client_id: string | null;
  }>(COMPANY_ID, `
    SELECT a.id::text AS account_id, a.email, a.display_name, m.client_id::text
      FROM customer_portal_accounts a
      LEFT JOIN customer_portal_memberships m ON m.portal_account_id = a.id AND m.empresa_id = a.empresa_id
     WHERE a.empresa_id = $1 AND a.auth_user_id = $2::uuid AND a.active = TRUE
  `, [COMPANY_ID, data.user.id], { cache: false });
  if (!result.rows.length) throw new ApiError(403, "Tu correo todavía no tiene clientes habilitados");
  return {
    accountId: result.rows[0]!.account_id,
    userId: data.user.id,
    email: result.rows[0]!.email,
    displayName: result.rows[0]!.display_name,
    companyId: COMPANY_ID,
    clientIds: result.rows.flatMap((row) => row.client_id ? [row.client_id] : []),
  };
}
