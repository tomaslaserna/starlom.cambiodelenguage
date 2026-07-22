import { Buffer } from "node:buffer";
import { TextDecoder } from "node:util";
import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";
import { ApiError } from "@/lib/api-response";
import type { AuthSession } from "@/lib/auth";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { resolvePriceListName } from "@/lib/order-pricing";
import { assertRequestSize, numberField, textField, type RequestBody } from "@/lib/request-body";

type CsvImportResult = {
  inserted?: number;
  updated?: number;
  skipped: number;
  errors: string[];
  processed: number;
};

const MAX_CSV_BYTES = 10 * 1024 * 1024;
const MAX_CSV_ROWS = 50_000;
const CSV_MIME_TYPES = new Set([
  "",
  "application/csv",
  "application/octet-stream",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
]);

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
  assertRequestSize(request, MAX_CSV_BYTES + 256 * 1024, "El CSV");
  const form = await request.formData();
  const file = form.get("csv_file") ?? form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "No se recibio ningun archivo CSV");
  if (!file.name.toLowerCase().endsWith(".csv")) throw new ApiError(400, "Solo se aceptan archivos .csv");
  if (file.size > MAX_CSV_BYTES) throw new ApiError(400, "El CSV supera el limite de 10 MB");
  if (!CSV_MIME_TYPES.has(file.type)) throw new ApiError(400, "El tipo de archivo CSV no es valido");
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
  if (records.length > MAX_CSV_ROWS) {
    throw new ApiError(400, `El CSV supera el limite de ${MAX_CSV_ROWS} filas`);
  }

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

function parseCustomerStatus(raw: string) {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "perdido") return "Perdido";
  if (normalized === "riesgo" || normalized === "en riesgo") return "En Riesgo";
  return "Activo";
}

function parseReceiptType(raw: string) {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "factura a" || normalized === "a") return "Factura A";
  if (normalized === "factura c" || normalized === "c") return "Factura C";
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
      const supplierName = value(row, 4);
      const name = value(row, 5);
      const cost = toArgentineDecimal(value(row, 6), 0);

      if (!name) {
        result.skipped++;
        result.errors.push(`Fila ${rowNumber}: sin nombre, omitida`);
        continue;
      }

      const duplicate = await client.query(
        `
          SELECT id
          FROM products
          WHERE empresa_id = $1 AND category_code = $2 AND name = $3 AND COALESCE(cost, 0) = $4
          LIMIT 1
        `,
        [companyId, code, name, cost],
      );
      if (duplicate.rows[0]) {
        result.skipped++;
        result.errors.push(`Fila ${rowNumber}: ${name} ya existe con codigo ${code} y costo ${cost}`);
        continue;
      }

      const supplier = supplierName
        ? await client.query<{ id: string }>(
            "SELECT id::text AS id FROM suppliers WHERE empresa_id = $1 AND active = true AND display_name ILIKE $2 LIMIT 1",
            [companyId, supplierName],
          )
        : { rows: [] };

      await client.query<{ id: string }>(
        `
          INSERT INTO products (
            category, category_code, supplier_id, name, cost, empresa_id
          )
          VALUES ($1, $2, $3::uuid, $4, $5, $6)
          RETURNING id::text AS id
        `,
        [category || rubro, code, supplier.rows[0]?.id ?? null, name, cost, companyId],
      );

      result.inserted = (result.inserted ?? 0) + 1;
    }
  });

  clearReadQueryCache();
  return result;
}

export async function importCustomersFromCsv(request: Request, companyId: number): Promise<CsvImportResult> {
  const records = await recordsFromCsvRequest(request);
  const dataRows = records.slice(1);
  const result: CsvImportResult = { inserted: 0, skipped: 0, errors: [], processed: 0 };

  await withCompanyContext(companyId, async (client) => {
    const activePriceLists = (
      await client.query<{ nombre: string }>(
        `
          SELECT nombre
          FROM listas_precio
          WHERE empresa_id = $1 AND activa = 1
          ORDER BY orden ASC, nombre ASC
        `,
        [companyId],
      )
    ).rows.map((row) => row.nombre);

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
      const priceList = resolvePriceListName(value(row, 10), activePriceLists);
      const hours = value(row, 11);
      const notes = value(row, 12);
      const receipt = parseReceiptType(value(row, 13));
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
          "SELECT id FROM clients WHERE empresa_id = $1 AND external_code = $2 LIMIT 1",
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
          INSERT INTO clients (
            external_code, display_name, legal_name, seller_name, tax_id,
            fiscal_condition, phone, active, address, price_list_name,
            opening_hours, notes, receipt_type, payment_term_days, empresa_id
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8 <> 'Perdido', $9, $10,
            $11, $12, $13, $14, $15
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
          /^\d+$/.test(paymentDays) ? Number(paymentDays) : null,
          companyId,
        ],
      );
      result.inserted = (result.inserted ?? 0) + 1;
    }
  });

  clearReadQueryCache();
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
        costSql = ` AND COALESCE(cost, 0) = $${params.length}`;
      }

      const found = await client.query<{ id: string }>(
        `SELECT id::text AS id FROM products WHERE empresa_id = $1 AND name = $2${costSql} LIMIT 10`,
        params,
      );
      if (!found.rows.length) {
        result.skipped++;
        result.errors.push(`Fila ${rowNumber}: ${name} no encontrado`);
        continue;
      }

      const updated = await client.query<{ id: string }>(
        `UPDATE products SET category_code = $${params.length + 1}, updated_at = now() WHERE empresa_id = $1 AND name = $2${costSql} RETURNING id::text AS id`,
        [...params, newCode],
      );
      result.updated = (result.updated ?? 0) + (updated.rowCount ?? 0);
    }
  });

  clearReadQueryCache();
  return result;
}

export function productCreateInputFromBody(body: RequestBody) {
  const name = textField(body, "name") || textField(body, "nombre");
  const code = (textField(body, "code") || textField(body, "codigo")).toUpperCase();
  const sku = (textField(body, "sku") || textField(body, "codigoProducto")).toUpperCase();
  const cost = numberField(body, "cost", numberField(body, "costo", 0));
  if (!name) throw new ApiError(400, "El nombre del producto es requerido");
  if (!code) throw new ApiError(400, "Debes seleccionar una categoria de precio");
  if (cost <= 0) throw new ApiError(400, "El costo debe ser mayor a 0");
  return {
    name,
    code,
    sku,
    cost,
    provider: textField(body, "provider") || textField(body, "proveedor"),
  };
}

export async function createCatalogProduct(
  session: AuthSession,
  input: ReturnType<typeof productCreateInputFromBody>,
) {
  const result = await withCompanyContext(session.companyId, async (client) => {
    const margin = await client.query<{ nombre: string }>(
      "SELECT nombre FROM margenes WHERE codigo = $1 AND empresa_id = $2 LIMIT 1",
      [input.code, session.companyId],
    );
    if (!margin.rows[0]) {
      throw new ApiError(400, `El codigo de categoria ${input.code} no existe en margenes`);
    }

    if (input.sku) {
      const duplicate = await client.query<{ id: string }>(
        "SELECT id::text AS id FROM products WHERE empresa_id = $1 AND UPPER(COALESCE(sku, '')) = $2 LIMIT 1",
        [session.companyId, input.sku],
      );
      if (duplicate.rows[0]) throw new ApiError(409, `Ya existe un producto con el codigo ${input.sku}`);
    }

    const rubric = input.code.replace(/\d+$/g, "");
    const supplier = input.provider
      ? await client.query<{ id: string }>(
          "SELECT id::text AS id FROM suppliers WHERE empresa_id = $1 AND active = true AND display_name ILIKE $2 LIMIT 1",
          [session.companyId, input.provider],
        )
      : { rows: [] };

    const created = await client.query<{ id: string }>(
      `
        INSERT INTO products (
          category, category_code, sku, supplier_id, name, cost, empresa_id
        )
        VALUES ($1, $2, $3, $4::uuid, $5, $6, $7)
        RETURNING id::text AS id
      `,
      [
        margin.rows[0].nombre || rubric,
        input.code,
        input.sku || null,
        supplier.rows[0]?.id ?? null,
        input.name,
        input.cost,
        session.companyId,
      ],
    );

    return { id: created.rows[0].id };
  });

  clearReadQueryCache();
  return result;
}

export async function listVendors(companyId: number) {
  const result = await queryWithCompanyContext<{
    id: string;
    name: string;
  }>(
    companyId,
    `
      SELECT p.id::text AS id,
             COALESCE(NULLIF(p.full_name, ''), NULLIF(p.username, ''), p.email, '') AS name
      FROM usuario_empresa ue
      JOIN profiles p ON p.id = ue.id_usuario
      WHERE ue.empresa_id = $1
        AND ue.activo = TRUE
        AND ue.role::text = 'vendedor'
      ORDER BY name ASC
    `,
    [companyId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    lastName: "",
    favoritePriceList: "",
  }));
}
