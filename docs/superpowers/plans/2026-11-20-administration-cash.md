# Caja, cobros y proyección — ejecución local

Alcance aprobado: corregir lecturas de Administración, contrastar con datos reales y mostrar antes de publicar. Sin escrituras en pagos, movimientos, saldos históricos ni despliegues.

1. Pruebas de regresión: cobros anulados/proveedores, corte de caja por fecha, pendientes parciales, anulaciones revertidas, créditos no imputados, vencidos y horizontes.
2. Una consulta compartida para saldo registrado a la fecha. Excluir movimientos futuros del disponible y mostrarlos en proyección una sola vez.
3. Cobros registrados de clientes únicamente; separar cheques recibidos del dinero acreditado.
4. Proyección desde saldos de cuenta corriente. Si los remitos no concilian con la cuenta, conservar la deuda real como importe sin fecha: no distribuir créditos automáticamente. Separar vencidos, sin fecha y próximos vencimientos.
5. Proveedores por vencimiento, sueldos pendientes descontando pagos existentes, cheques recibidos/emitidos según estado. Los costos económicos sin estado de pago no equivalen a obligaciones de caja: mostrarlos como limitación.
6. Pantalla: saldo registrado y fecha de corte, advertencia de conciliación, cobros del período y proyección con saldo inicial + entradas − salidas.
7. Ejecutar consultas reales SELECT, pruebas, TypeScript y revisión de navegador sobre copia local privada. Mostrar resultados y limitaciones. No publicar.
