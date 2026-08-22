const SQL_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertSqlIdentifier(identifier: string) {
  if (!SQL_IDENTIFIER.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
}

export function isInvoicedWithApprovedCaeSql(alias: string) {
  assertSqlIdentifier(alias);

  return `(COALESCE(${alias}.fiscal_status, 'no_enviado') = 'aprobado' AND COALESCE(${alias}.cae, '') NOT IN ('', 'manual'))`;
}

/**
 * Net of VAT for sales already invoiced with an approved CAE on a VAT-discriminating
 * receipt type (factura A/B), using that sale's own vat_rate (0 / 10.5 / 21). Sales not
 * yet invoiced (remitos), invoiced as factura C, or without a captured rate never
 * discriminate VAT, so they pass through at their gross amount.
 */
export function netSalesAmountSql(amountExpression: string, alias: string) {
  assertSqlIdentifier(alias);
  const receiptType = `COALESCE(${alias}.fiscal_receipt_type, ${alias}.receipt_type, 0)`;
  const vatRate = `COALESCE(${alias}.vat_rate, 0)`;

  return `CASE
    WHEN ${isInvoicedWithApprovedCaeSql(alias)} AND ${receiptType} IN (1, 2, 3, 6, 7, 8) AND ${vatRate} > 0
      THEN ${amountExpression} / (1 + (${vatRate} / 100))
    ELSE ${amountExpression}
  END`;
}

export function adjustedSalesAmountSql(amountExpression: string, alias: string) {
  assertSqlIdentifier(alias);
  return `(${amountExpression}
    + COALESCE((
        SELECT SUM(CASE WHEN sid.class_name = 'ND' THEN sid.amount ELSE -sid.amount END)
        FROM sales_internal_documents sid
        WHERE sid.empresa_id = ${alias}.empresa_id AND sid.sale_id = ${alias}.id
      ), 0))`;
}
