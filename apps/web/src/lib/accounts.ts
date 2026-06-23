import { ApiError } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { parsePagination } from "@/lib/pagination";
import { numberField, textField, type RequestBody } from "@/lib/request-body";

type ListInput = {
  companyId: number;
  type?: string | null;
  name?: string | null;
  from?: string | null;
  to?: string | null;
  page?: string | null;
  pageSize?: string | null;
};

const ACCOUNT_TYPES = new Set(["cliente", "proveedor"]);
const PAYMENT_TYPES = new Set(["cobro", "pago"]);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeAccountType(value: string) {
  return ACCOUNT_TYPES.has(value) ? value : "cliente";
}

function normalizePaymentType(value: string) {
  return PAYMENT_TYPES.has(value) ? value : "cobro";
}

function searchPattern(query: string) {
  return `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

export function accountMovementFromBody(body: RequestBody) {
  const entityName = textField(body, "entityName") || textField(body, "entidad_nombre");
  if (!entityName) throw new ApiError(400, "La entidad es obligatoria");

  const debit = numberField(body, "debit", numberField(body, "debe", 0));
  const credit = numberField(body, "credit", numberField(body, "haber", 0));
  if (debit < 0 || credit < 0) throw new ApiError(400, "Debe y haber no pueden ser negativos");

  return {
    type: normalizeAccountType(textField(body, "type") || textField(body, "tipo")),
    entityName,
    description: textField(body, "description") || textField(body, "descripcion"),
    debit,
    credit,
    date: textField(body, "date") || textField(body, "fecha") || todayIso(),
  };
}

export function paymentRecordFromBody(body: RequestBody) {
  const amount = numberField(body, "amount", numberField(body, "monto", 0));
  if (amount <= 0) throw new ApiError(400, "El monto debe ser mayor a cero");

  return {
    type: normalizePaymentType(textField(body, "type") || textField(body, "tipo")),
    entityName: textField(body, "entityName") || textField(body, "entidad_nombre"),
    concept: textField(body, "concept") || textField(body, "concepto"),
    amount,
    date: textField(body, "date") || textField(body, "fecha") || todayIso(),
    receiptUrl: textField(body, "receiptUrl") || textField(body, "comprobante_nombre"),
    notes: textField(body, "notes") || textField(body, "notas"),
  };
}

export async function listAccountMovements(input: ListInput) {
  const pagination = parsePagination(input);
  const params: unknown[] = [input.companyId];
  const filters = ["empresa_id = $1"];

  const type = input.type?.trim() ?? "";
  const name = input.name?.trim() ?? "";
  const from = input.from?.trim() ?? "";
  const to = input.to?.trim() ?? "";

  if (type && ACCOUNT_TYPES.has(type)) {
    params.push(type);
    filters.push(`tipo = $${params.length}`);
  }
  if (name) {
    params.push(searchPattern(name));
    filters.push(`entidad_nombre ILIKE $${params.length} ESCAPE '\\'`);
  }
  if (from) {
    params.push(from);
    filters.push(`fecha >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    filters.push(`fecha <= $${params.length}`);
  }

  const where = filters.join(" AND ");
  const countResult = await queryWithCompanyContext<{ total: string }>(
    input.companyId,
    `SELECT COUNT(*)::text AS total FROM cuentas_corrientes WHERE ${where}`,
    params,
  );

  const summaryResult = await queryWithCompanyContext<{
    total_debit: string;
    total_credit: string;
  }>(
    input.companyId,
    `
      SELECT COALESCE(SUM(debe), 0)::text AS total_debit,
             COALESCE(SUM(haber), 0)::text AS total_credit
      FROM cuentas_corrientes
      WHERE ${where}
    `,
    params,
  );

  params.push(pagination.pageSize, pagination.offset);
  const rows = await queryWithCompanyContext<{
    id: number;
    tipo: string;
    entidad_nombre: string;
    descripcion: string;
    debe: string;
    haber: string;
    fecha: string | null;
    id_origen: number | null;
    tipo_origen: string;
    created_at: string;
  }>(
    input.companyId,
    `
      SELECT id, tipo, entidad_nombre, descripcion, debe::text, haber::text,
             fecha::text, id_origen, tipo_origen, created_at::text
      FROM cuentas_corrientes
      WHERE ${where}
      ORDER BY fecha DESC NULLS LAST, id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );

  const total = Number(countResult.rows[0]?.total ?? 0);
  const summary = summaryResult.rows[0] ?? { total_debit: "0", total_credit: "0" };

  return {
    data: rows.rows.map((row) => ({
      id: row.id,
      type: row.tipo,
      entityName: row.entidad_nombre,
      description: row.descripcion,
      debit: Number(row.debe),
      credit: Number(row.haber),
      date: row.fecha,
      originId: row.id_origen,
      originType: row.tipo_origen,
      createdAt: row.created_at,
    })),
    meta: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
      totalDebit: Number(summary.total_debit),
      totalCredit: Number(summary.total_credit),
      balance: Number(summary.total_credit) - Number(summary.total_debit),
    },
  };
}

export async function createAccountMovement(companyId: number, input: ReturnType<typeof accountMovementFromBody>) {
  const result = await queryWithCompanyContext<{ id: number }>(
    companyId,
    `
      INSERT INTO cuentas_corrientes (tipo, entidad_nombre, descripcion, debe, haber, fecha, empresa_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `,
    [input.type, input.entityName, input.description, input.debit, input.credit, input.date, companyId],
  );

  return { id: result.rows[0].id };
}

export async function deleteAccountMovement(companyId: number, id: number) {
  const result = await queryWithCompanyContext<{ id: number }>(
    companyId,
    "DELETE FROM cuentas_corrientes WHERE id = $1 AND empresa_id = $2 RETURNING id",
    [id, companyId],
  );
  if (!result.rows[0]) throw new ApiError(404, "Movimiento no encontrado");
  return { id };
}

export async function listPaymentRecords(input: ListInput) {
  const pagination = parsePagination(input);
  const params: unknown[] = [input.companyId];
  const filters = ["empresa_id = $1"];

  const type = input.type?.trim() ?? "";
  const name = input.name?.trim() ?? "";
  const from = input.from?.trim() ?? "";
  const to = input.to?.trim() ?? "";

  if (type && PAYMENT_TYPES.has(type)) {
    params.push(type);
    filters.push(`tipo = $${params.length}`);
  }
  if (name) {
    params.push(searchPattern(name));
    filters.push(`entidad_nombre ILIKE $${params.length} ESCAPE '\\'`);
  }
  if (from) {
    params.push(from);
    filters.push(`fecha >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    filters.push(`fecha <= $${params.length}`);
  }

  const where = filters.join(" AND ");
  const countResult = await queryWithCompanyContext<{ total: string }>(
    input.companyId,
    `SELECT COUNT(*)::text AS total FROM pagos_registro WHERE ${where}`,
    params,
  );

  params.push(pagination.pageSize, pagination.offset);
  const rows = await queryWithCompanyContext<{
    id: number;
    tipo: string;
    entidad_nombre: string;
    concepto: string;
    monto: string;
    fecha: string | null;
    comprobante_nombre: string;
    notas: string;
    id_origen: number | null;
    tipo_origen: string;
    created_at: string;
  }>(
    input.companyId,
    `
      SELECT id, tipo, entidad_nombre, concepto, monto::text, fecha::text,
             comprobante_nombre, notas, id_origen, tipo_origen, created_at::text
      FROM pagos_registro
      WHERE ${where}
      ORDER BY fecha DESC NULLS LAST, id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );

  const total = Number(countResult.rows[0]?.total ?? 0);
  return {
    data: rows.rows.map((row) => ({
      id: row.id,
      type: row.tipo,
      entityName: row.entidad_nombre,
      concept: row.concepto,
      amount: Number(row.monto),
      date: row.fecha,
      receiptUrl: row.comprobante_nombre,
      notes: row.notas,
      originId: row.id_origen,
      originType: row.tipo_origen,
      createdAt: row.created_at,
    })),
    meta: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
    },
  };
}

export async function createPaymentRecord(companyId: number, input: ReturnType<typeof paymentRecordFromBody>) {
  const result = await queryWithCompanyContext<{ id: number }>(
    companyId,
    `
      INSERT INTO pagos_registro (
        tipo, entidad_nombre, concepto, monto, fecha, comprobante_nombre, notas, empresa_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `,
    [
      input.type,
      input.entityName,
      input.concept,
      input.amount,
      input.date,
      input.receiptUrl,
      input.notes,
      companyId,
    ],
  );

  return { id: result.rows[0].id };
}

export async function deletePaymentRecord(companyId: number, id: number) {
  const result = await queryWithCompanyContext<{ id: number }>(
    companyId,
    "DELETE FROM pagos_registro WHERE id = $1 AND empresa_id = $2 RETURNING id",
    [id, companyId],
  );
  if (!result.rows[0]) throw new ApiError(404, "Registro no encontrado");
  return { id };
}

