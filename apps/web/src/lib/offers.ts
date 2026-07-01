import { ApiError } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";

export type Offer = {
  id: string;
  title: string;
  description: string;
  active: boolean;
  productId: string | null;
  productName: string | null;
};

export type OfferInput = {
  title: string;
  description: string;
  active: boolean;
  productId: string | null;
};

type OfferRow = {
  id: string;
  title: string;
  description: string;
  active: boolean;
  product_id: string | null;
  product_name: string | null;
};

function mapOffer(row: OfferRow): Offer {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    active: row.active,
    productId: row.product_id,
    productName: row.product_name,
  };
}

const OFFER_SELECT = `
  SELECT o.id::text AS id, o.title, o.description, o.active,
         o.product_id::text AS product_id, p.name AS product_name
  FROM offers o
  LEFT JOIN products p ON p.id = o.product_id AND p.empresa_id = o.empresa_id
`;

export async function listOffers(companyId: number): Promise<Offer[]> {
  const result = await queryWithCompanyContext<OfferRow>(
    companyId,
    `${OFFER_SELECT} WHERE o.empresa_id = $1 ORDER BY o.active DESC, o.title ASC`,
    [companyId],
  );
  return result.rows.map(mapOffer);
}

export async function listActiveOffers(companyId: number): Promise<Offer[]> {
  const result = await queryWithCompanyContext<OfferRow>(
    companyId,
    `${OFFER_SELECT} WHERE o.empresa_id = $1 AND o.active = true ORDER BY o.title ASC`,
    [companyId],
  );
  return result.rows.map(mapOffer);
}

export async function getOffer(companyId: number, id: string): Promise<Offer> {
  const result = await queryWithCompanyContext<OfferRow>(
    companyId,
    `${OFFER_SELECT} WHERE o.id = $1::uuid AND o.empresa_id = $2 LIMIT 1`,
    [id, companyId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "Oferta no encontrada");
  return mapOffer(row);
}

export async function createOffer(companyId: number, input: OfferInput): Promise<string> {
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    `INSERT INTO offers (title, description, active, product_id, empresa_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id::text AS id`,
    [input.title, input.description, input.active, input.productId, companyId],
  );
  return result.rows[0].id;
}

export async function updateOffer(companyId: number, id: string, input: OfferInput): Promise<void> {
  const result = await queryWithCompanyContext(
    companyId,
    `UPDATE offers
       SET title = $1, description = $2, active = $3, product_id = $4, updated_at = now()
     WHERE id = $5::uuid AND empresa_id = $6`,
    [input.title, input.description, input.active, input.productId, id, companyId],
  );
  if (result.rowCount === 0) throw new ApiError(404, "Oferta no encontrada");
}

export async function setOfferActive(companyId: number, id: string, active: boolean): Promise<void> {
  const result = await queryWithCompanyContext(
    companyId,
    `UPDATE offers SET active = $1, updated_at = now() WHERE id = $2::uuid AND empresa_id = $3`,
    [active, id, companyId],
  );
  if (result.rowCount === 0) throw new ApiError(404, "Oferta no encontrada");
}

export function offerInputFromBody(body: Record<string, string>): OfferInput {
  const title = (body.title ?? "").trim();
  const description = (body.description ?? "").trim();
  if (!title) throw new ApiError(400, "El titulo es obligatorio");
  if (!description) throw new ApiError(400, "El texto de la oferta es obligatorio");
  const productId = (body.productId ?? "").trim() || null;
  const active = (body.active ?? "activa") !== "inactiva";
  return { title, description, active, productId };
}
