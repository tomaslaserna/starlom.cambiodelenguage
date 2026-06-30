import { ApiError } from "@/lib/api-response";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import { textField, uuidParam, type RequestBody } from "@/lib/request-body";
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
  const deliveryUserId = uuidParam(textField(body, "deliveryUserId") || textField(body, "id_repartidor"), "Repartidor");
  const rawIds = body.orderIds ?? body.ids;
  const orderIds = Array.isArray(rawIds)
    ? rawIds.map((id) => String(id).trim())
    : String(rawIds ?? "")
        .split(",")
        .map((id) => id.trim());
  const uniqueOrderIds = [...new Set(orderIds)].filter((id) => {
    try {
      uuidParam(id, "Pedido");
      return true;
    } catch {
      return false;
    }
  });

  if (!uniqueOrderIds.length) throw new ApiError(400, "Selecciona al menos un pedido");

  return { deliveryUserId, orderIds: uniqueOrderIds };
}

export async function listDeliveryPeople() {
  const result = await queryWithCompanyContext<{
    id: string;
    nombre_completo: string;
    usuario: string;
    telefono: string;
  }>(
    1,
    `
      SELECT id::text AS id,
             COALESCE(full_name, username, email, '') AS nombre_completo,
             COALESCE(username, email, '') AS usuario,
             '' AS telefono
      FROM profiles
      WHERE active = true
        AND role::text NOT IN ('minorista', 'mayorista')
      ORDER BY full_name ASC, username ASC
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
  input: { deliveryUserId: string; orderIds: string[] },
) {
  return withCompanyContext(session.companyId, async (client) => {
    const deliveryUser = await client.query<{
      nombre_completo: string;
      telefono: string;
    }>(
      "SELECT COALESCE(full_name, username, email, '') AS nombre_completo, '' AS telefono FROM profiles WHERE id = $1::uuid AND active = true LIMIT 1",
      [input.deliveryUserId],
    );
    const person = deliveryUser.rows[0];
    if (!person) throw new ApiError(404, "Repartidor no encontrado");
    const phoneForWhatsapp = person.telefono.trim() ? normalizePhoneForWhatsapp(person.telefono) : "";

    const orders = await client.query<{
      id: string;
      nombre_cliente: string;
      observacion: string;
      estado_pedido: string;
      domicilio: string;
      ciudad: string;
      provincia: string;
    }>(
      `
        SELECT v.id::text AS id,
               COALESCE(v.client_name, c.display_name, '') AS nombre_cliente,
               COALESCE(v.notes,'') AS observacion,
               ${normalizedOrderStatusSql("v")} AS estado_pedido,
               COALESCE(c.delivery_address, c.address, '') AS domicilio,
               COALESCE(c.locality,'') AS ciudad,
               COALESCE(c.province,'') AS provincia
        FROM sales v
        LEFT JOIN clients c ON c.id = v.client_id AND c.empresa_id = v.empresa_id
        WHERE v.id = ANY($1::uuid[]) AND v.empresa_id = $2
        ORDER BY v.id
      `,
      [input.orderIds, session.companyId],
    );

    if (orders.rows.length !== input.orderIds.length) {
      throw new ApiError(404, "Algun pedido no existe");
    }
    for (const order of orders.rows) {
      if (order.estado_pedido !== "confirmado") {
        throw new ApiError(400, `El pedido #${order.id} no esta confirmado para stock`);
      }
    }

    const assigned = await client.query<{ id_venta: string }>(
      "SELECT sale_id::text AS id_venta FROM delivery_run_sales WHERE empresa_id = $1 AND sale_id = ANY($2::uuid[])",
      [session.companyId, input.orderIds],
    );
    if (assigned.rows.length) {
      throw new ApiError(
        409,
        `Hay pedidos que ya estan en un reparto: #${assigned.rows.map((row) => row.id_venta).join(", #")}`,
      );
    }

    const delivery = await client.query<{ id: string }>(
      `
        INSERT INTO delivery_runs (
          delivery_person_id, delivery_person_name, delivery_person_phone, created_by, empresa_id
        )
        VALUES ($1::uuid, $2, $3, $4::uuid, $5)
        RETURNING id::text AS id
      `,
      [input.deliveryUserId, person.nombre_completo, person.telefono, session.userId, session.companyId],
    );
    const deliveryId = delivery.rows[0].id;

    for (const order of orders.rows) {
      await client.query(
        "INSERT INTO delivery_run_sales (delivery_run_id, sale_id, empresa_id) VALUES ($1::uuid, $2::uuid, $3)",
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
    const whatsappLink = phoneForWhatsapp
      ? `https://wa.me/${phoneForWhatsapp}?text=${encodeURIComponent(message)}`
      : "";

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
  const saleId = uuidParam(textField(body, "saleId") || textField(body, "id_venta"), "Venta");
  return { saleId };
}

export async function createDeliveryDocumentFromSale(session: AuthSession, saleId: string) {
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
        SELECT COALESCE(s.client_name, c.display_name, '') AS nombre_cliente,
               COALESCE(s.client_document, c.tax_id, '') AS dni_cliente,
               s.sale_date::text AS fecha,
               COALESCE(s.total_amount, 0)::text AS monto,
               COALESCE(s.payment_condition, '') AS condicion_pago,
               COALESCE(s.seller_name, c.seller_name, '') AS vendedor,
               COALESCE(s.price_list_name, c.price_list_name, '') AS lista_precios
        FROM sales s
        LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
        WHERE s.id = $1::uuid AND s.empresa_id = $2
        LIMIT 1
      `,
      [saleId, session.companyId],
    );
    const current = sale.rows[0];
    if (!current) throw new ApiError(404, "Venta no encontrada");

    const existing = await client.query<{ id: string }>(
      "SELECT id::text AS id FROM delivery_documents WHERE sale_id = $1::uuid AND empresa_id = $2 LIMIT 1",
      [saleId, session.companyId],
    );
    if (existing.rows[0]) throw new ApiError(409, "Esta venta ya tiene un remito");

    const lines = await client.query<{
      id: string;
      product_id: string | null;
      nombre_producto: string;
      cantidad: string;
      precio_unit: string;
      descuento: string;
      subtotal: string;
    }>(
      `
        SELECT si.id::text AS id, si.product_id::text,
               COALESCE(si.description, p.name, '') AS nombre_producto,
               si.quantity::text AS cantidad,
               si.unit_price::text AS precio_unit,
               COALESCE(si.discount, 0)::text AS descuento,
               si.total_amount::text AS subtotal
        FROM sale_items si
        LEFT JOIN products p ON p.id = si.product_id AND p.empresa_id = si.empresa_id
        WHERE si.sale_id = $1::uuid AND si.empresa_id = $2
        ORDER BY id ASC
      `,
      [saleId, session.companyId],
    );

    const sequence = await client.query<{ value: number }>(
      "SELECT COALESCE(MAX(delivery_number), 0) + 1 AS value FROM delivery_documents WHERE empresa_id = $1",
      [session.companyId],
    );
    const deliveryNumber = sequence.rows[0].value;

    const created = await client.query<{ id: string }>(
      `
        INSERT INTO delivery_documents (
          sale_id, delivery_number, client_name, price_list_name, client_document,
          delivery_date, payment_condition, total_amount, seller_name, order_status,
          created_by, empresa_id
        )
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, 'confirmado', $10::uuid, $11)
        RETURNING id::text AS id
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
        session.userId,
        session.companyId,
      ],
    );
    const deliveryId = created.rows[0].id;

    for (const line of lines.rows) {
      await client.query(
        `
          INSERT INTO delivery_document_items (
            delivery_id, sale_item_id, product_id, description, quantity,
            unit_price, discount, total_amount, empresa_id
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9)
        `,
        [
          deliveryId,
          line.id,
          line.product_id,
          line.nombre_producto,
          Number(line.cantidad),
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

    clearReadQueryCache();
    return { id: deliveryId, number: deliveryNumber, saleId };
  });
}

export async function getDeliveryItems(companyId: number, deliveryId: string) {
  const result = await queryWithCompanyContext<{
    nombre: string;
    cantidad: string;
  }>(
    companyId,
    `
      SELECT COALESCE(d.description, p.name, '(producto eliminado)') AS nombre,
             d.quantity::text AS cantidad
      FROM delivery_document_items d
      LEFT JOIN products p ON p.id = d.product_id AND p.empresa_id = d.empresa_id
      WHERE d.delivery_id = $1::uuid AND d.empresa_id = $2
      ORDER BY d.id ASC
    `,
    [deliveryId, companyId],
  );

  return result.rows.map((row) => ({ name: row.nombre, quantity: Number(row.cantidad) }));
}
