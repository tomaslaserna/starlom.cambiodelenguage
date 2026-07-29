import { ApiError } from "@/lib/api-response";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { intField, numberField, textField, type RequestBody } from "@/lib/request-body";
import { computeListMultipliers, type ListRule } from "@/lib/price-list-derivation";
import type { PoolClient } from "pg";

type MarginRow = {
  codigo: string;
  nombre: string;
  precio_0: string;
  precio_1: string;
  precio_2: string;
  precio_3: string;
  margen_minorista: string;
};

type PriceListRow = {
  id: number;
  nombre: string;
  activa: number;
  orden: number;
  multipliers_count: string;
};

const MARGIN_FIELDS = ["precio_0", "precio_1", "precio_2", "precio_3", "margen_minorista"] as const;
const MARGIN_FIELD_LABELS: Record<(typeof MARGIN_FIELDS)[number], string> = {
  precio_0: "L0 - agresivo",
  precio_1: "L1 - suave",
  precio_2: "L2 - ANCLA",
  precio_3: "L3 - caro",
  margen_minorista: "Minorista",
};

function normalizeMarginCode(code: string) {
  return code.trim().toUpperCase();
}

function assertMarginCode(code: string) {
  if (!/^[A-Z0-9][A-Z0-9._-]{0,9}$/.test(code)) {
    throw new ApiError(
      400,
      "Formato de codigo invalido. Usa letras, numeros, punto, guion o guion bajo",
    );
  }
}

function assertRubricCode(code: string) {
  if (!/^[A-Z0-9][A-Z0-9._-]{0,9}$/.test(code)) {
    throw new ApiError(400, "El codigo de rubro tiene formato invalido");
  }
}

function marginNumber(body: RequestBody, key: string, fallback?: number) {
  if (body[key] === undefined || body[key] === null || body[key] === "") return fallback;
  const value = numberField(body, key);
  if (value < 0.01 || value > 9.99) throw new ApiError(400, `${key} debe estar entre 0.01 y 9.99`);
  return value;
}

function mapMargin(row: MarginRow, multipliers: { listId: number; listName: string; multiplier: number }[] = []) {
  return {
    code: row.codigo,
    name: row.nombre,
    price0: Number(row.precio_0),
    price1: Number(row.precio_1),
    price2: Number(row.precio_2),
    price3: Number(row.precio_3),
    retailMargin: Number(row.margen_minorista),
    multipliers,
  };
}

function mapPriceList(row: PriceListRow) {
  return {
    id: row.id,
    name: row.nombre,
    active: Number(row.activa) === 1,
    order: row.orden,
    multipliersCount: Number(row.multipliers_count),
  };
}

export function marginInputFromBody(body: RequestBody, partial = false) {
  const code = normalizeMarginCode(textField(body, "code") || textField(body, "codigo"));
  const name = textField(body, "name") || textField(body, "nombre");

  if (!partial || code) {
    if (!code) throw new ApiError(400, "Codigo obligatorio");
    assertMarginCode(code);
  }
  if (!partial || name) {
    if (!name) throw new ApiError(400, "Nombre obligatorio");
    if (name.length > 100) throw new ApiError(400, "El nombre no puede superar 100 caracteres");
  }

  return {
    code,
    name,
    price0: marginNumber(body, "precio_0", partial ? undefined : 1),
    price1: marginNumber(body, "precio_1", partial ? undefined : 1),
    price2: marginNumber(body, "precio_2", partial ? undefined : 1),
    price3: marginNumber(body, "precio_3", partial ? undefined : 1),
    retailMargin: marginNumber(body, "margen_minorista", partial ? undefined : 1),
  };
}

export function priceListInputFromBody(body: RequestBody) {
  const name = textField(body, "name") || textField(body, "nombre");
  if (!name) throw new ApiError(400, "El nombre no puede estar vacio");
  if (name.length > 50) throw new ApiError(400, "El nombre no puede superar 50 caracteres");
  return { name };
}

export function multiplierInputFromBody(body: RequestBody) {
  const code = normalizeMarginCode(textField(body, "code") || textField(body, "codigo"));
  assertMarginCode(code);
  const listId = intField(body, "listId", intField(body, "lista_id", 0));
  if (listId <= 0) throw new ApiError(400, "lista_id invalido");
  const multiplier = numberField(body, "multiplier", numberField(body, "multiplicador", 0));
  if (multiplier < 0.01 || multiplier > 9.99) {
    throw new ApiError(400, "El multiplicador debe estar entre 0.01 y 9.99");
  }
  return { code, listId, multiplier };
}

export function marginFieldLabel(field: (typeof MARGIN_FIELDS)[number]) {
  return MARGIN_FIELD_LABELS[field];
}

export function rubricInputFromBody(body: RequestBody) {
  const code = normalizeMarginCode(textField(body, "code") || textField(body, "codigo"));
  const name = textField(body, "name") || textField(body, "nombre");
  if (!code) throw new ApiError(400, "El codigo del rubro no puede estar vacio");
  if (!name) throw new ApiError(400, "El nombre del rubro no puede estar vacio");
  assertRubricCode(code);
  if (name.length > 100) throw new ApiError(400, "El nombre no puede superar 100 caracteres");
  return { code, name };
}

export async function listMargins(companyId: number) {
  const margins = await queryWithCompanyContext<MarginRow>(
    companyId,
    `
      SELECT codigo, nombre, precio_0::text, precio_1::text, precio_2::text,
             precio_3::text, margen_minorista::text
      FROM margenes
      WHERE empresa_id = $1
      ORDER BY codigo ASC
    `,
    [companyId],
  );

  const multiplierRows = await queryWithCompanyContext<{
    codigo: string;
    lista_id: number;
    lista_nombre: string;
    multiplicador: string;
  }>(
    companyId,
    `
      SELECT ml.codigo, ml.lista_id, lp.nombre AS lista_nombre, ml.multiplicador::text
      FROM margenes_listas ml
      JOIN listas_precio lp ON lp.id = ml.lista_id AND lp.empresa_id = ml.empresa_id
      WHERE ml.empresa_id = $1 AND lp.activa = 1
      ORDER BY ml.codigo ASC, lp.orden ASC, lp.nombre ASC
    `,
    [companyId],
  );

  const multiplierMap = new Map<string, { listId: number; listName: string; multiplier: number }[]>();
  for (const row of multiplierRows.rows) {
    const list = multiplierMap.get(row.codigo) ?? [];
    list.push({ listId: row.lista_id, listName: row.lista_nombre, multiplier: Number(row.multiplicador) });
    multiplierMap.set(row.codigo, list);
  }

  return margins.rows.map((row) => mapMargin(row, multiplierMap.get(row.codigo) ?? []));
}

export async function createMargin(companyId: number, input: ReturnType<typeof marginInputFromBody>) {
  const result = await queryWithCompanyContext<{ codigo: string }>(
    companyId,
    `
      INSERT INTO margenes (
        codigo, nombre, precio_0, precio_1, precio_2, precio_3, margen_minorista, empresa_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (codigo) DO NOTHING
      RETURNING codigo
    `,
    [
      input.code,
      input.name,
      input.price0,
      input.price1,
      input.price2,
      input.price3,
      input.retailMargin,
      companyId,
    ],
  );
  if (!result.rows[0]) throw new ApiError(409, `El codigo ${input.code} ya existe`);
  return { code: result.rows[0].codigo };
}

export async function updateMargin(
  companyId: number,
  code: string,
  input: ReturnType<typeof marginInputFromBody>,
) {
  const normalizedCode = normalizeMarginCode(code);
  assertMarginCode(normalizedCode);

  const fields: string[] = [];
  const params: unknown[] = [];
  if (input.name) {
    params.push(input.name);
    fields.push(`nombre = $${params.length}`);
  }

  const numericValues: Record<(typeof MARGIN_FIELDS)[number], number | undefined> = {
    precio_0: input.price0,
    precio_1: input.price1,
    precio_2: input.price2,
    precio_3: input.price3,
    margen_minorista: input.retailMargin,
  };
  for (const field of MARGIN_FIELDS) {
    const value = numericValues[field];
    if (value === undefined) continue;
    params.push(value);
    fields.push(`${field} = $${params.length}`);
  }

  if (!fields.length) throw new ApiError(400, "No se recibieron campos para actualizar");
  params.push(normalizedCode, companyId);

  const result = await queryWithCompanyContext<{ codigo: string }>(
    companyId,
    `
      UPDATE margenes
      SET ${fields.join(", ")}
      WHERE codigo = $${params.length - 1} AND empresa_id = $${params.length}
      RETURNING codigo
    `,
    params,
  );

  if (!result.rows[0]) throw new ApiError(404, "Margen no encontrado");
  return { code: normalizedCode };
}

export async function deleteMargin(companyId: number, code: string) {
  const normalizedCode = normalizeMarginCode(code);
  assertMarginCode(normalizedCode);

  return withCompanyContext(companyId, async (client) => {
    const usage = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM products WHERE category_code = $1 AND empresa_id = $2 AND active = true",
      [normalizedCode, companyId],
    );
    const productsCount = Number(usage.rows[0]?.count ?? 0);
    if (productsCount > 0) {
      throw new ApiError(409, `No se puede eliminar: ${productsCount} productos usan esta categoria`);
    }

    await client.query("DELETE FROM margenes_listas WHERE codigo = $1 AND empresa_id = $2", [
      normalizedCode,
      companyId,
    ]);
    const deleted = await client.query<{ codigo: string }>(
      "DELETE FROM margenes WHERE codigo = $1 AND empresa_id = $2 RETURNING codigo",
      [normalizedCode, companyId],
    );
    if (!deleted.rows[0]) throw new ApiError(404, "Margen no encontrado");
    return { code: normalizedCode };
  });
}

export async function listPriceLists(companyId: number, includeInactive = false) {
  const result = await queryWithCompanyContext<PriceListRow>(
    companyId,
    `
      SELECT lp.id, lp.nombre, lp.activa, lp.orden,
             COUNT(ml.codigo)::text AS multipliers_count
      FROM listas_precio lp
      LEFT JOIN margenes_listas ml ON ml.lista_id = lp.id AND ml.empresa_id = lp.empresa_id
      WHERE lp.empresa_id = $1
        AND ($2::boolean OR lp.activa = 1)
      GROUP BY lp.id, lp.nombre, lp.activa, lp.orden
      ORDER BY lp.orden ASC, lp.nombre ASC
    `,
    [companyId, includeInactive],
  );

  return result.rows.map(mapPriceList);
}

export async function createPriceList(companyId: number, input: ReturnType<typeof priceListInputFromBody>) {
  return withCompanyContext(companyId, async (client) => {
    const created = await client.query<{ id: number; nombre: string }>(
      "INSERT INTO listas_precio (nombre, activa, orden, empresa_id) VALUES ($1, 1, 0, $2) RETURNING id, nombre",
      [input.name, companyId],
    );
    const id = created.rows[0].id;
    await client.query(
      `
        INSERT INTO margenes_listas (codigo, lista_id, multiplicador, empresa_id)
        SELECT codigo, $1, 1.00, $2
        FROM margenes
        WHERE empresa_id = $2
        ON CONFLICT (codigo, lista_id) DO NOTHING
      `,
      [id, companyId],
    );
    return { id, name: created.rows[0].nombre };
  });
}

export async function updatePriceList(companyId: number, id: number, input: ReturnType<typeof priceListInputFromBody>) {
  const result = await queryWithCompanyContext<{ id: number }>(
    companyId,
    `
      UPDATE listas_precio
      SET nombre = $1
      WHERE id = $2 AND empresa_id = $3
      RETURNING id
    `,
    [input.name, id, companyId],
  );
  if (!result.rows[0]) throw new ApiError(404, "Lista no encontrada");
  return { id };
}

export async function deactivatePriceList(companyId: number, id: number) {
  const result = await queryWithCompanyContext<{ id: number }>(
    companyId,
    `
      UPDATE listas_precio
      SET activa = 0
      WHERE id = $1 AND empresa_id = $2
      RETURNING id
    `,
    [id, companyId],
  );
  if (!result.rows[0]) throw new ApiError(404, "Lista no encontrada");
  return { id };
}

export async function updatePriceListMultiplier(
  companyId: number,
  input: ReturnType<typeof multiplierInputFromBody>,
) {
  return withCompanyContext(companyId, async (client) => {
    const margin = await client.query("SELECT 1 FROM margenes WHERE codigo = $1 AND empresa_id = $2", [
      input.code,
      companyId,
    ]);
    if (!margin.rows[0]) throw new ApiError(404, `El codigo ${input.code} no existe en margenes`);

    const list = await client.query(
      "SELECT 1 FROM listas_precio WHERE id = $1 AND empresa_id = $2 AND activa = 1",
      [input.listId, companyId],
    );
    if (!list.rows[0]) throw new ApiError(404, "La lista no existe o esta inactiva");

    await client.query(
      `
        INSERT INTO margenes_listas (codigo, lista_id, multiplicador, empresa_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (codigo, lista_id) DO UPDATE
        SET multiplicador = EXCLUDED.multiplicador, empresa_id = EXCLUDED.empresa_id
      `,
      [input.code, input.listId, input.multiplier, companyId],
    );
    return input;
  });
}

export async function listRubrics(companyId: number) {
  const result = await queryWithCompanyContext<{ codigo: string; nombre: string }>(
    companyId,
    `
      SELECT codigo, nombre
      FROM rubros
      WHERE empresa_id = $1
      ORDER BY codigo ASC
    `,
    [companyId],
  );
  return result.rows.map((row) => ({ code: row.codigo, name: row.nombre }));
}

export async function upsertRubric(companyId: number, input: ReturnType<typeof rubricInputFromBody>) {
  const result = await queryWithCompanyContext<{ codigo: string; nombre: string }>(
    companyId,
    `
      INSERT INTO rubros (codigo, nombre, empresa_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (codigo) DO UPDATE
      SET nombre = EXCLUDED.nombre, empresa_id = EXCLUDED.empresa_id
      RETURNING codigo, nombre
    `,
    [input.code, input.name, companyId],
  );
  return { code: result.rows[0].codigo, name: result.rows[0].nombre };
}

export type PriceListParameters = {
  id: number;
  name: string;
  active: boolean;
  order: number;
  derivationType: "costo" | "lista";
  parentListId: number | null;
  percentage: number;
  allowedRoles: string[];
  validFrom: string | null;
  validTo: string | null;
  requiresAuthorization: boolean;
  admitsOffers: boolean;
  floorFactor: number | null;
};

export type SavePriceListInput = {
  id?: number | null;
  name: string;
  derivationType: "costo" | "lista";
  parentListId: number | null;
  percentage: number;
  allowedRoles: string[];
  validFrom: string | null;
  validTo: string | null;
  requiresAuthorization: boolean;
  admitsOffers: boolean;
  floorFactor: number | null;
};

type PriceListParametersRow = {
  id: number;
  nombre: string;
  activa: number;
  orden: number;
  derivation_type: string;
  parent_list_id: number | null;
  percentage: string;
  allowed_roles: string[] | null;
  valid_from: string | null;
  valid_to: string | null;
  requires_authorization: boolean;
  admits_offers: boolean;
  floor_factor: string | null;
};

export async function listPriceListParameters(companyId: number): Promise<PriceListParameters[]> {
  const result = await queryWithCompanyContext<PriceListParametersRow>(
    companyId,
    `
      SELECT id, nombre, activa, orden, derivation_type, parent_list_id, percentage,
             allowed_roles, valid_from::text AS valid_from, valid_to::text AS valid_to,
             requires_authorization, admits_offers, floor_factor::text AS floor_factor
      FROM listas_precio
      WHERE empresa_id = $1
      ORDER BY orden ASC, nombre ASC
    `,
    [companyId],
    { cache: false },
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    name: row.nombre,
    active: Number(row.activa) === 1,
    order: row.orden,
    derivationType: row.derivation_type === "lista" ? "lista" : "costo",
    parentListId: row.parent_list_id === null ? null : Number(row.parent_list_id),
    percentage: Number(row.percentage),
    allowedRoles: row.allowed_roles ?? [],
    validFrom: row.valid_from,
    validTo: row.valid_to,
    requiresAuthorization: Boolean(row.requires_authorization),
    admitsOffers: Boolean(row.admits_offers),
    floorFactor: row.floor_factor === null ? null : Number(row.floor_factor),
  }));
}

// Recalcula los multiplicadores por categoria de cada lista (margenes_listas) a
// partir de las reglas de derivacion. Lo que ya lee todo el calculo de precios.
export async function recomputeListMultipliers(companyId: number, existingClient?: PoolClient) {
  const run = async (client: PoolClient) => {
    const lists = await client.query<{
      id: number;
      derivation_type: string;
      parent_list_id: number | null;
      percentage: string;
    }>(
      `SELECT id, derivation_type, parent_list_id, percentage FROM listas_precio WHERE empresa_id = $1`,
      [companyId],
    );
    const margins = await client.query<{ codigo: string; precio_1: string }>(
      `SELECT codigo, precio_1 FROM margenes WHERE empresa_id = $1`,
      [companyId],
    );
    const baseMargins = new Map(margins.rows.map((row) => [row.codigo, Number(row.precio_1)]));
    const rules: ListRule[] = lists.rows.map((row) => ({
      id: Number(row.id),
      derivationType: row.derivation_type === "lista" ? "lista" : "costo",
      parentId: row.parent_list_id === null ? null : Number(row.parent_list_id),
      percentage: Number(row.percentage),
    }));

    const computed = computeListMultipliers(rules, baseMargins);
    const codigos: string[] = [];
    const listaIds: number[] = [];
    const mults: number[] = [];
    for (const [listId, byCategory] of computed) {
      for (const [codigo, multiplier] of byCategory) {
        codigos.push(codigo);
        listaIds.push(listId);
        mults.push(multiplier);
      }
    }
    if (codigos.length) {
      await client.query(
        `
          INSERT INTO margenes_listas (codigo, lista_id, multiplicador, empresa_id)
          SELECT c, l, m, $4
          FROM UNNEST($1::text[], $2::bigint[], $3::numeric[]) AS t(c, l, m)
          ON CONFLICT (codigo, lista_id) DO UPDATE SET multiplicador = EXCLUDED.multiplicador
        `,
        [codigos, listaIds, mults, companyId],
      );
    }
  };

  if (existingClient) return run(existingClient);
  await withCompanyContext(companyId, run);
}

export async function savePriceListParameters(companyId: number, input: SavePriceListInput) {
  const name = input.name.trim();
  if (!name) throw new ApiError(400, "El nombre no puede estar vacío");
  if (name.length > 50) throw new ApiError(400, "El nombre no puede superar 50 caracteres");
  if (input.derivationType === "lista" && !input.parentListId) {
    throw new ApiError(400, "Elegí la lista de la que deriva");
  }
  if (input.id && input.parentListId === input.id) {
    throw new ApiError(400, "Una lista no puede derivar de sí misma");
  }
  const parentId = input.derivationType === "lista" ? input.parentListId : null;
  const floor = input.floorFactor != null && Number.isFinite(input.floorFactor) ? input.floorFactor : null;

  return withCompanyContext(companyId, async (client) => {
    let listId = input.id ?? null;
    if (listId) {
      const updated = await client.query(
        `
          UPDATE listas_precio
          SET nombre = $1, derivation_type = $2, parent_list_id = $3, percentage = $4,
              allowed_roles = $5, valid_from = $6, valid_to = $7,
              requires_authorization = $8, admits_offers = $9, floor_factor = $10
          WHERE id = $11 AND empresa_id = $12
        `,
        [
          name,
          input.derivationType,
          parentId,
          input.percentage,
          input.allowedRoles,
          input.validFrom,
          input.validTo,
          input.requiresAuthorization,
          input.admitsOffers,
          floor,
          listId,
          companyId,
        ],
      );
      if (updated.rowCount === 0) throw new ApiError(404, "La lista no existe");
    } else {
      const created = await client.query<{ id: number }>(
        `
          INSERT INTO listas_precio (
            nombre, activa, orden, empresa_id, derivation_type, parent_list_id, percentage,
            allowed_roles, valid_from, valid_to, requires_authorization, admits_offers, floor_factor
          )
          VALUES ($1, 1, 0, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id
        `,
        [
          name,
          companyId,
          input.derivationType,
          parentId,
          input.percentage,
          input.allowedRoles,
          input.validFrom,
          input.validTo,
          input.requiresAuthorization,
          input.admitsOffers,
          floor,
        ],
      );
      listId = Number(created.rows[0].id);
    }

    // Recalcula dentro de la misma transaccion; si hay ciclo, lanza y revierte.
    await recomputeListMultipliers(companyId, client);
    return { id: listId };
  });
}
