import { randomUUID } from "node:crypto";
import { ApiError, handleApiError, ok } from "@/lib/api-response";
import { withCompanyContext } from "@/lib/db";
import { readRequestBody } from "@/lib/request-body";
import { ORDERS_CREATE_PERMISSION, requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await requireApiSession([ORDERS_CREATE_PERMISSION]);
    const body = await readRequestBody(request);
    const name = String(body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 180);
    const cost = Number(body.cost);
    const margin = body.margin === undefined || body.margin === "" ? NaN : Number(body.margin);
    if (!name) throw new ApiError(400, "Ingresá el nombre del producto");
    if (!Number.isFinite(cost) || cost <= 0 || cost > 100_000_000)
      throw new ApiError(400, "Ingresá un costo neto válido");
    if (!Number.isFinite(margin) || margin < 0 || margin >= 90)
      throw new ApiError(400, "El margen bruto debe estar entre 0 y 89,99%");

    const product = await withCompanyContext(session.companyId, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock($1::int, hashtext(lower($2)))", [session.companyId, name]);
      const duplicate = await client.query<{ id: string }>(
        "SELECT id::text FROM products WHERE empresa_id=$1 AND active=true AND lower(trim(name))=lower($2) LIMIT 1",
        [session.companyId, name],
      );
      if (duplicate.rows.length)
        throw new ApiError(409, "Ya existe un producto con ese nombre. Buscalo en el catálogo antes de crear otro.");

      const multiplier = Number((1 / (1 - margin / 100)).toFixed(6));
      const code = `PED${randomUUID().replaceAll("-", "").slice(0, 7).toUpperCase()}`;
      await client.query(
        `INSERT INTO margenes (codigo,nombre,precio_0,precio_1,precio_2,precio_3,margen_minorista,empresa_id)
         VALUES ($1,$2,$3,$3,$3,$3,$3,$4)`,
        [code, `Pedido: ${name}`, multiplier, session.companyId],
      );
      await client.query(
        `INSERT INTO margenes_listas (codigo,lista_id,multiplicador,empresa_id)
         SELECT $1,id,$2,$3 FROM listas_precio WHERE empresa_id=$3 AND activa=1`,
        [code, multiplier, session.companyId],
      );
      const created = await client.query<{ id: string }>(
        `INSERT INTO products (category,category_code,sku,name,cost,sale_price,presentation_units,empresa_id)
         VALUES ('Otros artículos',$1,$1,$2,$3,$4,1,$5) RETURNING id::text`,
        [code, name, Number(cost.toFixed(2)), Number((cost * multiplier).toFixed(2)), session.companyId],
      );
      return {
        id: created.rows[0].id,
        code,
        name,
        available: 0,
        presentationUnits: 1,
        cost: Number(cost.toFixed(2)),
        prices: Object.fromEntries(
          (await client.query<{ name: string }>(
            "SELECT nombre AS name FROM listas_precio WHERE empresa_id=$1 AND activa=1",
            [session.companyId],
          )).rows.map((list) => [list.name, Number((cost * multiplier).toFixed(2))]),
        ),
      };
    });
    return ok({ data: product }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
