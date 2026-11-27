# Sugerencias por rubro y presupuestos base

Estado: propuesta para revisión de Augusto. No implementada.

## Objetivo
Transformar las compras históricas de StarLim en una guía comercial compartida y presupuestos editables que reduzcan el tiempo de cotización. El PDF y las plantillas consultarán una misma fuente para evitar recomendaciones contradictorias.

## Enfoque recomendado y alternativas
Recomendado: generar las sugerencias desde el ERP, con precios vigentes al abrir cada presupuesto. Publicar una entrada permanente “Sugerencias por rubro — PDF” en el Banco de empresa; cada descarga genera una versión actualizada, con fecha de cálculo. Así no hay que volver a subir archivos cuando cambian precios o compras.

Alternativa: PDF y presupuestos cargados manualmente. Es más simple inicialmente, pero sus precios y cantidades quedan desactualizados y duplican mantenimiento. No se recomienda para el objetivo pedido.

## PDF
- Índice y sección por cada rubro registrado, incluso si no tiene compras suficientes.
- Listado de productos activos comprados por clientes de ese rubro, ordenados por penetración entre compradores; sin el límite actual de diez productos.
- Mostrar presentación/unidad, compradores del producto, cantidad orientativa y período analizado. No publicar nombres de clientes, costos ni márgenes.
- Separar productos habituales de compras ocasionales. La guía refleja necesidades observadas; no afirma cubrir necesidades que nunca se registraron.
- Habituales: comprados por al menos dos clientes o por el 20% de los compradores del rubro durante la ventana; el mismo criterio rige PDF y presupuesto. El resto queda como ocasional únicamente en el PDF. Nunca completar veinte renglones con productos que no califican.
- Rubros sin historial: señalar “Sin historial suficiente”, sin inventar productos o cantidades.
- Paginación legible e índice con números de página; no forzar todos los rubros dentro de tres hojas si vuelve ilegible el documento.

## Presupuestos base
- Botón “Presupuestos base” en el listado de presupuestos.
- Pantalla por rubro con cantidad de clientes y pedidos analizados, período y advertencia cuando la muestra es pequeña.
- “Usar base” abre el formulario existente como presupuesto nuevo de prospecto, sin guardarlo automáticamente.
- Precargar hasta veinte productos habituales, priorizando los comprados por al menos dos clientes o por el 20% de los compradores del rubro. Si el rubro tiene un solo comprador, identificar la base como preliminar y permitir usarla.
- Cantidades editables, productos agregables/eliminables, nombre del prospecto y datos fiscales editables. Lista de precios seleccionable según el funcionamiento actual.
- Calcular precios con el mismo motor vigente del presupuesto; no copiar precios históricos, descuentos históricos ni datos de clientes de referencia. Informar productos sin precio vigente y no cotizarlos silenciosamente a cero.
- Las plantillas no reservan stock ni crean ventas. Mantener permisos y cartera de cada vendedor.
- Las recomendaciones utilizan el historial agregado de toda la empresa, compartido con los vendedores para asesorar. Esto no otorga acceso a cuentas, pedidos ni identidades de clientes de otras carteras. Los controles actuales siguen rigiendo al seleccionar un cliente o guardar un presupuesto.

## Cálculo propuesto
- Ventana móvil de 90 días completos anteriores a la fecha local de generación, informando las fechas exactas.
- Ventas entregadas, canónicas, sin duplicados y dentro de la misma empresa. Excluir anulaciones, cantidades no positivas y productos inactivos. Aplicar ajustes/devoluciones según el modelo vigente, sin contar documentos de cobro como compras.
- Usar solamente rubros confirmados; las clasificaciones automáticas pendientes de revisión no se mezclan con el historial confirmado.
- Base orientativa por pedido, no consumo mensual: por producto, consolidar líneas del mismo pedido y calcular la media entre los pedidos del rubro que incluyeron ese producto. Mostrar el denominador y redondear a unidades vendibles. Esta definición evita presentar compras como consumo real o mezclar meses sin observación.
- El PDF puede incluir el universo observado; el presupuesto utiliza la selección habitual para evitar una cotización inflada con productos alternativos u ocasionales.
- Cuando haya productos equivalentes, la pantalla permite quitar alternativas; no asegurar que todos se consumen juntos. Identificar que la base requiere validación con el cliente.

## Rubros y carnicerías
El catálogo actual contiene Restaurante, Cafetería, Bar, Salón de eventos, Cancha o club deportivo, Consorcio, Fábrica o industria, Salud o rehabilitación, Hotelería, Comercio, Empresa de limpieza, Institución y Otro. Agregar “Carnicería” como categoría válida en los formularios de clientes y prospectos. No reclasificar clientes existentes automáticamente por su nombre: hasta contar con clientes clasificados explícitamente, esa sección figurará sin historial suficiente.

## Entrega y verificación
Reutilizar el formulario, el motor de precios y el generador PDF existentes. Verificar aislamiento de empresa, permisos de vendedores, ausencia de creación automática, exactitud del promedio, exclusión de duplicados y precios actuales. Renderizar el PDF para revisar índice, saltos de página y tablas. Publicar y comprobar el flujo real antes de darlo por terminado.

## Decisiones que se dejan al implementador
Diseño visual acorde al ERP, rutas internas, estructura de consultas y pruebas, estrategia de caché breve con fecha visible y tratamiento técnico de errores. No modificar las recomendaciones públicas de la tienda como parte de este trabajo.
