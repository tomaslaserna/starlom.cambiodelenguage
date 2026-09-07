import { handleApiError, ok } from "@/lib/api-response";
import { withCompanyContext } from "@/lib/db";
import { requirePortalIdentity } from "@/lib/portal-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await requirePortalIdentity(request);
    const { saleId } = await request.json() as { saleId?: string };
    if (!saleId) throw new Error("Falta el pedido a repetir");
    const data = await withCompanyContext(identity.companyId, async (client) => {
      const sale = (await client.query<{ client_id: string; client_name: string; business_name: string; tax_id: string; phone: string; address: string; seller_id: string | null; total: string }>(
        `SELECT s.client_id::text, c.display_name AS client_name, COALESCE(c.business_name,'') AS business_name,
                COALESCE(c.tax_id,'') AS tax_id, COALESCE(c.phone,'') AS phone, COALESCE(c.address,'') AS address,
                s.seller_id::text, COALESCE(s.total_amount,0)::text AS total
           FROM sales s JOIN clients c ON c.id=s.client_id AND c.empresa_id=s.empresa_id
          WHERE s.empresa_id=$1 AND s.id=$2::uuid AND s.client_id=ANY($3::uuid[])`,
        [identity.companyId, saleId, identity.clientIds],
      )).rows[0];
      if (!sale) throw new Error("Ese pedido no pertenece a tu cuenta");
      const items = (await client.query<{ product_id: string; description: string; quantity: string; unit_price: string; discount: string; total: string }>(
        `SELECT product_id::text, COALESCE(description,''), quantity::text, unit_price::text, COALESCE(discount,0)::text, total_amount::text AS total
           FROM sale_items WHERE empresa_id=$1 AND sale_id=$2::uuid ORDER BY id`, [identity.companyId, saleId],
      )).rows;
      if (!items.length) throw new Error("El pedido original no tiene artículos repetibles");
      await client.query("SELECT pg_advisory_xact_lock(83011, $1::int)", [identity.companyId]);
      const seq = await client.query<{ value: string }>(`SELECT (COALESCE(MAX(substring(quote_number FROM '^P-([0-9]+)$')::bigint),0)+1)::text AS value FROM quotes WHERE empresa_id=$1 AND quote_number~'^P-[0-9]+$'`, [identity.companyId]);
      const number = `P-${String(Number(seq.rows[0]?.value ?? 1)).padStart(4, "0")}`;
      const quote = await client.query<{ id: string }>(
        `INSERT INTO quotes (quote_number,client_id,seller_id,status,total_amount,validity_days,include_vat,vat_rate,desired_document,active_price_list,price_list_name,discount_percent,net_amount,discount_amount,subtotal_amount,vat_amount,client_name,client_legal_name,client_document,client_fiscal_condition,client_phone,client_address,empresa_id,visible_to_all)
         VALUES ($1,$2::uuid,$3::uuid,'pendiente',$4,15,false,0,'remito',1,'Precio congelado',0,$4,0,$4,0,$5,$6,$7,'',$8,$9,$10,true) RETURNING id::text`,
        [number, sale.client_id, sale.seller_id, sale.total, sale.client_name, sale.business_name, sale.tax_id, sale.phone, sale.address, identity.companyId],
      );
      for (const item of items) await client.query(`INSERT INTO quote_items (quote_id,product_id,description,quantity,unit_price,discount,total_amount,empresa_id) VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8)`, [quote.rows[0]!.id,item.product_id,item.description,item.quantity,item.unit_price,item.discount,item.total,identity.companyId]);
      return { quoteId: quote.rows[0]!.id, quoteNumber: number };
    });
    return ok({ data });
  } catch (error) { return handleApiError(error); }
}
