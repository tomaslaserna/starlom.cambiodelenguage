const SQL_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const JUNE_2026_START = "2026-06-01";
const JULY_2026_START = "2026-07-01";
const JUNE_2026_SOURCE = "12lzgmYiRh-sIAFv-EnhPVnbAfZMuNZYi8uwTj-ooJIE:ENTREGAS MACRO";
const ANNUAL_SALES_SOURCE = "1Ocl4Y9gcTS5LqNIePCebV3mtgYk7v6pa5Vy8uHDc75M:VENTAS ANUAL";

function assertSqlIdentifier(identifier: string) {
  if (!SQL_IDENTIFIER.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
}

export function canonicalSalesSourceSql(alias: string) {
  assertSqlIdentifier(alias);

  return `(
    ${alias}.source_sheet IS NULL
    OR ${alias}.source_sheet = ''
    OR (
      ${alias}.sale_date >= DATE '${JUNE_2026_START}'
      AND ${alias}.sale_date < DATE '${JULY_2026_START}'
      AND ${alias}.source_sheet = '${JUNE_2026_SOURCE}'
    )
    OR (
      (${alias}.sale_date < DATE '${JUNE_2026_START}' OR ${alias}.sale_date >= DATE '${JULY_2026_START}')
      AND ${alias}.source_sheet = '${ANNUAL_SALES_SOURCE}'
    )
  )`;
}
