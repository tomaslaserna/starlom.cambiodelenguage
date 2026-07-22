import { Buffer } from "node:buffer";
import { TextDecoder } from "node:util";
import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";
import { ApiError } from "@/lib/api-response";

export const MAX_STOCK_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_STOCK_IMPORT_ROWS = 5_000;
export const MAX_STOCK_IMPORT_QUANTITY = 1_000_000_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StockImportMode = "entrada" | "salida" | "exacto";

export type StockImportSourceRow = {
  rowNumber: number;
  productId: string;
  code: string;
  mode: StockImportMode | null;
  quantity: number | null;
  reason: string;
  errors: string[];
};

type ParseStockImportOptions = {
  defaultMode?: string;
  defaultReason?: string;
  fileName?: string;
};

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function valuesByNormalizedKey(record: Record<string, unknown>) {
  return new Map(Object.entries(record).map(([key, value]) => [normalizeKey(key), value]));
}

function firstValue(values: Map<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    const value = values.get(alias);
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function decimalValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let normalized = String(value ?? "").trim().replaceAll(" ", "");
  if (!normalized) return null;
  if (normalized.includes(",")) normalized = normalized.replaceAll(".", "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeStockImportMode(value: unknown): StockImportMode | null {
  const normalized = normalizeKey(String(value ?? ""));
  if (["entrada", "ingreso", "ingresar", "suma", "sumar", "positivo", "ajuste_positivo"].includes(normalized)) {
    return "entrada";
  }
  if (["salida", "egreso", "retirar", "resta", "restar", "negativo", "ajuste_negativo"].includes(normalized)) {
    return "salida";
  }
  if (["exacto", "exact", "stock", "total", "recuento", "stock_final"].includes(normalized)) return "exacto";
  return null;
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  return (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
}

function parseJsonRecords(text: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, "El archivo o texto JSON no es valido");
  }

  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.items)) return record.items;
    if (Array.isArray(record.productos)) return record.productos;
    if (Array.isArray(record.data)) return record.data;
    return [record];
  }
  throw new ApiError(400, "El JSON debe contener un array de movimientos o un objeto con items");
}

function parseCsvRecords(text: string) {
  try {
    return parse(text, {
      bom: true,
      columns: (headers: string[]) => headers.map(normalizeKey),
      delimiter: detectDelimiter(text),
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, unknown>[];
  } catch {
    throw new ApiError(400, "No se pudo leer el CSV. Revisa encabezados, separadores y comillas");
  }
}

function looksLikeJson(text: string, fileName: string) {
  const extension = fileName.toLocaleLowerCase("es");
  if (extension.endsWith(".json")) return true;
  if (extension.endsWith(".csv")) return false;
  return text.trimStart().startsWith("[") || text.trimStart().startsWith("{");
}

function parsedSourceRow(
  raw: unknown,
  rowNumber: number,
  options: ParseStockImportOptions,
): StockImportSourceRow {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const values = valuesByNormalizedKey(record);
  const suppliedRowNumber = decimalValue(firstValue(values, ["row_number", "rownumber", "numero_fila"]));
  const resolvedRowNumber =
    suppliedRowNumber !== null && Number.isInteger(suppliedRowNumber) && suppliedRowNumber > 0
      ? suppliedRowNumber
      : rowNumber;
  const productId = String(
    firstValue(values, ["product_id", "productid", "id_producto", "producto_id", "id"]) ?? "",
  ).trim();
  const code = String(firstValue(values, ["sku", "codigo", "code", "codigo_producto"]) ?? "").trim();
  const explicitMode = firstValue(values, ["tipo", "type", "modo", "mode", "movimiento"]);
  const exactValue = firstValue(values, ["stock", "stock_final", "cantidad_final", "cantidad_actual"]);
  const deltaValue = firstValue(values, ["delta", "diferencia", "ajuste"]);
  const quantityValue = firstValue(values, ["cantidad", "quantity", "valor", "value"]);
  let mode = normalizeStockImportMode(explicitMode ?? options.defaultMode);
  let quantity = decimalValue(exactValue ?? deltaValue ?? quantityValue);

  if (exactValue !== undefined && explicitMode === undefined && !options.defaultMode) mode = "exacto";
  if (deltaValue !== undefined && explicitMode === undefined && !options.defaultMode && quantity !== null) {
    mode = quantity < 0 ? "salida" : "entrada";
    quantity = Math.abs(quantity);
  }

  const reason = String(
    firstValue(values, ["motivo", "reason", "observacion", "observaciones", "nota", "notes"]) ??
      options.defaultReason ??
      "",
  ).trim();
  const errors: string[] = [];
  if (!productId && !code) errors.push("falta id_producto o codigo");
  if (productId && !UUID_PATTERN.test(productId)) errors.push("id_producto no es un UUID valido");
  if (!mode) errors.push("falta un tipo valido: entrada, salida o exacto");
  if (quantity === null) errors.push("la cantidad no es numerica");
  else if (!Number.isInteger(quantity)) errors.push("la cantidad debe ser un numero entero");
  else if (mode === "exacto" ? quantity < 0 : quantity <= 0) {
    errors.push(mode === "exacto" ? "el stock exacto no puede ser negativo" : "la cantidad debe ser mayor a cero");
  } else if (quantity > MAX_STOCK_IMPORT_QUANTITY) {
    errors.push("la cantidad supera el limite permitido");
  }
  if (!reason) errors.push("falta el motivo");

  return {
    rowNumber: resolvedRowNumber,
    productId,
    code,
    mode,
    quantity,
    reason,
    errors,
  };
}

export function parseStockImportText(text: string, options: ParseStockImportOptions = {}) {
  if (Buffer.byteLength(text, "utf8") > MAX_STOCK_IMPORT_BYTES) {
    throw new ApiError(413, "La carga de stock supera el limite de 5 MB");
  }
  if (!text.trim()) throw new ApiError(400, "Selecciona un archivo o pega datos para validar");

  const json = looksLikeJson(text, options.fileName ?? "");
  const records = json ? parseJsonRecords(text) : parseCsvRecords(text);
  if (records.length > MAX_STOCK_IMPORT_ROWS) {
    throw new ApiError(400, `La carga supera el limite de ${MAX_STOCK_IMPORT_ROWS} filas`);
  }
  if (!records.length) throw new ApiError(400, "La carga no contiene filas");

  const firstRowNumber = json ? 1 : 2;
  return records.map((record, index) => parsedSourceRow(record, firstRowNumber + index, options));
}

export function decodeStockImportBytes(bytes: ArrayBuffer) {
  const buffer = Buffer.from(bytes);
  if (buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) return buffer.subarray(3).toString("utf8");
  if (buffer.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) return iconv.decode(buffer.subarray(2), "utf16-le");
  if (buffer.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) return iconv.decode(buffer.subarray(2), "utf16-be");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return iconv.decode(buffer, "win1252");
  }
}
