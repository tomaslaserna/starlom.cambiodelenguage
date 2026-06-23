import { ApiError } from "@/lib/api-response";
import type { AuthSession } from "@/lib/auth";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { parsePagination } from "@/lib/pagination";
import { intField, textField, type RequestBody } from "@/lib/request-body";
import type { PoolClient } from "pg";

const ORDER_STATES = new Set(["recibido", "en_proceso", "pendiente_entrega", "entregado"]);
const TRACKING_STATES = new Set(["facturada", "no_facturada"]);
const TYPE_CODES = new Set([1, 2, 3, 6, 7, 8]);

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

async function discountSaleStock(client: PoolClient, companyId: number, saleId: number) {
  const claim = await client.query(
    `
      UPDATE ventas
      SET stock_descontado = 1
      WHERE id = $1 AND empresa_id = $2 AND COALESCE(stock_descontado, 0) = 0
      RETURNING id
    `,
    [saleId, companyId],
  );
  if (!claim.rows[0]) return false;

  const lines = await client.query<{ id_producto: number; cantidad: number }>(
    "SELECT id_producto, cantidad FROM detalle_ventas WHERE id_venta = $1 AND empresa_id = $2",
    [saleId, companyId],
  );
  for (const line of lines.rows) {
    await client.query("UPDATE productos SET stock = stock - $1 WHERE id = $2 AND empresa_id = $3", [
      line.cantidad,
      line.id_producto,
      companyId,
    ]);
  }
  return true;
}

export async function getSalesSummary(companyId: number, period: string | null) {
  const bounds = currentPeriod(period);
  const params = bounds.start && bounds.end ? [companyId, bounds.start, bounds.end] : [companyId];
  const periodFilter = bounds.start && bounds.end ? "AND fecha >= $2 AND fecha < $3" : "";

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
             COALESCE(SUM(CASE WHEN is_venta = 1 AND con_factura THEN monto ELSE 0 END), 0)::text AS facturadas,
             COALESCE(SUM(CASE WHEN NOT con_factura THEN monto ELSE 0 END), 0)::text AS no_facturadas
      FROM (
        SELECT monto, COALESCE(cae, '') <> '' AS con_factura, 1 AS is_venta, fecha
        FROM ventas
        WHERE empresa_id = $1 AND COALESCE(estado_pedido, 'entregado') = 'entregado' ${periodFilter}
        UNION ALL
        SELECT monto, FALSE AS con_factura, 0 AS is_venta, fecha
        FROM remitos
        WHERE empresa_id = $1 AND id_venta IS NULL AND COALESCE(estado_pedido, 'entregado') = 'entregado' ${periodFilter}
      ) combined
    `,
    params,
  );

  const collections = await queryWithCompanyContext<{ pendiente: string; vencido: string }>(
    companyId,
    `
      SELECT
        COALESCE(SUM(CASE WHEN COALESCE(estado_cobro,'pendiente') IN ('pendiente','en_proceso','pendiente_aprobacion') THEN monto ELSE 0 END), 0)::text AS pendiente,
        COALESCE(SUM(CASE WHEN estado_cobro = 'vencido' THEN monto ELSE 0 END), 0)::text AS vencido
      FROM ventas
      WHERE empresa_id = $1
        AND COALESCE(estado_pedido, 'entregado') = 'entregado'
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
  const saleId = intField(body, "saleId", intField(body, "id_venta", 0));
  const deliveryId = intField(body, "deliveryId", intField(body, "id_remito", 0));
  const field = textField(body, "field") || textField(body, "campo");
  const value = textField(body, "value") || textField(body, "valor");
  const isDelivery = deliveryId > 0 && saleId <= 0;

  if (isDelivery) {
    if (field !== "estado_pedido" || !ORDER_STATES.has(value)) {
      throw new ApiError(400, "Datos invalidos");
    }
    return { target: "delivery" as const, id: deliveryId, field, value };
  }

  if (saleId <= 0) throw new ApiError(400, "Venta invalida");
  if (field === "estado_pedido" && ORDER_STATES.has(value)) {
    return { target: "sale" as const, id: saleId, field, value };
  }
  if (field === "seguimiento" && TRACKING_STATES.has(value)) {
    return { target: "sale" as const, id: saleId, field, value };
  }
  throw new ApiError(400, "Datos invalidos");
}

export async function updateSalesField(
  session: AuthSession,
  input: ReturnType<typeof salesFieldInputFromBody>,
) {
  return withCompanyContext(session.companyId, async (client) => {
    const table = input.target === "delivery" ? "remitos" : "ventas";
    const result = await client.query<{ id: number }>(
      `UPDATE ${table} SET ${input.field} = $1 WHERE id = $2 AND empresa_id = $3 RETURNING id`,
      [input.value, input.id, session.companyId],
    );
    if (!result.rows[0]) throw new ApiError(404, "Registro no encontrado");

    let stockDiscounted = false;
    if (input.target === "sale" && input.field === "estado_pedido" && input.value === "entregado") {
      stockDiscounted = await discountSaleStock(client, session.companyId, input.id);
    }

    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        `${input.target === "delivery" ? "remito" : "venta"}.${input.field}_cambiado`,
        JSON.stringify({ id: input.id, campo: input.field, valor: input.value, usuario: session.username }),
        session.companyId,
      ],
    );

    return { id: input.id, affected: result.rowCount, stockDiscounted };
  });
}

export async function getSalesAdminRecord(companyId: number, id: number) {
  const result = await queryWithCompanyContext<Record<string, unknown>>(
    companyId,
    `
      SELECT id, nro_comprobante, tipo_cbte, nombre_cliente, dni_cliente,
             fecha::text, monto::text, condicion_pago,
             COALESCE(estado_cobro,'pendiente') AS estado_cobro,
             COALESCE(estado_pedido,'entregado') AS estado_pedido,
             COALESCE(seguimiento,'no_facturada') AS seguimiento,
             vendedor
      FROM ventas
      WHERE id = $1 AND empresa_id = $2
      LIMIT 1
    `,
    [id, companyId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "Venta no encontrada");
  return row;
}

export async function updateSalesAdminRecord(session: AuthSession, id: number, body: RequestBody) {
  if (!["Jefe1", "Admin"].includes(session.role)) throw new ApiError(403, "Sin permisos");
  if (body.estado_cobro !== undefined) {
    throw new ApiError(400, "El estado de cobro se gestiona desde Cobros y Pagos");
  }

  return withCompanyContext(session.companyId, async (client) => {
    const currentResult = await client.query<Record<string, unknown>>(
      "SELECT * FROM ventas WHERE id = $1 AND empresa_id = $2 LIMIT 1",
      [id, session.companyId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new ApiError(404, "Venta no encontrada");

    const sets: string[] = [];
    const values: unknown[] = [];
    const changes: { label: string; antes: string; despues: string }[] = [];

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

      values.push(normalized.value);
      sets.push(`${field} = $${values.length}`);
      changes.push({ label: config.label, antes: before, despues: normalized.display });
    }

    if (!sets.length) return { id, changedFields: 0 };

    values.push(id, session.companyId);
    await client.query(
      `UPDATE ventas SET ${sets.join(", ")} WHERE id = $${values.length - 1} AND empresa_id = $${values.length}`,
      values,
    );

    const label = `Venta #${String(current.nro_comprobante ?? 0).padStart(8, "0")} - ${
      current.nombre_cliente || "sin cliente"
    }`;
    await client.query(
      `
        INSERT INTO ventas_modificaciones (empleado, venta_id, venta_label, accion, cambios, empresa_id)
        VALUES ($1, $2, $3, 'edicion', $4, $5)
      `,
      [session.username, id, label, JSON.stringify(changes), session.companyId],
    );

    return { id, changedFields: changes.length };
  });
}

export async function listSalesAdminAudit(companyId: number) {
  const result = await queryWithCompanyContext<{
    id: number;
    empleado: string;
    venta_id: number;
    venta_label: string;
    accion: string;
    cambios: string;
    fecha: string;
  }>(
    companyId,
    `
      SELECT id, empleado, venta_id, venta_label, accion, cambios, fecha::text
      FROM ventas_modificaciones
      WHERE empresa_id = $1
      ORDER BY fecha DESC, id DESC
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

  const saleConditions = ["v.empresa_id = $1", "COALESCE(v.estado_pedido, 'entregado') = 'entregado'"];
  let saleJoin = "";

  if (filters.taxId) {
    saleConditions.push(`v.dni_cliente = ${pushParam(filters.taxId)}`);
  }
  if (filters.receiptNumber) {
    saleConditions.push(`v.nro_comprobante::text LIKE ${pushParam(`%${filters.receiptNumber.replace(/^0+/, "") || "0"}%`)}`);
  }
  const receiptMap: Record<string, string> = { a: "1", b: "6" };
  if (filters.receiptType === "remito") {
    saleConditions.push("COALESCE(v.cae, '') = ''");
  } else if (filters.receiptType === "nc") {
    saleConditions.push("v.tipo_cbte IN (3,8)", "COALESCE(v.cae, '') <> ''");
  } else if (filters.receiptType === "nd") {
    saleConditions.push("v.tipo_cbte IN (2,7)", "COALESCE(v.cae, '') <> ''");
  } else if (receiptMap[filters.receiptType]) {
    saleConditions.push(`v.tipo_cbte = ${receiptMap[filters.receiptType]}`, "COALESCE(v.cae, '') <> ''");
  }
  for (const [key, expression] of [
    ["day", "EXTRACT(DAY FROM v.fecha)"],
    ["month", "EXTRACT(MONTH FROM v.fecha)"],
    ["year", "EXTRACT(YEAR FROM v.fecha)"],
  ] as const) {
    const value = filters[key];
    if (/^\d+$/.test(value)) {
      saleConditions.push(`${expression} = ${pushParam(Number(value))}`);
    }
  }
  if (["en_proceso", "pendiente_aprobacion", "recibido", "pendiente", "vencido"].includes(filters.collection)) {
    saleConditions.push(`COALESCE(v.estado_cobro, 'pendiente') = ${pushParam(filters.collection)}`);
  }
  if (TRACKING_STATES.has(filters.tracking)) {
    saleConditions.push(`v.seguimiento = ${pushParam(filters.tracking)}`);
  }
  if (["rev", "1", "2", "3", "4"].includes(filters.priceList)) {
    saleJoin = "LEFT JOIN clientes cl ON cl.empresa_id = v.empresa_id AND cl.nro_id = v.dni_cliente";
    saleConditions.push(`cl.lista_precios = ${pushParam(filters.priceList)}`);
  }

  const includeDeliveries =
    filters.receiptType === "remito" ||
    (!filters.receiptNumber &&
      !["a", "b", "nc", "nd"].includes(filters.receiptType) &&
      !["en_proceso", "pendiente_aprobacion", "recibido", "pendiente", "vencido"].includes(filters.collection) &&
      filters.tracking !== "facturada");

  const saleSql = `
    SELECT v.id AS id_venta, v.nro_comprobante, v.tipo_cbte, COALESCE(v.cae, '') AS cae,
           v.fecha::text, v.monto::text, v.condicion_pago,
           COALESCE(v.estado_cobro, 'pendiente') AS estado_cobro,
           COALESCE(v.seguimiento, 'no_facturada') AS seguimiento,
           COALESCE(v.estado_pedido, 'entregado') AS estado_pedido,
           v.nombre_cliente, v.dni_cliente, rj.id AS id_remito, rj.nro_remito
    FROM ventas v
    LEFT JOIN remitos rj ON rj.empresa_id = v.empresa_id AND rj.id_venta = v.id
    ${saleJoin}
    WHERE ${saleConditions.join(" AND ")}
  `;
  let deliverySql = "";
  if (includeDeliveries) {
    const deliveryConditions = [
      "r.empresa_id = $1",
      "r.id_venta IS NULL",
      "COALESCE(r.estado_pedido, 'entregado') = 'entregado'",
    ];
    if (filters.taxId) {
      deliveryConditions.push(`r.dni_cliente = ${pushParam(filters.taxId)}`);
    }
    for (const [key, expression] of [
      ["day", "EXTRACT(DAY FROM r.fecha)"],
      ["month", "EXTRACT(MONTH FROM r.fecha)"],
      ["year", "EXTRACT(YEAR FROM r.fecha)"],
    ] as const) {
      const value = filters[key];
      if (/^\d+$/.test(value)) {
        deliveryConditions.push(`${expression} = ${pushParam(Number(value))}`);
      }
    }
    if (["rev", "1", "2", "3", "4"].includes(filters.priceList)) {
      deliveryConditions.push(`r.lista_precios = ${pushParam(filters.priceList)}`);
    }

    deliverySql = `
      UNION ALL
      SELECT NULL AS id_venta, NULL AS nro_comprobante, 0 AS tipo_cbte, '' AS cae,
             r.fecha::text, r.monto::text, r.condicion_pago,
             NULL AS estado_cobro, NULL AS seguimiento,
             COALESCE(r.estado_pedido, 'entregado') AS estado_pedido,
             r.nombre_cliente, r.dni_cliente, r.id AS id_remito, r.nro_remito
      FROM remitos r
      WHERE ${deliveryConditions.join(" AND ")}
    `;
  }

  const count = await queryWithCompanyContext<{ total: string }>(
    companyId,
    `SELECT COUNT(*)::text AS total FROM (${saleSql} ${deliverySql}) combined`,
    params,
  );

  const rows = await queryWithCompanyContext<{
    id_venta: number | null;
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
    id_remito: number | null;
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

  const typeLabels: Record<number, string> = { 0: "Remito", 1: "A", 2: "ND", 3: "NC", 6: "B", 7: "ND", 8: "NC" };
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
