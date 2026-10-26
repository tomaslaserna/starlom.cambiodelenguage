import { queryWithCompanyContext } from "@/lib/db";
import { getOrder, type OrderDetail } from "@/lib/orders";

type SaleMetadataRow = {
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  delivered_at: string | null;
  operator_name: string | null;
  delivery_operator_name: string | null;
  client_legal_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_address: string | null;
  client_locality: string | null;
  client_province: string | null;
  client_delivery_address: string | null;
  client_opening_hours: string | null;
  payment_term_days: number | null;
  source_cost_amount: string | null;
  source_net_amount: string | null;
  source_profit_amount: string | null;
  collection_registered_at: string | null;
  collection_method: string | null;
  collection_operation: string | null;
  invoice_authorized_at: string | null;
  fiscal_receipt_number: number | null;
  fiscal_point_of_sale: number | null;
};

export type SaleDetail360 = OrderDetail & {
  registeredAt: string;
  confirmedAt: string | null;
  deliveredAt: string | null;
  operatorName: string;
  deliveryOperatorName: string;
  customerLegalName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  customerLocality: string;
  customerProvince: string;
  customerDeliveryAddress: string;
  customerOpeningHours: string;
  paymentTermDays: number | null;
  totalCost: number;
  grossProfit: number;
  grossMarginPercent: number;
  collectionRegisteredAt: string | null;
  collectionMethod: string;
  collectionOperation: string;
  invoiceAuthorizedAt: string | null;
  fiscalReceiptNumber: number | null;
  fiscalPointOfSale: number | null;
};

function numeric(value: string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getSaleDetail360(companyId: number, saleId: string): Promise<SaleDetail360> {
  const [order, metadataResult] = await Promise.all([
    getOrder(companyId, saleId),
    queryWithCompanyContext<SaleMetadataRow>(
      companyId,
      `
        SELECT s.created_at::text,
               s.updated_at::text,
               confirmed_event.confirmed_at::text,
               COALESCE(delivered_event.delivered_at, delivery.created_at)::text AS delivered_at,
               COALESCE(
                 NULLIF(operator_profile.full_name, ''),
                 NULLIF(operator_profile.username, ''),
                 NULLIF(created_event.operator_name, ''),
                 NULLIF(s.source_operator_name, '')
               ) AS operator_name,
               COALESCE(NULLIF(delivery_profile.full_name, ''), NULLIF(delivery_profile.username, '')) AS delivery_operator_name,
               COALESCE(NULLIF(c.legal_name, ''), NULLIF(s.client_name, '')) AS client_legal_name,
               COALESCE(c.email, '') AS client_email,
               COALESCE(c.phone, '') AS client_phone,
               COALESCE(c.address, '') AS client_address,
               COALESCE(c.locality, '') AS client_locality,
               COALESCE(c.province, '') AS client_province,
               COALESCE(c.delivery_address, '') AS client_delivery_address,
               COALESCE(c.opening_hours, '') AS client_opening_hours,
               COALESCE(c.payment_term_days, s.source_payment_term_days) AS payment_term_days,
               s.source_cost_amount::text,
               s.source_net_amount::text,
               s.source_profit_amount::text,
               s.collection_registered_at::text,
               COALESCE(s.collection_method, '') AS collection_method,
               COALESCE(s.collection_operation, '') AS collection_operation,
               COALESCE(s.fiscal_authorized_at, s.invoice_authorized_at)::text AS invoice_authorized_at,
               s.fiscal_receipt_number,
               s.fiscal_point_of_sale
        FROM sales s
        LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
        LEFT JOIN profiles operator_profile ON operator_profile.id = s.operator_id
        LEFT JOIN LATERAL (
          SELECT dd.created_at, dd.created_by
          FROM delivery_documents dd
          WHERE dd.sale_id = s.id AND dd.empresa_id = s.empresa_id
          ORDER BY dd.created_at DESC
          LIMIT 1
        ) delivery ON true
        LEFT JOIN profiles delivery_profile ON delivery_profile.id = delivery.created_by
        LEFT JOIN LATERAL (
          SELECT e.datos->>'usuario' AS operator_name
          FROM eventos_integracion e
          WHERE e.empresa_id = s.empresa_id
            AND e.tipo IN ('pedido.cargado', 'pedido.creado')
            AND e.datos->>'id' = s.id::text
          ORDER BY e.created_at ASC
          LIMIT 1
        ) created_event ON true
        LEFT JOIN LATERAL (
          SELECT MIN(e.created_at) AS confirmed_at
          FROM eventos_integracion e
          WHERE e.empresa_id = s.empresa_id
            AND e.tipo = 'pedido.confirmado_stock'
            AND e.datos->>'id' = s.id::text
        ) confirmed_event ON true
        LEFT JOIN LATERAL (
          SELECT MIN(e.created_at) AS delivered_at
          FROM eventos_integracion e
          WHERE e.empresa_id = s.empresa_id
            AND e.tipo = 'pedido.entregado'
            AND e.datos->>'id' = s.id::text
        ) delivered_event ON true
        WHERE s.id = $1::uuid AND s.empresa_id = $2
        LIMIT 1
      `,
      [saleId, companyId],
      { cache: false },
    ),
  ]);

  const metadata = metadataResult.rows[0];
  const calculatedCost = order.lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0);
  const calculatedProfit = order.lines.reduce((sum, line) => sum + line.subtotal - line.unitCost * line.quantity, 0);
  const sourceCost = numeric(metadata?.source_cost_amount);
  const sourceNet = numeric(metadata?.source_net_amount);
  const sourceProfit = numeric(metadata?.source_profit_amount);
  const hasImportedFinancialSnapshot = sourceCost !== 0 || sourceProfit !== 0;
  const totalCost = hasImportedFinancialSnapshot ? sourceCost : calculatedCost;
  const grossProfit = hasImportedFinancialSnapshot ? sourceProfit : calculatedProfit;
  const profitRevenue = hasImportedFinancialSnapshot && sourceNet > 0 ? sourceNet : order.netAmount;

  return {
    ...order,
    registeredAt: metadata?.created_at ?? order.date ?? "",
    confirmedAt: metadata?.confirmed_at ?? null,
    deliveredAt: metadata?.delivered_at ?? null,
    operatorName: metadata?.operator_name ?? "No registrado",
    deliveryOperatorName: metadata?.delivery_operator_name ?? "No registrado",
    customerLegalName: metadata?.client_legal_name ?? order.customerName,
    customerEmail: metadata?.client_email ?? "",
    customerPhone: metadata?.client_phone ?? "",
    customerAddress: metadata?.client_address ?? "",
    customerLocality: metadata?.client_locality ?? "",
    customerProvince: metadata?.client_province ?? "",
    customerDeliveryAddress: metadata?.client_delivery_address ?? "",
    customerOpeningHours: metadata?.client_opening_hours ?? "",
    paymentTermDays: metadata?.payment_term_days ?? null,
    totalCost,
    grossProfit,
    grossMarginPercent: profitRevenue > 0 ? (grossProfit / profitRevenue) * 100 : 0,
    collectionRegisteredAt: metadata?.collection_registered_at ?? null,
    collectionMethod: metadata?.collection_method ?? "",
    collectionOperation: metadata?.collection_operation ?? "",
    invoiceAuthorizedAt: metadata?.invoice_authorized_at ?? null,
    fiscalReceiptNumber: metadata?.fiscal_receipt_number ?? null,
    fiscalPointOfSale: metadata?.fiscal_point_of_sale ?? null,
  };
}
