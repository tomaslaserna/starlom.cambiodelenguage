import { ApiError } from "@/lib/api-response";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import { textField, uuidParam, type RequestBody } from "@/lib/request-body";
import type { AuthSession } from "@/lib/auth";

export type SalesDocumentItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type SalesNoteInput = {
  saleId: string;
  remittanceId: string;
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

function optionalUuid(body: RequestBody, keys: string[], label: string) {
  for (const key of keys) {
    const value = textField(body, key);
    if (value) return uuidParam(value, label);
  }
  return "";
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
        id: itemText(item, ["id", "productId", "id_producto"]),
        name: itemText(item, ["name", "nombre"]),
        quantity,
        unitPrice,
        subtotal: Number((quantity * unitPrice).toFixed(2)),
      };
    })
    .filter((item) => item.quantity > 0);

  if (!detail.length) throw new ApiError(400, "Agrega al menos un producto");

  return {
    saleId: optionalUuid(body, ["saleId", "id_venta"], "Venta"),
    remittanceId: optionalUuid(body, ["remittanceId", "id_remito"], "Remito"),
    className,
    fiscal: ["1", "true", "si", "sí"].includes(textField(body, "fiscal").toLowerCase()),
    reason: textField(body, "reason") || textField(body, "motivo"),
    detail,
  };
}

export async function getSalesDocumentContext(companyId: number, saleId = "", remittanceId = "") {
  if (!saleId && !remittanceId) throw new ApiError(400, "Falta id_venta o id_remito");

  const response: {
    sale: Record<string, unknown> | null;
    detail: SalesDocumentItem[];
    notes: Record<string, unknown>[];
  } = { sale: null, detail: [], notes: [] };

  if (saleId) {
    const saleResult = await queryWithCompanyContext<{
      id: string;
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
        SELECT s.id::text AS id, '' AS cae, 0 AS tipo_cbte,
               COALESCE(s.receipt_number, nullif(regexp_replace(COALESCE(s.sale_number, ''), '\D', '', 'g'), '')::bigint, 0)::int AS nro_comprobante,
               COALESCE(s.client_name, c.display_name, '') AS nombre_cliente,
               COALESCE(s.client_document, c.tax_id, '') AS dni_cliente,
               COALESCE(s.total_amount, 0)::text AS monto,
               ${normalizedOrderStatusSql("s")} AS estado_pedido
        FROM sales s
        LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
        WHERE s.id = $1::uuid AND s.empresa_id = $2
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
      id_producto: string;
      nombre: string;
      cantidad: string;
      precio_unit: string;
    }>(
      companyId,
      `
        SELECT d.product_id::text AS id_producto,
               COALESCE(d.description, p.name, '(producto)') AS nombre,
               d.quantity::text AS cantidad,
               d.unit_price::text AS precio_unit
        FROM sale_items d
        LEFT JOIN products p ON p.id = d.product_id AND p.empresa_id = d.empresa_id
        WHERE d.sale_id = $1::uuid AND d.empresa_id = $2
        ORDER BY d.id ASC
      `,
      [saleId, companyId],
    );

    response.detail = detailResult.rows.map((item) => ({
      id: item.id_producto,
      name: item.nombre,
      quantity: Number(item.cantidad),
      unitPrice: Number(item.precio_unit),
      subtotal: Number((Number(item.cantidad) * Number(item.precio_unit)).toFixed(2)),
    }));
  } else {
    const remittanceResult = await queryWithCompanyContext<{
      id: string;
      nombre_cliente: string;
      dni_cliente: string;
      nro_remito: number;
      monto: string;
    }>(
      companyId,
      `
        SELECT id::text AS id, client_name AS nombre_cliente, client_document AS dni_cliente,
               COALESCE(delivery_number, 0)::int AS nro_remito,
               total_amount::text AS monto
        FROM delivery_documents
        WHERE id = $1::uuid AND empresa_id = $2
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
      id_producto: string;
      nombre: string;
      cantidad: string;
      precio_unit: string;
    }>(
      companyId,
      `
        SELECT d.product_id::text AS id_producto,
               COALESCE(d.description, p.name, '(producto)') AS nombre,
               d.quantity::text AS cantidad,
               d.unit_price::text AS precio_unit
        FROM delivery_document_items d
        LEFT JOIN products p ON p.id = d.product_id AND p.empresa_id = d.empresa_id
        WHERE d.delivery_id = $1::uuid AND d.empresa_id = $2
        ORDER BY d.id ASC
      `,
      [remittanceId, companyId],
    );

    response.detail = detailResult.rows.map((item) => ({
      id: item.id_producto,
      name: item.nombre,
      quantity: Number(item.cantidad),
      unitPrice: Number(item.precio_unit),
      subtotal: Number((Number(item.cantidad) * Number(item.precio_unit)).toFixed(2)),
    }));
  }

  const notesResult = await queryWithCompanyContext<{
    id: string;
    clase: string;
    fiscal: boolean;
    tipo_cbte: number;
    nro_comprobante: number;
    monto: string;
    motivo: string;
    creado_en: string;
  }>(
    companyId,
    `
      SELECT id::text AS id, class_name AS clase, fiscal, receipt_type AS tipo_cbte,
             COALESCE(receipt_number, 0)::int AS nro_comprobante,
             amount::text AS monto, reason AS motivo, created_at::text AS creado_en
      FROM sales_internal_documents
      WHERE empresa_id = $1
        AND ${saleId ? "sale_id = $2::uuid" : "delivery_id = $2::uuid"}
      ORDER BY created_at DESC
    `,
    [companyId, saleId || remittanceId],
  );

  response.notes = notesResult.rows.map((note) => ({
    id: note.id,
    className: note.clase,
    fiscal: note.fiscal,
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
  if (!input.saleId && !input.remittanceId) {
    throw new ApiError(400, "Falta la venta o remito");
  }

  return withCompanyContext(session.companyId, async (client) => {
    let reference: { nombre_cliente: string; estado_pedido?: string; client_id?: string | null } | undefined;

    if (input.saleId) {
      const referenceResult = await client.query<{
        nombre_cliente: string;
        estado_pedido: string;
        client_id: string | null;
      }>(
        `
          SELECT COALESCE(s.client_name, c.display_name, '') AS nombre_cliente,
                 ${normalizedOrderStatusSql("s")} AS estado_pedido,
                 s.client_id::text
          FROM sales s
          LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
          WHERE s.id = $1::uuid AND s.empresa_id = $2
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
      const referenceResult = await client.query<{ nombre_cliente: string; client_id: string | null }>(
        `
          SELECT d.client_name AS nombre_cliente, s.client_id::text
          FROM delivery_documents d
          LEFT JOIN sales s ON s.id = d.sale_id AND s.empresa_id = d.empresa_id
          WHERE d.id = $1::uuid AND d.empresa_id = $2
          LIMIT 1
        `,
        [input.remittanceId, session.companyId],
      );
      reference = referenceResult.rows[0];
      if (!reference) throw new ApiError(404, "Remito no encontrado");
    }

    const amount = Number(
      input.detail.reduce((total, item) => total + item.subtotal, 0).toFixed(2),
    );
    await client.query("SELECT pg_advisory_xact_lock(83030, $1::int)", [session.companyId]);
    const nextNumber = await client.query<{ valor: number }>(
      "SELECT COALESCE(MAX(receipt_number), 0) + 1 AS valor FROM sales_internal_documents WHERE empresa_id = $1",
      [session.companyId],
    );
    const receiptNumber = nextNumber.rows[0]?.valor;
    if (!receiptNumber) throw new ApiError(500, "No se pudo generar el comprobante");

    const insertResult = await client.query<{ id: string }>(
      `
        INSERT INTO sales_internal_documents (
          sale_id, delivery_id, class_name, fiscal, receipt_type, receipt_number,
          amount, detail_json, reason, stock_adjusted, created_by, created_by_name, empresa_id
        )
        VALUES ($1::uuid, $2::uuid, $3, false, 0, $4, $5, $6, $7, false, $8::uuid, $9, $10)
        RETURNING id::text AS id
      `,
      [
        input.saleId || null,
        input.remittanceId || null,
        input.className,
        receiptNumber,
        amount,
        JSON.stringify(input.detail),
        input.reason,
        session.userId,
        session.username,
        session.companyId,
      ],
    );
    const documentId = insertResult.rows[0].id;

    const sign = input.className === "NC" ? 1 : -1;
    for (const item of input.detail) {
      if (!item.id) continue;
      await client.query(
        `
          INSERT INTO stock_movements (product_id, movement_type, quantity, notes, empresa_id)
          VALUES ($1::uuid, $2::stock_movement_type, $3, $4, $5)
        `,
        [
          item.id,
          sign > 0 ? "ajuste_positivo" : "ajuste_negativo",
          item.quantity,
          `${input.className === "NC" ? "Nota de credito" : "Nota de debito"} interna #${receiptNumber}`,
          session.companyId,
        ],
      );
    }

    await client.query(
      "UPDATE sales_internal_documents SET stock_adjusted = true WHERE id = $1::uuid AND empresa_id = $2",
      [documentId, session.companyId],
    );

    if (input.saleId) {
      const debit = input.className === "ND" ? amount : 0;
      const credit = input.className === "NC" ? amount : 0;
      await client.query(
        `
          INSERT INTO current_account_movements (
            client_id, sale_id, entity_type, entity_name, description,
            debit, credit, movement_date, empresa_id
          )
          VALUES ($1::uuid, $2::uuid, 'cliente', $3, $4, $5, $6, CURRENT_DATE, $7)
        `,
        [
          reference.client_id ?? null,
          input.saleId,
          reference.nombre_cliente,
          `${input.className === "NC" ? "Nota de credito" : "Nota de debito"} interna #${receiptNumber}`,
          debit,
          credit,
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
          id_venta: input.saleId || null,
          id_remito: input.remittanceId || null,
          monto: amount,
          nro: receiptNumber,
        }),
        session.companyId,
      ],
    );

    clearReadQueryCache();
    return {
      id: documentId,
      className: input.className,
      fiscal: false,
      receiptNumber,
      amount,
    };
  });
}
