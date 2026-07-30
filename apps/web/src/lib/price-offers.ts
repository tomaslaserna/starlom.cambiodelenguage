import { ApiError } from "@/lib/api-response";
import type { AuthSession } from "@/lib/auth";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { computeOfferStatus, type OfferPriceMode, type OfferStatus } from "@/lib/offer-status";
import { localDateIso } from "@/lib/timezone";

const READ = { cache: false } as const;

export type PriceOfferItem = { productId: string; productName: string; code: string; quantity: number };

export type PriceOffer = {
  id: string;
  name: string;
  active: boolean;
  priceMode: OfferPriceMode;
  fixedPrice: number | null;
  discountPercent: number | null;
  minPrice: number | null;
  validFrom: string | null;
  validTo: string | null;
  stockLimit: number | null;
  status: OfferStatus;
  items: PriceOfferItem[];
};

export type PriceOfferInput = {
  id?: string | null;
  name: string;
  active: boolean;
  priceMode: OfferPriceMode;
  fixedPrice: number | null;
  discountPercent: number | null;
  minPrice: number | null;
  validFrom: string | null;
  validTo: string | null;
  stockLimit: number | null;
  items: { productId: string; quantity: number }[];
};

export async function listPriceOffers(companyId: number): Promise<PriceOffer[]> {
  const [offers, items] = await Promise.all([
    queryWithCompanyContext<{
      id: string;
      name: string;
      active: boolean;
      price_mode: string;
      fixed_price: string | null;
      discount_percent: string | null;
      min_price: string | null;
      valid_from: string | null;
      valid_to: string | null;
      stock_limit: number | null;
    }>(
      companyId,
      `
        SELECT id::text, name, active, price_mode,
               fixed_price::text, discount_percent::text, min_price::text,
               valid_from::text AS valid_from, valid_to::text AS valid_to, stock_limit
        FROM price_offers
        WHERE empresa_id = $1
        ORDER BY created_at DESC
      `,
      [companyId],
      READ,
    ),
    queryWithCompanyContext<{
      offer_id: string;
      product_id: string;
      product_name: string;
      code: string;
      quantity: string;
    }>(
      companyId,
      `
        SELECT i.offer_id::text, i.product_id::text,
               COALESCE(p.name, '(producto eliminado)') AS product_name,
               COALESCE(p.sku, p.category_code, '') AS code,
               i.quantity::text
        FROM price_offer_items i
        LEFT JOIN products p ON p.id = i.product_id AND p.empresa_id = i.empresa_id
        WHERE i.empresa_id = $1
        ORDER BY i.id ASC
      `,
      [companyId],
      READ,
    ),
  ]);

  const itemsByOffer = new Map<string, PriceOfferItem[]>();
  for (const row of items.rows) {
    const list = itemsByOffer.get(row.offer_id) ?? [];
    list.push({ productId: row.product_id, productName: row.product_name, code: row.code, quantity: Number(row.quantity) });
    itemsByOffer.set(row.offer_id, list);
  }

  const today = localDateIso();
  return offers.rows.map((row) => ({
    id: row.id,
    name: row.name,
    active: Boolean(row.active),
    priceMode: row.price_mode === "descuento" ? "descuento" : "fijo",
    fixedPrice: row.fixed_price === null ? null : Number(row.fixed_price),
    discountPercent: row.discount_percent === null ? null : Number(row.discount_percent),
    minPrice: row.min_price === null ? null : Number(row.min_price),
    validFrom: row.valid_from,
    validTo: row.valid_to,
    stockLimit: row.stock_limit === null ? null : Number(row.stock_limit),
    status: computeOfferStatus(Boolean(row.active), row.valid_from, row.valid_to, today),
    items: itemsByOffer.get(row.id) ?? [],
  }));
}

function validate(input: PriceOfferInput) {
  const name = input.name.trim();
  if (!name) throw new ApiError(400, "Poné un nombre para la oferta");
  if (name.length > 120) throw new ApiError(400, "El nombre no puede superar 120 caracteres");
  if (!input.items.length) throw new ApiError(400, "Agregá al menos un artículo a la oferta");
  for (const item of input.items) {
    if (!/^[0-9a-f-]{36}$/i.test(item.productId)) throw new ApiError(400, "Artículo inválido en la oferta");
    if (!(item.quantity > 0)) throw new ApiError(400, "La cantidad de cada artículo debe ser mayor a cero");
  }
  if (input.priceMode === "fijo") {
    if (!(Number(input.fixedPrice) > 0)) throw new ApiError(400, "Poné el precio fijo de la oferta");
  } else {
    const pct = Number(input.discountPercent);
    if (!(pct > 0 && pct <= 100)) throw new ApiError(400, "El descuento debe estar entre 0 y 100%");
  }
  if (input.validFrom && input.validTo && input.validTo < input.validFrom) {
    throw new ApiError(400, "La vigencia 'hasta' no puede ser anterior a 'desde'");
  }
  return name;
}

export async function savePriceOffer(session: AuthSession, input: PriceOfferInput): Promise<{ id: string }> {
  const name = validate(input);
  const fixedPrice = input.priceMode === "fijo" ? Number(input.fixedPrice) : null;
  const discountPercent = input.priceMode === "descuento" ? Number(input.discountPercent) : null;
  const minPrice = input.priceMode === "descuento" && input.minPrice != null ? Number(input.minPrice) : null;

  return withCompanyContext(session.companyId, async (client) => {
    let offerId = input.id ?? null;
    if (offerId) {
      const updated = await client.query(
        `
          UPDATE price_offers
          SET name = $1, active = $2, price_mode = $3, fixed_price = $4, discount_percent = $5,
              min_price = $6, valid_from = $7, valid_to = $8, stock_limit = $9
          WHERE id = $10::uuid AND empresa_id = $11
        `,
        [
          name,
          input.active,
          input.priceMode,
          fixedPrice,
          discountPercent,
          minPrice,
          input.validFrom,
          input.validTo,
          input.stockLimit,
          offerId,
          session.companyId,
        ],
      );
      if (updated.rowCount === 0) throw new ApiError(404, "La oferta no existe");
      await client.query(`DELETE FROM price_offer_items WHERE offer_id = $1::uuid AND empresa_id = $2`, [
        offerId,
        session.companyId,
      ]);
    } else {
      const created = await client.query<{ id: string }>(
        `
          INSERT INTO price_offers (
            empresa_id, name, active, price_mode, fixed_price, discount_percent, min_price,
            valid_from, valid_to, stock_limit, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id::text
        `,
        [
          session.companyId,
          name,
          input.active,
          input.priceMode,
          fixedPrice,
          discountPercent,
          minPrice,
          input.validFrom,
          input.validTo,
          input.stockLimit,
          session.username,
        ],
      );
      offerId = created.rows[0].id;
    }

    for (const item of input.items) {
      await client.query(
        `INSERT INTO price_offer_items (offer_id, empresa_id, product_id, quantity) VALUES ($1::uuid, $2, $3::uuid, $4)`,
        [offerId, session.companyId, item.productId, item.quantity],
      );
    }

    return { id: offerId as string };
  });
}

export async function setPriceOfferActive(session: AuthSession, id: string, active: boolean) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(400, "Oferta inválida");
  await queryWithCompanyContext(
    session.companyId,
    `UPDATE price_offers SET active = $1 WHERE id = $2::uuid AND empresa_id = $3`,
    [active, id, session.companyId],
  );
}

export async function deletePriceOffer(session: AuthSession, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(400, "Oferta inválida");
  await queryWithCompanyContext(
    session.companyId,
    `DELETE FROM price_offers WHERE id = $1::uuid AND empresa_id = $2`,
    [id, session.companyId],
  );
}
