import QRCode from "qrcode";
import { randomUUID } from "node:crypto";
import { ApiError, handleApiError, ok } from "@/lib/api-response";
import { withCompanyContext } from "@/lib/db";
import { createPreference } from "@/lib/mercadopago";
import { requirePortalIdentity } from "@/lib/portal-auth";
import { reconcileToAccountBalance, selectionIsOldestFirst } from "@/lib/portal-balances";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await requirePortalIdentity(request);
    const body = await request.json();
    const saleIds: string[] = Array.from(new Set<string>(Array.isArray(body.saleIds) ? body.saleIds.map(String) : []));
    const clientId = String(body.clientId || "");
    if (!clientId || !identity.clientIds.includes(clientId) || !saleIds.length) throw new ApiError(400, "Seleccioná al menos una factura pendiente");
    const intentId = randomUUID();
    const result = await withCompanyContext(identity.companyId, async (client) => {
      const rows = await client.query<{ id: string; client_id: string; date: string; outstanding: string }>(`
        SELECT s.id::text, s.client_id::text, s.sale_date::text AS date, GREATEST(COALESCE(s.total_amount,0)+COALESCE(m.debits,0)-COALESCE(m.credits,0),0)::text AS outstanding
        FROM sales s LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(debit) FILTER (WHERE description ILIKE 'nota de debito%' OR description ILIKE 'anulacion de cobro%'),0) debits,
                 COALESCE(SUM(credit),0) credits FROM current_account_movements
          WHERE empresa_id=s.empresa_id AND sale_id=s.id
        ) m ON true
        WHERE s.empresa_id=$1 AND s.client_id=$2::uuid
          AND COALESCE(s.order_status,s.status,'')='entregado'
        ORDER BY s.sale_date ASC, s.created_at ASC
        FOR UPDATE OF s`, [identity.companyId, clientId]);
      const balanceRows = await client.query<{ balance: string }>(`SELECT COALESCE(SUM(debit-credit),0)::text AS balance FROM current_account_movements WHERE empresa_id=$1 AND client_id=$2::uuid`, [identity.companyId, clientId]);
      const openSales = reconcileToAccountBalance(rows.rows, new Map([[clientId, Number(balanceRows.rows[0]?.balance ?? 0)]])).filter((sale) => Number(sale.outstanding)>0.005);
      if (!selectionIsOldestFirst(openSales.map((sale) => sale.id), saleIds)) throw new ApiError(409, "Para pagar un comprobante primero tenés que incluir todos los anteriores pendientes");
      const selected = openSales.filter((sale) => saleIds.includes(sale.id));
      if (selected.length !== saleIds.length) throw new ApiError(409, "Una de las facturas seleccionadas ya no está disponible");
      const amount = Math.round(selected.reduce((sum, row) => sum + Number(row.outstanding), 0) * 100) / 100;
      if (amount <= 0) throw new ApiError(409, "Las facturas seleccionadas ya están pagadas");
      await client.query(`INSERT INTO customer_portal_payment_intents (id,empresa_id,portal_account_id,client_id,sale_ids,amount,portal_user_id) VALUES ($1,$2,$3::uuid,$4::uuid,$5::uuid[],$6,$7::uuid)`, [intentId, identity.companyId, identity.accountId, clientId, saleIds, amount, identity.userId]);
      return amount;
    });
    const preference = await createPreference({ intentId, amount: result, description: `Pago Starlim · ${saleIds.length} comprobante${saleIds.length === 1 ? "" : "s"}`, email: identity.email, origin: new URL(request.url).origin });
    const checkoutUrl = String(preference.init_point || "");
    if (!checkoutUrl) throw new ApiError(502, "Mercado Pago no devolvió el enlace de pago");
    await withCompanyContext(identity.companyId, (client) => client.query(`UPDATE customer_portal_payment_intents SET mp_preference_id=$1,updated_at=now() WHERE id=$2 AND empresa_id=$3`, [preference.id, intentId, identity.companyId]));
    return ok({ data: { intentId, amount: result, checkoutUrl, qrDataUrl: await QRCode.toDataURL(checkoutUrl, { width: 320, margin: 1 }) } }, 201);
  } catch (error) { return handleApiError(error); }
}
