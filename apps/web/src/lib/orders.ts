import { ApiError } from "@/lib/api-response";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { parsePagination } from "@/lib/pagination";
import { numberField, textField, type RequestBody } from "@/lib/request-body";
import type { AuthSession } from "@/lib/auth";

type ListInput = {
  companyId?: number;
  query?: string | null;
  status?: string | null;
  collectionStatus?: string | null;
  page?: string | null;
  pageSize?: string | null;
};

export type OrderSummary = {
  id: number;
  customerName: string;
  customerDocument: string;
  priceList: string;
  amount: number;
  netAmount: number;
  vatAmount: number;
  receiptNumber: number;
  paymentCondition: string;
  date: string | null;
  seller: string;
  collectionStatus: string;
  orderStatus: string;
  desiredDocument: string;
  stockDiscounted: boolean;
  observation: string;
};

export type OrderDetailLine = {
  id: number;
  productId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
};

export type OrderDetail = OrderSummary & {
  lines: OrderDetailLine[];
};

const DEFAULT_COMPANY_ID = 1;
const ORDER_STATES = ["recibido", "en_proceso", "pendiente_entrega", "entregado"] as const;
const COLLECTION_STATES = ["pendiente", "cancelado"] as const;
type OrderStatus = (typeof ORDER_STATES)[number];
const ORDER_RANK = new Map(ORDER_STATES.map((state, index) => [state, index]));

function searchPattern(query: string) {
  return `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function mapOrder(row: {
  id: number;
  nombre_cliente: string;
  dni_cliente: string;
  lista_precios: string;
  monto: string;
  monto_neto: string;
  monto_iva: string;
  nro_comprobante: number;
  condicion_pago: string;
  fecha: string | null;
  vendedor: string;
  estado_cobro: string;
  estado_pedido: string;
  comprobante_deseado: string;
  stock_descontado: number;
  observacion: string;
}): OrderSummary {
  return {
    id: row.id,
    customerName: row.nombre_cliente,
    customerDocument: row.dni_cliente,
    priceList: row.lista_precios,
    amount: Number(row.monto),
    netAmount: Number(row.monto_neto),
    vatAmount: Number(row.monto_iva),
    receiptNumber: row.nro_comprobante,
    paymentCondition: row.condicion_pago,
    date: row.fecha,
    seller: row.vendedor,
    collectionStatus: row.estado_cobro,
    orderStatus: row.estado_pedido,
    desiredDocument: row.comprobante_deseado,
    stockDiscounted: Number(row.stock_descontado) === 1,
    observation: row.observacion,
  };
}

function isOrderStatus(status: string): status is OrderStatus {
  return ORDER_STATES.includes(status as OrderStatus);
}

function normalizeOrderStatus(status: string) {
  return isOrderStatus(status) ? status : "recibido";
}

async function insertIntegrationEvent(
  companyId: number,
  type: string,
  payload: Record<string, unknown>,
) {
  await queryWithCompanyContext(
    companyId,
    "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
    [type, JSON.stringify(payload), companyId],
  );
}

export async function listOrders(input: ListInput = {}) {
  const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
  const query = input.query?.trim() ?? "";
  const status = input.status?.trim() ?? "";
  const collectionStatus = input.collectionStatus?.trim() ?? "";
  const pagination = parsePagination(input);
  const params: unknown[] = [companyId];
  const filters = ["empresa_id = $1"];

  if (query) {
    params.push(searchPattern(query));
    filters.push(
      `(nombre_cliente ILIKE $${params.length} ESCAPE '\\' OR dni_cliente ILIKE $${params.length} ESCAPE '\\' OR vendedor ILIKE $${params.length} ESCAPE '\\')`,
    );
  }

  if (status) {
    params.push(status);
    filters.push(`COALESCE(estado_pedido, 'recibido') = $${params.length}`);
  }

  if (collectionStatus) {
    params.push(collectionStatus);
    filters.push(`COALESCE(estado_cobro, 'pendiente') = $${params.length}`);
  }

  const where = filters.join(" AND ");
  const countResult = await queryWithCompanyContext<{ total: string }>(
    companyId,
    `SELECT COUNT(*)::text AS total FROM ventas WHERE ${where}`,
    params,
  );

  params.push(pagination.pageSize, pagination.offset);
  const rows = await queryWithCompanyContext<Parameters<typeof mapOrder>[0]>(
    companyId,
    `
      SELECT id, nombre_cliente, dni_cliente, lista_precios, monto::text,
             monto_neto::text, monto_iva::text, nro_comprobante, condicion_pago,
             fecha::text, vendedor, COALESCE(estado_cobro, 'pendiente') AS estado_cobro,
             COALESCE(estado_pedido, 'recibido') AS estado_pedido,
             comprobante_deseado, stock_descontado, observacion
      FROM ventas
      WHERE ${where}
      ORDER BY COALESCE(fecha, creado_en::date) DESC, id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );

  const total = Number.parseInt(countResult.rows[0]?.total ?? "0", 10);

  return {
    data: rows.rows.map(mapOrder),
    meta: {
      companyId,
      query,
      status,
      collectionStatus,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
    },
  };
}

export async function getOrdersDashboard(companyId: number) {
  const result = await queryWithCompanyContext<{
    received_month: string;
    delivered_month: string;
    in_process: string;
    pending_delivery: string;
    total_month: string;
  }>(
    companyId,
    `
      SELECT
        COUNT(*) FILTER (
          WHERE fecha >= date_trunc('month', CURRENT_DATE)::date
            AND fecha < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
        )::text AS received_month,
        COUNT(*) FILTER (
          WHERE fecha >= date_trunc('month', CURRENT_DATE)::date
            AND fecha < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
            AND COALESCE(estado_pedido, 'recibido') = 'entregado'
        )::text AS delivered_month,
        COUNT(*) FILTER (WHERE COALESCE(estado_pedido, 'recibido') = 'en_proceso')::text AS in_process,
        COUNT(*) FILTER (WHERE COALESCE(estado_pedido, 'recibido') = 'pendiente_entrega')::text AS pending_delivery,
        COALESCE(SUM(monto) FILTER (
          WHERE fecha >= date_trunc('month', CURRENT_DATE)::date
            AND fecha < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
        ), 0)::text AS total_month
      FROM ventas
      WHERE empresa_id = $1
    `,
    [companyId],
  );

  const row = result.rows[0];
  return {
    receivedMonth: Number(row?.received_month ?? 0),
    deliveredMonth: Number(row?.delivered_month ?? 0),
    inProcess: Number(row?.in_process ?? 0),
    pendingDelivery: Number(row?.pending_delivery ?? 0),
    totalMonth: Number(row?.total_month ?? 0),
  };
}

export async function getOrder(companyId: number, id: number): Promise<OrderDetail> {
  const orderResult = await queryWithCompanyContext<Parameters<typeof mapOrder>[0]>(
    companyId,
    `
      SELECT id, nombre_cliente, dni_cliente, lista_precios, monto::text,
             monto_neto::text, monto_iva::text, nro_comprobante, condicion_pago,
             fecha::text, vendedor, COALESCE(estado_cobro, 'pendiente') AS estado_cobro,
             COALESCE(estado_pedido, 'recibido') AS estado_pedido,
             comprobante_deseado, stock_descontado, observacion
      FROM ventas
      WHERE id = $1 AND empresa_id = $2
      LIMIT 1
    `,
    [id, companyId],
  );

  const order = orderResult.rows[0];
  if (!order) throw new ApiError(404, "Pedido no encontrado");

  const linesResult = await queryWithCompanyContext<{
    id: number;
    id_producto: number;
    nombre: string;
    cantidad: number;
    precio_unit: string;
    descuento: string;
    subtotal: string;
  }>(
    companyId,
    `
      SELECT d.id, d.id_producto,
             COALESCE(d.nombre_producto, p.nombre, '(producto eliminado)') AS nombre,
             d.cantidad,
             d.precio_unit::text,
             COALESCE(d.descuento, 0)::text AS descuento,
             d.subtotal::text
      FROM detalle_ventas d
      LEFT JOIN productos p ON p.id = d.id_producto AND p.empresa_id = d.empresa_id
      WHERE d.id_venta = $1 AND d.empresa_id = $2
      ORDER BY d.id ASC
    `,
    [id, companyId],
  );

  return {
    ...mapOrder(order),
    lines: linesResult.rows.map((line) => ({
      id: line.id,
      productId: line.id_producto,
      name: line.nombre,
      quantity: line.cantidad,
      unitPrice: Number(line.precio_unit),
      discount: Number(line.descuento),
      subtotal: Number(line.subtotal),
    })),
  };
}

export function orderStatusFromBody(body: RequestBody): OrderStatus {
  const state = textField(body, "status") || textField(body, "estado");
  if (!isOrderStatus(state)) throw new ApiError(400, "Estado invalido");
  return state;
}

export function observationFromBody(body: RequestBody) {
  return textField(body, "observation") || textField(body, "observacion");
}

export function collectionStatusFromBody(body: RequestBody) {
  const state = textField(body, "collectionStatus") || textField(body, "estado_cobro");
  if (!COLLECTION_STATES.includes(state as (typeof COLLECTION_STATES)[number])) {
    throw new ApiError(
      400,
      "El cobro se registra desde Cobros y Pagos y se aprueba por administracion",
    );
  }
  return state;
}

export function basicOrderInputFromBody(body: RequestBody) {
  const customerName = textField(body, "customerName") || textField(body, "nombre_cliente");
  const customerDocument = textField(body, "customerDocument") || textField(body, "dni_cliente");
  const amount = numberField(body, "amount", numberField(body, "monto", 0));
  if (!customerName) throw new ApiError(400, "El cliente es obligatorio");
  if (amount <= 0) throw new ApiError(400, "El monto debe ser mayor a cero");

  return {
    customerName,
    customerDocument,
    amount,
    date: textField(body, "date") || textField(body, "fecha") || new Date().toISOString().slice(0, 10),
    seller: textField(body, "seller") || textField(body, "vendedor"),
    priceList: textField(body, "priceList") || textField(body, "lista_precios"),
    paymentCondition: textField(body, "paymentCondition") || textField(body, "condicion_pago") || "pendiente",
    desiredDocument: textField(body, "desiredDocument") || textField(body, "comprobante_deseado") || "remito",
    observation: textField(body, "observation") || textField(body, "observacion"),
  };
}

export async function createBasicOrder(
  session: AuthSession,
  input: ReturnType<typeof basicOrderInputFromBody>,
) {
  return withCompanyContext(session.companyId, async (client) => {
    const sequence = await client.query<{ value: string }>(
      "SELECT app_private.next_sequence($1, 'nro_comprobante')::text AS value",
      [session.companyId],
    );
    const receiptNumber = Number(sequence.rows[0]?.value ?? 0);

    const result = await client.query<{ id: number }>(
      `
        INSERT INTO ventas (
          dni_cliente, nombre_cliente, lista_precios, monto, monto_neto, monto_iva,
          tipo_cbte, nro_comprobante, condicion_pago, fecha, vendedor,
          estado_cobro, estado_pedido, comprobante_deseado, observacion,
          stock_descontado, empresa_id
        )
        VALUES ($1, $2, $3, $4, $4, 0, 0, $5, $6, $7, $8,
                'pendiente', 'recibido', $9, $10, 0, $11)
        RETURNING id
      `,
      [
        input.customerDocument,
        input.customerName,
        input.priceList,
        input.amount,
        receiptNumber,
        input.paymentCondition,
        input.date,
        input.seller,
        input.desiredDocument,
        input.observation,
        session.companyId,
      ],
    );

    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        "pedido.creado",
        JSON.stringify({ id: result.rows[0].id, usuario: session.username }),
        session.companyId,
      ],
    );

    return getOrder(session.companyId, result.rows[0].id);
  });
}

export async function updateOrderObservation(companyId: number, id: number, observation: string) {
  const trimmedObservation = observation.slice(0, 2000);
  const result = await queryWithCompanyContext<{ id: number }>(
    companyId,
    "UPDATE ventas SET observacion = $1 WHERE id = $2 AND empresa_id = $3 RETURNING id",
    [trimmedObservation, id, companyId],
  );

  if (!result.rows[0]) throw new ApiError(404, "Pedido no encontrado");
  return getOrder(companyId, id);
}

export async function updateOrderStatus(session: AuthSession, id: number, nextStatus: OrderStatus) {
  const result = await withCompanyContext(session.companyId, async (client) => {
    const orderResult = await client.query<{ estado_pedido: string }>(
      `
        SELECT COALESCE(estado_pedido, 'recibido') AS estado_pedido
        FROM ventas
        WHERE id = $1 AND empresa_id = $2
        LIMIT 1
      `,
      [id, session.companyId],
    );
    const order = orderResult.rows[0];
    if (!order) throw new ApiError(404, "Pedido no encontrado");

    const currentStatus = normalizeOrderStatus(order.estado_pedido);
    const currentRank = ORDER_RANK.get(currentStatus) ?? 0;
    const nextRank = ORDER_RANK.get(nextStatus) ?? -1;
    if (nextRank <= currentRank) {
      throw new ApiError(
        400,
        `El pedido ya esta en '${currentStatus}'; solo se puede avanzar.`,
      );
    }

    await client.query(
      "UPDATE ventas SET estado_pedido = $1 WHERE id = $2 AND empresa_id = $3",
      [nextStatus, id, session.companyId],
    );
    await client.query(
      "UPDATE remitos SET estado_pedido = $1 WHERE id_venta = $2 AND empresa_id = $3",
      [nextStatus, id, session.companyId],
    );

    let stockDiscounted = false;
    if (nextStatus === "entregado") {
      const claim = await client.query<{ id: number }>(
        `
          UPDATE ventas
          SET stock_descontado = 1
          WHERE id = $1
            AND empresa_id = $2
            AND COALESCE(stock_descontado, 0) = 0
          RETURNING id
        `,
        [id, session.companyId],
      );

      stockDiscounted = Boolean(claim.rows[0]);
      if (stockDiscounted) {
        const lines = await client.query<{ id_producto: number; cantidad: number }>(
          "SELECT id_producto, cantidad FROM detalle_ventas WHERE id_venta = $1 AND empresa_id = $2",
          [id, session.companyId],
        );

        for (const line of lines.rows) {
          await client.query(
            "UPDATE productos SET stock = stock - $1 WHERE id = $2 AND empresa_id = $3",
            [line.cantidad, line.id_producto, session.companyId],
          );
        }
      }
    }

    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        nextStatus === "entregado" ? "pedido.entregado" : "pedido.estado_cambiado",
        JSON.stringify({
          id,
          estado_anterior: currentStatus,
          estado_nuevo: nextStatus,
          usuario: session.username,
        }),
        session.companyId,
      ],
    );

    return { status: nextStatus, stockDiscounted };
  });

  return result;
}

export async function updateOrderCollectionStatus(
  session: AuthSession,
  id: number,
  collectionStatus: string,
) {
  const result = await queryWithCompanyContext<{ id: number }>(
    session.companyId,
    `
      UPDATE ventas
      SET estado_cobro = $1
      WHERE id = $2 AND empresa_id = $3
      RETURNING id
    `,
    [collectionStatus, id, session.companyId],
  );

  if (!result.rows[0]) throw new ApiError(404, "Pedido no encontrado");
  await insertIntegrationEvent(session.companyId, "cobro.estado_cambiado", {
    id,
    estado_cobro: collectionStatus,
    usuario: session.username,
  });

  return getOrder(session.companyId, id);
}
