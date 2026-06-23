import { ApiError } from "@/lib/api-response";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { intField, numberField, textField, type RequestBody } from "@/lib/request-body";
import type { AuthSession } from "@/lib/auth";

type PurchaseItem = {
  productId: number;
  quantity: number;
};

type PurchaseInput = {
  supplierId: number;
  description: string;
  total: number;
  date: string;
  status: string;
  type: string;
  items: PurchaseItem[];
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function bodyItems(body: RequestBody): PurchaseItem[] {
  const raw = body.items ?? body.productos ?? body.products;
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      productId: Number(item.productId ?? item.id_producto ?? item.id ?? 0),
      quantity: Number(item.quantity ?? item.cantidad ?? 0),
    }))
    .filter((item) => Number.isInteger(item.productId) && item.productId > 0 && item.quantity > 0)
    .map((item) => ({ productId: item.productId, quantity: Math.trunc(item.quantity) }));
}

export function purchaseInputFromBody(body: RequestBody): PurchaseInput {
  const supplierId = intField(body, "supplierId", intField(body, "id_proveedor", 0));
  const total = numberField(body, "total", 0);

  if (supplierId <= 0) throw new ApiError(400, "Proveedor invalido");
  if (total < 0) throw new ApiError(400, "El total no puede ser negativo");

  return {
    supplierId,
    description: textField(body, "description") || textField(body, "descripcion"),
    total,
    date: textField(body, "date") || textField(body, "fecha") || todayIso(),
    status: textField(body, "status") || textField(body, "estado") || "pendiente",
    type: textField(body, "type") || textField(body, "tipo") || "compra",
    items: bodyItems(body),
  };
}

function mapPurchase(row: {
  id: number;
  id_proveedor: number | null;
  proveedor: string;
  descripcion: string;
  total: string;
  fecha: string | null;
  estado: string;
  tipo: string;
  stock_actualizado: number;
  estado_paquete: string;
  falla_descripcion: string;
  recibo_foto: string;
  pagado: number;
  monto_pagado: string;
  created_at: string;
}) {
  return {
    id: row.id,
    supplierId: row.id_proveedor,
    supplierName: row.proveedor,
    description: row.descripcion,
    total: Number(row.total),
    date: row.fecha,
    status: row.estado,
    type: row.tipo,
    stockUpdated: Number(row.stock_actualizado) === 1,
    packageStatus: row.estado_paquete,
    failureDescription: row.falla_descripcion,
    receiptPhoto: row.recibo_foto,
    paid: Number(row.pagado) === 1,
    paidAmount: Number(row.monto_pagado),
    balance: Math.max(0, Number(row.total) - Number(row.monto_pagado)),
    createdAt: row.created_at,
  };
}

export async function listPurchases(companyId: number) {
  const result = await queryWithCompanyContext<Parameters<typeof mapPurchase>[0]>(
    companyId,
    `
      SELECT cr.id, cr.id_proveedor, COALESCE(p.nombre, '') AS proveedor,
             cr.descripcion, cr.total::text, cr.fecha::text, cr.estado, cr.tipo,
             cr.stock_actualizado, cr.estado_paquete, cr.falla_descripcion,
             cr.recibo_foto, cr.pagado, cr.monto_pagado::text, cr.created_at::text
      FROM compras_registro cr
      LEFT JOIN proveedores p ON p.id = cr.id_proveedor AND p.empresa_id = cr.empresa_id
      WHERE cr.empresa_id = $1
      ORDER BY COALESCE(cr.fecha, cr.created_at::date) DESC, cr.id DESC
    `,
    [companyId],
  );

  return result.rows.map(mapPurchase);
}

export async function getPurchase(companyId: number, id: number) {
  const purchaseResult = await queryWithCompanyContext<Parameters<typeof mapPurchase>[0]>(
    companyId,
    `
      SELECT cr.id, cr.id_proveedor, COALESCE(p.nombre, '') AS proveedor,
             cr.descripcion, cr.total::text, cr.fecha::text, cr.estado, cr.tipo,
             cr.stock_actualizado, cr.estado_paquete, cr.falla_descripcion,
             cr.recibo_foto, cr.pagado, cr.monto_pagado::text, cr.created_at::text
      FROM compras_registro cr
      LEFT JOIN proveedores p ON p.id = cr.id_proveedor AND p.empresa_id = cr.empresa_id
      WHERE cr.id = $1 AND cr.empresa_id = $2
      LIMIT 1
    `,
    [id, companyId],
  );
  const purchase = purchaseResult.rows[0];
  if (!purchase) throw new ApiError(404, "Compra no encontrada");

  const items = await queryWithCompanyContext<{
    id: number;
    id_producto: number;
    nombre: string;
    cantidad: number;
  }>(
    companyId,
    `
      SELECT d.id, d.id_producto, COALESCE(p.nombre, '') AS nombre, d.cantidad
      FROM detalle_compras_registro d
      LEFT JOIN productos p ON p.id = d.id_producto AND p.empresa_id = d.empresa_id
      WHERE d.id_compra = $1 AND d.empresa_id = $2
      ORDER BY d.id ASC
    `,
    [id, companyId],
  );

  return {
    ...mapPurchase(purchase),
    items: items.rows.map((item) => ({
      id: item.id,
      productId: item.id_producto,
      name: item.nombre,
      quantity: item.cantidad,
    })),
  };
}

export async function assertPurchaseReceiptUploadAllowed(companyId: number, id: number) {
  const purchase = await getPurchase(companyId, id);
  if (purchase.status !== "recibida") {
    throw new ApiError(400, "La compra debe estar en estado recibida para cargar el recibo");
  }
  return purchase;
}

export async function updatePurchaseReceiptPhoto(
  session: AuthSession,
  id: number,
  receiptPhoto: string,
) {
  return withCompanyContext(session.companyId, async (client) => {
    const purchase = await client.query<{ estado: string }>(
      "SELECT estado FROM compras_registro WHERE id = $1 AND empresa_id = $2 LIMIT 1",
      [id, session.companyId],
    );
    if (!purchase.rows[0]) throw new ApiError(404, "Compra no encontrada");
    if (purchase.rows[0].estado !== "recibida") {
      throw new ApiError(400, "La compra debe estar en estado recibida para cargar el recibo");
    }

    await client.query(
      "UPDATE compras_registro SET recibo_foto = $1 WHERE id = $2 AND empresa_id = $3",
      [receiptPhoto, id, session.companyId],
    );
    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        "compra.recibo_cargado",
        JSON.stringify({ id, recibo_foto: receiptPhoto, usuario: session.username }),
        session.companyId,
      ],
    );

    return { id, receiptPhoto };
  });
}

export async function createPurchase(session: AuthSession, input: PurchaseInput) {
  return withCompanyContext(session.companyId, async (client) => {
    const result = await client.query<{ id: number }>(
      `
        INSERT INTO compras_registro (id_proveedor, descripcion, total, fecha, estado, tipo, empresa_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `,
      [
        input.supplierId,
        input.description,
        input.total,
        input.date,
        input.status,
        input.type,
        session.companyId,
      ],
    );
    const purchaseId = result.rows[0].id;

    for (const item of input.items) {
      await client.query(
        `
          INSERT INTO detalle_compras_registro (id_compra, id_producto, cantidad, empresa_id)
          VALUES ($1, $2, $3, $4)
        `,
        [purchaseId, item.productId, item.quantity, session.companyId],
      );
    }

    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        "compra.creada",
        JSON.stringify({ id: purchaseId, proveedor: input.supplierId, usuario: session.username }),
        session.companyId,
      ],
    );

    return getPurchase(session.companyId, purchaseId);
  });
}

export async function updatePurchaseStatus(companyId: number, id: number, status: string) {
  const result = await queryWithCompanyContext<{ id: number }>(
    companyId,
    "UPDATE compras_registro SET estado = $1 WHERE id = $2 AND empresa_id = $3 RETURNING id",
    [status, id, companyId],
  );
  if (!result.rows[0]) throw new ApiError(404, "Compra no encontrada");
  return getPurchase(companyId, id);
}

export async function deletePurchase(companyId: number, id: number) {
  await queryWithCompanyContext(
    companyId,
    "DELETE FROM detalle_compras_registro WHERE id_compra = $1 AND empresa_id = $2",
    [id, companyId],
  );
  const result = await queryWithCompanyContext<{ id: number }>(
    companyId,
    "DELETE FROM compras_registro WHERE id = $1 AND empresa_id = $2 RETURNING id",
    [id, companyId],
  );
  if (!result.rows[0]) throw new ApiError(404, "Compra no encontrada");
  return { id };
}

export function packageReviewFromBody(body: RequestBody) {
  const action = textField(body, "action") || textField(body, "accion");
  const failure = textField(body, "failure") || textField(body, "falla");
  const arrivedRaw = body.arrivedItems ?? body.productos_llego ?? body.items ?? body.productos;
  const arrivedItems = Array.isArray(arrivedRaw)
    ? arrivedRaw
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => ({
          productId: Number(item.productId ?? item.id ?? item.id_producto ?? 0),
          quantity: Number(item.quantity ?? item.llego ?? item.cantidad ?? 0),
        }))
        .filter((item) => Number.isInteger(item.productId) && item.productId > 0 && item.quantity > 0)
        .map((item) => ({ productId: item.productId, quantity: Math.trunc(item.quantity) }))
    : [];

  if (!["marcar_revisado", "reportar_falla", "confirmar_falla"].includes(action)) {
    throw new ApiError(400, "Accion no reconocida");
  }
  if (action !== "marcar_revisado" && !failure) throw new ApiError(400, "Debe describir la falla");

  return { action, failure, arrivedItems };
}

export async function reviewPurchasePackage(
  session: AuthSession,
  id: number,
  input: ReturnType<typeof packageReviewFromBody>,
) {
  return withCompanyContext(session.companyId, async (client) => {
    const purchase = await client.query<{ estado: string }>(
      "SELECT estado FROM compras_registro WHERE id = $1 AND empresa_id = $2 LIMIT 1",
      [id, session.companyId],
    );
    if (!purchase.rows[0]) throw new ApiError(404, "Compra no encontrada");
    if (purchase.rows[0].estado !== "recibida") {
      throw new ApiError(400, "La compra debe estar en estado recibida");
    }

    if (input.action === "marcar_revisado") {
      await client.query(
        "UPDATE compras_registro SET estado_paquete = 'revisado', falla_descripcion = '' WHERE id = $1 AND empresa_id = $2",
        [id, session.companyId],
      );
      const detail = await client.query<{ id_producto: number; cantidad: number }>(
        "SELECT id_producto, cantidad FROM detalle_compras_registro WHERE id_compra = $1 AND empresa_id = $2",
        [id, session.companyId],
      );
      for (const item of detail.rows) {
        await client.query(
          "UPDATE productos SET stock = stock + $1 WHERE id = $2 AND empresa_id = $3",
          [item.cantidad, item.id_producto, session.companyId],
        );
      }
    } else {
      await client.query(
        "UPDATE compras_registro SET estado_paquete = 'falla', falla_descripcion = $1 WHERE id = $2 AND empresa_id = $3",
        [input.failure, id, session.companyId],
      );
      for (const item of input.arrivedItems) {
        await client.query(
          "UPDATE productos SET stock = stock + $1 WHERE id = $2 AND empresa_id = $3",
          [item.quantity, item.productId, session.companyId],
        );
      }
    }

    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        input.action === "marcar_revisado" ? "compra.paquete_revisado" : "compra.paquete_falla",
        JSON.stringify({ id, accion: input.action, falla: input.failure, usuario: session.username }),
        session.companyId,
      ],
    );

    return { id, packageStatus: input.action === "marcar_revisado" ? "revisado" : "falla" };
  });
}

export function supplierPaymentFromBody(body: RequestBody) {
  const amount = numberField(body, "amount", numberField(body, "monto", 0));
  if (amount <= 0) throw new ApiError(400, "El monto debe ser mayor a cero");
  return {
    amount,
    date: textField(body, "date") || textField(body, "fecha") || todayIso(),
    notes: textField(body, "notes") || textField(body, "notas"),
  };
}

export async function paySupplierPurchase(
  session: AuthSession,
  id: number,
  input: ReturnType<typeof supplierPaymentFromBody>,
) {
  if (!["Admin", "Jefe1"].includes(session.role)) {
    const result = await queryWithCompanyContext<{ id: number }>(
      session.companyId,
      `
        INSERT INTO app_solicitudes (
          empresa_id, tipo, origen_tipo, origen_id, titulo, detalle, monto,
          solicitante, metadata
        )
        VALUES ($1, 'Orden de pago', 'compra', $2, $3, $4, $5, $6, $7)
        RETURNING id
      `,
      [
        session.companyId,
        id,
        `Pago proveedor - Compra #${id}`,
        input.notes || "Solicitud de pago proveedor",
        input.amount,
        session.username,
        JSON.stringify({
          action: "supplier_payment",
          purchaseId: id,
          amount: input.amount,
          date: input.date,
          notes: input.notes,
        }),
      ],
    );

    return { id, requested: true, requestId: result.rows[0].id };
  }

  return executeSupplierPayment(session, id, input);
}

export async function executeSupplierPayment(
  session: AuthSession,
  id: number,
  input: ReturnType<typeof supplierPaymentFromBody>,
) {
  return withCompanyContext(session.companyId, async (client) => {
    const purchaseResult = await client.query<{
      total: string;
      monto_pagado: string;
      proveedor: string;
    }>(
      `
        SELECT cr.total::text, COALESCE(cr.monto_pagado,0)::text AS monto_pagado,
               COALESCE(p.nombre, '') AS proveedor
        FROM compras_registro cr
        LEFT JOIN proveedores p ON p.id = cr.id_proveedor AND p.empresa_id = cr.empresa_id
        WHERE cr.id = $1 AND cr.empresa_id = $2
        LIMIT 1
      `,
      [id, session.companyId],
    );
    const purchase = purchaseResult.rows[0];
    if (!purchase) throw new ApiError(404, "Compra no encontrada");

    const total = Number(purchase.total);
    const alreadyPaid = Number(purchase.monto_pagado);
    const remaining = Math.max(0, total - alreadyPaid);
    const paymentAmount = Math.min(input.amount, remaining);
    if (paymentAmount <= 0) throw new ApiError(400, "La compra ya esta saldada");

    const supplierName = purchase.proveedor || `Compra #${id}`;

    const existingDebit = await client.query(
      "SELECT id FROM cuentas_corrientes WHERE empresa_id = $1 AND id_origen = $2 AND tipo_origen = 'compra' AND debe > 0 LIMIT 1",
      [session.companyId, id],
    );
    if (!existingDebit.rows[0] && total > 0) {
      await client.query(
        `
          INSERT INTO cuentas_corrientes (
            tipo, entidad_nombre, descripcion, debe, haber, fecha, id_origen, tipo_origen, empresa_id
          )
          VALUES ('proveedor', $1, $2, $3, 0, $4, $5, 'compra', $6)
        `,
        [supplierName, `Factura proveedor #${id}`, total, input.date, id, session.companyId],
      );
    }

    await client.query(
      `
        INSERT INTO cuentas_corrientes (
          tipo, entidad_nombre, descripcion, debe, haber, fecha, id_origen, tipo_origen, empresa_id
        )
        VALUES ('proveedor', $1, $2, 0, $3, $4, $5, 'compra', $6)
      `,
      [supplierName, `Pago - Compra #${id}`, paymentAmount, input.date, id, session.companyId],
    );

    const nextPaid = alreadyPaid + paymentAmount;
    await client.query(
      "UPDATE compras_registro SET monto_pagado = $1, pagado = CASE WHEN $1 >= total THEN 1 ELSE pagado END WHERE id = $2 AND empresa_id = $3",
      [nextPaid, id, session.companyId],
    );

    await client.query(
      `
        INSERT INTO pagos_registro (
          tipo, entidad_nombre, concepto, monto, fecha, notas, id_origen, tipo_origen, empresa_id
        )
        VALUES ('pago', $1, $2, $3, $4, $5, $6, 'compra', $7)
      `,
      [supplierName, `Pago proveedor - Compra #${id}`, paymentAmount, input.date, input.notes, id, session.companyId],
    );

    await client.query(
      "INSERT INTO eventos_integracion (tipo, datos, empresa_id) VALUES ($1, $2, $3)",
      [
        "compra.pago_registrado",
        JSON.stringify({ id, monto: paymentAmount, usuario: session.username }),
        session.companyId,
      ],
    );

    return { id, amount: paymentAmount, paidAmount: nextPaid, paid: nextPaid >= total };
  });
}
