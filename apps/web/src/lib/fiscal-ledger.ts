import { queryWithCompanyContext } from "@/lib/db";
import { currentMonth, monthRange } from "@/lib/month-range";

export type FiscalVatSummary = {
  period: string;
  salesVatDebit: number;
  debitNotesVat: number;
  creditNotesVat: number;
  purchaseVatCredit: number;
  netVatBalance: number;
  fiscalSalesTotal: number;
  purchaseWithVatTotal: number;
};

function vatFromGrossSql(amountExpression: string, receiptTypeExpression: string) {
  return `CASE
    WHEN ${receiptTypeExpression} IN (1, 2, 3, 6, 7, 8) THEN ${amountExpression} - (${amountExpression} / 1.21)
    ELSE 0
  END`;
}

export async function getFiscalVatSummary(companyId: number): Promise<FiscalVatSummary> {
  const period = currentMonth();
  const range = monthRange(period);
  const salesVat = vatFromGrossSql("COALESCE(s.total_amount, 0)", "COALESCE(s.fiscal_receipt_type, s.receipt_type, 0)");
  const noteVat = vatFromGrossSql("COALESCE(sid.amount, 0)", "COALESCE(sid.fiscal_receipt_type, sid.receipt_type, 0)");

  const result = await queryWithCompanyContext<{
    sales_vat_debit: string;
    debit_notes_vat: string;
    credit_notes_vat: string;
    purchase_vat_credit: string;
    fiscal_sales_total: string;
    purchase_with_vat_total: string;
  }>(
    companyId,
    `
      WITH fiscal_sales AS (
        SELECT
          COALESCE(SUM(${salesVat}), 0) AS sales_vat_debit,
          COALESCE(SUM(s.total_amount), 0) AS fiscal_sales_total
        FROM sales s
        WHERE s.empresa_id = $1
          AND COALESCE(s.fiscal_status, 'no_enviado') = 'aprobado'
          AND COALESCE(s.cae, '') NOT IN ('', 'manual')
          AND COALESCE(
            s.fiscal_issue_date,
            (s.fiscal_authorized_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
            s.sale_date
          ) >= $2::date
          AND COALESCE(
            s.fiscal_issue_date,
            (s.fiscal_authorized_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
            s.sale_date
          ) < $3::date
      ),
      fiscal_notes AS (
        SELECT
          COALESCE(SUM(${noteVat}) FILTER (WHERE sid.class_name = 'ND'), 0) AS debit_notes_vat,
          COALESCE(SUM(${noteVat}) FILTER (WHERE sid.class_name = 'NC'), 0) AS credit_notes_vat
        FROM sales_internal_documents sid
        WHERE sid.empresa_id = $1
          AND sid.fiscal = true
          AND COALESCE(sid.fiscal_status, 'no_enviado') = 'aprobado'
          AND COALESCE(sid.cae, '') NOT IN ('', 'manual')
          AND COALESCE(
            sid.fiscal_issue_date,
            (sid.fiscal_authorized_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
            sid.created_at::date
          ) >= $2::date
          AND COALESCE(
            sid.fiscal_issue_date,
            (sid.fiscal_authorized_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
            sid.created_at::date
          ) < $3::date
      ),
      purchase_vat AS (
        SELECT
          COALESCE(SUM(
            CASE
              WHEN COALESCE(p.tax_mode, 'con_iva') = 'sin_iva' THEN 0
              WHEN COALESCE(p.vat_rate, 0) <= 0 THEN 0
              ELSE p.total_amount - (p.total_amount / (1 + (p.vat_rate / 100)))
            END
          ), 0) AS purchase_vat_credit,
          COALESCE(SUM(p.total_amount) FILTER (
            WHERE COALESCE(p.tax_mode, 'con_iva') = 'con_iva'
              AND COALESCE(p.vat_rate, 0) > 0
          ), 0) AS purchase_with_vat_total
        FROM purchases p
        WHERE p.empresa_id = $1
          AND p.status <> 'cancelada'
          AND p.purchase_date >= $2::date
          AND p.purchase_date < $3::date
      )
      SELECT
        fiscal_sales.sales_vat_debit::text,
        fiscal_notes.debit_notes_vat::text,
        fiscal_notes.credit_notes_vat::text,
        purchase_vat.purchase_vat_credit::text,
        fiscal_sales.fiscal_sales_total::text,
        purchase_vat.purchase_with_vat_total::text
      FROM fiscal_sales, fiscal_notes, purchase_vat
    `,
    [companyId, range.start, range.endExclusive],
  );

  const row = result.rows[0];
  const salesVatDebit = Number(row?.sales_vat_debit ?? 0);
  const debitNotesVat = Number(row?.debit_notes_vat ?? 0);
  const creditNotesVat = Number(row?.credit_notes_vat ?? 0);
  const purchaseVatCredit = Number(row?.purchase_vat_credit ?? 0);

  return {
    period,
    salesVatDebit,
    debitNotesVat,
    creditNotesVat,
    purchaseVatCredit,
    netVatBalance: salesVatDebit + debitNotesVat - creditNotesVat - purchaseVatCredit,
    fiscalSalesTotal: Number(row?.fiscal_sales_total ?? 0),
    purchaseWithVatTotal: Number(row?.purchase_with_vat_total ?? 0),
  };
}
