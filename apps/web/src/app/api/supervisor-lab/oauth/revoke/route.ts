import { getDbPool, withCompanyContext } from "@/lib/db";
import type { AuthSession } from "@/lib/auth";
import { hash } from "@/lib/supervisor-lab/dot-protocol.mjs";
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 10000)
    return new Response(null, { status: 413 });
  const params = new URLSearchParams(await request.text());
  const token = params.get("token");
  if (token) {
    const removed = await getDbPool().query<{ principal: AuthSession }>(
      "DELETE FROM starlim_dot.oauth_grants WHERE client_id=$1 AND (access_hash=$2 OR refresh_hash=$2) RETURNING principal",
      [params.get("client_id"), hash(token)],
    );
    for (const { principal } of removed.rows) {
      await withCompanyContext(principal.companyId, (client) => client.query(
        "UPDATE supervisor_dot_subscriptions SET active=false WHERE empresa_id=$1 AND user_id=$2",
        [principal.companyId, principal.userId],
      ));
    }
  }
  return new Response(null, { status: 200 });
}
