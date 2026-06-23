import { ApiError } from "@/lib/api-response";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { intField, textField, type RequestBody } from "@/lib/request-body";
import type { AuthSession } from "@/lib/auth";

export type SalesDocumentItem = {
  id: number;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type SalesNoteInput = {
  saleId: number;
  remittanceId: number;
  className: "NC" | "ND";
  fiscal: boolean;
  reason: string;
  detail: SalesDocumentItem[];
};

function parseDetail(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed;
  }
  return [];
}

function itemText(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null) return String(value).trim();
  }
  return "";
}

function itemNumber(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && value !== "") {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
    }
  }
  return 0;
}

export function salesNoteInputFromBody(body: RequestBody): SalesNoteInput {
  const className = (textField(body, "className") || textField(body, "clase")).toUpperCase();
  if (className !== "NC" && className !== "ND") throw new ApiError(400, "Clase invalida");

  const rawDetail = body.detail ?? body.detalle ?? body.detalle_json;
  let rawItems: unknown[];
  try {
    rawItems = parseDetail(rawDetail);
  } catch {
    throw new ApiError(400, "Detalle JSON invalido");
  }

  const detail = rawItems
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const quantity = Math.trunc(itemNumber(item, ["quantity", "cantidad"]));
      const unitPrice = itemNumber(item, ["unitPrice", "precio_unit"]);
      return {
        id: Math.trunc(itemNumber(item, ["id", "productId", "id_producto"])),
        name: itemText(item, ["name", "nombre"]),
        quantity,
        unitPrice,
        subtotal: Number((quantity * unitPrice).toFixed(2)),
      };
    })
    .filter((item) => item.quantity > 0);

  if (!detail.length) throw new ApiError(400, "Agrega al menos un producto");

  return {
    saleId: intField(body, "saleId", intField(body, "id_venta", 0)),
    remittanceId: intField(body, "remittanceId", intField(body, "id_remito", 0)),
    className,
    fiscal: intField(body, "fiscal", 0) === 1 || textField(body, "fiscal") === "true",
    reason: textField(body, "reason") || textField(body, "motivo"),
    detail,
  };
}

export async function getSalesDocumentContext(companyId: number, saleId = 0, remittanceId = 0) {
  if (saleId <= 0 && remittanceId <= 0) throw new ApiError(400, "Falta id_venta o id_remito");

  const response: {
    sale: Record<string, unknown> | null;
    detail: SalesDocumentItem[];
    notes: Record<string, unknown>[];
  } = { sale: null, detail: [], notes: [] };

  if (saleId > 0) {
    const saleResult = await queryWithCompanyContext<{
      id: number;
      cae: string;
      tipo_cbte: number;
      nro_comprobante: number;
      nombre_cliente: string;
      dni_cliente: string;
      monto: string;
      estado_pedido: string;
    }>(
      companyId,
      `
        SELECT id, COALESCE(cae, '') AS cae, tipo_cbte, nro_comprobante,
               nombre_cliente, dni_cliente, monto::text,
               COALESCE(estado_pedido, 'entregado') AS estado_pedido
        FROM ventas
        WHERE id = $1 AND empresa_id = $2
        LIMIT 1
      `,
      [saleId, companyId],
    );
    const sale = saleResult.rows[0];
    if (!sale) throw new ApiError(404, "Venta no encontrada");

    response.sale = {
      id: sale.id,
      hasInvoice: sale.cae.trim() !== "",
      receiptType: sale.tipo_cbte,
      receiptNumber: String(sale.nro_comprobante).padStart(8, "0"),
      customerName: sale.nombre_cliente,
      customerDocument: sale.dni_cliente,
      amount: Number(sale.monto),
      delivered: sale.estado_pedido === "entregado",
    };

    const detailResult = await queryWithCompanyContext<{
      id_producto: number;
      nombre: string;
      cantidad: number;
      precio_unit: string;
    }>(
      companyId,
      `
        SELECT d.id_producto,
               COALESCE(d.nombre_producto, p.nombre, '(producto)') AS nombre,
               d.cantidad,
               d.precio_unit::text
        FROM detalle_ventas d
        LEFT JOIN productos p ON p.id = d.id_producto AND p.empresa_id = d.empresa_id
        WHERE d.id_venta = $1 AND d.empresa_id = $2
        ORDER BY d.id ASC
      `,
      [saleId, companyId],
    );

    response.detail = detailResult.rows.map((item) => ({
      id: item.id_producto,
      name: item.nombre,
      quantity: item.cantidad,
      unitPrice: Number(item.precio_unit),
      subtotal: Number((item.cantidad * Number(item.precio_unit)).toFixed(2)),
    }));
  } else {
    const remittanceResult = await queryWithCompanyContext<{
      id: number;
      nombre_cliente: string;
      dni_cliente: string;
      nro_remito: number;
      monto: string;
    }>(
      companyId,
      `
        SELECT id, nombre_cliente, dni_cliente, nro_remito, monto::text
        FROM remitos
        WHERE id = $1 AND empresa_id = $2
        LIMIT 1
      `,
      [remittanceId, companyId],
    );
    const remittance = remittanceResult.rows[0];
    if (!remittance) throw new ApiError(404, "Remito no encontrado");

    response.sale = {
      remittanceId: remittance.id,
      hasInvoice: false,
      receiptNumber: String(remittance.nro_remito).padStart(8, "0"),
      customerName: remittance.nombre_cliente,
      customerDocument: remittance.dni_cliente,
      amount: Number(remittance.monto),
      delivered: true,
    };

    const detailResult = await queryWithCompanyContext<{
      id_producto: number;
      nombre: string;
      cantidad: number;
      precio_unit: string;
    }>(
      companyId,
      `
        SELECT d.id_producto,
               COALESCE(d.nombre_producto, p.nombre, '(producto)') AS nombre,
               d.cantidad,
               d.precio_unit::text
        FROM detalle_remitos d
        LEFT JOIN productos p ON p.id = d.id_producto AND p.empresa_id = d.empresa_id
        WHERE d.id_remito = $1 AND d.empresa_id = $2
        ORDER BY d.id ASC
      `,
      [remittanceId, companyId],
    );

    response.detail = detailResult.rows.map((item) => ({
      id: item.id_producto,
      name: item.nombre,
      quantity: item.cantidad,
      unitPrice: Number(item.precio_unit),
      subtotal: Number((item.cantidad * Number(item.precio_unit)).toFixed(2)),
    }));
  }

  const notesResult = await queryWithCompanyContext<{
    id: number;
    clase: string;
    fiscal: number;
    tipo_cbte: number;
    nro_comprobante: number;
    monto: string;
    motivo: string;
    creado_en: string;
  }>(
    companyId,
    `
      SELECT id, clase, fiscal, tipo_cbte, nro_comprobante, monto::text, motivo, creado_en::text
      FROM comprobantes_venta
      WHERE empresa_id = $1
        AND ${saleId > 0 ? "id_venta = $2" : "id_remito = $2"}
      ORDER BY id DESC
    `,
    [companyId, saleId > 0 ? saleId : remittanceId],
  );

  response.notes = notesResult.rows.map((note) => ({
    id: note.id,
    className: note.clase,
    fiscal: Number(note.fiscal) === 1,
    receiptType: note.tipo_cbte,
    receiptNumber: String(note.nro_comprobante).padStart(8, "0"),
    amount: Number(note.monto),
    reason: note.motivo,
    createdAt: note.creado_en,
  }));

  return response;
}

export async function createSalesNote(session: AuthSession, input: SalesNoteInput) {
  if (input.fiscal) {
    throw new ApiError(
      400,
      "La emision fiscal online esta deshabilitada. Genera solo notas internas.",
    );
  }
  if (input.saleId <= 0 && input.remittanceId <= 0) {
    throw new ApiError(400, "Falta la venta o remito");
  }

  return withCompanyContext(session.companyId, async (client) => {
    let reference: { nombre_cliente: string; estado_pedido?: string } | undefined;

    if (input.saleId > 0) {
      const referenceResult = await client.query<{
        nombre_cliente: string;
        estado_pedido: string;
      }>(
        `
          SELECT nombre_cliente, COALESCE(estado_pedido, 'entregado') AS estado_pedido
          FROM ventas
          WHERE id = $1 AND empresa_id = $2
          LIMIT 1
        `,
        [input.saleId, session.companyId],
      );
      reference = referenceResult.rows[0];
      if (!reference) throw new ApiError(404, "Venta no encontrada");
      if (reference.estado_pedido !== "entregado") {
        throw new ApiError(400, "El pedido aun no fue entregado.");
      }
    } else {
      const referenceResult = await client.query<{ nombre_cliente: string }>(
        "SELECT nombre_cliente FROM remitos WHERE id = $1 AND empresa_id = $2 LIMIT 1",
        [input.remittanceId, session.companyId],
      );
      reference = referenceResult.rows[0];
      if (!reference) throw new ApiError(404, "Remito no encontrado");
    }

    const amount = Number(
      input.detail.reduce((total, item) => total + item.subtotal, 0).toFixed(2),
    );
    const nextNumber = await client.query<{ valor: number }>(
      "SELECT app_private.next_sequence($1, $2) AS valor",
      [session.companyId, "comprobante_venta"],
    );
    const receiptNumber = nextNumber.rows[0]?.valor;
    if (!receiptNumber) throw new ApiError(500, "No se pudo generar el comprobante");

    const insertResult = await client.query<{ id: number }>(
      `
        INSERT INTO comprobantes_venta (
          id_venta, id_remito, clase, fiscal, tipo_cbte, nro_comprobante, cae,
          vencimiento_cae, monto, detalle_json, motivo, stock_ajustado, creado_por, empresa_id
        )
        VALUES ($1, $2, $3, 0, 0, $4, '', '', $5, $6, $7, 0, $8, $9)
        RETURNING id
      `,
      [
        input.saleId > 0 ? input.saleId : null,
        input.remittanceId > 0 ? input.remittanceId : null,
        input.className,
        receiptNumber,
        amount,
        JSON.stringify(input.detail),
        input.reason,
        session.username,
        session.companyId,
      ],
    );
    const documentId = insertResult.rows[0].id;

    const sign = input.className === "NC" ? 1 : -1;
    for (const item of input.detail) {
      if (item.id <= 0) continue;
      await client.query(
        "UPDATE productos SET stock = GREATEST(0, stock + $1) WHERE id = $2 AND empresa_id = $3",
        [sign * item.quantity, item.id, session.companyId],
      );
    }

    await client.query(
      "UPDATE comprobantes_venta SET stock_ajustado = 1 WHERE id = $1 AND empresa_id = $2",
      [documentId, session.companyId],
    );

    if (input.saleId > 0) {
      const debit = input.className === "ND" ? amount : 0;
      const credit = input.className === "NC" ? amount : 0;
      await client.query(
        `
          INSERT INTO cuentas_corrientes (
            tipo, entidad_nombre, descripcion, debe, haber, fecha, id_origen, tipo_origen, empresa_id
          )
          VALUES ('cliente', $1, $2, $3, $4, CURRENT_DATE, $5, 'venta', $6)
        `,
        [
          reference.nombre_cliente,
          `${input.className === "NC" ? "Nota de credito" : "Nota de debito"} interna #${receiptNumber}`,
          debit,
          credit,
          input.saleId,
          session.companyId,
        ],
      );
    }

    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        "nota.creada",
        JSON.stringify({
          id: documentId,
          clase: input.className,
          fiscal: false,
          id_venta: input.saleId,
          id_remito: input.remittanceId,
          monto: amount,
          nro: receiptNumber,
        }),
        session.companyId,
      ],
    );

    return {
      id: documentId,
      className: input.className,
      fiscal: false,
      receiptNumber,
      amount,
    };
  });
}

