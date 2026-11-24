// One company-scoped, read-only source statement. Used by ERP and local snapshot extraction.
export const monthlyCostSourceSql = `select jsonb_build_object(
 'companyId',$1::bigint,'capturedAt',now(),'baselineMonth',$2::text,
 'salaries',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id::text,'name',coalesce(nullif(p.full_name,''),nullif(c.employee_name,''),p.username,'Empleado'),'monthly',c.sueldo_mensual,'active',c.activo,'bonus',coalesce(c.aguinaldo_aplica,true),'chargesPercent',coalesce(c.cargas_pct,0)) order by c.id),'[]') from admin_sueldos_config c left join profiles p on p.id=c.profile_id where c.empresa_id=$1),
 'expenses',(select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'name',concepto,'amount',monto,'start',to_char(start_month,'YYYY-MM'),'durationMonths',duration_months,'active',active) order by id),'[]') from costos_operativos where empresa_id=$1),
 'decisions',(select coalesce(jsonb_agg(jsonb_build_object('costId',cost_id::text,'month',to_char(month,'YYYY-MM'),'included',included)),'[]') from admin_operating_cost_month_status where empresa_id=$1 and month>=($2||'-01')::date)
) as source`;
