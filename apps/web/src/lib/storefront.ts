import { ApiError } from "@/lib/api-response";
import { withCompanyContext } from "@/lib/db";

const COMPANY_ID = 1;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StorefrontLine = { productId: string; quantity: number };
export type StorefrontRequest = {
  name: string;
  phone: string;
  brand: string;
  taxId: string;
  businessName: string;
  industry: string;
  businessType: string;
  companyName: string;
  usualPurchases: string[];
  currentSupplier: string;
  supplierCount: string;
  address: string;
  city: string;
  province: string;
  latitude: number | null;
  longitude: number | null;
  notes: string;
  items: StorefrontLine[];
};

function clean(value: unknown, max = 180) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function parseStorefrontRequest(value: unknown): StorefrontRequest {
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const productId = clean(row.productId, 36);
    const quantity = Number(row.quantity);
    return UUID_RE.test(productId) && Number.isInteger(quantity) && quantity > 0 && quantity <= 9999
      ? [{ productId, quantity }]
      : [];
  }).slice(0, 100);
  const parsed = {
    name: clean(body.name), phone: clean(body.phone, 40), brand: clean(body.brand),
    taxId: clean(body.taxId, 20), businessName: clean(body.businessName),
    industry: clean(body.industry), businessType: clean(body.businessType), companyName: clean(body.companyName),
    usualPurchases: (Array.isArray(body.usualPurchases) ? body.usualPurchases : []).map((item) => clean(item, 80)).filter(Boolean).slice(0, 12),
    currentSupplier: clean(body.currentSupplier), supplierCount: clean(body.supplierCount, 40),
    address: clean(body.address, 300), city: clean(body.city),
    province: clean(body.province), notes: clean(body.notes, 1000), items,
    latitude: Number.isFinite(Number(body.latitude)) ? Number(body.latitude) : null,
    longitude: Number.isFinite(Number(body.longitude)) ? Number(body.longitude) : null,
  };
  if (!parsed.name || !parsed.phone) throw new ApiError(400, "Completá nombre y teléfono");
  if (!parsed.address) throw new ApiError(400, "Completá la dirección de entrega");
  if (!items.length) throw new ApiError(400, "Agregá al menos un producto");
  return parsed;
}

export async function createStorefrontRequest(input: StorefrontRequest) {
  return withCompanyContext(COMPANY_ID, async (client) => {
    const productIds = input.items.map((item) => item.productId);
    const products = await client.query<{ id: string; name: string }>(
      `SELECT id::text, name FROM products WHERE empresa_id = $1 AND active = true AND id = ANY($2::uuid[])`,
      [COMPANY_ID, productIds],
    );
    const byId = new Map(products.rows.map((product) => [product.id, product.name]));
    if (byId.size !== new Set(productIds).size) throw new ApiError(400, "Uno de los productos ya no está disponible");

    const seller = (await client.query<{ id: string; identity: string }>(
      `SELECT p.id::text, COALESCE(NULLIF(p.full_name, ''), NULLIF(p.username, ''), '') AS identity
         FROM usuario_empresa ue JOIN profiles p ON p.id = ue.id_usuario
        WHERE ue.empresa_id = $1 AND ue.activo = true AND ue.role::text IN ('vendedor','jefe','administrador')
        ORDER BY CASE ue.role::text WHEN 'vendedor' THEN 0 WHEN 'jefe' THEN 1 ELSE 2 END, p.username LIMIT 1`,
      [COMPANY_ID],
    )).rows[0];
    if (!seller) throw new ApiError(503, "No hay un comercial disponible para recibir el pedido");

    await client.query("SELECT pg_advisory_xact_lock(83011, $1::int)", [COMPANY_ID]);
    const sequence = await client.query<{ value: string }>(
      `SELECT (COALESCE(MAX(substring(quote_number FROM '^P-([0-9]+)$')::bigint), 0) + 1)::text AS value
         FROM quotes WHERE empresa_id = $1 AND quote_number ~ '^P-[0-9]+$'`, [COMPANY_ID],
    );
    const quoteNumber = `P-${String(Number(sequence.rows[0]?.value ?? 1)).padStart(4, "0")}`;
    const fullAddress = [input.address, input.city, input.province].filter(Boolean).join(", ");
    const location = input.latitude !== null && input.longitude !== null
      ? `Ubicación: ${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}` : "Ubicación: carga manual";
    const cartText = input.items.map((item) => `${item.quantity} x ${byId.get(item.productId)}`).join("\n");
    const leadNotes = [`Solicitud web ${quoteNumber}`, `Marca: ${input.brand || "-"}`, input.companyName && `Negocio informado: ${input.companyName}`, `Razón social: ${input.businessName || "-"}`, `CUIT: ${input.taxId || "-"}`, `Rubro: ${input.industry || input.businessType || "-"}`, input.usualPurchases.length && `Compra habitualmente: ${input.usualPurchases.join(", ")}`, input.currentSupplier && `Proveedor actual: ${input.currentSupplier}`, input.supplierCount && `Cantidad de proveedores: ${input.supplierCount}`, `Dirección: ${fullAddress}`, location, input.notes && `Comentarios: ${input.notes}`, "Productos:", cartText].filter(Boolean).join("\n");

    const lead = await client.query<{ id: string }>(
      `INSERT INTO crm_leads (empresa_id, assigned_seller, name, phone, locality, source, stage, next_followup, notes, created_by, business_segment)
       VALUES ($1,$2,$3,$4,$5,'Tienda web','nuevo',CURRENT_DATE + 3,$6,'tienda-web',NULLIF($7,'')) RETURNING id::text`,
      [COMPANY_ID, seller.identity, input.name, input.phone, [input.city, input.province].filter(Boolean).join(", "), leadNotes, input.businessType],
    );
    const quote = await client.query<{ id: string }>(
      `INSERT INTO quotes (quote_number, client_id, seller_id, status, total_amount, validity_days, include_vat, vat_rate,
        desired_document, active_price_list, price_list_name, discount_percent, net_amount, discount_amount, subtotal_amount,
        vat_amount, client_name, client_legal_name, client_document, client_fiscal_condition, client_phone, client_address,
        empresa_id, visible_to_all)
       VALUES ($1,NULL,$2::uuid,'pendiente',0,15,false,0,'remito',1,'A cotizar',0,0,0,0,0,$3,$4,$5,'',$6,$7,$8,true)
       RETURNING id::text`,
      [quoteNumber, seller.id, input.brand || input.name, input.businessName, input.taxId, input.phone, fullAddress, COMPANY_ID],
    );
    for (const item of input.items) {
      await client.query(
        `INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, discount, total_amount, empresa_id)
         VALUES ($1::uuid,$2::uuid,$3,$4,0,0,0,$5)`,
        [quote.rows[0]!.id, item.productId, byId.get(item.productId), item.quantity, COMPANY_ID],
      );
    }
    return { leadId: lead.rows[0]!.id, quoteId: quote.rows[0]!.id, quoteNumber };
  });
}
