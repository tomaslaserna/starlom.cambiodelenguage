# Administracion - Vertex ERP

## Decisiones aprobadas

- El proyecto real es `star-lim-phi.vercel.app`.
- `Admin` ve toda la seccion Administracion.
- Para cualquier otro cargo, el acceso a cada sub-pestana administrativa es asignable por permiso granular. El cargo no habilita Administracion por si solo.
- Tesoreria no reemplaza a Cobros y Pagos. Toma informacion de Cobros y Pagos para analizar liquidez disponible, cuentas y arqueo de caja, pero es una vista administrativa distinta.

## Recursos administrativos

Los recursos viven en `admin_resources` y sus permisos en `app_permisos` con claves `admin.*`.

- `admin.panel`
- `admin.tesoreria`
- `admin.conciliacion_bancaria`
- `admin.metricas`
- `admin.movimientos`
- `admin.cashflow`
- `admin.balance`
- `admin.dividendos`
- `admin.sueldos`
- `admin.calendario`
- `admin.usuarios`
- `admin.obligaciones_fiscales`
- `admin.resultados`
- `admin.cuentas_por_pagar`

Cada recurso tiene permisos `ver` y `editar`. Los recursos sensibles tambien tienen `ver_sensible` y `editar_sensible`.

## Enforcement

- UI: el sidebar debe ocultar recursos sin permiso.
- Backend: cada pagina o endpoint administrativo debe llamar a `starlim_admin_require()` o `starlim_admin_require_sensitive()`.
- Auditoria: las acciones sensibles deben registrarse en `admin_audit_log`.

## Etapas

1. Base de permisos y auditoria: `migrations/011_admin_permissions_foundation.sql`, `api/php/admin_permissions.php`.
2. Sidebar Administracion con acordeon y filtrado por permisos.
3. Proteccion backend de cada pagina administrativa.
4. Registros de movimientos.
5. Tesoreria administrativa, Cash flow, Balance y Calendario.
6. Sueldos y Dividendos con doble permiso sensible.

## Etapas ejecutadas adicionales

- `admin_cashflow.php`: usa `ventas` pendientes de cobro, `compras_registro` impagas y `pagos_registro` para saldo proyectado.
- `admin_conciliacion_bancaria.php`: cruza extractos bancarios cargados contra `pagos_registro`; Tesoreria analiza liquidez, Conciliacion valida banco contra sistema.
- `admin_balance.php`: usa `ventas`, `costos_operativos` y `compras_registro` para balance mensual. La edicion de costos queda centralizada en `planilla_admin.php`.
- `admin_resultados.php`: P&L anual por mes desde `ventas` y `costos_operativos`.
- `admin_cuentas_por_pagar.php`: deudas a proveedores desde `compras_registro` y pagos aplicados.
- `admin_calendario.php`: reutiliza `recordatorios`; crear eventos requiere `admin.calendario.editar`.
- `admin_dividendos.php`: usa `admin_socios` y `admin_dividendos`; requiere doble permiso sensible.
- `admin_sueldos.php`: usa `usuarios`, `usuario_empresa`, `admin_sueldos_config` y `admin_sueldo_movimientos`; requiere doble permiso sensible.
- `admin_obligaciones_fiscales.php`: usa `billing_document`, `billing_tax_line`, `fiscal_authorization` y `admin_obligaciones_fiscales`; requiere doble permiso sensible.

## Migraciones adicionales

- `migrations/012_admin_finance_modules.sql`: crea tablas administrativas faltantes para socios/dividendos, sueldos y obligaciones fiscales manuales. Es aditiva y no borra datos.
- `migrations/013_admin_bank_reconciliation.sql`: crea cuentas bancarias, lineas de extracto y matches de conciliacion contra `pagos_registro`. Es aditiva y no borra datos.
