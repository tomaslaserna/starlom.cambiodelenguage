import { Buffer } from "node:buffer";
import { TextDecoder } from "node:util";
import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";
import { ApiError } from "@/lib/api-response";
import type { AuthSession } from "@/lib/auth";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { numberField, textField, type RequestBody } from "@/lib/request-body";

type CsvImportResult = {
  inserted?: number;
  updated?: number;
  skipped: number;
  errors: string[];
  processed: number;
};

function decodeCsvBuffer(buffer: Buffer) {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    return buffer.subarray(3).toString("utf8");
  }
  if (buffer.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) {
    return iconv.decode(buffer.subarray(2), "utf16-le");
  }
  if (buffer.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) {
    return iconv.decode(buffer.subarray(2), "utf16-be");
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return iconv.decode(buffer, "win1252");
  }
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  return (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0)
    ? ";"
    : ",";
}

async function csvFileFromRequest(request: Request) {
  const form = await request.formData();
  const file = form.get("csv_file") ?? form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "No se recibio ningun archivo CSV");
  if (!file.name.toLowerCase().endsWith(".csv")) throw new ApiError(400, "Solo se aceptan archivos .csv");
  return file;
}

async function recordsFromCsvRequest(request: Request) {
  const file = await csvFileFromRequest(request);
  const buffer = Buffer.from(await file.arrayBuffer());
  const text = decodeCsvBuffer(buffer);
  const delimiter = detectDelimiter(text);
  const records = parse(text, {
    bom: true,
    delimiter,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: false,
  }) as string[][];

  return records;
}

function value(row: string[], index: number) {
  return String(row[index] ?? "").trim();
}

function hasData(row: string[]) {
  return row.some((cell) => String(cell ?? "").trim() !== "");
}

function toArgentineDecimal(raw: string, fallback = 0) {
  let value = raw.trim().replaceAll("$", "").replaceAll(" ", "");
  if (!value) return fallback;
  if (value.includes(",")) {
    value = value.replaceAll(".", "").replace(",", ".");
  } else {
    value = value.replaceAll(".", "");
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDate(raw: string) {
  const value = raw.trim();
  if (!value || value === "0" || value === "-" || value.toLowerCase() === "null") return null;

  const dmy = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year.padStart(4, "0")}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }

  const ymd = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function parseCustomerStatus(raw: string) {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "perdido") return "Perdido";
  if (normalized === "riesgo" || normalized === "en riesgo") return "En Riesgo";
  return "Activo";
}

function parseReceiptType(raw: string) {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "factura a" || normalized === "a") return "Factura A";
  if (normalized === "remito") return "Remito";
  return "Factura B";
}

export async function importProductsFromCsv(request: Request, companyId: number): Promise<CsvImportResult> {
  const records = await recordsFromCsvRequest(request);
  const dataRows = records.slice(1);
  const result: CsvImportResult = { inserted: 0, skipped: 0, errors: [], processed: 0 };

  await withCompanyContext(companyId, async (client) => {
    for (const [index, row] of dataRows.entries()) {
      const rowNumber = index + 2;
      if (!hasData(row)) continue;
      result.processed++;

      const rubro = value(row, 1);
      const code = value(row, 2).toUpperCase();
      const category = value(row, 3);
      const supplier = value(row, 4);
      const name = value(row, 5);
      const cost = toArgentineDecimal(value(row, 6), 0);
      const stock = Number.parseInt(value(row, 7), 10) || 0;

      if (!name) {
        result.skipped++;
        result.errors.push(`Fila ${rowNumber}: sin nombre, omitida`);
        continue;
      }

      const duplicate = await client.query(
        `
          SELECT id
          FROM productos
          WHERE empresa_id = $1 AND codigo = $2 AND nombre = $3 AND costo = $4
          LIMIT 1
        `,
        [companyId, code, name, cost],
      );
      if (duplicate.rows[0]) {
        result.skipped++;
        result.errors.push(`Fila ${rowNumber}: ${name} ya existe con codigo ${code} y costo ${cost}`);
        continue;
      }

      const next = await client.query<{ next_id: number }>(
        "SELECT COALESCE(MAX(id_producto), 0) + 1 AS next_id FROM productos WHERE empresa_id = $1 AND codigo = $2",
        [companyId, code],
      );

      await client.query(
        `
          INSERT INTO productos (
            id_producto, rubro, codigo, categoria, proveedor, nombre, costo, stock, descripcion, empresa_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '', $9)
        `,
        [next.rows[0].next_id, rubro, code, category, supplier, name, cost, Math.max(0, stock), companyId],
      );
      result.inserted = (result.inserted ?? 0) + 1;
    }
  });

  return result;
}

export async function importCustomersFromCsv(request: Request, companyId: number): Promise<CsvImportResult> {
  const records = await recordsFromCsvRequest(request);
  const dataRows = records.slice(1);
  const result: CsvImportResult = { inserted: 0, skipped: 0, errors: [], processed: 0 };

  await withCompanyContext(companyId, async (client) => {
    for (const [index, row] of dataRows.entries()) {
      const rowNumber = index + 2;
      if (!hasData(row)) continue;
      result.processed++;

      while (row.length < 18) row.push("");

      const code = value(row, 0);
      const name = value(row, 1);
      const businessName = value(row, 2);
      const seller = value(row, 3);
      const taxId = value(row, 4).replace(/\D/g, "");
      const paymentDays = value(row, 5);
      const vatCondition = value(row, 6);
      const phone = value(row, 7).replace(/\D/g, "");
      const status = parseCustomerStatus(value(row, 8));
      const address = value(row, 9);
      const priceList = value(row, 10);
      const hours = value(row, 11);
      const notes = value(row, 12);
      const receipt = parseReceiptType(value(row, 13));
      const lastPurchase = parseDate(value(row, 14));
      const purchaseAge = Number.parseInt(value(row, 15), 10) || 0;
      const averagePurchase = toArgentineDecimal(value(row, 16), 0);
      const repurchaseDate = parseDate(value(row, 17));
      const observation = [notes, /^\d+$/.test(paymentDays) ? `Plazo de pago: ${paymentDays} dias` : ""]
        .filter(Boolean)
        .join(" | ");

      if (!code && !name) {
        result.skipped++;
        result.errors.push(`Fila ${rowNumber}: sin codigo ni nombre, omitida`);
        continue;
      }

      if (code) {
        const duplicate = await client.query(
          "SELECT id FROM clientes WHERE empresa_id = $1 AND codigo_cliente = $2 LIMIT 1",
          [companyId, code],
        );
        if (duplicate.rows[0]) {
          result.skipped++;
          result.errors.push(`Fila ${rowNumber}: ${code} ya existe`);
          continue;
        }
      }

      await client.query(
        `
          INSERT INTO clientes (
            codigo_cliente, nombre_cliente, razon_social, vendedor_cl, tipo_id,
            nro_id, cond_iva, telefono, estado, domicilio, lista_precios,
            horarios, observacion, comprobante, ultima_compra, antiguedad_uc,
            promedio_compra, dia_recompra, empresa_id
          )
          VALUES (
            $1, $2, $3, $4, 'CUIT', $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18
          )
        `,
        [
          code,
          name,
          businessName,
          seller,
          taxId,
          vatCondition,
          phone,
          status,
          address,
          priceList,
          hours,
          observation,
          receipt,
          lastPurchase,
          purchaseAge,
          averagePurchase,
          repurchaseDate,
          companyId,
        ],
      );
      result.inserted = (result.inserted ?? 0) + 1;
    }
  });

  return result;
}

export async function importProductCodesFromCsv(request: Request, companyId: number): Promise<CsvImportResult> {
  const records = await recordsFromCsvRequest(request);
  const dataRows = records.slice(1);
  const result: CsvImportResult = { updated: 0, skipped: 0, errors: [], processed: 0 };

  await withCompanyContext(companyId, async (client) => {
    for (const [index, row] of dataRows.entries()) {
      const rowNumber = index + 2;
      if (!hasData(row)) continue;
      result.processed++;

      const newCode = value(row, 0).toUpperCase();
      const name = value(row, 1);
      const rawCost = value(row, 2);
      const cost = rawCost ? toArgentineDecimal(rawCost, Number.NaN) : null;
      if (!newCode || !name) {
        result.skipped++;
        result.errors.push(`Fila ${rowNumber}: codigo o nombre vacio, omitida`);
        continue;
      }

      const params: unknown[] = [companyId, name];
      let costSql = "";
      if (cost !== null && Number.isFinite(cost)) {
        params.push(cost);
        costSql = ` AND costo = $${params.length}`;
      }

      const found = await client.query<{ id: number }>(
        `SELECT id FROM productos WHERE empresa_id = $1 AND nombre = $2${costSql} LIMIT 10`,
        params,
      );
      if (!found.rows.length) {
        result.skipped++;
        result.errors.push(`Fila ${rowNumber}: ${name} no encontrado`);
        continue;
      }

      const updated = await client.query<{ id: number }>(
        `UPDATE productos SET codigo = $${params.length + 1} WHERE empresa_id = $1 AND nombre = $2${costSql} RETURNING id`,
        [...params, newCode],
      );
      result.updated = (result.updated ?? 0) + (updated.rowCount ?? 0);
    }
  });

  return result;
}

export function stockRecountInputFromBody(body: RequestBody) {
  const rawItems = body.items;
  if (!Array.isArray(rawItems)) throw new ApiError(400, "Sin datos");
  const mode = textField(body, "mode") || textField(body, "modo") || "delta";
  return {
    mode: mode === "exacto" || mode === "exact" ? "exact" : "delta",
    items: rawItems
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const id = Number(record.id);
        const valueNumber = Number(record.value ?? record.valor);
        if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(valueNumber)) return null;
        return { id, value: valueNumber };
      })
      .filter((item): item is { id: number; value: number } => Boolean(item)),
  };
}

export async function applyStockRecount(
  session: AuthSession,
  input: ReturnType<typeof stockRecountInputFromBody>,
) {
  let updated = 0;
  const errors: number[] = [];

  await withCompanyContext(session.companyId, async (client) => {
    for (const item of input.items) {
      const result = await client.query<{ id: number }>(
        input.mode === "exact"
          ? "UPDATE productos SET stock = $1 WHERE id = $2 AND empresa_id = $3 RETURNING id"
          : "UPDATE productos SET stock = GREATEST(0, stock + $1) WHERE id = $2 AND empresa_id = $3 RETURNING id",
        [input.mode === "exact" ? Math.max(0, item.value) : item.value, item.id, session.companyId],
      );
      if (result.rows[0]) updated++;
      else errors.push(item.id);
    }
  });

  return { updated, errors };
}

export function productCreateInputFromBody(body: RequestBody) {
  const name = textField(body, "name") || textField(body, "nombre");
  const code = (textField(body, "code") || textField(body, "codigo")).toUpperCase();
  const cost = numberField(body, "cost", numberField(body, "costo", 0));
  const stock = Math.max(0, Number.parseInt(String(body.stock ?? 0), 10) || 0);
  if (!name) throw new ApiError(400, "El nombre del producto es requerido");
  if (!code) throw new ApiError(400, "Debes seleccionar una categoria de precio");
  if (cost <= 0) throw new ApiError(400, "El costo debe ser mayor a 0");
  return {
    name,
    code,
    cost,
    stock,
    provider: textField(body, "provider") || textField(body, "proveedor"),
    description: textField(body, "description") || textField(body, "descripcion"),
    image: textField(body, "image") || textField(body, "imagen"),
  };
}

export async function createStockProduct(
  session: AuthSession,
  input: ReturnType<typeof productCreateInputFromBody>,
) {
  return withCompanyContext(session.companyId, async (client) => {
    const margin = await client.query<{ nombre: string }>(
      "SELECT nombre FROM margenes WHERE codigo = $1 AND empresa_id = $2 LIMIT 1",
      [input.code, session.companyId],
    );
    if (!margin.rows[0]) {
      throw new ApiError(400, `El codigo de categoria ${input.code} no existe en margenes`);
    }

    const rubric = input.code.replace(/\d+$/g, "");
    const created = await client.query<{ id: number }>(
      `
        INSERT INTO productos (
          id_producto, rubro, codigo, categoria, proveedor, nombre, costo,
          stock, descripcion, imagen, empresa_id
        )
        SELECT COALESCE(MAX(id_producto), 0) + 1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        FROM productos
        WHERE codigo = $2 AND empresa_id = $10
        RETURNING id
      `,
      [
        rubric,
        input.code,
        margin.rows[0].nombre,
        input.provider,
        input.name,
        input.cost,
        input.stock,
        input.description,
        input.image,
        session.companyId,
      ],
    );
    return { id: created.rows[0].id };
  });
}

export function productBulkUpdateInputFromBody(body: RequestBody): Record<string, unknown>[] {
  if (Array.isArray(body.items)) {
    return body.items
      .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
      .filter((item): item is Record<string, unknown> => Boolean(item));
  }

  const ids = Array.isArray(body.id) ? body.id : [];
  return ids.map((id, index): Record<string, unknown> => ({
    id,
    name: Array.isArray(body.nombre) ? body.nombre[index] : undefined,
    cost: Array.isArray(body.precio) ? body.precio[index] : undefined,
    description: Array.isArray(body.descripcion) ? body.descripcion[index] : undefined,
    stock: Array.isArray(body.cantidad) ? body.cantidad[index] : undefined,
    image: Array.isArray(body.imagen) ? body.imagen[index] : undefined,
  }));
}

export async function bulkUpdateProducts(
  session: AuthSession,
  items: ReturnType<typeof productBulkUpdateInputFromBody>,
) {
  let updated = 0;

  await withCompanyContext(session.companyId, async (client) => {
    for (const item of items) {
      const id = Number(item.id);
      if (!Number.isInteger(id) || id <= 0) continue;
      const result = await client.query<{ id: number }>(
        `
          UPDATE productos
          SET nombre = $1, costo = $2, descripcion = $3, stock = $4, imagen = $5
          WHERE id = $6 AND empresa_id = $7
          RETURNING id
        `,
        [
          String(item.name ?? item.nombre ?? "").trim(),
          Number(item.cost ?? item.costo ?? item.precio ?? 0),
          String(item.description ?? item.descripcion ?? "").trim(),
          Math.max(0, Number.parseInt(String(item.stock ?? item.cantidad ?? 0), 10) || 0),
          String(item.image ?? item.imagen ?? "").trim(),
          id,
          session.companyId,
        ],
      );
      if (result.rows[0]) updated++;
    }
  });

  return { updated };
}

export async function listVendors(companyId: number) {
  const result = await queryWithCompanyContext<{
    id: number;
    nombre: string;
    apellido: string;
    lista_precios_fav: string;
  }>(
    companyId,
    `
      SELECT id, nombre, apellido, lista_precios_fav
      FROM operadores
      WHERE empresa_id = $1
      ORDER BY nombre ASC, apellido ASC
    `,
    [companyId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.nombre,
    lastName: row.apellido,
    favoritePriceList: row.lista_precios_fav,
  }));
}
