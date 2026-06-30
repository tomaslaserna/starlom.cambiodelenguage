import { ApiError } from "@/lib/api-response";
import { clearReadQueryCache, queryWithCompanyContext } from "@/lib/db";
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
    filters.push(`entity_type = $${params.length}`);
  }
  if (name) {
    params.push(searchPattern(name));
    filters.push(`entity_name ILIKE $${params.length} ESCAPE '\\'`);
  }
  if (from) {
    params.push(from);
    filters.push(`movement_date >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    filters.push(`movement_date <= $${params.length}`);
  }

  const where = filters.join(" AND ");
  const countResult = await queryWithCompanyContext<{ total: string }>(
    input.companyId,
    `SELECT COUNT(*)::text AS total FROM current_account_movements WHERE ${where}`,
    params,
  );

  const summaryResult = await queryWithCompanyContext<{
    total_debit: string;
    total_credit: string;
  }>(
    input.companyId,
    `
      SELECT COALESCE(SUM(debit), 0)::text AS total_debit,
             COALESCE(SUM(credit), 0)::text AS total_credit
      FROM current_account_movements
      WHERE ${where}
    `,
    params,
  );

  params.push(pagination.pageSize, pagination.offset);
  const rows = await queryWithCompanyContext<{
    id: string;
    entity_type: string;
    entity_name: string;
    description: string;
    debit: string;
    credit: string;
    movement_date: string | null;
    sale_id: string | null;
    purchase_id: string | null;
    payment_id: string | null;
    created_at: string;
  }>(
    input.companyId,
    `
      SELECT id::text AS id, entity_type, entity_name, description,
             debit::text, credit::text, movement_date::text,
             sale_id::text, purchase_id::text, payment_id::text, created_at::text
      FROM current_account_movements
      WHERE ${where}
      ORDER BY movement_date DESC NULLS LAST, created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );

  const total = Number(countResult.rows[0]?.total ?? 0);
  const summary = summaryResult.rows[0] ?? { total_debit: "0", total_credit: "0" };

  return {
    data: rows.rows.map((row) => ({
      id: row.id,
      type: row.entity_type,
      entityName: row.entity_name,
      description: row.description,
      debit: Number(row.debit),
      credit: Number(row.credit),
      date: row.movement_date,
      originId: row.sale_id ?? row.purchase_id ?? row.payment_id,
      originType: row.sale_id ? "venta" : row.purchase_id ? "compra" : row.payment_id ? "pago" : "",
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
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    `
      INSERT INTO current_account_movements (
        entity_type, entity_name, description, debit, credit, movement_date, empresa_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id::text AS id
    `,
    [input.type, input.entityName, input.description, input.debit, input.credit, input.date, companyId],
  );

  clearReadQueryCache();
  return { id: result.rows[0].id };
}

export async function deleteAccountMovement(companyId: number, id: string) {
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    "DELETE FROM current_account_movements WHERE id = $1::uuid AND empresa_id = $2 RETURNING id::text AS id",
    [id, companyId],
  );
  if (!result.rows[0]) throw new ApiError(404, "Movimiento no encontrado");
  clearReadQueryCache();
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
    filters.push(`entity_type = $${params.length}`);
  }
  if (name) {
    params.push(searchPattern(name));
    filters.push(`entity_name ILIKE $${params.length} ESCAPE '\\'`);
  }
  if (from) {
    params.push(from);
    filters.push(`payment_date >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    filters.push(`payment_date <= $${params.length}`);
  }

  const where = filters.join(" AND ");
  const countResult = await queryWithCompanyContext<{ total: string }>(
    input.companyId,
    `SELECT COUNT(*)::text AS total FROM payments WHERE ${where}`,
    params,
  );

  params.push(pagination.pageSize, pagination.offset);
  const rows = await queryWithCompanyContext<{
    id: string;
    entity_type: string;
    entity_name: string;
    concept: string;
    amount: string;
    payment_date: string | null;
    receipt_url: string;
    notas: string;
    sale_id: string | null;
    purchase_id: string | null;
    created_at: string;
  }>(
    input.companyId,
    `
      SELECT id::text AS id, entity_type, entity_name,
             COALESCE(concept, reference, '') AS concept,
             amount::text, payment_date::text, receipt_url, notes AS notas,
             sale_id::text, purchase_id::text, created_at::text
      FROM payments
      WHERE ${where}
      ORDER BY payment_date DESC NULLS LAST, created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );

  const total = Number(countResult.rows[0]?.total ?? 0);
  return {
    data: rows.rows.map((row) => ({
      id: row.id,
      type: row.entity_type,
      entityName: row.entity_name,
      concept: row.concept,
      amount: Number(row.amount),
      date: row.payment_date,
      receiptUrl: row.receipt_url,
      notes: row.notas,
      originId: row.sale_id ?? row.purchase_id,
      originType: row.sale_id ? "venta" : row.purchase_id ? "compra" : "",
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
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    `
      INSERT INTO payments (
        entity_type, entity_name, concept, amount, payment_date,
        receipt_url, notes, method, reference, status, empresa_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $1, $3, 'registrado', $8)
      RETURNING id::text AS id
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

  clearReadQueryCache();
  return { id: result.rows[0].id };
}

export async function deletePaymentRecord(companyId: number, id: string) {
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    "DELETE FROM payments WHERE id = $1::uuid AND empresa_id = $2 RETURNING id::text AS id",
    [id, companyId],
  );
  if (!result.rows[0]) throw new ApiError(404, "Registro no encontrado");
  clearReadQueryCache();
  return { id };
}
