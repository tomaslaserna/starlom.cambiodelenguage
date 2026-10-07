# Plan de validación y migración

## 1. Resultado de validación actual

| Control | Resultado | Lectura |
| --- | --- | --- |
| `npm run lint` | Pasa | Calidad sintáctica aceptable |
| `npx tsc --noEmit` | Pasa | Tipos coherentes en compilación |
| `npm run security:scan` | Pasa | Sin hallazgos del escaneo local configurado |
| `npm test` | Falla, 9 pruebas | Hay regresiones o expectativas obsoletas |
| `npm run env:check` | Falla | No existe un entorno local integrado listo |
| Navegación `/system-v2` | HTTP 200 | Prototipo disponible |
| E2E mutacional | No disponible | No se puede afirmar funcionamiento punta a punta |

Variables locales ausentes: URL y claves de Supabase, `STARLIM_SESSION_SECRET` y credenciales de base. Además, Mercado Pago requiere variables que no están documentadas en `.env.example`.

Las nueve pruebas que no pasaron en la línea de base corresponden a: envejecimiento y remitos abiertos, resolución del tipo de comprobante del cliente, IVA de pedido/presupuesto, sugerencia de comprobante sin bloqueo, rutas/UI retiradas, cargas que ocultan errores con valores vacíos, transición de entrega y cobranza, selección futura de factura/remito y persistencia de precios comerciales de la tienda.

## 2. Debilidad del conjunto actual

De 69 archivos de prueba, 46 inspeccionan principalmente texto del código. Son útiles para impedir que desaparezca una frase o llamada, pero no demuestran que el comportamiento sea correcto. El caso de cobranzas lo ilustra: una prueba puede encontrar el texto “sólo remitos seleccionados” mientras el backend ejecuta FIFO al recibir una lista vacía.

## 3. Pirámide de pruebas requerida

### Unidad — invariantes

- suma de aplicaciones + crédito general = importe del cobro;
- nunca aplicar a un documento no seleccionado;
- reversión deja el mismo saldo neto con historia visible;
- entrega idempotente;
- recepción parcial idempotente;
- comisión y sueldo reproducibles por período.

### Integración — PostgreSQL real aislado

- RLS impide leer o mutar otra empresa;
- transacciones revierten todos los efectos ante fallo;
- concurrencia sobre entrega, cobro, recepción y numeración fiscal;
- migración completa desde una copia anonimizada;
- conciliación entre ledgers y sus saldos derivados.

### Contrato — APIs e integraciones simuladas

- ARCA: aprobado, rechazado, timeout después de aprobación, consulta posterior;
- Mercado Pago: webhook repetido, fuera de orden y firma inválida;
- correo/notificación: reintento e idempotencia;
- IA: toda ejecución finalizada devuelve texto o error accionable con ID.

### Navegador — recorridos críticos

1. alta de cliente → presupuesto → pedido;
2. pedido → preparación → entrega → factura/remito → cuenta corriente;
3. cobro parcial, total, excedente y reversión;
4. orden de compra → recepción parcial → factura → obligación → pago;
5. alta de empleado → permiso → asistencia → liquidación → pago;
6. conciliación bancaria → cierre → informe por rol.

## 4. Matriz de aceptación punta a punta

| Flujo | Caso feliz | Bordes obligatorios | Resultado esperado |
| --- | --- | --- | --- |
| Pedido facturado | entrega con stock | reintento, ARCA caído | una entrega, una deuda, una factura eventual |
| Pedido con remito | entrega | cambio de comprobante permitido antes de entregar | remitos con/sin precios, sin factura |
| Cobro | imputación elegida | parcial, excedente, ninguna selección | sólo selección; resto crédito general |
| Nota de crédito | referencia a factura | monto parcial, repetición | reduce deuda una vez y conserva relación fiscal |
| Compra | recepción | parcial, diferencia, sin factura | stock por recepción; deuda por factura |
| Pago proveedor | aplicaciones elegidas | anticipo, reversión | tesorería y obligación conciliables |
| Permiso | capacidad concedida | rol “Jefe” sin capacidad | endpoint y UI rechazan igual |
| IA | consulta con herramientas | herramienta sin texto final | fallback redactado y trazable |

## 5. Fases de migración

### Fase 0 — Congelamiento y preparación

- declarar carpeta canónica de migraciones;
- documentar variables y crear base local de integración;
- capturar saldos y conteos iniciales;
- caracterizar con pruebas las reglas válidas del sistema actual antes de moverlas;
- introducir banderas por empresa;
- prohibir nuevas rutas paralelas.

### Fase 1 — Sustituir Administración y Finanzas

- poner en producción el bloque nuevo de Administración;
- consolidar tesorería, obligaciones, resultados y patrimonio;
- importar los pocos datos históricos útiles;
- validar que no existan consumidores ocultos de Balance, Caja o Rentabilidad;
- retirar sus entradas viejas del menú con redirección temporal.

### Fase 2 — Reemplazar Compras y Proveedores

- separar orden, recepción, factura, obligación y pago;
- importar proveedores, compras, costos y documentos históricos;
- conservar stock y trazabilidad;
- activar el nuevo circuito como única entrada de compras.

### Fase 3 — Rediseñar RR.HH. y CRM

- mantener intacta la autenticación mientras se separan legajo y permisos;
- migrar usuarios y sesiones con rollback probado;
- integrar leads y seguimiento dentro de Comercial;
- retirar el segundo mundo de navegación del CRM.

### Fase 4 — Evolucionar Datos

- migrar clientes, productos, precios y stock sin pérdida;
- crear maestros canónicos y relaciones proveedor-producto;
- mantener adaptadores para Operaciones y Cobros/Pagos.

### Fase 5 — Evolucionar Operaciones y Cobros/Pagos

- preservar los circuitos actuales mientras se caracterizan con pruebas;
- migrar presupuestos, pedidos, entrega y facturación por partes;
- unificar cobranzas con ejecución paralela y conciliación por documento;
- retirar cada ruta antigua sólo después de demostrar paridad.

### Fase 6 — Unificación visual y cierre

- aplicar el mismo sistema visual a bloques nuevos y conservados;
- eliminar navegación, componentes y adaptadores obsoletos;
- completar snapshots mensuales e informes por rol;
- realizar una última prueba integral del sistema completo.

## 6. Ejecución paralela y rollback

Durante al menos dos cierres:

1. el sistema viejo sigue siendo operativo;
2. V2 recibe eventos en sombra y calcula resultados;
3. una tarea diaria compara deuda, stock, caja, obligaciones y fiscalidad;
4. toda diferencia queda explicada por documento;
5. la bandera se habilita por dominio, no para todo el sistema;
6. el rollback vuelve la escritura al adaptador viejo sin borrar datos V2.

## 7. Puertas de salida

### GO por dominio

- 100 % de recorridos críticos automatizados;
- cero diferencias sin explicar en dos cierres;
- migración y rollback ensayados;
- permisos probados con matriz de roles;
- soporte y runbook disponibles;
- usuarios clave aceptan el recorrido.

### NO-GO inmediato

- borrado físico todavía disponible sobre hechos contabilizados;
- una misma operación tiene dos reglas activas;
- un saldo sólo coincide después de ajuste manual;
- integración externa puede duplicar documentos;
- no existe copia restaurable ni rollback probado.

## 8. Riesgos y mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
| --- | --- | --- | --- |
| diferencias históricas de saldos | Alta | Alta | dataset canónico y conciliación por documento |
| migración divergente entre entornos | Alta | Alta | fuente única y prueba desde cero |
| duplicación fiscal | Media | Crítico | idempotencia, outbox y reconciliación |
| resistencia de usuarios | Media | Media | recorridos guiados y migración por rol |
| permisos excesivos | Alta | Alta | capacidades sin atajo por rol |
| reescritura demasiado extensa | Media | Alta | monolito modular y adaptadores incrementales |
