# LA TIRRA: consultas sin respuesta y pedidos de clientes

Fecha de revisión: 2 de noviembre de 2026, Argentina.
Base de código revisada: `starlom/main`, commit `79bec1b`.
Implementación: rama `codex/tirra-response-reliability`, publicada en `main` del repositorio que despliega StarLim.

## Evidencia del incidente

Se consultaron en modo lectura los mensajes persistidos de la empresa en PostgreSQL. Se encontraron dos consultas iguales sobre UNIVERSITA IT a las 10:42:06 y 10:42:22, seguidas por el reclamo de las 10:42:58. La respuesta de las 10:43:13 es la única respuesta de asistente persistida en esa conversación. Luego aparecen «hace lo mismo para torre del carmen» a las 10:43:55 y «porque no pudiste redactar» a las 10:44:15, sin una respuesta de asistente posterior en el historial consultado.

El modelo registrado para esos mensajes es `google/gemini-3.5-flash`, coincidente con el agente de AI SDK del código revisado. No hay solicitudes recientes en la cola del puente Dot. El complemento MCP «StarLim · LA TIRRA» exige reautenticación; ese fallo de conexión es distinto del chat de inferencia utilizado por estos mensajes.

No se obtuvieron trazas de ejecución del proveedor: Vercel rechazó la lectura de despliegues por el conector y por la CLI con 403. Por eso se distingue el defecto de configuración comprobado de la causa precisa de cada finalización sin texto. Los mensajes compactados no conservan llamadas ni resultados de herramientas.

## Funciones revisadas

| Función del chat web | Alcance y observaciones |
| --- | --- |
| Búsqueda e historial de clientes | Búsqueda por nombre/razón social/CUIT; el historial requiere UUID y devuelve solo entregados. Por eso necesita llamadas dependientes. |
| Cuenta corriente | Usa movimientos reales; no reconstruye deuda desde compras. |
| Facturas y comprobantes por número | Consulta comprobantes fiscales aprobados y enlaces para verificación. |
| Patrón de productos | Resuelve nombres y resume cantidades/frecuencia de productos; no es un resumen monetario mensual de pedidos. |
| Pendientes operativos | Pedidos, entregas y decisiones fiscales pendientes. |
| Prioridades de trabajo | Según perfil; consulta de otro empleado limitada a administradores. |
| Ventas mensuales | Ventas entregadas y métricas fiscales con período explícito. |
| Guía y manual | Ubicación de funciones y procedimientos internos de solo lectura. |
| Asesoramiento de limpieza | Protocolo y coincidencias de catálogo; requiere compatibilidad y seguridad. |

El agente no ofrece funciones para modificar ventas, stock, clientes ni pagos.

## Defectos comprobados

1. **Lecturas dependientes bloqueadas.** `prepareStep` fuerza `toolChoice: "none"` desde el segundo paso. La instrucción exige además una única ronda de herramientas. Sin un UUID previo, buscar un cliente impide luego pedir su historial en la misma ejecución. Esta restricción afecta otras consultas que requieran combinar herramientas.
2. **Pedidos y compras entregadas confundidos.** `getCustomerHistory` excluye pedidos cargados/confirmados. La respuesta guardada de UNIVERSITA IT llama «último pedido» al P-0162 de septiembre, omitiendo el P-0261 del 2 de noviembre, cargado el 30 de octubre y todavía pendiente.
3. **Período relativo sin fecha explícita.** La respuesta guardada interpreta «último mes» como septiembre, pese a ser 2 de noviembre. No se debe cambiar octubre por el último mes con actividad.
4. **Falta de respuesta no recuperada automáticamente.** La interfaz detecta herramientas sin texto y muestra un reintento. El usuario debe volver a preguntar; el historial compactado elimina resultados de herramientas y no sirve como traza para diagnosticar esa ejecución.

## Corrección implementada

- Cinco pasos acotados: hasta cuatro rondas de lectura y un último paso reservado para redactar. El tiempo total de la ruta conserva su límite existente.
- Instrucciones con fecha actual y zona horaria argentina; «último mes» predeterminado al mes calendario anterior. Una petición de «lo mismo para otro cliente» exige repetir las métricas y el período, consultando datos nuevos.
- Nueva herramienta `getCustomerOrderSummary(search, period?)`: resuelve el cliente, consulta encabezados canónicos sin multiplicar por productos y devuelve último pedido, última compra entregada, ritmo de compra, cantidad e importe del mes por fecha comercial y por fecha de carga.
- Las consultas conservan los filtros por empresa y vendedor y la resolución de homónimos. No hay cambios de esquema ni escrituras comerciales.
- El ritmo se presenta como promedio simple entre días distintos con compras entregadas, con cantidad de fechas e intervalos y límites del historial. Una sola fecha o ninguna devuelve frecuencia desconocida. No reemplaza el indicador ponderado de seguimiento del CRM.
- Se excluyen cancelados; los importes incorporan los ajustes usados por el ERP y se agregan en centavos. Los meses sin pedidos devuelven cero.

## Función comercial y forma de responder

El propósito principal es resolver consultas dentro del chat, combinando y calculando datos para producir una respuesta breve y útil. Se eliminó el requisito de incluir siempre secciones de significado, instrucciones de navegación y fuentes. Los enlaces quedan como respaldo; los pasos de navegación se explican si el usuario los pide. La pantalla también expresa este propósito comercial.

- `getCustomerCommercialBrief(search)` resuelve el cliente y reúne en paralelo resumen de pedidos, productos habituales y últimos dos comprobantes. Devuelve ritmo, importe promedio por pedido entregado, cantidad y período histórico usados, productos más frecuentes y cantidades promedio por compra de cada producto. Los importes históricos no se ofrecen como precios actuales ni como una cotización.
- `getCustomerDocuments(search, limit)` resuelve el cliente antes de consultar y devuelve exactamente hasta la cantidad solicitada, con tipo, número, fecha, importe y enlace al PDF. Incluye facturas fiscales aprobadas y remitos realmente emitidos desde `delivery_documents`; no transforma pedidos en documentos. No incluye notas de crédito/débito y lo declara expresamente. Una factura y un remito de una misma venta son documentos distintos y no se suman como compras independientes.
- Se conservaron las funciones de facturas específicas, saldo real y procedimientos. Una respuesta comercial puede contener varias medidas en un solo mensaje, sin obligar al usuario a reformular o buscar cifras en otra pantalla.
- Se agregaron casos de aceptación para una visita comercial y para los últimos dos comprobantes de Torre del Carmen. Son criterios para una prueba real de inferencia, además de las pruebas automatizadas.

La corrección permite completar las lecturas necesarias; no garantiza que un proveedor nunca devuelva texto vacío ni sustituye una prueba real de inferencia.

## Cierre sin texto observado a las 12:00

La captura aportada muestra resultados de `getCustomerProductPattern` y `getCustomerInvoices`, sin texto final y con una etiqueta aún «en curso» pese a haber terminado la ejecución. PostgreSQL confirma una nueva pregunta del usuario a las 12:00:09 de Argentina sin respuesta posterior persistida. La captura no demuestra que los resultados de esas herramientas sean suficientes para calcular pedidos: un patrón de productos y facturas fiscales tienen alcances diferentes del historial de pedidos.

El servidor entregaba directamente el flujo de `createAgentUIStreamResponse`, sin comprobar si contenía una respuesta escrita. Por eso una ejecución que finaliza solo con herramientas podía cerrar normalmente y dejar al usuario el botón de reintento. Las pruebas anteriores de cálculos y generación simulada no cubrían ese cierre en el protocolo del chat.

Se agregó una recuperación del lado servidor: el flujo principal tiene hasta 45 segundos; si termina normalmente sin texto en su último paso, se reserva un único intento de redacción de hasta 15 segundos, con el mismo modelo configurado, sin herramientas ni reintentos internos. Recibe únicamente la conversación y la evidencia obtenida para esa consulta, con tamaño acotado y fragmentos marcados como incompletos. Debe responder las partes respaldadas y declarar las faltantes. No se fabrican totales de pedidos desde resultados de facturas.

La recuperación agrega texto antes del cierre del mensaje y antes de persistirlo, de modo que navegador e historial reciben la misma respuesta. Si vuelve a quedar vacía o falla, emite un error explícito. No se recuperan ejecuciones canceladas por el usuario ni se publican respuestas tardías tras cancelar. Se registran inicio, éxito/fallo y cantidad de caracteres de la recuperación, sin registrar el contenido de resultados comerciales.

Las etiquetas de herramientas diferencian «sin resultado», «sin permiso» y «sin completar»; solo muestran «en curso» mientras hay una ejecución activa.

## Casos de control

- UNIVERSITA IT: compras entregadas del 9/7, 3/8, 31/8 y 25/9: promedio de 26 días. Último pedido P-0261, fecha comercial 2/11, carga 30/10, importe $43.092,08, estado cargado. Octubre: cero por fecha comercial; uno por fecha de carga.
- TORRE DEL CARMEN tiene pedidos entregados en octubre: P-0186 del 7/10 por $61.786,54 y P-0259 del 29/10 por $48.552,24. Ambos encabezados suman $110.338,78. Es evidencia de que existen datos para responder, no una validación de todas las cifras históricas del cliente.

## Verificación real y publicación

Se confirmó mediante Vercel que `starlim.vercel.app` ejecutaba el commit `79bec1b`. Las correcciones locales de la primera revisión no habían sido desplegadas. Se publicó `49bd84d` y la prueba real encontró que podía responder por TORRE DEL CARMEN cuando la última pregunta nombraba UNIVERSITA IT, retomando una pregunta anterior sin respuesta del historial.

Se separó la solicitud vigente de la conversación anterior en `request-context.ts`, sin sumar llamadas al modelo: `currentQuestion` es la única tarea actual y `conversationContext` sirve solo para referencias. Esta corrección se publicó como `4ca6a6c`; Vercel confirmó que el alias de producción apuntaba a `dpl_9iJWscTzDm223tGhUscroGvXgYPE` en estado READY.

Pruebas realizadas desde el navegador, autenticado como administrador, y contrastadas con la respuesta persistida en PostgreSQL:

1. **12:29 Argentina — prompt original sin modificar.** Respondió UNIVERSITA IT, 26 días de frecuencia, último pedido P-0261 por $43.092,08, octubre con cero por fecha comercial y uno por fecha de carga. La respuesta quedó persistida aproximadamente 6,7 segundos después de la pregunta.
2. **12:30 — «hace lo mismo para torre del carmen».** Respondió TORRE DEL CARMEN, último P-0259 por $48.552,24, dos pedidos de octubre por $110.338,78. Respuesta persistida aproximadamente 6 segundos después de la pregunta.
3. **12:33 — «mostrame los ultimos dos comprobantes de Torre del Carmen».** Devolvió Factura B 0002-00000017 y Remito 00000680, ambos del 29/10 por $48.552,24, con sus enlaces PDF y aclaración de que corresponden a la misma entrega. Respuesta persistida aproximadamente 5,7 segundos después de la pregunta.

Se verificó que el navegador recibía esos textos. Se agregó seguimiento del final de la conversación al cargar historial, enviar y recibir mensajes, para que la respuesta nueva quede visible; si el usuario desplaza el historial hacia arriba, se respeta esa lectura.

## Validación y límites

- `npm run test:supervisor-evaluation`: 49 pruebas aprobadas. Incluyen cálculo, ceros, límites mensuales, cancelados, centavos, ticket promedio, documentos emitidos y su cantidad/PDF, permisos, homónimos, clientes consecutivos, composición del resumen comercial, aislamiento de la pregunta vigente y una secuencia real del AI SDK con modelo simulado: búsqueda → historial → texto final. Las pruebas del cierre sin texto pasan por `createUIMessageStream` y `readUIMessageStream` y comprueban el texto visible y persistido, la ausencia de reintentos en respuestas normales, los errores, cancelaciones y límites de evidencia. Una prueba integra además `ToolLoopAgent`, un proveedor simulado que termina sin texto, y `generateText` sin herramientas para redactar la recuperación.
- `npx --no-install tsc --noEmit`: aprobado.
- Las pruebas automatizadas usan modelos simulados. Las tres pruebas del navegador sí utilizaron el modelo real configurado en la aplicación.
- `npm run lint`: aprobado para toda la aplicación. Para desbloquear este control se renombraron cuatro variables locales `module` de tres scripts de pruebas existentes, sin cambiar su lógica; se ejecutaron las pruebas unitarias de comprobantes y cuenta corriente afectadas.
- `npm run security:scan`: aprobado.
- `npm test` general: 362 aprobadas y 14 fallidas en comprobantes/IVA, expectativas de pantallas, navegación y PDF, fuera de la funcionalidad de LA TIRRA. No se afirma que la suite general esté verde. Su salida queda en el registro local ignorado `tmp/tirra-full-tests.log`.
- `npm run build`: aprobado con Next.js 16.3.3/Turbopack, incluyendo TypeScript y generación de las 145 páginas. El bloqueo inicial era el enlace local de dependencias compartidas: se sustituyó por una instalación propia con `npm ci --ignore-scripts` y el lockfile existente. El intento previo con Webpack había fallado en la cadena `leads-board.tsx → leads-domain.ts → api-response.ts → node:crypto`; no fue necesario modificar ese circuito para completar la compilación normal con Turbopack.
- La verificación real se hizo con un administrador; no constituye una prueba física de todos los perfiles de vendedor ni de todas las consultas posibles. No se modificaron registros comerciales ni el esquema.
