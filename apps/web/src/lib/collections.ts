import { ApiError } from "@/lib/api-response";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { numberField, textField, type RequestBody } from "@/lib/request-body";
import type { AuthSession } from "@/lib/auth";
import type { PoolClient } from "pg";

const APPROVAL_STATES = new Set(["pendiente_aprobacion", "en_proceso"]);
const REGISTERABLE_STATES = new Set(["pendiente", "vencido"]);
const PAYMENT_METHODS = new Set(["efectivo", "transferencia", "echeck"]);
const COLLECTION_RESOLUTION_CONFLICT =
  "El cobro ya no esta pendiente de resolucion o no puede procesarse";

type CollectionResolutionSale = {
  id: number;
  nombre_cliente: string;
  monto: string;
  nro_comprobante: number;
  estado_cobro: string;
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

function remittanceLabel(value: { nro_remito?: number | null; nro_comprobante?: number | null; id?: number }) {
  const numberValue = value.nro_remito ?? value.nro_comprobante ?? value.id ?? 0;
  return `#${String(numberValue).padStart(4, "0")}`;
}

function throwCollectionResolutionConflict(): never {
  throw new ApiError(409, COLLECTION_RESOLUTION_CONFLICT);
}

function assertResolvedOneRow(rows: { id: number }[]) {
  if (rows.length !== 1) throwCollectionResolutionConflict();
}

async function lockCollectionSaleForResolution(
  client: PoolClient,
  companyId: number,
  saleId: number,
) {
  const saleResult = await client.query<CollectionResolutionSale>(
    `
      SELECT v.id, v.nombre_cliente, v.monto::text, v.nro_comprobante,
             COALESCE(v.estado_cobro,'pendiente') AS estado_cobro,
             COALESCE(v.cobro_monto_registrado,0)::text AS cobro_monto_registrado,
             COALESCE(v.cobro_fecha, CURRENT_DATE)::text AS cobro_fecha,
             COALESCE(v.cobro_metodo,'') AS cobro_metodo,
             COALESCE(v.cobro_destino,'') AS cobro_destino,
             COALESCE(v.cobro_operacion,'') AS cobro_operacion,
             COALESCE(v.cobro_notas,'') AS cobro_notas,
             COALESCE((
               SELECT r.nro_remito
               FROM remitos r
               WHERE r.id_venta = v.id AND r.empresa_id = v.empresa_id
               ORDER BY r.id
               LIMIT 1
             ), v.nro_comprobante) AS nro_remito
      FROM ventas v
      WHERE v.id = $1 AND v.empresa_id = $2
      FOR UPDATE OF v
    `,
    [saleId, companyId],
  );
  const sale = saleResult.rows[0];
  if (!sale || !APPROVAL_STATES.has(sale.estado_cobro)) {
    throwCollectionResolutionConflict();
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
  saleId: number,
  sale: { nombre_cliente: string; monto: string | number; nro_remito?: number | null; nro_comprobante: number },
) {
  const existing = await client.query(
    `
      SELECT id
      FROM cuentas_corrientes
      WHERE empresa_id = $1
        AND id_origen = $2
        AND tipo_origen = 'venta'
        AND debe > 0
      LIMIT 1
    `,
    [companyId, saleId],
  );
  if (existing.rows[0] || Number(sale.monto) <= 0) return;

  await client.query(
    `
      INSERT INTO cuentas_corrientes (
        tipo, entidad_nombre, descripcion, debe, haber, fecha, id_origen, tipo_origen, empresa_id
      )
      VALUES ('cliente', $1, $2, $3, 0, CURRENT_DATE, $4, 'venta', $5)
    `,
    [
      sale.nombre_cliente,
      `Saldo pendiente - Remito ${remittanceLabel(sale)}`,
      Number(sale.monto),
      saleId,
      companyId,
    ],
  );
}

export async function listPendingCollections(companyId: number) {
  const result = await queryWithCompanyContext<{
    id: number;
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
  }>(
    companyId,
    `
      SELECT v.id, v.nro_comprobante, v.tipo_cbte, COALESCE(v.cae,'') AS cae,
             v.fecha::text, v.monto::text, v.nombre_cliente, v.dni_cliente,
             COALESCE(rm.nro_remito, v.nro_comprobante) AS nro_remito,
             COALESCE(cli.codigo_cliente, '') AS codigo_cliente,
             COALESCE(cli.nro_id, v.dni_cliente, '') AS cuit_cliente,
             COALESCE(v.cobro_metodo,'') AS cobro_metodo,
             COALESCE(v.cobro_monto_registrado,0)::text AS cobro_monto_registrado,
             v.cobro_fecha::text,
             COALESCE(v.cobro_destino,'') AS cobro_destino,
             COALESCE(v.cobro_operacion,'') AS cobro_operacion,
             COALESCE(v.cobro_notas,'') AS cobro_notas,
             COALESCE(v.cobro_registrado_por,'') AS cobro_registrado_por,
             v.cobro_registrado_at::text,
             COALESCE(v.estado_cobro,'pendiente') AS estado_cobro,
             COALESCE(docs.total, 0)::text AS documentos_asociados
      FROM ventas v
      LEFT JOIN (
        SELECT id_venta, MIN(nro_remito) AS nro_remito
        FROM remitos
        WHERE empresa_id = $1
        GROUP BY id_venta
      ) rm ON rm.id_venta = v.id
      LEFT JOIN (
        SELECT regexp_replace(nro_id, '[^0-9]', '', 'g') AS nro_norm,
               MAX(NULLIF(codigo_cliente,'')) AS codigo_cliente,
               MAX(NULLIF(nro_id,'')) AS nro_id
        FROM clientes
        WHERE empresa_id = $1 AND COALESCE(nro_id,'') <> ''
        GROUP BY regexp_replace(nro_id, '[^0-9]', '', 'g')
      ) cli ON cli.nro_norm = regexp_replace(v.dni_cliente, '[^0-9]', '', 'g')
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total
        FROM comprobantes_venta cv
        WHERE cv.empresa_id = v.empresa_id AND cv.id_venta = v.id
      ) docs ON TRUE
      WHERE COALESCE(v.estado_cobro,'pendiente') IN ('pendiente_aprobacion','en_proceso')
        AND v.empresa_id = $1
        AND COALESCE(v.estado_pedido,'entregado') = 'entregado'
      ORDER BY v.cobro_registrado_at DESC, v.id DESC
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
  }));
}

export async function registerCollection(
  session: AuthSession,
  saleId: number,
  input: CollectionRegistrationInput,
) {
  return withCompanyContext(session.companyId, async (client) => {
    const saleResult = await client.query<{
      nombre_cliente: string;
      monto: string;
      nro_comprobante: number;
      estado_cobro: string;
      nro_remito: number | null;
    }>(
      `
        SELECT v.nombre_cliente, v.monto::text, v.nro_comprobante,
               COALESCE(v.estado_cobro,'pendiente') AS estado_cobro,
               COALESCE((
                 SELECT r.nro_remito
                 FROM remitos r
                 WHERE r.id_venta = v.id AND r.empresa_id = v.empresa_id
                 ORDER BY r.id
                 LIMIT 1
               ), v.nro_comprobante) AS nro_remito
        FROM ventas v
        WHERE v.id = $1 AND v.empresa_id = $2
        LIMIT 1
      `,
      [saleId, session.companyId],
    );
    const sale = saleResult.rows[0];
    if (!sale) throw new ApiError(404, "Venta no encontrada");
    if (!REGISTERABLE_STATES.has(sale.estado_cobro)) {
      throw new ApiError(400, "La venta no esta pendiente de cobro");
    }

    await ensureSaleDebit(client, session.companyId, saleId, sale);

    await client.query(
      `
        UPDATE ventas
        SET estado_cobro = 'pendiente_aprobacion',
            cobro_metodo = $1,
            cobro_monto_registrado = $2,
            cobro_fecha = $3,
            cobro_destino = $4,
            cobro_operacion = $5,
            cobro_notas = $6,
            cobro_registrado_por = $7,
            cobro_registrado_at = NOW(),
            cobro_aprobado_por = '',
            cobro_aprobado_at = NULL,
            cobro_justificacion_proceso = '',
            cobro_intento_proceso_at = NULL
        WHERE id = $8 AND empresa_id = $9
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

    return { id: saleId, status: "pendiente_aprobacion", amount: input.amount };
  });
}

export async function approveCollection(session: AuthSession, saleId: number) {
  return withCompanyContext(session.companyId, async (client) => {
    const sale = await lockCollectionSaleForResolution(client, session.companyId, saleId);

    const amount = Number(sale.cobro_monto_registrado);
    if (amount <= 0) throw new ApiError(400, "El monto registrado es invalido");

    await ensureSaleDebit(client, session.companyId, saleId, sale);

    const doc = remittanceLabel(sale);
    const description = `Cobro aprobado - Remito ${doc}`;
    await client.query(
      `
        INSERT INTO cuentas_corrientes (
          tipo, entidad_nombre, descripcion, debe, haber, fecha, id_origen, tipo_origen, empresa_id
        )
        VALUES ('cliente', $1, $2, 0, $3, $4, $5, 'venta', $6)
      `,
      [sale.nombre_cliente, description, amount, sale.cobro_fecha || todayIso(), saleId, session.companyId],
    );

    const detail = `Metodo: ${sale.cobro_metodo} | Cuenta destino/entrega: ${sale.cobro_destino} | Operacion: ${sale.cobro_operacion} | ${sale.cobro_notas}`.trim();
    await client.query(
      `
        INSERT INTO pagos_registro (
          tipo, entidad_nombre, concepto, monto, fecha, notas, id_origen, tipo_origen, empresa_id
        )
        VALUES ('cobro', $1, $2, $3, $4, $5, $6, 'venta', $7)
      `,
      [sale.nombre_cliente, description, amount, sale.cobro_fecha || todayIso(), detail, saleId, session.companyId],
    );

    const totalResult = await client.query<{ total_haber: string | null }>(
      `
        SELECT SUM(haber)::text AS total_haber
        FROM cuentas_corrientes
        WHERE empresa_id = $1 AND id_origen = $2 AND tipo_origen = 'venta'
      `,
      [session.companyId, saleId],
    );
    const totalCredit = Number(totalResult.rows[0]?.total_haber ?? 0);
    const nextStatus = totalCredit + 0.0001 >= Number(sale.monto) ? "recibido" : "pendiente";

    const updateResult = await client.query<{ id: number }>(
      `
        UPDATE ventas
        SET estado_cobro = $1,
            cobro_aprobado_por = $2,
            cobro_aprobado_at = NOW()
        WHERE id = $3 AND empresa_id = $4
          AND COALESCE(estado_cobro,'pendiente') IN ('pendiente_aprobacion','en_proceso')
        RETURNING id
      `,
      [nextStatus, session.username, saleId, session.companyId],
    );
    assertResolvedOneRow(updateResult.rows);

    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        "cobro.aprobado",
        JSON.stringify({ id: saleId, estado: nextStatus, monto: amount, usuario: session.username }),
        session.companyId,
      ],
    );

    return { id: saleId, status: nextStatus, amount };
  });
}

export async function rejectCollection(session: AuthSession, saleId: number, reason: string) {
  return withCompanyContext(session.companyId, async (client) => {
    await lockCollectionSaleForResolution(client, session.companyId, saleId);

    const note = reason.trim()
      ? `Cobro rechazado por ${session.username}: ${reason.trim()}`
      : `Cobro rechazado por ${session.username}`;

    const updateResult = await client.query<{ id: number }>(
      `
        UPDATE ventas
        SET estado_cobro = 'pendiente',
            cobro_metodo = '',
            cobro_monto_registrado = 0,
            cobro_fecha = NULL,
            cobro_destino = '',
            cobro_operacion = '',
            cobro_notas = '',
            cobro_registrado_por = '',
            cobro_registrado_at = NULL,
            cobro_aprobado_por = '',
            cobro_aprobado_at = NULL,
            cobro_justificacion_proceso = $1,
            cobro_intento_proceso_at = NOW()
        WHERE id = $2 AND empresa_id = $3
          AND COALESCE(estado_cobro,'pendiente') IN ('pendiente_aprobacion','en_proceso')
        RETURNING id
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

    return { id: saleId, status: "pendiente" };
  });
}
