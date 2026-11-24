# Altas mensuales de costos y sueldos — 2026-11-24

Alcance aprobado: completar el circuito local mensual existente; no publicar ni escribir producción.

1. Añadir comando de alta validado, id generado en servidor, revisión optimista y actor de sesión. Fecha de inicio posterior a meses protegidos; costo fijo/variable/único; duración limitada o indefinida; sueldo con aguinaldo y cargas. No crea usuario ni acceso al sistema.
2. Conservar snapshots antiguos sin añadir filas retrospectivamente. Validar persistencia tras añadir conceptos futuros. Bloquear nombres duplicados para promover edición del concepto existente.
3. UI separada y breve para Nuevo costo/Nuevo sueldo; resumen de vigencia; conservar importes y fechas tras errores.
4. Incluir sueldos nuevos en lectores mensuales de resultados/RRHH/proyección sin generar pagos.
5. Pruebas dominio, SQLite y PostgreSQL local; navegador con datos de prueba identificados y restauración de copia local. Mostrar antes de publicar.
