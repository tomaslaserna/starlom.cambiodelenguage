# Ensayo de recuperación de facturas · 26/11/2026

Se ejecutó la función de facturación de ventas del ERP con su cliente SOAP y PostgreSQL 17 local. Cada operador corrió en un proceso Node independiente. WSAA y WSFE se simularon para controlar el momento del corte. Los CAE y las ventas son ficticios.

| Escenario | Flujo actual | Prototipo |
| --- | --- | --- |
| El servidor autoriza y corta el socket antes de entregar la respuesta. Otro proceso reintenta la venta. | Se pidieron y otorgaron dos CAE. El ERP guardó el segundo. | Un envío. El segundo proceso consultó el número reservado con FECompConsultar y recuperó el primer CAE. |
| Dos operadores facturan la misma venta mientras la primera respuesta sigue en tránsito. | Dos números autorizados y dos aprobaciones en la auditoría de la misma venta. | Un envío, una aprobación en la auditoría y el mismo número y CAE para ambos operadores. |

Las cuatro variantes pasaron tres veces con esquemas de base de datos independientes. En la prueba concurrente del prototipo se verificó en PostgreSQL que el segundo proceso estaba efectivamente bloqueado antes de liberar la respuesta del primero.

## Ensayo inicial

Usar una base local de laboratorio llamada `arca_homologacion_lab` con un usuario `lab_owner` con permiso de crear esquemas. Configurar `ARCA_LAB_PGPORT` y `ARCA_LAB_PGPASSWORD` para esa base y ejecutar `node scripts/arca-homologacion/run.mjs` desde `apps/web`. Cada corrida abre el simulador en un puerto de loopback, crea un esquema nuevo y emite las secuencias SOAP observadas por salida estándar.

En el ensayo inicial se cargó el prototipo desde `coordinator.mjs`. La versión desplegada ejecuta la recuperación en `invoice-attempt.ts`.

## Verificación con ARCA en homologación

El 26/11/2026 WSAA emitió un ticket para wsfe. El listado de puntos de venta devolvió 602 y la consulta individual del punto 2 devolvió último número cero para factura A. Se ejecutó el prototipo con dos ventas ficticias de $121 sobre la base local.

- Factura A 0002-00000001. ARCA devolvió aprobación. El intermediario de prueba cortó el socket antes de entregar la respuesta al ERP. Un proceso nuevo consultó ese número mediante FECompConsultar y recuperó el mismo CAE. Se contó un solo FECAESolicitar.
- Factura A 0002-00000002. Dos operadores independientes intentaron facturar la misma venta. Se observó la espera del segundo en PostgreSQL. Los dos obtuvieron el mismo número y CAE y hubo una sola aprobación en la auditoría local.

Una consulta independiente posterior confirmó ambos comprobantes e importes en WSFE de homologación. El prototipo opera sólo en el ensayo.

## Verificación de la versión integrada

El corte después de la aprobación de la factura A 3 de homologación se recuperó en la misma operación del ERP. Para la factura A 4 se cortó el primer envío antes de entregarlo a WSFE. La consulta del número dio 602, WSFE confirmó que el número siguiente seguía siendo 4 y el ERP completó el envío con igual número y fecha. Dos operadores obtuvieron el mismo CAE para la factura A 5. Cada venta registró una sola aprobación.

El simulador local también reproduce una caída prolongada de FECompConsultar. Mientras la consulta falla el ERP conserva la reserva. En el siguiente intento comprueba el número antes de decidir si debe reenviar.
