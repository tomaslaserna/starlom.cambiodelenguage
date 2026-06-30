import { ApiError } from "@/lib/api-response";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { numberField, textField, type RequestBody } from "@/lib/request-body";
import { normalizeRole, type AuthSession } from "@/lib/auth";

type PurchaseItem = {
  productId: string;
  quantity: number;
};

type PurchaseInput = {
  supplierId: string;
  description: string;
  total: number;
  date: string;
  status: string;
  type: string;
  items: PurchaseItem[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PURCHASE_STATUSES = new Set(["pendiente", "recibida", "cancelada"]);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function uuidField(body: RequestBody, key: string, label: string) {
  const value = textField(body, key);
  if (!UUID_PATTERN.test(value)) throw new ApiError(400, `${label} invalido`);
  return value;
}

function normalizePurchaseStatus(status: string) {
  const normalized = status.trim().toLowerCase();
  if (!PURCHASE_STATUSES.has(normalized)) throw new ApiError(400, "Estado de compra invalido");
  return normalized;
}

export function purchaseIdFromParam(value: string, label = "Compra") {
  if (!UUID_PATTERN.test(value)) throw new ApiError(400, `${label} invalido`);
  return value;
}

function bodyItems(body: RequestBody): PurchaseItem[] {
  const raw = body.items ?? body.productos ?? body.products;
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      productId: String(item.productId ?? item.id_producto ?? item.id ?? "").trim(),
      quantity: Number(item.quantity ?? item.cantidad ?? 0),
    }))
    .filter((item) => UUID_PATTERN.test(item.productId) && item.quantity > 0)
    .map((item) => ({ productId: item.productId, quantity: Math.trunc(item.quantity) }));
}

export function purchaseInputFromBody(body: RequestBody): PurchaseInput {
  const total = numberField(body, "total", 0);
  if (total < 0) throw new ApiError(400, "El total no puede ser negativo");

  return {
    supplierId: uuidField(body, "supplierId", "Proveedor"),
    description: textField(body, "description") || textField(body, "descripcion"),
    total,
    date: textField(body, "date") || textField(body, "fecha") || todayIso(),
    status: normalizePurchaseStatus(textField(body, "status") || textField(body, "estado") || "pendiente"),
    type: textField(body, "type") || textField(body, "tipo") || "compra",
    items: bodyItems(body),
  };
}

function mapPurchase(row: {
  id: string;
  supplier_id: string | null;
  supplier_name: string;
  description: string;
  total_amount: string;
  purchase_date: string | null;
  status: string;
  purchase_type: string;
  package_status: string;
  failure_description: string;
  receipt_photo: string;
  paid_amount: string;
  created_at: string;
}) {
  const total = Number(row.total_amount);
  const paidAmount = Number(row.paid_amount);
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    description: row.description,
    total,
    date: row.purchase_date,
    status: row.status,
    type: row.purchase_type,
    stockUpdated: row.package_status === "revisado",
    packageStatus: row.package_status,
    failureDescription: row.failure_description,
    receiptPhoto: row.receipt_photo,
    paid: paidAmount >= total && total > 0,
    paidAmount,
    balance: Math.max(0, total - paidAmount),
    createdAt: row.created_at,
  };
}

export async function listPurchaseFormSuppliers(companyId: number) {
  const result = await queryWithCompanyContext<{
    id: string;
    display_name: string;
  }>(
    companyId,
    `
      SELECT id, display_name
      FROM suppliers
      WHERE empresa_id = $1 AND active = true
      ORDER BY display_name ASC, id ASC
      LIMIT 200
    `,
    [companyId],
  );

  return result.rows.map((row) => ({ id: row.id, name: row.display_name }));
}

export async function listPurchaseFormProducts(companyId: number) {
  const result = await queryWithCompanyContext<{
    id: string;
    sku: string | null;
    name: string;
  }>(
    companyId,
    `
      SELECT id, sku, name
      FROM products
      WHERE empresa_id = $1 AND active = true
      ORDER BY name ASC, id ASC
      LIMIT 300
    `,
    [companyId],
  );

  return result.rows.map((row) => ({ id: row.id, code: row.sku ?? "", name: row.name }));
}

export async function listPurchases(companyId: number) {
  const result = await queryWithCompanyContext<Parameters<typeof mapPurchase>[0]>(
    companyId,
    `
      SELECT p.id, p.supplier_id, COALESCE(s.display_name, '') AS supplier_name,
             COALESCE(p.description, '') AS description,
             p.total_amount::text, p.purchase_date::text, p.status,
             p.purchase_type, p.package_status, p.failure_description,
             p.receipt_photo, p.paid_amount::text, p.created_at::text
      FROM purchases p
      LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id
      WHERE p.empresa_id = $1
      ORDER BY COALESCE(p.purchase_date, p.created_at::date) DESC, p.created_at DESC
    `,
    [companyId],
  );

  return result.rows.map(mapPurchase);
}

export async function getPurchase(companyId: number, id: string) {
  const purchaseResult = await queryWithCompanyContext<Parameters<typeof mapPurchase>[0]>(
    companyId,
    `
      SELECT p.id, p.supplier_id, COALESCE(s.display_name, '') AS supplier_name,
             COALESCE(p.description, '') AS description,
             p.total_amount::text, p.purchase_date::text, p.status,
             p.purchase_type, p.package_status, p.failure_description,
             p.receipt_photo, p.paid_amount::text, p.created_at::text
      FROM purchases p
      LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id
      WHERE p.id = $1 AND p.empresa_id = $2
      LIMIT 1
    `,
    [id, companyId],
  );
  const purchase = purchaseResult.rows[0];
  if (!purchase) throw new ApiError(404, "Compra no encontrada");

  const items = await queryWithCompanyContext<{
    id: string;
    product_id: string | null;
    name: string;
    quantity: string;
  }>(
    companyId,
    `
      SELECT i.id, i.product_id, COALESCE(p.name, '') AS name, i.quantity::text
      FROM purchase_items i
      LEFT JOIN products p ON p.id = i.product_id AND p.empresa_id = i.empresa_id
      WHERE i.purchase_id = $1 AND i.empresa_id = $2
      ORDER BY i.id ASC
    `,
    [id, companyId],
  );

  return {
    ...mapPurchase(purchase),
    items: items.rows.map((item) => ({
      id: item.id,
      productId: item.product_id,
      name: item.name,
      quantity: Number(item.quantity),
    })),
  };
}

export async function assertPurchaseReceiptUploadAllowed(companyId: number, id: string) {
  const purchase = await getPurchase(companyId, id);
  if (purchase.status !== "recibida") {
    throw new ApiError(400, "La compra debe estar en estado recibida para cargar el recibo");
  }
  return purchase;
}

export async function updatePurchaseReceiptPhoto(
  session: AuthSession,
  id: string,
  receiptPhoto: string,
) {
  return withCompanyContext(session.companyId, async (client) => {
    const purchase = await client.query<{ status: string }>(
      "SELECT status FROM purchases WHERE id = $1 AND empresa_id = $2 LIMIT 1",
      [id, session.companyId],
    );
    if (!purchase.rows[0]) throw new ApiError(404, "Compra no encontrada");
    if (purchase.rows[0].status !== "recibida") {
      throw new ApiError(400, "La compra debe estar en estado recibida para cargar el recibo");
    }

    await client.query(
      "UPDATE purchases SET receipt_photo = $1, updated_at = now() WHERE id = $2 AND empresa_id = $3",
      [receiptPhoto, id, session.companyId],
    );
    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        session.userId,
        "purchase.receipt_uploaded",
        "purchases",
        id,
        JSON.stringify({ receiptPhoto }),
        session.companyId,
      ],
    );

    return { id, receiptPhoto };
  });
}

export async function createPurchase(session: AuthSession, input: PurchaseInput) {
  const purchaseId = await withCompanyContext(session.companyId, async (client) => {
    const result = await client.query<{ id: string }>(
      `
        INSERT INTO purchases (
          supplier_id, description, total_amount, purchase_date, status,
          purchase_type, empresa_id
        )
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
      const unitCost = item.quantity > 0 && input.items.length === 1 ? input.total / item.quantity : 0;
      await client.query(
        `
          INSERT INTO purchase_items (
            purchase_id, product_id, quantity, unit_cost, total_amount, empresa_id
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [purchaseId, item.productId, item.quantity, unitCost, unitCost * item.quantity, session.companyId],
      );
    }

    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        session.userId,
        "purchase.created",
        "purchases",
        purchaseId,
        JSON.stringify({ supplierId: input.supplierId, total: input.total, type: input.type }),
        session.companyId,
      ],
    );

    return purchaseId;
  });

  clearReadQueryCache();
  return getPurchase(session.companyId, purchaseId);
}

export async function updatePurchaseStatus(companyId: number, id: string, status: string) {
  const nextStatus = normalizePurchaseStatus(status);
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    "UPDATE purchases SET status = $1, updated_at = now() WHERE id = $2 AND empresa_id = $3 RETURNING id",
    [nextStatus, id, companyId],
  );
  if (!result.rows[0]) throw new ApiError(404, "Compra no encontrada");
  return getPurchase(companyId, id);
}

export async function deletePurchase(companyId: number, id: string) {
  await queryWithCompanyContext(
    companyId,
    "DELETE FROM purchase_items WHERE purchase_id = $1 AND empresa_id = $2",
    [id, companyId],
  );
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    "DELETE FROM purchases WHERE id = $1 AND empresa_id = $2 RETURNING id",
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
          productId: String(item.productId ?? item.id ?? item.id_producto ?? "").trim(),
          quantity: Number(item.quantity ?? item.llego ?? item.cantidad ?? 0),
        }))
        .filter((item) => UUID_PATTERN.test(item.productId) && item.quantity > 0)
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
  id: string,
  input: ReturnType<typeof packageReviewFromBody>,
) {
  return withCompanyContext(session.companyId, async (client) => {
    const purchase = await client.query<{ status: string }>(
      "SELECT status FROM purchases WHERE id = $1 AND empresa_id = $2 LIMIT 1",
      [id, session.companyId],
    );
    if (!purchase.rows[0]) throw new ApiError(404, "Compra no encontrada");
    if (purchase.rows[0].status !== "recibida") {
      throw new ApiError(400, "La compra debe estar en estado recibida");
    }

    if (input.action === "marcar_revisado") {
      await client.query(
        "UPDATE purchases SET package_status = 'revisado', failure_description = '', updated_at = now() WHERE id = $1 AND empresa_id = $2",
        [id, session.companyId],
      );
      const detail = await client.query<{ product_id: string; quantity: string }>(
        "SELECT product_id, quantity::text FROM purchase_items WHERE purchase_id = $1 AND empresa_id = $2 AND product_id IS NOT NULL",
        [id, session.companyId],
      );
      for (const item of detail.rows) {
        await client.query(
          `
            INSERT INTO stock_movements (
              product_id, movement_type, quantity, purchase_id, notes, created_by, empresa_id
            )
            VALUES ($1, 'entrada_compra', $2, $3, $4, $5, $6)
          `,
          [item.product_id, Number(item.quantity), id, "Compra recibida y revisada", session.userId, session.companyId],
        );
      }
    } else {
      await client.query(
        "UPDATE purchases SET package_status = 'falla', failure_description = $1, updated_at = now() WHERE id = $2 AND empresa_id = $3",
        [input.failure, id, session.companyId],
      );
      for (const item of input.arrivedItems) {
        await client.query(
          `
            INSERT INTO stock_movements (
              product_id, movement_type, quantity, purchase_id, notes, created_by, empresa_id
            )
            VALUES ($1, 'entrada_compra', $2, $3, $4, $5, $6)
          `,
          [item.productId, item.quantity, id, input.failure, session.userId, session.companyId],
        );
      }
    }

    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        session.userId,
        input.action === "marcar_revisado" ? "purchase.package_reviewed" : "purchase.package_failed",
        "purchases",
        id,
        JSON.stringify({ failure: input.failure, arrivedItems: input.arrivedItems }),
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
  id: string,
  input: ReturnType<typeof supplierPaymentFromBody>,
) {
  const role = normalizeRole(session.role);
  if (role !== "administrador" && role !== "jefe") {
    throw new ApiError(403, "Sin permiso para registrar pagos a proveedores");
  }

  return executeSupplierPayment(session, id, input);
}

export async function executeSupplierPayment(
  session: AuthSession,
  id: string,
  input: ReturnType<typeof supplierPaymentFromBody>,
) {
  return withCompanyContext(session.companyId, async (client) => {
    const purchaseResult = await client.query<{
      total_amount: string;
      paid_amount: string;
      purchase_date: string;
      supplier_name: string;
    }>(
      `
        SELECT p.total_amount::text,
               p.paid_amount::text,
               p.purchase_date::text,
               COALESCE(s.display_name, 'Proveedor sin nombre') AS supplier_name
        FROM purchases p
        LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id
        WHERE p.id = $1 AND p.empresa_id = $2
        FOR UPDATE OF p
        LIMIT 1
      `,
      [id, session.companyId],
    );
    const purchase = purchaseResult.rows[0];
    if (!purchase) throw new ApiError(404, "Compra no encontrada");

    const total = Number(purchase.total_amount);
    const alreadyPaid = Number(purchase.paid_amount);
    const remaining = Math.max(0, total - alreadyPaid);
    const paymentAmount = Math.min(input.amount, remaining);
    if (paymentAmount <= 0) throw new ApiError(400, "La compra ya esta saldada");

    const nextPaid = alreadyPaid + paymentAmount;
    const supplierName = purchase.supplier_name || "Proveedor sin nombre";
    const purchaseDescription = `Compra ${id}`;

    const debt = await client.query<{ total_credit: string | null }>(
      `
        SELECT COALESCE(SUM(credit), 0)::text AS total_credit
        FROM current_account_movements
        WHERE empresa_id = $1 AND purchase_id = $2::uuid AND entity_type = 'proveedor'
      `,
      [session.companyId, id],
    );
    if (Number(debt.rows[0]?.total_credit ?? 0) <= 0 && total > 0) {
      await client.query(
        `
          INSERT INTO current_account_movements (
            purchase_id, movement_date, debit, credit, description,
            entity_type, entity_name, empresa_id
          )
          VALUES ($1::uuid, $2, 0, $3, $4, 'proveedor', $5, $6)
        `,
        [
          id,
          purchase.purchase_date || input.date,
          total,
          `Compra registrada - ${purchaseDescription}`,
          supplierName,
          session.companyId,
        ],
      );
    }

    await client.query(
      "UPDATE purchases SET paid_amount = $1, updated_at = now() WHERE id = $2 AND empresa_id = $3",
      [nextPaid, id, session.companyId],
    );

    const payment = await client.query<{ id: string }>(
      `
        INSERT INTO payments (
          purchase_id, payment_date, amount, method, reference, status, registered_by,
          entity_type, entity_name, concept, notes, empresa_id
        )
        VALUES ($1::uuid, $2, $3, 'pago_proveedor', $4, 'registrado', $5::uuid,
                'pago', $6, $7, $8, $9)
        RETURNING id::text AS id
      `,
      [
        id,
        input.date,
        paymentAmount,
        purchaseDescription,
        session.userId,
        supplierName,
        `Pago proveedor - ${purchaseDescription}`,
        input.notes,
        session.companyId,
      ],
    );

    await client.query(
      `
        INSERT INTO current_account_movements (
          purchase_id, payment_id, movement_date, debit, credit, description,
          entity_type, entity_name, empresa_id
        )
        VALUES ($1::uuid, $2::uuid, $3, $4, 0, $5, 'proveedor', $6, $7)
      `,
      [
        id,
        payment.rows[0].id,
        input.date,
        paymentAmount,
        `Pago registrado - ${purchaseDescription}${input.notes ? ` | ${input.notes}` : ""}`,
        supplierName,
        session.companyId,
      ],
    );

    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        session.userId,
        "purchase.payment_registered",
        "purchases",
        id,
        JSON.stringify({ amount: paymentAmount, date: input.date, notes: input.notes }),
        session.companyId,
      ],
    );

    return { id, amount: paymentAmount, paidAmount: nextPaid, paid: nextPaid >= total };
  });
}
