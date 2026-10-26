/** A manual base salary is redundant only with one exact active payroll match.
 * Amount and a whole first/full name must match. Extras, bonuses, inactive plans
 * and ambiguous names are deliberately not inferred or discarded.
 */
export function payrollDuplicateEmployeeSql(costAlias: string) {
  const normalize = (value: string) => `btrim(regexp_replace(lower(translate(${value}, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[^a-z0-9]+', ' ', 'g'))`;
  const name = normalize("COALESCE(NULLIF(p.full_name, ''), NULLIF(sc.employee_name, ''), p.username, '')");
  const concept = normalize(`${costAlias}.concepto`);
  return `(SELECT CASE WHEN COUNT(*) = 1 THEN MIN(COALESCE(NULLIF(p.full_name, ''), NULLIF(sc.employee_name, ''), p.username)) END
    FROM admin_sueldos_config sc
    LEFT JOIN profiles p ON p.id = sc.profile_id
    WHERE sc.empresa_id = ${costAlias}.empresa_id
      AND sc.activo = true AND sc.sueldo_mensual = ${costAlias}.monto
      AND ${name} <> ''
      AND ${concept} IN ('sueldo ' || ${name}, 'salario ' || ${name},
        'sueldo ' || split_part(${name}, ' ', 1), 'salario ' || split_part(${name}, ' ', 1)))`;
}
