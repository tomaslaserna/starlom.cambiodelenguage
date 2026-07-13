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
 * receipt type (factura A/B). Sales not yet invoiced (remitos) or invoiced as factura C
 * never discriminate VAT, so they pass through at their gross amount.
 */
export function netSalesAmountSql(amountExpression: string, alias: string) {
  assertSqlIdentifier(alias);
  const receiptType = `COALESCE(${alias}.fiscal_receipt_type, ${alias}.receipt_type, 0)`;

  return `CASE
    WHEN ${isInvoicedWithApprovedCaeSql(alias)} AND ${receiptType} IN (1, 2, 3, 6, 7, 8)
      THEN ${amountExpression} / 1.21
    ELSE ${amountExpression}
  END`;
}
