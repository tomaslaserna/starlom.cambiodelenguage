import { ApiError } from "@/lib/api-response";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { numberField, textField, type RequestBody } from "@/lib/request-body";
import { normalizeRole, type AuthSession } from "@/lib/auth";
import { localDateIso } from "@/lib/timezone";
import { storageDownloadUrl, storageObjectReference } from "@/lib/storage";
import { requireOperationalRecordDeletePermission } from "@/lib/route-auth";

type PurchaseItem = {
  productId: string;
  newProductName: string;
  newProductCode: string;
  quantity: number;
  unitCost: number;
};

type PurchaseInput = {
  supplierId: string;
  description: string;
  total: number;
  date: string;
  status: string;
  type: string;
  taxMode: PurchaseTaxMode;
  vatRate: number;
  items: PurchaseItem[];
};

type PurchaseTaxMode = "con_iva" | "sin_iva";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PURCHASE_STATUSES = new Set(["pendiente", "recibida", "cancelada"]);
const PURCHASE_TAX_MODES = new Set<PurchaseTaxMode>(["con_iva", "sin_iva"]);
const PURCHASE_VAT_RATES = new Set([0, 10.5, 21]);

const todayIso = localDateIso;

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

function normalizePurchaseTaxMode(value: string): PurchaseTaxMode {
  const normalized = value.trim().toLowerCase().replaceAll("-", "_");
  if (PURCHASE_TAX_MODES.has(normalized as PurchaseTaxMode)) return normalized as PurchaseTaxMode;
  throw new ApiError(400, "Modo de IVA de compra invalido");
}

function normalizePurchaseVatRate(value: number, taxMode: PurchaseTaxMode) {
  if (taxMode === "sin_iva") return 0;
  const rounded = Math.round(value * 100) / 100;
  if (PURCHASE_VAT_RATES.has(rounded)) return rounded;
  throw new ApiError(400, "Alicuota de IVA de compra invalida");
}

export function purchaseIdFromParam(value: string, label = "Compra") {
  if (!UUID_PATTERN.test(value)) throw new ApiError(400, `${label} invalido`);
  return value;
}

function bodyItems(body: RequestBody): PurchaseItem[] {
  const raw = body.items ?? body.productos ?? body.products ?? body.productsJson ?? body.productos_json;
  let rawItems: unknown[];
  if (Array.isArray(raw)) {
    rawItems = raw;
  } else if (typeof raw === "string" && raw.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new ApiError(400, "Detalle de compra invalido");
    }
    if (!Array.isArray(parsed)) throw new ApiError(400, "Detalle de compra invalido");
    rawItems = parsed;
  } else {
    rawItems = [];
  }

  return rawItems
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      productId: String(item.productId ?? item.id_producto ?? item.id ?? "").trim(),
      newProductName: String(item.newProductName ?? item.new_product_name ?? "").trim().slice(0, 180),
      newProductCode: String(item.newProductCode ?? item.new_product_code ?? "").trim().slice(0, 80),
      quantity: Number(item.quantity ?? item.cantidad ?? 0),
      unitCost: Number(item.unitCost ?? item.unit_cost ?? item.costo ?? 0),
    }))
    .filter((item) => (UUID_PATTERN.test(item.productId) || item.newProductName.length >= 2) && item.quantity > 0 && item.unitCost >= 0)
    .map((item) => ({ ...item, quantity: Math.trunc(item.quantity), unitCost: Math.round(item.unitCost * 100) / 100 }));
}

export function purchaseInputFromBody(body: RequestBody): PurchaseInput {
  const total = numberField(body, "total", 0);
  if (total < 0) throw new ApiError(400, "El total no puede ser negativo");
  const taxMode = normalizePurchaseTaxMode(textField(body, "taxMode") || textField(body, "tax_mode") || "con_iva");

  return {
    supplierId: uuidField(body, "supplierId", "Proveedor"),
    description: textField(body, "description") || textField(body, "descripcion"),
    total,
    date: textField(body, "date") || textField(body, "fecha") || todayIso(),
    status: normalizePurchaseStatus(textField(body, "status") || textField(body, "estado") || "pendiente"),
    type: textField(body, "type") || textField(body, "tipo") || "compra",
    taxMode,
    vatRate: normalizePurchaseVatRate(
      numberField(body, "vatRate", numberField(body, "vat_rate", 21)),
      taxMode,
    ),
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
  tax_mode: PurchaseTaxMode;
  vat_rate: string;
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
    taxMode: row.tax_mode,
    vatRate: Number(row.vat_rate),
    stockUpdated: row.package_status === "revisado",
    packageStatus: row.package_status,
    failureDescription: row.failure_description,
    receiptPhoto: storageDownloadUrl(row.receipt_photo),
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
    payment_term_days: number | null;
  }>(
    companyId,
    `
      SELECT id, display_name, payment_term_days
      FROM suppliers
      WHERE empresa_id = $1 AND active = true
      ORDER BY display_name ASC, id ASC
      LIMIT 200
    `,
    [companyId],
  );

  return result.rows.map((row) => ({ id: row.id, name: row.display_name, paymentTermDays: Number(row.payment_term_days ?? 0) }));
}

export async function listPurchaseFormProducts(companyId: number, supplierId?: string) {
  const supplierFilter = supplierId ? "AND supplier_id = $2::uuid" : "";
  const params = supplierId ? [companyId, supplierId] : [companyId];
  const result = await queryWithCompanyContext<{
    id: string;
    sku: string | null;
    name: string;
    supplier_id: string | null;
    cost: string | null;
    image_path: string | null;
  }>(
    companyId,
    `
      SELECT id, sku, name, supplier_id::text, cost::text, image_path
      FROM products
      WHERE empresa_id = $1 AND active = true ${supplierFilter}
      ORDER BY name ASC, id ASC
    `,
    params,
  );

  return result.rows.map((row) => ({
    id: row.id,
    code: row.sku ?? "",
    name: row.name,
    supplierId: row.supplier_id,
    cost: Number(row.cost ?? 0),
    imageUrl: row.image_path ? storageDownloadUrl(row.image_path) : "",
  }));
}

export async function listPurchases(companyId: number) {
  const result = await queryWithCompanyContext<Parameters<typeof mapPurchase>[0]>(
    companyId,
    `
      SELECT p.id, p.supplier_id, COALESCE(s.display_name, '') AS supplier_name,
             COALESCE(p.description, '') AS description,
             p.total_amount::text, p.purchase_date::text, p.status,
             p.purchase_type, p.tax_mode, p.vat_rate::text,
             p.package_status, p.failure_description,
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

export async function listPurchaseItemsByPurchaseIds(companyId: number, purchaseIds: string[]) {
  if (purchaseIds.length === 0) return new Map<string, { productId: string; name: string; quantity: number }[]>();

  const result = await queryWithCompanyContext<{
    purchase_id: string;
    product_id: string;
    name: string;
    quantity: string;
  }>(
    companyId,
    `
      SELECT i.purchase_id, i.product_id, COALESCE(p.name, '') AS name, i.quantity::text
      FROM purchase_items i
      LEFT JOIN products p ON p.id = i.product_id AND p.empresa_id = i.empresa_id
      WHERE i.empresa_id = $1 AND i.purchase_id = ANY($2::uuid[]) AND i.product_id IS NOT NULL
      ORDER BY i.id ASC
    `,
    [companyId, purchaseIds],
  );

  const byPurchase = new Map<string, { productId: string; name: string; quantity: number }[]>();
  for (const row of result.rows) {
    const list = byPurchase.get(row.purchase_id) ?? [];
    list.push({ productId: row.product_id, name: row.name, quantity: Number(row.quantity) });
    byPurchase.set(row.purchase_id, list);
  }
  return byPurchase;
}

export async function getPurchase(companyId: number, id: string) {
  const purchaseResult = await queryWithCompanyContext<Parameters<typeof mapPurchase>[0]>(
    companyId,
    `
      SELECT p.id, p.supplier_id, COALESCE(s.display_name, '') AS supplier_name,
             COALESCE(p.description, '') AS description,
             p.total_amount::text, p.purchase_date::text, p.status,
             p.purchase_type, p.tax_mode, p.vat_rate::text,
             p.package_status, p.failure_description,
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

export async function assertPurchaseReceiptStorageAccess(
  companyId: number,
  bucket: string,
  objectPath: string,
) {
  const reference = storageObjectReference(bucket, objectPath);
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    `
      SELECT id::text AS id
      FROM purchases
      WHERE empresa_id = $1
        AND receipt_photo = $2
      LIMIT 1
    `,
    [companyId, reference],
  );
  if (!result.rows[0]) {
    throw new ApiError(404, "Recibo no encontrado o no autorizado");
  }
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
    const isSupplierIntake = input.type.trim().toLowerCase() === "compra";
    const supplier = await client.query<{ id: string; payment_term_days: number }>(
      "SELECT id::text AS id, COALESCE(payment_term_days, 0)::int AS payment_term_days FROM suppliers WHERE id = $1::uuid AND empresa_id = $2 AND active = true LIMIT 1",
      [input.supplierId, session.companyId],
    );
    if (!supplier.rows[0]) throw new ApiError(400, "Proveedor invalido o inactivo");

    const resolvedItems: PurchaseItem[] = [];
    for (const item of input.items) {
      if (UUID_PATTERN.test(item.productId)) {
        resolvedItems.push(item);
        continue;
      }
      if (!isSupplierIntake) throw new ApiError(400, "Los productos nuevos solo pueden crearse desde una compra recibida");

      const duplicate = item.newProductCode
        ? await client.query<{ id: string }>(
            "SELECT id::text AS id FROM products WHERE empresa_id = $1 AND active = true AND lower(COALESCE(sku, '')) = lower($2) LIMIT 1",
            [session.companyId, item.newProductCode],
          )
        : { rows: [] };
      if (duplicate.rows[0]) {
        resolvedItems.push({ ...item, productId: duplicate.rows[0].id });
        continue;
      }

      const created = await client.query<{ id: string }>(
        `INSERT INTO products (category, category_code, sku, supplier_id, name, cost, empresa_id)
         VALUES ('Nuevos productos', 'NUEVO', NULLIF($1, ''), $2::uuid, $3, $4, $5)
         RETURNING id::text AS id`,
        [item.newProductCode, input.supplierId, item.newProductName, item.unitCost, session.companyId],
      );
      resolvedItems.push({ ...item, productId: created.rows[0].id });
    }

    const productIds = Array.from(new Set(resolvedItems.map((item) => item.productId)));
    if (productIds.length) {
      const products = await client.query<{ id: string; supplier_id: string | null; name: string }>(
        `
          SELECT id::text AS id, supplier_id::text AS supplier_id, name
          FROM products
          WHERE empresa_id = $1 AND active = true AND id = ANY($2::uuid[])
        `,
        [session.companyId, productIds],
      );
      if (products.rows.length !== productIds.length) {
        throw new ApiError(400, "Uno o mas productos de la compra no existen o estan inactivos");
      }

      const foreignProducts = products.rows.filter((product) => product.supplier_id !== input.supplierId);
      if (foreignProducts.length && !isSupplierIntake) {
        throw new ApiError(400, `El producto ${foreignProducts[0].name || foreignProducts[0].id} no corresponde al proveedor seleccionado`);
      }
      if (foreignProducts.length) {
        await client.query(
          "UPDATE products SET supplier_id = $1::uuid, updated_at = now() WHERE empresa_id = $2 AND id = ANY($3::uuid[])",
          [input.supplierId, session.companyId, foreignProducts.map((product) => product.id)],
        );
      }
    }

    if (input.items.length === 0) throw new ApiError(400, "Agregá al menos un producto a la compra");
    if (isSupplierIntake) {
      const netFromItems = resolvedItems.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
      const calculatedTotal = input.taxMode === "con_iva"
        ? netFromItems * (1 + input.vatRate / 100)
        : netFromItems;
      if (Math.abs(calculatedTotal - input.total) > 0.02) {
        throw new ApiError(400, "El total de la compra no coincide con los productos, costos e IVA informados");
      }
    }

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO purchases (
          supplier_id, description, total_amount, purchase_date, status,
          purchase_type, tax_mode, vat_rate, package_status, due_date, empresa_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $4::date + $10::int, $11)
        RETURNING id
      `,
      [
        input.supplierId,
        input.description,
        input.total,
        input.date,
        isSupplierIntake ? "recibida" : input.status,
        input.type,
        input.taxMode,
        input.vatRate,
        isSupplierIntake ? "revisado" : "pendiente",
        supplier.rows[0].payment_term_days,
        session.companyId,
      ],
    );
    const purchaseId = result.rows[0].id;

    for (const item of resolvedItems) {
      await client.query(
        `
          INSERT INTO purchase_items (
            purchase_id, product_id, quantity, unit_cost, total_amount, empresa_id
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [purchaseId, item.productId, item.quantity, item.unitCost, item.unitCost * item.quantity, session.companyId],
      );
      if (isSupplierIntake) {
        await client.query(
          `UPDATE products SET cost = $1, updated_at = now()
            WHERE id = $2::uuid AND empresa_id = $3 AND cost IS DISTINCT FROM $1`,
          [item.unitCost, item.productId, session.companyId],
        );
        await client.query(
          `INSERT INTO stock_movements (
             product_id, movement_type, quantity, purchase_id, notes, created_by, empresa_id, idempotency_key
           ) VALUES ($1, 'entrada_compra', $2, $3, 'Ingreso automático desde Nueva compra', $4, $5, $6)
           ON CONFLICT (empresa_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
          [item.productId, item.quantity, purchaseId, session.userId, session.companyId, `purchase-intake:${purchaseId}:${item.productId}`],
        );
      }
    }

    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        session.userId,
        "purchase.created",
        "purchases",
        purchaseId,
        JSON.stringify({
          supplierId: input.supplierId,
          total: input.total,
          type: input.type,
          taxMode: input.taxMode,
          vatRate: input.vatRate,
        }),
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

export async function deletePurchase(session: AuthSession, id: string) {
  await requireOperationalRecordDeletePermission(session);

  return withCompanyContext(session.companyId, async (client) => {
    const purchaseResult = await client.query<{ snapshot: Record<string, unknown> }>(
      "SELECT to_jsonb(p) AS snapshot FROM purchases p WHERE p.id = $1::uuid AND p.empresa_id = $2 FOR UPDATE",
      [id, session.companyId],
    );
    const purchase = purchaseResult.rows[0];
    if (!purchase) throw new ApiError(404, "Compra no encontrada");

    const reconciled = await client.query(
      `
        SELECT 1
        FROM admin_bank_reconciliation_matches match
        JOIN payments payment ON payment.id = match.payment_id
        WHERE payment.purchase_id = $1::uuid
          AND payment.empresa_id = $2
        LIMIT 1
      `,
      [id, session.companyId],
    );
    if (reconciled.rows[0]) {
      throw new ApiError(409, "La compra tiene un pago conciliado y no puede borrarse");
    }

    // Some purchase references do not have database foreign keys yet, so this
    // cleanup stays explicit and transactional. Keep it synchronized with
    // docs/operational-record-deletion.md when the schema changes.
    await client.query(
      `
        DELETE FROM current_account_movements
        WHERE empresa_id = $2
          AND (purchase_id = $1::uuid OR payment_id IN (
            SELECT id FROM payments WHERE purchase_id = $1::uuid AND empresa_id = $2
          ))
      `,
      [id, session.companyId],
    );
    await client.query("DELETE FROM payments WHERE purchase_id = $1::uuid AND empresa_id = $2", [id, session.companyId]);
    await client.query("DELETE FROM stock_movements WHERE purchase_id = $1::uuid AND empresa_id = $2", [id, session.companyId]);
    await client.query("DELETE FROM purchase_items WHERE purchase_id = $1::uuid AND empresa_id = $2", [id, session.companyId]);
    await client.query("DELETE FROM purchases WHERE id = $1::uuid AND empresa_id = $2", [id, session.companyId]);
    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, old_data, empresa_id) VALUES ($1, 'purchase.deleted', 'purchases', $2, $3, $4)",
      [session.userId, id, purchase.snapshot, session.companyId],
    );

    return { id };
  });
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
    const purchase = await client.query<{ status: string; package_status: string }>(
      "SELECT status, package_status FROM purchases WHERE id = $1 AND empresa_id = $2 LIMIT 1",
      [id, session.companyId],
    );
    if (!purchase.rows[0]) throw new ApiError(404, "Compra no encontrada");
    if (purchase.rows[0].status !== "recibida") {
      throw new ApiError(400, "La compra debe estar en estado recibida");
    }
    if (purchase.rows[0].package_status === "revisado") {
      throw new ApiError(409, "La mercadería de esta compra ya fue ingresada al stock");
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

export async function requestSupplierPaymentApproval(
  session: AuthSession,
  id: string,
  input: ReturnType<typeof supplierPaymentFromBody>,
) {
  return withCompanyContext(session.companyId, async (client) => {
    const purchaseResult = await client.query<{
      total_amount: string;
      paid_amount: string;
      supplier_name: string;
      purchase_date: string | null;
    }>(
      `
        SELECT p.total_amount::text,
               p.paid_amount::text,
               p.purchase_date::text,
               COALESCE(s.display_name, 'Proveedor sin nombre') AS supplier_name
        FROM purchases p
        LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.empresa_id = p.empresa_id
        WHERE p.id = $1::uuid AND p.empresa_id = $2
        LIMIT 1
      `,
      [id, session.companyId],
    );
    const purchase = purchaseResult.rows[0];
    if (!purchase) throw new ApiError(404, "Compra no encontrada");

    const total = Number(purchase.total_amount);
    const paid = Number(purchase.paid_amount);
    const remaining = Math.max(0, total - paid);
    const amount = Math.min(input.amount, remaining);
    if (amount <= 0) throw new ApiError(400, "La compra ya esta saldada");

    const metadata = {
      action: "supplier_payment",
      purchaseId: id,
      amount,
      date: input.date,
      notes: input.notes,
    };
    const detail = [
      `Proveedor: ${purchase.supplier_name}`,
      `Compra: ${id}`,
      `Saldo abierto: ${remaining.toFixed(2)}`,
      input.notes ? `Notas: ${input.notes}` : "",
    ]
      .filter(Boolean)
      .join(" | ");

    const request = await client.query<{ id: string }>(
      `
        INSERT INTO app_solicitudes (
          tipo, titulo, detalle, monto, solicitante, estado, metadata, empresa_id
        )
        SELECT 'pago_proveedor', $3, $4, $5, $6, 'pendiente', $7::jsonb, $2
        WHERE NOT EXISTS (
          SELECT 1
          FROM app_solicitudes
          WHERE empresa_id = $2
            AND estado = 'pendiente'
            AND metadata->>'action' = 'supplier_payment'
            AND metadata->>'purchaseId' = $1
        )
        RETURNING id::text AS id
      `,
      [
        id,
        session.companyId,
        `Pago a ${purchase.supplier_name}`,
        detail,
        amount,
        session.username,
        JSON.stringify(metadata),
      ],
    );

    if (!request.rows[0]) throw new ApiError(409, "Ya existe una solicitud de pago pendiente para esta compra");

    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        session.userId,
        "purchase.payment_requested",
        "purchases",
        id,
        JSON.stringify({ requestId: request.rows[0].id, ...metadata }),
        session.companyId,
      ],
    );

    return { id: request.rows[0].id, purchaseId: id, amount };
  });
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
