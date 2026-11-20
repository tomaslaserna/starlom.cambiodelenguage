import { getSupplier, type Supplier } from "@/lib/catalog-management";
import { queryWithCompanyContext } from "@/lib/db";

export type SupplierSummary = {
  totalPurchased: number;
  receivedPurchaseCount: number;
  lastPurchaseDate: string | null;
  outstandingBalance: number;
  paymentTermDays: number;
  activeProductCount: number;
};

export type SupplierProduct = {
  id: string;
  sku: string;
  name: string;
  category: string;
  cost: number;
  presentationUnits: number;
};

export type SupplierPurchase = {
  id: string;
  purchaseNumber: string;
  date: string | null;
  description: string;
  total: number;
  paid: number;
  balance: number;
  dueDate: string | null;
  status: string;
  taxMode: string;
  vatRate: number;
  packageStatus: string;
};

export type SupplierDetail360 = {
  supplier: Supplier;
  summary: SupplierSummary;
  products: SupplierProduct[];
  purchases: SupplierPurchase[];
};

type SummaryRow = {
  total_purchased: string | null;
  received_purchase_count: string | null;
  last_purchase_date: string | null;
  outstanding_balance: string | null;
  active_product_count: string | null;
};

type ProductRow = {
  id: string;
  sku: string | null;
  name: string;
  category: string | null;
  cost: string | null;
  presentation_units: number | null;
};

type PurchaseRow = {
  id: string;
  purchase_number: string | null;
  purchase_date: string | null;
  description: string | null;
  total_amount: string | null;
  paid_amount: string | null;
  balance: string | null;
  due_date: string | null;
  status: string | null;
  tax_mode: string | null;
  vat_rate: string | null;
  package_status: string | null;
};

export async function getSupplierDetail360(
  companyId: number,
  supplierId: string,
): Promise<SupplierDetail360> {
  const supplier = await getSupplier(companyId, supplierId);

  const [summaryResult, productsResult, purchasesResult] = await Promise.all([
    queryWithCompanyContext<SummaryRow>(
      companyId,
      `
        SELECT
          COALESCE(SUM(total_amount) FILTER (WHERE status = 'recibida'), 0)::text AS total_purchased,
          COUNT(*) FILTER (WHERE status = 'recibida')::text AS received_purchase_count,
          MAX(purchase_date) FILTER (WHERE status = 'recibida')::text AS last_purchase_date,
          COALESCE(
            SUM(GREATEST(total_amount - paid_amount, 0)) FILTER (WHERE status = 'recibida'),
            0
          )::text AS outstanding_balance,
          (
            SELECT COUNT(*)::text
            FROM products
            WHERE empresa_id = $1 AND supplier_id = $2::uuid AND active = true
          ) AS active_product_count
        FROM purchases
        WHERE empresa_id = $1 AND supplier_id = $2::uuid
      `,
      [companyId, supplierId],
    ),
    queryWithCompanyContext<ProductRow>(
      companyId,
      `
        SELECT id::text AS id, sku, name, category, cost::text, presentation_units
        FROM products
        WHERE empresa_id = $1 AND supplier_id = $2::uuid AND active = true
        ORDER BY name ASC, id ASC
      `,
      [companyId, supplierId],
    ),
    queryWithCompanyContext<PurchaseRow>(
      companyId,
      `
        SELECT id::text AS id, purchase_number, purchase_date::text, description,
               total_amount::text, paid_amount::text,
               GREATEST(total_amount - paid_amount, 0)::text AS balance,
               due_date::text, status, tax_mode, vat_rate::text, package_status
        FROM purchases
        WHERE empresa_id = $1 AND supplier_id = $2::uuid
        ORDER BY COALESCE(purchase_date, created_at::date) DESC, created_at DESC, id DESC
      `,
      [companyId, supplierId],
    ),
  ]);

  const summary = summaryResult.rows[0];
  return {
    supplier,
    summary: {
      totalPurchased: Number(summary?.total_purchased ?? 0),
      receivedPurchaseCount: Number(summary?.received_purchase_count ?? 0),
      lastPurchaseDate: summary?.last_purchase_date ?? null,
      outstandingBalance: Number(summary?.outstanding_balance ?? 0),
      paymentTermDays: supplier.paymentTermDays,
      activeProductCount: Number(summary?.active_product_count ?? productsResult.rows.length),
    },
    products: productsResult.rows.map((row) => ({
      id: row.id,
      sku: row.sku ?? "",
      name: row.name,
      category: row.category ?? "",
      cost: Number(row.cost ?? 0),
      presentationUnits: Number(row.presentation_units ?? 1),
    })),
    purchases: purchasesResult.rows.map((row) => ({
      id: row.id,
      purchaseNumber: row.purchase_number ?? "",
      date: row.purchase_date,
      description: row.description ?? "",
      total: Number(row.total_amount ?? 0),
      paid: Number(row.paid_amount ?? 0),
      balance: Math.max(0, Number(row.balance ?? 0)),
      dueDate: row.due_date,
      status: row.status ?? "",
      taxMode: row.tax_mode ?? "",
      vatRate: Number(row.vat_rate ?? 0),
      packageStatus: row.package_status ?? "",
    })),
  };
}
