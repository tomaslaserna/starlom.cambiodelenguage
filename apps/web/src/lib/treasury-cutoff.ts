// A statement covers its date, not previously entered future-dated movements.
export function afterReconciliationSql(m: string, r: string) {
 return `(${m}.created_at > COALESCE(${r}.reconciled_at, '-infinity'::timestamptz) OR ${m}.movement_date > ${r}.statement_date)`;
}
