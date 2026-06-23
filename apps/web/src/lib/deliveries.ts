import { ApiError } from "@/lib/api-response";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { intField, type RequestBody } from "@/lib/request-body";
import type { AuthSession } from "@/lib/auth";

function normalizePhoneForWhatsapp(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) throw new ApiError(400, "Telefono del repartidor invalido");
  return digits.startsWith("54") ? digits : `54${digits}`;
}

function todayArgentinaLabel() {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

export function deliveryInputFromBody(body: RequestBody) {
  const deliveryUserId = intField(body, "deliveryUserId", intField(body, "id_repartidor", 0));
  const rawIds = body.orderIds ?? body.ids;
  const orderIds = Array.isArray(rawIds)
    ? rawIds.map(Number)
    : String(rawIds ?? "")
        .split(",")
        .map((id) => Number(id.trim()));
  const uniqueOrderIds = [...new Set(orderIds.filter((id) => Number.isInteger(id) && id > 0))];

  if (deliveryUserId <= 0) throw new ApiError(400, "Elegi un repartidor");
  if (!uniqueOrderIds.length) throw new ApiError(400, "Selecciona al menos un pedido");

  return { deliveryUserId, orderIds: uniqueOrderIds };
}

export async function listDeliveryPeople() {
  const result = await queryWithCompanyContext<{
    id: number;
    nombre_completo: string;
    usuario: string;
    telefono: string;
  }>(
    1,
    `
      SELECT id, nombre_completo, usuario, COALESCE(telefono, '') AS telefono
      FROM usuarios
      WHERE COALESCE(telefono, '') <> ''
        AND COALESCE(activo, 1) <> 0
        AND rango NOT IN ('Minorista', 'Mayorista')
      ORDER BY nombre_completo ASC, usuario ASC
    `,
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.nombre_completo || row.usuario,
    username: row.usuario,
    phone: row.telefono,
  }));
}

export async function createDelivery(
  session: AuthSession,
  input: { deliveryUserId: number; orderIds: number[] },
) {
  return withCompanyContext(session.companyId, async (client) => {
    const deliveryUser = await client.query<{
      nombre_completo: string;
      telefono: string;
    }>(
      "SELECT nombre_completo, COALESCE(telefono, '') AS telefono FROM usuarios WHERE id = $1 LIMIT 1",
      [input.deliveryUserId],
    );
    const person = deliveryUser.rows[0];
    if (!person) throw new ApiError(404, "Repartidor no encontrado");
    if (!person.telefono.trim()) {
      throw new ApiError(400, "El repartidor no tiene telefono cargado");
    }

    const phoneForWhatsapp = normalizePhoneForWhatsapp(person.telefono);

    const orders = await client.query<{
      id: number;
      nombre_cliente: string;
      dni_cliente: string;
      observacion: string;
      estado_pedido: string;
      domicilio: string;
      ciudad: string;
      provincia: string;
    }>(
      `
        SELECT v.id, v.nombre_cliente, v.dni_cliente, COALESCE(v.observacion,'') AS observacion,
               COALESCE(v.estado_pedido,'') AS estado_pedido,
               COALESCE(c.domicilio,'') AS domicilio,
               COALESCE(c.ciudad,'') AS ciudad,
               COALESCE(c.provincia,'') AS provincia
        FROM ventas v
        LEFT JOIN clientes c ON c.empresa_id = v.empresa_id
             AND regexp_replace(c.nro_id, '[^0-9]', '', 'g') = regexp_replace(v.dni_cliente, '[^0-9]', '', 'g')
             AND c.nro_id <> ''
        WHERE v.id = ANY($1) AND v.empresa_id = $2
        ORDER BY v.id
      `,
      [input.orderIds, session.companyId],
    );

    if (orders.rows.length !== input.orderIds.length) {
      throw new ApiError(404, "Algun pedido no existe");
    }
    for (const order of orders.rows) {
      if (order.estado_pedido !== "pendiente_entrega") {
        throw new ApiError(400, `El pedido #${order.id} no esta en pendiente de entrega`);
      }
    }

    const assigned = await client.query<{ id_venta: number }>(
      "SELECT id_venta FROM reparto_pedidos WHERE empresa_id = $1 AND id_venta = ANY($2)",
      [session.companyId, input.orderIds],
    );
    if (assigned.rows.length) {
      throw new ApiError(
        409,
        `Hay pedidos que ya estan en un reparto: #${assigned.rows.map((row) => row.id_venta).join(", #")}`,
      );
    }

    const delivery = await client.query<{ id: number }>(
      `
        INSERT INTO repartos (repartidor_nombre, repartidor_telefono, creado_por, empresa_id)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [person.nombre_completo, person.telefono, session.username, session.companyId],
    );
    const deliveryId = delivery.rows[0].id;

    for (const order of orders.rows) {
      await client.query(
        "INSERT INTO reparto_pedidos (id_reparto, id_venta, empresa_id) VALUES ($1, $2, $3)",
        [deliveryId, order.id, session.companyId],
      );
    }

    const dateLabel = todayArgentinaLabel();
    const lines = [
      `*Reparto ${dateLabel}* - Repartidor: ${person.nombre_completo}`,
      "Pedidos a entregar hoy:",
      "",
    ];
    const payloadOrders = orders.rows.map((order, index) => {
      const location = [order.ciudad, order.provincia].filter(Boolean).join(", ");
      const address = [order.domicilio, location].filter(Boolean).join(", ");
      lines.push(`${index + 1}) ${order.nombre_cliente}`);
      if (address) lines.push(`   Direccion: ${address}`);
      if (order.observacion.trim()) lines.push(`   Obs: ${order.observacion}`);
      lines.push("");

      return {
        orderId: order.id,
        customer: order.nombre_cliente,
        address,
        observation: order.observacion,
      };
    });

    const message = lines.join("\n").trim();
    const whatsappLink = `https://wa.me/${phoneForWhatsapp}?text=${encodeURIComponent(message)}`;

    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        "reparto.asignado",
        JSON.stringify({
          id_reparto: deliveryId,
          repartidor: person.nombre_completo,
          repartidor_telefono: phoneForWhatsapp,
          fecha: dateLabel,
          pedidos: payloadOrders,
          mensaje: message,
        }),
        session.companyId,
      ],
    );

    return {
      id: deliveryId,
      count: orders.rows.length,
      deliveryPerson: person.nombre_completo,
      whatsappLink,
      message,
    };
  });
}

export function deliveryFromSaleInputFromBody(body: RequestBody) {
  const saleId = intField(body, "saleId", intField(body, "id_venta", 0));
  if (saleId <= 0) throw new ApiError(400, "id_venta invalido");
  return { saleId };
}

export async function createDeliveryDocumentFromSale(session: AuthSession, saleId: number) {
  return withCompanyContext(session.companyId, async (client) => {
    const sale = await client.query<{
      nombre_cliente: string;
      dni_cliente: string;
      fecha: string | null;
      monto: string;
      condicion_pago: string;
      vendedor: string;
      lista_precios: string;
    }>(
      `
        SELECT nombre_cliente, dni_cliente, fecha::text, monto::text,
               condicion_pago, vendedor, COALESCE(lista_precios, '') AS lista_precios
        FROM ventas
        WHERE id = $1 AND empresa_id = $2
        LIMIT 1
      `,
      [saleId, session.companyId],
    );
    const current = sale.rows[0];
    if (!current) throw new ApiError(404, "Venta no encontrada");

    const existing = await client.query<{ id: number }>(
      "SELECT id FROM remitos WHERE id_venta = $1 AND empresa_id = $2 LIMIT 1",
      [saleId, session.companyId],
    );
    if (existing.rows[0]) throw new ApiError(409, "Esta venta ya tiene un remito");

    const lines = await client.query<{
      id_producto: number;
      nombre_producto: string;
      cantidad: number;
      precio_unit: string;
      descuento: string;
      subtotal: string;
    }>(
      `
        SELECT id_producto, nombre_producto, cantidad, precio_unit::text,
               COALESCE(descuento, 0)::text AS descuento, subtotal::text
        FROM detalle_ventas
        WHERE id_venta = $1 AND empresa_id = $2
        ORDER BY id ASC
      `,
      [saleId, session.companyId],
    );

    const sequence = await client.query<{ value: number }>(
      "SELECT app_private.next_sequence($1, 'nro_remito') AS value",
      [session.companyId],
    );
    const deliveryNumber = sequence.rows[0].value;

    const created = await client.query<{ id: number }>(
      `
        INSERT INTO remitos (
          id_venta, nro_remito, nombre_cliente, lista_precios, dni_cliente,
          fecha, condicion_pago, monto, vendedor, empresa_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `,
      [
        saleId,
        deliveryNumber,
        current.nombre_cliente,
        current.lista_precios,
        current.dni_cliente,
        current.fecha,
        current.condicion_pago,
        current.monto,
        current.vendedor,
        session.companyId,
      ],
    );
    const deliveryId = created.rows[0].id;

    for (const line of lines.rows) {
      await client.query(
        `
          INSERT INTO detalle_remitos (
            id_remito, id_producto, nombre_producto, cantidad, precio_unit,
            descuento, subtotal, empresa_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          deliveryId,
          line.id_producto,
          line.nombre_producto,
          line.cantidad,
          Number(line.precio_unit),
          Number(line.descuento),
          Number(line.subtotal),
          session.companyId,
        ],
      );
    }

    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ('remito.creado', $1, $2)",
      [
        JSON.stringify({
          id: deliveryId,
          nro_remito: deliveryNumber,
          id_venta: saleId,
          nombre_cliente: current.nombre_cliente,
          dni_cliente: current.dni_cliente,
          monto: Number(current.monto),
          usuario: session.username,
        }),
        session.companyId,
      ],
    );

    return { id: deliveryId, number: deliveryNumber, saleId };
  });
}

export async function getDeliveryItems(companyId: number, deliveryId: number) {
  const result = await queryWithCompanyContext<{
    nombre: string;
    cantidad: number;
  }>(
    companyId,
    `
      SELECT COALESCE(p.nombre, d.nombre_producto, '(producto eliminado)') AS nombre,
             d.cantidad
      FROM detalle_remitos d
      LEFT JOIN productos p ON p.id = d.id_producto AND p.empresa_id = d.empresa_id
      WHERE d.id_remito = $1 AND d.empresa_id = $2
      ORDER BY d.id ASC
    `,
    [deliveryId, companyId],
  );

  return result.rows.map((row) => ({ name: row.nombre, quantity: row.cantidad }));
}
