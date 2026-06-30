import { ApiError } from "@/lib/api-response";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { normalizeOrderStatusValue, normalizedOrderStatusSql } from "@/lib/order-status";
import { numberField, textField, type RequestBody } from "@/lib/request-body";
import { canonicalSalesSourceSql } from "@/lib/sales-source-sql";
import type { AuthSession } from "@/lib/auth";
import type { PoolClient } from "pg";

const APPROVAL_STATES = new Set(["pendiente_aprobacion", "en_proceso"]);
const REGISTERABLE_STATES = new Set(["pendiente", "vencido"]);
const PAYMENT_METHODS = new Set(["efectivo", "transferencia", "echeck"]);
const MONEY_EPSILON = 0.005;
const COLLECTION_RESOLUTION_CONFLICT =
  "El cobro ya no esta pendiente de resolucion o no puede procesarse";

type CollectionResolutionSale = {
  id: string;
  client_id: string | null;
  nombre_cliente: string;
  monto: string;
  nro_comprobante: number;
  estado_cobro: string;
  estado_pedido: string;
  cobro_monto_registrado: string;
  cobro_fecha: string | null;
  cobro_metodo: string;
  cobro_destino: string;
  cobro_operacion: string;
  cobro_notas: string;
  nro_remito: number | null;
};

export type CollectionRegistrationInput = {
  amount: number;
  date: string;
  method: string;
  destination: string;
  operation: string;
  notes: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function remittanceLabel(value: { nro_remito?: number | null; nro_comprobante?: number | null; id?: string | number }) {
  const numberValue = value.nro_remito ?? value.nro_comprobante ?? value.id ?? 0;
  return `#${String(numberValue).padStart(4, "0")}`;
}

function throwCollectionResolutionConflict(): never {
  throw new ApiError(409, COLLECTION_RESOLUTION_CONFLICT);
}

function assertResolvedOneRow(rows: { id: string }[]) {
  if (rows.length !== 1) throwCollectionResolutionConflict();
}

function moneyValue(value: string | number | null | undefined) {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

function assertCollectionAmountWithinBalance(amount: number, outstanding: number) {
  if (amount > outstanding + MONEY_EPSILON) {
    throw new ApiError(
      400,
      `El cobro supera el saldo pendiente. Saldo disponible: ${outstanding.toFixed(2)}`,
    );
  }
}

async function saleCollectedCredit(
  client: {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: { total_credit: string | null }[] }>;
  },
  companyId: number,
  saleId: string,
) {
  const totalResult = await client.query(
    `
      SELECT COALESCE(SUM(credit), 0)::text AS total_credit
      FROM current_account_movements
      WHERE empresa_id = $1 AND sale_id = $2::uuid
    `,
    [companyId, saleId],
  );

  return moneyValue(totalResult.rows[0]?.total_credit);
}

async function saleOutstandingBalance(
  client: {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: { total_credit: string | null }[] }>;
  },
  companyId: number,
  saleId: string,
  saleTotal: string | number,
) {
  const collected = await saleCollectedCredit(client, companyId, saleId);
  return Math.max(0, moneyValue(saleTotal) - collected);
}

async function lockCollectionSaleForResolution(
  client: PoolClient,
  companyId: number,
  saleId: string,
) {
  const saleResult = await client.query<CollectionResolutionSale>(
    `
      SELECT v.id::text AS id, v.client_id::text,
             COALESCE(v.client_name, c.display_name, '') AS nombre_cliente,
             COALESCE(v.total_amount, 0)::text AS monto,
             COALESCE(v.receipt_number, nullif(regexp_replace(COALESCE(v.sale_number, ''), '\D', '', 'g'), '')::bigint, 0)::int AS nro_comprobante,
             COALESCE(v.collection_status,'pendiente') AS estado_cobro,
             ${normalizedOrderStatusSql("v")} AS estado_pedido,
             COALESCE(v.collection_registered_amount,0)::text AS cobro_monto_registrado,
             COALESCE(v.collection_date, CURRENT_DATE)::text AS cobro_fecha,
             COALESCE(v.collection_method,'') AS cobro_metodo,
             COALESCE(v.collection_destination,'') AS cobro_destino,
             COALESCE(v.collection_operation,'') AS cobro_operacion,
             COALESCE(v.collection_notes,'') AS cobro_notas,
             COALESCE(v.receipt_number, nullif(regexp_replace(COALESCE(v.sale_number, ''), '\D', '', 'g'), '')::bigint, 0)::int AS nro_remito
      FROM sales v
      LEFT JOIN clients c ON c.id = v.client_id AND c.empresa_id = v.empresa_id
      WHERE v.id = $1::uuid AND v.empresa_id = $2
      FOR UPDATE OF v
    `,
    [saleId, companyId],
  );
  const sale = saleResult.rows[0];
  if (!sale || !APPROVAL_STATES.has(sale.estado_cobro)) {
    throwCollectionResolutionConflict();
  }
  if (normalizeOrderStatusValue(sale.estado_pedido) !== "entregado") {
    throw new ApiError(400, "El pedido debe estar entregado para resolver el cobro");
  }

  return sale;
}

export function collectionRegistrationFromBody(body: RequestBody): CollectionRegistrationInput {
  const amount = numberField(body, "amount", numberField(body, "monto", 0));
  const method = (textField(body, "method") || textField(body, "metodo")).toLowerCase();
  const destination = textField(body, "destination") || textField(body, "destino");
  const operation = textField(body, "operation") || textField(body, "operacion");
  const notes = textField(body, "notes") || textField(body, "notas");
  const date = textField(body, "date") || textField(body, "fecha") || todayIso();

  if (amount <= 0) throw new ApiError(400, "El monto debe ser mayor a cero");
  if (!PAYMENT_METHODS.has(method)) throw new ApiError(400, "Metodo de cobro invalido");
  if (!destination) throw new ApiError(400, "El destino es obligatorio");
  if (method !== "efectivo" && !operation) throw new ApiError(400, "La operacion es obligatoria");

  return { amount, date, method, destination, operation, notes };
}

export function rejectionReasonFromBody(body: RequestBody) {
  return textField(body, "reason") || textField(body, "motivo");
}

async function ensureSaleDebit(
  client: {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  },
  companyId: number,
  saleId: string,
  sale: { client_id?: string | null; nombre_cliente: string; monto: string | number; nro_remito?: number | null; nro_comprobante: number },
) {
  const existing = await client.query(
    `
      SELECT id
      FROM current_account_movements
      WHERE empresa_id = $1
        AND sale_id = $2::uuid
        AND debit > 0
      LIMIT 1
    `,
    [companyId, saleId],
  );
  if (existing.rows[0] || Number(sale.monto) <= 0) return;

  await client.query(
    `
      INSERT INTO current_account_movements (
        client_id, sale_id, movement_date, debit, credit, description, empresa_id
      )
      VALUES ($1::uuid, $2::uuid, CURRENT_DATE, $3, 0, $4, $5)
    `,
    [
      sale.client_id ?? null,
      saleId,
      Number(sale.monto),
      `Saldo pendiente - Remito ${remittanceLabel(sale)} - ${sale.nombre_cliente}`,
      companyId,
    ],
  );
}

export async function listPendingCollections(companyId: number) {
  const result = await queryWithCompanyContext<{
    id: string;
    nro_comprobante: number;
    tipo_cbte: number;
    cae: string;
    fecha: string | null;
    monto: string;
    nombre_cliente: string;
    dni_cliente: string;
    nro_remito: number | null;
    codigo_cliente: string;
    cuit_cliente: string;
    cobro_metodo: string;
    cobro_monto_registrado: string;
    cobro_fecha: string | null;
    cobro_destino: string;
    cobro_operacion: string;
    cobro_notas: string;
    cobro_registrado_por: string;
    cobro_registrado_at: string | null;
    estado_cobro: string;
    documentos_asociados: string;
    cobrado_aprobado: string;
    saldo_actual: string;
    saldo_despues_aprobar: string;
  }>(
    companyId,
    `
      SELECT v.id::text AS id,
             COALESCE(v.receipt_number, nullif(regexp_replace(COALESCE(v.sale_number, ''), '\D', '', 'g'), '')::bigint, 0)::int AS nro_comprobante,
             0 AS tipo_cbte,
             '' AS cae,
             v.sale_date::text AS fecha,
             COALESCE(v.total_amount, 0)::text AS monto,
             COALESCE(v.client_name, cli.display_name, '') AS nombre_cliente,
             COALESCE(v.client_document, cli.tax_id, '') AS dni_cliente,
             COALESCE(v.receipt_number, nullif(regexp_replace(COALESCE(v.sale_number, ''), '\D', '', 'g'), '')::bigint, 0)::int AS nro_remito,
             COALESCE(cli.external_code, '') AS codigo_cliente,
             COALESCE(cli.tax_id, v.client_document, '') AS cuit_cliente,
             COALESCE(v.collection_method,'') AS cobro_metodo,
             COALESCE(v.collection_registered_amount,0)::text AS cobro_monto_registrado,
             v.collection_date::text AS cobro_fecha,
             COALESCE(v.collection_destination,'') AS cobro_destino,
             COALESCE(v.collection_operation,'') AS cobro_operacion,
             COALESCE(v.collection_notes,'') AS cobro_notas,
             COALESCE(v.collection_registered_by,'') AS cobro_registrado_por,
             v.collection_registered_at::text AS cobro_registrado_at,
             COALESCE(v.collection_status,'pendiente') AS estado_cobro,
             0::text AS documentos_asociados,
             COALESCE(approved.total_credit, 0)::text AS cobrado_aprobado,
             GREATEST(COALESCE(v.total_amount, 0) - COALESCE(approved.total_credit, 0), 0)::text AS saldo_actual,
             GREATEST(COALESCE(v.total_amount, 0) - COALESCE(approved.total_credit, 0) - COALESCE(v.collection_registered_amount, 0), 0)::text AS saldo_despues_aprobar
      FROM sales v
      LEFT JOIN clients cli ON cli.id = v.client_id AND cli.empresa_id = v.empresa_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(cam.credit), 0) AS total_credit
        FROM current_account_movements cam
        WHERE cam.empresa_id = v.empresa_id AND cam.sale_id = v.id
      ) approved ON true
      WHERE COALESCE(v.collection_status,'pendiente') IN ('pendiente_aprobacion','en_proceso')
        AND v.empresa_id = $1
        AND ${canonicalSalesSourceSql("v")}
        AND ${normalizedOrderStatusSql("v")} = 'entregado'
      ORDER BY v.collection_registered_at DESC, v.created_at DESC
    `,
    [companyId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    receiptNumber: row.nro_comprobante,
    receiptType: row.tipo_cbte,
    hasFiscalAuthorization: row.cae !== "",
    date: row.fecha,
    amount: Number(row.monto),
    customerName: row.nombre_cliente,
    customerDocument: row.dni_cliente,
    remittanceNumber: row.nro_remito,
    remittanceLabel: remittanceLabel(row),
    customerCode: row.codigo_cliente,
    customerTaxId: row.cuit_cliente,
    method: row.cobro_metodo,
    registeredAmount: Number(row.cobro_monto_registrado),
    collectionDate: row.cobro_fecha,
    destination: row.cobro_destino,
    operation: row.cobro_operacion,
    notes: row.cobro_notas,
    registeredBy: row.cobro_registrado_por,
    registeredAt: row.cobro_registrado_at,
    status: row.estado_cobro,
    associatedDocuments: Number(row.documentos_asociados),
    approvedAmount: Number(row.cobrado_aprobado),
    outstandingAmount: Number(row.saldo_actual),
    outstandingAfterApproval: Number(row.saldo_despues_aprobar),
  }));
}

export async function registerCollection(
  session: AuthSession,
  saleId: string,
  input: CollectionRegistrationInput,
) {
  return withCompanyContext(session.companyId, async (client) => {
    const saleResult = await client.query<{
      client_id: string | null;
      nombre_cliente: string;
      monto: string;
      nro_comprobante: number;
      estado_cobro: string;
      estado_pedido: string;
      nro_remito: number | null;
    }>(
      `
        SELECT v.client_id::text,
               COALESCE(v.client_name, c.display_name, '') AS nombre_cliente,
               COALESCE(v.total_amount, 0)::text AS monto,
               COALESCE(v.receipt_number, nullif(regexp_replace(COALESCE(v.sale_number, ''), '\D', '', 'g'), '')::bigint, 0)::int AS nro_comprobante,
               COALESCE(v.collection_status,'pendiente') AS estado_cobro,
               ${normalizedOrderStatusSql("v")} AS estado_pedido,
               COALESCE(v.receipt_number, nullif(regexp_replace(COALESCE(v.sale_number, ''), '\D', '', 'g'), '')::bigint, 0)::int AS nro_remito
        FROM sales v
        LEFT JOIN clients c ON c.id = v.client_id AND c.empresa_id = v.empresa_id
        WHERE v.id = $1::uuid AND v.empresa_id = $2
        LIMIT 1
      `,
      [saleId, session.companyId],
    );
    const sale = saleResult.rows[0];
    if (!sale) throw new ApiError(404, "Venta no encontrada");
    if (!REGISTERABLE_STATES.has(sale.estado_cobro)) {
      throw new ApiError(400, "La venta no esta pendiente de cobro");
    }
    if (normalizeOrderStatusValue(sale.estado_pedido) !== "entregado") {
      throw new ApiError(400, "El pedido debe estar entregado para registrar un cobro");
    }

    await ensureSaleDebit(client, session.companyId, saleId, sale);
    const outstanding = await saleOutstandingBalance(client, session.companyId, saleId, sale.monto);
    if (outstanding <= MONEY_EPSILON) {
      throw new ApiError(400, "La venta ya no tiene saldo pendiente");
    }
    assertCollectionAmountWithinBalance(input.amount, outstanding);

    await client.query(
      `
        UPDATE sales
        SET collection_status = 'pendiente_aprobacion',
            collection_method = $1,
            collection_registered_amount = $2,
            collection_date = $3,
            collection_destination = $4,
            collection_operation = $5,
            collection_notes = $6,
            collection_registered_by = $7,
            collection_registered_at = NOW(),
            collection_approved_by = '',
            collection_approved_at = NULL,
            collection_resolution_note = '',
            collection_resolution_at = NULL,
            updated_at = now()
        WHERE id = $8::uuid AND empresa_id = $9
      `,
      [
        input.method,
        input.amount,
        input.date,
        input.destination,
        input.operation,
        input.notes,
        session.username,
        saleId,
        session.companyId,
      ],
    );

    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        "cobro.registrado",
        JSON.stringify({ id: saleId, monto: input.amount, usuario: session.username }),
        session.companyId,
      ],
    );

    clearReadQueryCache();
    return { id: saleId, status: "pendiente_aprobacion", amount: input.amount };
  });
}

export async function approveCollection(session: AuthSession, saleId: string) {
  return withCompanyContext(session.companyId, async (client) => {
    const sale = await lockCollectionSaleForResolution(client, session.companyId, saleId);

    const amount = Number(sale.cobro_monto_registrado);
    if (amount <= 0) throw new ApiError(400, "El monto registrado es invalido");

    await ensureSaleDebit(client, session.companyId, saleId, sale);
    const outstanding = await saleOutstandingBalance(client, session.companyId, saleId, sale.monto);
    if (outstanding <= MONEY_EPSILON) {
      throw new ApiError(400, "La venta ya no tiene saldo pendiente");
    }
    assertCollectionAmountWithinBalance(amount, outstanding);

    const doc = remittanceLabel(sale);
    const description = `Cobro aprobado - Remito ${doc}`;
    await client.query(
      `
        INSERT INTO payments (
          client_id, sale_id, payment_date, amount, method, reference,
          status, registered_by, empresa_id
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, 'registrado', $7::uuid, $8)
      `,
      [
        sale.client_id ?? null,
        saleId,
        sale.cobro_fecha || todayIso(),
        amount,
        sale.cobro_metodo,
        sale.cobro_operacion || description,
        session.userId,
        session.companyId,
      ],
    );

    const detail = `Metodo: ${sale.cobro_metodo} | Cuenta destino/entrega: ${sale.cobro_destino} | Operacion: ${sale.cobro_operacion} | ${sale.cobro_notas}`.trim();
    await client.query(
      `
        INSERT INTO current_account_movements (
          client_id, sale_id, movement_date, debit, credit, description, empresa_id
        )
        VALUES ($1::uuid, $2::uuid, $3, 0, $4, $5, $6)
      `,
      [
        sale.client_id ?? null,
        saleId,
        sale.cobro_fecha || todayIso(),
        amount,
        `${description} | ${detail}`,
        session.companyId,
      ],
    );

    const nextOutstanding = Math.max(0, outstanding - amount);
    const nextStatus = nextOutstanding <= MONEY_EPSILON ? "recibido" : "pendiente";
    const resolutionNote =
      nextStatus === "pendiente"
        ? `Cobro parcial aprobado. Saldo pendiente: ${nextOutstanding.toFixed(2)}`
        : "Cobro total aprobado";

    const updateResult = await client.query<{ id: string }>(
      `
        UPDATE sales
        SET collection_status = $1,
            collection_approved_by = $2,
            collection_approved_at = NOW(),
            collection_resolution_note = $5,
            collection_resolution_at = NOW(),
            updated_at = now()
        WHERE id = $3::uuid AND empresa_id = $4
          AND COALESCE(collection_status,'pendiente') IN ('pendiente_aprobacion','en_proceso')
        RETURNING id::text AS id
      `,
      [nextStatus, session.username, saleId, session.companyId, resolutionNote],
    );
    assertResolvedOneRow(updateResult.rows);

    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        "cobro.aprobado",
        JSON.stringify({
          id: saleId,
          estado: nextStatus,
          monto: amount,
          saldo_pendiente: nextOutstanding,
          usuario: session.username,
        }),
        session.companyId,
      ],
    );

    clearReadQueryCache();
    return { id: saleId, status: nextStatus, amount };
  });
}

export async function rejectCollection(session: AuthSession, saleId: string, reason: string) {
  return withCompanyContext(session.companyId, async (client) => {
    await lockCollectionSaleForResolution(client, session.companyId, saleId);

    const note = reason.trim()
      ? `Cobro rechazado por ${session.username}: ${reason.trim()}`
      : `Cobro rechazado por ${session.username}`;

    const updateResult = await client.query<{ id: string }>(
      `
        UPDATE sales
        SET collection_status = 'pendiente',
            collection_method = '',
            collection_registered_amount = 0,
            collection_date = NULL,
            collection_destination = '',
            collection_operation = '',
            collection_notes = '',
            collection_registered_by = '',
            collection_registered_at = NULL,
            collection_approved_by = '',
            collection_approved_at = NULL,
            collection_resolution_note = $1,
            collection_resolution_at = NOW(),
            updated_at = now()
        WHERE id = $2::uuid AND empresa_id = $3
          AND COALESCE(collection_status,'pendiente') IN ('pendiente_aprobacion','en_proceso')
        RETURNING id::text AS id
      `,
      [note, saleId, session.companyId],
    );
    assertResolvedOneRow(updateResult.rows);

    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        "cobro.rechazado",
        JSON.stringify({ id: saleId, motivo: reason, usuario: session.username }),
        session.companyId,
      ],
    );

    clearReadQueryCache();
    return { id: saleId, status: "pendiente" };
  });
}
