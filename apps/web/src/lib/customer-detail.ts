import { queryWithCompanyContext } from "@/lib/db";
import { normalizeOrderStatusValue } from "@/lib/order-status";
import { summarizePurchases, type PurchaseSummary } from "@/lib/customer-purchase-summary";
import { adjustedSalesAmountSql } from "@/lib/sales-vat";

export type CustomerOrder = {
  id: string;
  number: string;
  date: string | null;
  amount: number;
  orderStatus: string;
  collectionStatus: string;
};

export type CustomerPurchaseHistory = {
  summary: PurchaseSummary;
  orders: CustomerOrder[];
};

export async function getCustomerPurchaseHistory(
  companyId: number,
  clientId: string,
): Promise<CustomerPurchaseHistory> {
  const rows = (
    await queryWithCompanyContext<{
      id: string;
      number: string;
      date: string | null;
      amount: string;
      order_status: string;
      collection_status: string;
    }>(
      companyId,
      `
        SELECT s.id::text AS id,
               COALESCE(NULLIF(s.commercial_number::text, ''), s.sale_number, '') AS number,
               s.sale_date::text AS date,
               ${adjustedSalesAmountSql("COALESCE(s.total_amount, 0)", "s")}::text AS amount,
               COALESCE(s.order_status, '') AS order_status,
               COALESCE(s.collection_status, 'pendiente') AS collection_status
          FROM sales s
         WHERE s.empresa_id = $1 AND s.client_id = $2::uuid
         ORDER BY s.sale_date DESC NULLS LAST, s.created_at DESC
         LIMIT 1000
      `,
      [companyId, clientId],
    )
  ).rows;

  const orders: CustomerOrder[] = rows.map((row) => ({
    id: row.id,
    number: row.number,
    date: row.date,
    amount: Number(row.amount),
    orderStatus: normalizeOrderStatusValue(row.order_status),
    collectionStatus: row.collection_status,
  }));

  const summary = summarizePurchases(rows.map((row) => ({ date: row.date, amount: Number(row.amount) })));
  return { summary, orders };
}
