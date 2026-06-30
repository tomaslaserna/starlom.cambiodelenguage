import { ApiError } from "@/lib/api-response";
import { normalizeRole, type AuthSession } from "@/lib/auth";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import {
  ORDER_STATUSES,
  normalizeOrderStatusValue,
  normalizedOrderStatusSql,
  type OrderStatus,
} from "@/lib/order-status";
import { parsePagination } from "@/lib/pagination";
import { textField, uuidParam, type RequestBody } from "@/lib/request-body";
import { canonicalSalesSourceSql } from "@/lib/sales-source-sql";
import { discountSaleStockIfAvailable } from "@/lib/stock";
import type { PoolClient } from "pg";

const ORDER_STATES = new Set<string>(ORDER_STATUSES);
const TRACKING_STATES = new Set(["facturada", "no_facturada"]);
const TYPE_CODES = new Set([1, 2, 3, 6, 7, 8, 11, 12, 13]);

const SALE_EDIT_FIELDS = {
  nro_comprobante: { label: "Nro. comprobante", type: "int" },
  tipo_cbte: { label: "Tipo de comprobante", type: "typeCode" },
  nombre_cliente: { label: "Cliente", type: "requiredString" },
  dni_cliente: { label: "CUIT/DNI", type: "string" },
  fecha: { label: "Fecha", type: "date" },
  monto: { label: "Monto", type: "decimal" },
  condicion_pago: { label: "Condicion de pago", type: "string" },
  estado_pedido: { label: "Estado de pedido", type: "orderState" },
  seguimiento: { label: "Seguimiento", type: "trackingState" },
  vendedor: { label: "Vendedor", type: "string" },
} as const;

type SaleEditField = keyof typeof SALE_EDIT_FIELDS;

function currentPeriod(period: string | null) {
  const now = new Date();
  if (period === "anio") {
    return {
      start: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10),
      end: new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)).toISOString().slice(0, 10),
    };
  }
  if (period === "todos") return { start: null, end: null };
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10),
  };
}

function parseMaybeDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(400, "Fecha invalida");
  return value;
}

function normalizeSaleEditValue(type: string, raw: string, label: string) {
  switch (type) {
    case "int": {
      if (!/^\d+$/.test(raw)) throw new ApiError(400, `${label}: debe ser entero`);
      return { value: Number.parseInt(raw, 10), display: String(Number.parseInt(raw, 10)) };
    }
    case "decimal": {
      const value = Number(raw.replace(",", "."));
      if (!Number.isFinite(value) || value < 0) throw new ApiError(400, `${label}: monto invalido`);
      return { value, display: value.toFixed(2) };
    }
    case "date":
      return { value: parseMaybeDate(raw), display: raw };
    case "requiredString":
      if (!raw) throw new ApiError(400, `${label}: no puede quedar vacio`);
      if (raw.length > 255) throw new ApiError(400, `${label}: demasiado largo`);
      return { value: raw, display: raw };
    case "string":
      if (raw.length > 255) throw new ApiError(400, `${label}: demasiado largo`);
      return { value: raw, display: raw };
    case "orderState":
      if (!ORDER_STATES.has(raw)) throw new ApiError(400, `${label}: valor no permitido`);
      return { value: raw, display: raw };
    case "trackingState":
      if (!TRACKING_STATES.has(raw)) throw new ApiError(400, `${label}: valor no permitido`);
      return { value: raw, display: raw };
    case "typeCode": {
      const code = Number.parseInt(raw, 10);
      if (!TYPE_CODES.has(code)) throw new ApiError(400, `${label}: tipo no permitido`);
      return { value: code, display: String(code) };
    }
    default:
      throw new ApiError(400, "Campo invalido");
  }
}

const SALE_DB_FIELDS: Record<SaleEditField, string> = {
  nro_comprobante: "receipt_number",
  tipo_cbte: "receipt_type",
  nombre_cliente: "client_name",
  dni_cliente: "client_document",
  fecha: "sale_date",
  monto: "total_amount",
  condicion_pago: "payment_condition",
  estado_pedido: "order_status",
  seguimiento: "tracking_status",
  vendedor: "seller_name",
};

async function discountSaleStock(client: PoolClient, companyId: number, saleId: string) {
  return discountSaleStockIfAvailable(client, companyId, saleId, `Descuento admin por venta ${saleId}`);
}

function assertSaleOrderTransition(currentStatus: OrderStatus, nextStatus: OrderStatus) {
  if (currentStatus === nextStatus) {
    throw new ApiError(400, `El pedido ya esta en '${currentStatus}'.`);
  }
  if (currentStatus === "entregado" || currentStatus === "cancelado") {
    throw new ApiError(400, `El pedido ya esta ${currentStatus} y no puede modificarse.`);
  }
  if (nextStatus === "cargado") {
    throw new ApiError(400, "No se puede volver un pedido a cargado.");
  }
  if (nextStatus === "confirmado" && currentStatus !== "cargado") {
    throw new ApiError(400, "Solo los pedidos cargados pueden confirmarse.");
  }
  if (nextStatus === "entregado" && currentStatus !== "confirmado") {
    throw new ApiError(400, "Solo los pedidos confirmados pueden marcarse como entregados.");
  }
}

function collectionStatusForOrderStatus(status: OrderStatus) {
  if (status === "entregado") return "pendiente";
  if (status === "cancelado") return "cancelado";
  return "no_aplica";
}

function orderIntegrationEventType(status: OrderStatus) {
  if (status === "confirmado") return "pedido.confirmado_stock";
  if (status === "entregado") return "pedido.entregado";
  return "pedido.cancelado";
}

async function applySaleOrderStatusTransition(
  client: PoolClient,
  session: AuthSession,
  saleId: string,
  nextStatus: OrderStatus,
) {
  const currentResult = await client.query<{ estado_pedido: string }>(
    `
      SELECT ${normalizedOrderStatusSql("s")} AS estado_pedido
      FROM sales s
      WHERE s.id = $1::uuid AND s.empresa_id = $2
      LIMIT 1
      FOR UPDATE OF s
    `,
    [saleId, session.companyId],
  );
  const current = currentResult.rows[0];
  if (!current) throw new ApiError(404, "Venta no encontrada");

  const currentStatus = normalizeOrderStatusValue(current.estado_pedido);
  assertSaleOrderTransition(currentStatus, nextStatus);

  let stockDiscounted = false;
  if (nextStatus === "entregado") {
    stockDiscounted = await discountSaleStock(client, session.companyId, saleId);
  }

  await client.query(
    `
      UPDATE sales
      SET order_status = $1,
          status = $1,
          collection_status = $2,
          updated_at = now()
      WHERE id = $3::uuid AND empresa_id = $4
    `,
    [nextStatus, collectionStatusForOrderStatus(nextStatus), saleId, session.companyId],
  );

  await client.query(
    "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
    [
      orderIntegrationEventType(nextStatus),
      JSON.stringify({
        id: saleId,
        estado_anterior: currentStatus,
        estado_nuevo: nextStatus,
        stock_pendiente_impresion: nextStatus === "confirmado",
        cobro_habilitado: nextStatus === "entregado",
        usuario: session.username,
      }),
      session.companyId,
    ],
  );

  return stockDiscounted;
}

export async function getSalesSummary(companyId: number, period: string | null) {
  const bounds = currentPeriod(period);
  const params = bounds.start && bounds.end ? [companyId, bounds.start, bounds.end] : [companyId];
  const periodFilter = bounds.start && bounds.end ? "AND sale_date >= $2 AND sale_date < $3" : "";

  const summary = await queryWithCompanyContext<{
    total_facturas: string;
    total_monto: string;
    facturadas: string;
    no_facturadas: string;
  }>(
    companyId,
    `
      SELECT COUNT(*)::text AS total_facturas,
             COALESCE(SUM(monto), 0)::text AS total_monto,
             COALESCE(SUM(CASE WHEN con_factura THEN monto ELSE 0 END), 0)::text AS facturadas,
             COALESCE(SUM(CASE WHEN NOT con_factura THEN monto ELSE 0 END), 0)::text AS no_facturadas
      FROM (
        SELECT COALESCE(s.total_amount, 0) AS monto,
               COALESCE(s.tracking_status, 'no_facturada') = 'facturada' AS con_factura,
               s.sale_date
        FROM sales s
        WHERE s.empresa_id = $1
          AND ${canonicalSalesSourceSql("s")}
          AND ${normalizedOrderStatusSql("s")} = 'entregado'
          ${periodFilter}
      ) combined
    `,
    params,
  );

  const collections = await queryWithCompanyContext<{ pendiente: string; vencido: string }>(
    companyId,
    `
      SELECT
        COALESCE(SUM(CASE WHEN COALESCE(s.collection_status,'pendiente') IN ('pendiente','en_proceso','pendiente_aprobacion') THEN COALESCE(s.total_amount, 0) ELSE 0 END), 0)::text AS pendiente,
        COALESCE(SUM(CASE WHEN s.collection_status = 'vencido' THEN COALESCE(s.total_amount, 0) ELSE 0 END), 0)::text AS vencido
      FROM sales s
      WHERE s.empresa_id = $1
        AND ${canonicalSalesSourceSql("s")}
        AND ${normalizedOrderStatusSql("s")} = 'entregado'
    `,
    [companyId],
  );

  const row = summary.rows[0];
  const collectionRow = collections.rows[0];
  return {
    totalInvoices: Number(row.total_facturas),
    totalAmount: Number(row.total_monto),
    invoiced: Number(row.facturadas),
    notInvoiced: Number(row.no_facturadas),
    pending: Number(collectionRow.pendiente),
    overdue: Number(collectionRow.vencido),
  };
}

export function salesFieldInputFromBody(body: RequestBody) {
  const saleId = textField(body, "saleId") || textField(body, "id_venta");
  const deliveryId = textField(body, "deliveryId") || textField(body, "id_remito");
  const field = textField(body, "field") || textField(body, "campo");
  const value = textField(body, "value") || textField(body, "valor");
  const isDelivery = Boolean(deliveryId && !saleId);

  if (isDelivery) {
    const id = uuidParam(deliveryId, "Remito");
    if (field !== "estado_pedido" || !ORDER_STATES.has(value)) {
      throw new ApiError(400, "Datos invalidos");
    }
    return { target: "delivery" as const, id, field, value };
  }

  if (!saleId) throw new ApiError(400, "Venta invalida");
  const id = uuidParam(saleId, "Venta");
  if (field === "estado_pedido" && ORDER_STATES.has(value)) {
    return { target: "sale" as const, id, field, value };
  }
  if (field === "seguimiento" && TRACKING_STATES.has(value)) {
    return { target: "sale" as const, id, field, value };
  }
  throw new ApiError(400, "Datos invalidos");
}

export async function updateSalesField(
  session: AuthSession,
  input: ReturnType<typeof salesFieldInputFromBody>,
) {
  return withCompanyContext(session.companyId, async (client) => {
    if (input.target === "sale" && input.field === "estado_pedido") {
      const stockDiscounted = await applySaleOrderStatusTransition(
        client,
        session,
        input.id,
        input.value as OrderStatus,
      );
      clearReadQueryCache();
      return { id: input.id, affected: 1, stockDiscounted };
    }

    const table = input.target === "delivery" ? "delivery_documents" : "sales";
    const column =
      input.target === "delivery"
        ? "order_status"
        : input.field === "estado_pedido"
          ? "order_status"
          : "tracking_status";
    const result = await client.query<{ id: string }>(
      `UPDATE ${table} SET ${column} = $1, updated_at = now() WHERE id = $2::uuid AND empresa_id = $3 RETURNING id::text AS id`,
      [input.value, input.id, session.companyId],
    );
    if (!result.rows[0]) throw new ApiError(404, "Registro no encontrado");

    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        `${input.target === "delivery" ? "remito" : "venta"}.${input.field}_cambiado`,
        JSON.stringify({ id: input.id, campo: input.field, valor: input.value, usuario: session.username }),
        session.companyId,
      ],
    );

    clearReadQueryCache();
    return { id: input.id, affected: result.rowCount, stockDiscounted: false };
  });
}

export async function getSalesAdminRecord(companyId: number, id: string) {
  const result = await queryWithCompanyContext<Record<string, unknown>>(
    companyId,
    `
      SELECT id::text AS id, receipt_number AS nro_comprobante, receipt_type AS tipo_cbte,
             client_name AS nombre_cliente, client_document AS dni_cliente,
             sale_date::text AS fecha, COALESCE(total_amount, 0)::text AS monto, payment_condition AS condicion_pago,
             COALESCE(collection_status,'pendiente') AS estado_cobro,
             ${normalizedOrderStatusSql("sales")} AS estado_pedido,
             COALESCE(tracking_status,'no_facturada') AS seguimiento,
             seller_name AS vendedor
      FROM sales
      WHERE id = $1::uuid AND empresa_id = $2
      LIMIT 1
    `,
    [id, companyId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "Venta no encontrada");
  return row;
}

export async function updateSalesAdminRecord(session: AuthSession, id: string, body: RequestBody) {
  const role = normalizeRole(session.role);
  if (role !== "administrador" && role !== "jefe") throw new ApiError(403, "Sin permisos");
  if (body.estado_cobro !== undefined) {
    throw new ApiError(400, "El estado de cobro se gestiona desde Cobros y Pagos");
  }

  return withCompanyContext(session.companyId, async (client) => {
    const currentResult = await client.query<Record<string, unknown>>(
      `
        SELECT id::text, receipt_number AS nro_comprobante, receipt_type AS tipo_cbte,
               client_name AS nombre_cliente, client_document AS dni_cliente,
               sale_date::text AS fecha, total_amount::text AS monto,
               payment_condition AS condicion_pago, ${normalizedOrderStatusSql("sales")} AS estado_pedido,
               tracking_status AS seguimiento, seller_name AS vendedor
        FROM sales
        WHERE id = $1::uuid AND empresa_id = $2
        LIMIT 1
      `,
      [id, session.companyId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new ApiError(404, "Venta no encontrada");

    const sets: string[] = [];
    const values: unknown[] = [];
    const changes: { label: string; antes: string; despues: string }[] = [];
    let nextOrderStatus: OrderStatus | null = null;

    for (const [field, config] of Object.entries(SALE_EDIT_FIELDS) as [SaleEditField, (typeof SALE_EDIT_FIELDS)[SaleEditField]][]) {
      if (body[field] === undefined || body[field] === null) continue;
      const raw = String(body[field]).trim();
      const normalized = normalizeSaleEditValue(config.type, raw, config.label);
      const before =
        config.type === "decimal"
          ? Number(current[field] ?? 0).toFixed(2)
          : config.type === "typeCode" || config.type === "int"
            ? String(Number(current[field] ?? 0))
            : String(current[field] ?? "");
      if (before === normalized.display) continue;

      if (field === "estado_pedido") {
        nextOrderStatus = normalized.value as OrderStatus;
        changes.push({ label: config.label, antes: before, despues: normalized.display });
        continue;
      }

      values.push(normalized.value);
      sets.push(`${SALE_DB_FIELDS[field]} = $${values.length}`);
      changes.push({ label: config.label, antes: before, despues: normalized.display });
    }

    if (!sets.length && !nextOrderStatus) return { id, changedFields: 0 };

    if (nextOrderStatus) {
      await applySaleOrderStatusTransition(client, session, id, nextOrderStatus);
    }

    if (sets.length) {
      values.push(id, session.companyId);
      await client.query(
        `UPDATE sales SET ${sets.join(", ")}, updated_at = now() WHERE id = $${values.length - 1}::uuid AND empresa_id = $${values.length}`,
        values,
      );
    }

    const label = `Venta #${String(current.nro_comprobante ?? 0).padStart(8, "0")} - ${
      current.nombre_cliente || "sin cliente"
    }`;
    await client.query(
      `
        INSERT INTO sales_admin_audit (employee, sale_id, sale_label, action, changes, empresa_id)
        VALUES ($1, $2, $3, 'edicion', $4, $5)
      `,
      [session.username, id, label, JSON.stringify(changes), session.companyId],
    );

    clearReadQueryCache();
    return { id, changedFields: changes.length };
  });
}

export async function listSalesAdminAudit(companyId: number) {
  const result = await queryWithCompanyContext<{
    id: string;
    empleado: string;
    venta_id: string | null;
    venta_label: string;
    accion: string;
    cambios: string;
    fecha: string;
  }>(
    companyId,
    `
      SELECT id::text AS id, employee AS empleado, sale_id::text AS venta_id,
             sale_label AS venta_label, action AS accion, changes::text AS cambios,
             created_at::text AS fecha
      FROM sales_admin_audit
      WHERE empresa_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 200
    `,
    [companyId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    employee: row.empleado,
    saleId: row.venta_id,
    saleLabel: row.venta_label,
    action: row.accion,
    changes: JSON.parse(row.cambios || "[]") as unknown,
    date: row.fecha,
  }));
}

export async function listSalesLedger(companyId: number, searchParams: URLSearchParams) {
  const pagination = parsePagination({
    page: searchParams.get("page") ?? searchParams.get("pagina"),
    pageSize: searchParams.get("pageSize") ?? searchParams.get("limite"),
  });
  const filters = {
    taxId: (searchParams.get("nro_id") ?? "").replace(/\D/g, ""),
    receiptNumber: searchParams.get("nro_factura") ?? "",
    receiptType: (searchParams.get("tipo_factura") ?? "").toLowerCase(),
    day: searchParams.get("dia") ?? "",
    month: searchParams.get("mes") ?? "",
    year: searchParams.get("anio") ?? "",
    collection: searchParams.get("cobro") ?? "",
    tracking: searchParams.get("seguimiento") ?? "",
    priceList: searchParams.get("lista_precios") ?? "",
  };

  const params: unknown[] = [companyId];
  const pushParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  const saleConditions = [
    "v.empresa_id = $1",
    canonicalSalesSourceSql("v"),
    `${normalizedOrderStatusSql("v")} = 'entregado'`,
  ];

  if (filters.taxId) {
    saleConditions.push(`regexp_replace(COALESCE(v.client_document, ''), '[^0-9]', '', 'g') = ${pushParam(filters.taxId)}`);
  }
  if (filters.receiptNumber) {
    saleConditions.push(`COALESCE(v.receipt_number, 0)::text LIKE ${pushParam(`%${filters.receiptNumber.replace(/^0+/, "") || "0"}%`)}`);
  }
  const receiptMap: Record<string, string> = { a: "1", b: "6", c: "11" };
  if (filters.receiptType === "remito") {
    saleConditions.push("COALESCE(v.tracking_status, 'no_facturada') = 'no_facturada'");
  } else if (filters.receiptType === "nc") {
    saleConditions.push("v.receipt_type IN (3,8,13)");
  } else if (filters.receiptType === "nd") {
    saleConditions.push("v.receipt_type IN (2,7,12)");
  } else if (receiptMap[filters.receiptType]) {
    saleConditions.push(`v.receipt_type = ${receiptMap[filters.receiptType]}`);
  }
  for (const [key, expression] of [
    ["day", "EXTRACT(DAY FROM v.sale_date)"],
    ["month", "EXTRACT(MONTH FROM v.sale_date)"],
    ["year", "EXTRACT(YEAR FROM v.sale_date)"],
  ] as const) {
    const value = filters[key];
    if (/^\d+$/.test(value)) {
      saleConditions.push(`${expression} = ${pushParam(Number(value))}`);
    }
  }
  if (["en_proceso", "pendiente_aprobacion", "recibido", "pendiente", "vencido"].includes(filters.collection)) {
    saleConditions.push(`COALESCE(v.collection_status, 'pendiente') = ${pushParam(filters.collection)}`);
  }
  if (TRACKING_STATES.has(filters.tracking)) {
    saleConditions.push(`v.tracking_status = ${pushParam(filters.tracking)}`);
  }
  if (["rev", "1", "2", "3", "4"].includes(filters.priceList)) {
    saleConditions.push(`v.price_list_name = ${pushParam(filters.priceList)}`);
  }

  const includeDeliveries =
    filters.receiptType === "remito" ||
    (!filters.receiptNumber &&
      !["a", "b", "c", "nc", "nd"].includes(filters.receiptType) &&
      !["en_proceso", "pendiente_aprobacion", "recibido", "pendiente", "vencido"].includes(filters.collection) &&
      filters.tracking !== "facturada");

  const saleSql = `
    SELECT v.id::text AS id_venta, v.receipt_number AS nro_comprobante, v.receipt_type AS tipo_cbte,
           CASE WHEN COALESCE(v.tracking_status, 'no_facturada') = 'facturada' THEN 'manual' ELSE '' END AS cae,
           v.sale_date::text AS fecha, COALESCE(v.total_amount, 0)::text AS monto, COALESCE(v.payment_condition, '') AS condicion_pago,
           COALESCE(v.collection_status, 'pendiente') AS estado_cobro,
           COALESCE(v.tracking_status, 'no_facturada') AS seguimiento,
           ${normalizedOrderStatusSql("v")} AS estado_pedido,
           COALESCE(v.client_name, '') AS nombre_cliente, COALESCE(v.client_document, '') AS dni_cliente,
           rj.id::text AS id_remito, rj.delivery_number AS nro_remito
    FROM sales v
    LEFT JOIN delivery_documents rj ON rj.empresa_id = v.empresa_id AND rj.sale_id = v.id
    WHERE ${saleConditions.join(" AND ")}
  `;
  let deliverySql = "";
  if (includeDeliveries) {
    const deliveryConditions = [
      "r.empresa_id = $1",
      "r.sale_id IS NULL",
      "COALESCE(r.order_status, 'entregado') = 'entregado'",
    ];
    if (filters.taxId) {
      deliveryConditions.push(`regexp_replace(COALESCE(r.client_document, ''), '[^0-9]', '', 'g') = ${pushParam(filters.taxId)}`);
    }
    for (const [key, expression] of [
      ["day", "EXTRACT(DAY FROM r.delivery_date)"],
      ["month", "EXTRACT(MONTH FROM r.delivery_date)"],
      ["year", "EXTRACT(YEAR FROM r.delivery_date)"],
    ] as const) {
      const value = filters[key];
      if (/^\d+$/.test(value)) {
        deliveryConditions.push(`${expression} = ${pushParam(Number(value))}`);
      }
    }
    if (["rev", "1", "2", "3", "4"].includes(filters.priceList)) {
      deliveryConditions.push(`r.price_list_name = ${pushParam(filters.priceList)}`);
    }

    deliverySql = `
      UNION ALL
      SELECT NULL AS id_venta, NULL AS nro_comprobante, 0 AS tipo_cbte, '' AS cae,
             r.delivery_date::text AS fecha, r.total_amount::text AS monto, r.payment_condition AS condicion_pago,
             NULL AS estado_cobro, NULL AS seguimiento,
             COALESCE(r.order_status, 'entregado') AS estado_pedido,
             r.client_name AS nombre_cliente, r.client_document AS dni_cliente,
             r.id::text AS id_remito, r.delivery_number AS nro_remito
      FROM delivery_documents r
      WHERE ${deliveryConditions.join(" AND ")}
    `;
  }

  const count = await queryWithCompanyContext<{ total: string }>(
    companyId,
    `SELECT COUNT(*)::text AS total FROM (${saleSql} ${deliverySql}) combined`,
    params,
  );

  const rows = await queryWithCompanyContext<{
    id_venta: string | null;
    nro_comprobante: number | null;
    tipo_cbte: number;
    cae: string;
    fecha: string | null;
    monto: string;
    condicion_pago: string;
    estado_cobro: string | null;
    seguimiento: string | null;
    estado_pedido: string;
    nombre_cliente: string;
    dni_cliente: string;
    id_remito: string | null;
    nro_remito: number | null;
  }>(
    companyId,
    `
      SELECT *
      FROM (${saleSql} ${deliverySql}) combined
      ORDER BY fecha DESC NULLS LAST, COALESCE(id_remito, id_venta) DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `,
    [...params, pagination.pageSize, pagination.offset],
  );

  const typeLabels: Record<number, string> = { 0: "Remito", 1: "A", 2: "ND", 3: "NC", 6: "B", 7: "ND", 8: "NC", 11: "C", 12: "ND", 13: "NC" };
  const data = rows.rows.map((row) => {
    const hasInvoice = Boolean(row.cae);
    return {
      saleId: row.id_venta,
      receiptNumber: row.id_venta !== null ? String(row.nro_comprobante ?? 0).padStart(8, "0") : null,
      type: row.id_venta !== null && !hasInvoice ? "Remito" : typeLabels[row.tipo_cbte] ?? "?",
      hasInvoice,
      date: row.fecha,
      amount: Number(row.monto),
      paymentCondition: row.condicion_pago,
      collectionStatus: row.estado_cobro || "pendiente",
      trackingStatus: row.seguimiento || "no_facturada",
      orderStatus: row.estado_pedido,
      customerName: row.nombre_cliente,
      customerDocument: row.dni_cliente,
      deliveryId: row.id_remito,
      deliveryNumber: row.nro_remito !== null ? String(row.nro_remito).padStart(8, "0") : null,
    };
  });

  const total = Number(count.rows[0]?.total ?? 0);
  return {
    data,
    meta: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
    },
  };
}
