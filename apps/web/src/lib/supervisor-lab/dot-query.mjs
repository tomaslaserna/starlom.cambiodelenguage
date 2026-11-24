const identifier = /^[a-z_][a-z0-9_]*$/;
const operators = { eq: "=", ne: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };
function column(name, columns) {
  if (!identifier.test(name) || !columns.includes(name))
    throw new Error("Columna no disponible");
  return `t."${name}"`;
}
/** Builds only SELECT statements; identifiers are schema-checked and values are bound. */
export function compileDotQuery(
  table,
  columns,
  input,
  companyId,
  extraWhere = "",
  extraParams = [],
) {
  if (!identifier.test(table)) throw new Error("Tabla inválida");
  const params = [companyId, ...extraParams];
  const clauses = ["t.empresa_id=$1", ...(extraWhere ? [extraWhere] : [])];
  if (
    input.filters &&
    (!Array.isArray(input.filters) || input.filters.length > 12)
  )
    throw new Error("Filtros inválidos");
  for (const filter of input.filters ?? []) {
    const field = column(filter.column, columns);
    if (filter.op === "isNull") {
      clauses.push(`${field} IS NULL`);
      continue;
    }
    if (!operators[filter.op] && filter.op !== "contains" && filter.op !== "in")
      throw new Error("Operador inválido");
    if (filter.op === "in") {
      if (
        !Array.isArray(filter.value) ||
        !filter.value.length ||
        filter.value.length > 50 ||
        filter.value.some(
          (v) =>
            v !== null && !["string", "number", "boolean"].includes(typeof v),
        )
      )
        throw new Error("Lista inválida");
      const placeholders = filter.value.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      clauses.push(`${field} IN (${placeholders.join(",")})`);
    } else {
      if (
        !["string", "number", "boolean"].includes(typeof filter.value) ||
        String(filter.value).length > 500
      )
        throw new Error("Valor inválido");
      params.push(
        filter.op === "contains"
          ? `%${String(filter.value).replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`
          : filter.value,
      );
      clauses.push(
        filter.op === "contains"
          ? `${field}::text ILIKE $${params.length} ESCAPE '\\'`
          : `${field} ${operators[filter.op]} $${params.length}`,
      );
    }
  }
  const where = clauses.join(" AND ");
  const from = `FROM public."${table}" t WHERE ${where}`;
  const fields = input.columns?.length ? input.columns : columns;
  if (!Array.isArray(fields) || !fields.length || fields.length > 80)
    throw new Error("Columnas inválidas");
  const projection = fields.map((name) => column(name, columns)).join(",");
  const tieBreaker = columns.includes("id") ? ", t.id ASC" : "";
  const order = input.orderBy
    ? ` ORDER BY ${column(input.orderBy, columns)} ${input.descending === true ? "DESC" : "ASC"} NULLS LAST${tieBreaker}`
    : columns.includes("id")
      ? " ORDER BY t.id ASC"
      : "";
  const limit = input.limit ?? 50,
    offset = input.offset ?? 0;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 100000
  )
    throw new Error("Paginación inválida");
  let aggregate = "COUNT(*)::text AS count";
  if (input.aggregate) {
    if (!["sum", "avg", "min", "max"].includes(input.aggregate.function))
      throw new Error("Agregación inválida");
    aggregate += `, ${input.aggregate.function}(${column(input.aggregate.column, columns)})::text AS value`;
  }
  return {
    sql: `SELECT ${projection} ${from}${order} LIMIT ${limit} OFFSET ${offset}`,
    countSql: `SELECT ${aggregate} ${from}`,
    params,
    limit,
    offset,
  };
}
