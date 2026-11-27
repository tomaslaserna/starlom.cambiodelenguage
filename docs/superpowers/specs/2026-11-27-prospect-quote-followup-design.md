# Seguimiento de presupuestos a prospectos en Motor de ventas

## Intención

Evitar que un presupuesto hecho a un prospecto quede fuera del seguimiento comercial por no existir todavía como cliente. El responsable será el vendedor asignado al presupuesto o, cuando no se haya elegido otro, la persona que lo creó.

## Comportamiento acordado

- Todo presupuesto pendiente de un prospecto aparece inmediatamente en el Motor de ventas de su vendedor.
- Los presupuestos de clientes registrados conservan la lógica actual de próximo vencimiento o vencido.
- Si un mismo vendedor tiene varios presupuestos pendientes para el mismo prospecto, el Motor muestra solamente el más reciente.
- La identidad del prospecto se compara por nombre normalizado, ignorando mayúsculas, espacios y acentos.
- La misión permite marcar el contacto como realizado y elegir una fecha de recontacto.
- Una misión reprogramada desaparece hasta la fecha elegida y luego vuelve a aparecer si el presupuesto continúa pendiente.
- Si el presupuesto deja de estar pendiente, deja de generar seguimiento.

## Caso Espacio O2

Los presupuestos P-0130 y P-0133 pertenecen a Matías Ferrer. Se utilizará el más reciente, P-0133, y se dejará programado para reaparecer el 25/01/2027.

## Enfoques considerados

1. Mostrar todos los presupuestos pendientes: simple, pero duplica tareas cuando el prospecto recibió más de una versión.
2. Mostrar sólo el presupuesto pendiente más reciente por prospecto y vendedor: elegido porque conserva la oportunidad sin ensuciar la agenda.
3. Crear automáticamente un lead por cada presupuesto: descartado porque duplica datos y separa el seguimiento del documento que originó la oportunidad.

## Alcance técnico

- Incorporar los presupuestos vigentes de prospectos al armado de misiones.
- Deduplicarlos antes de construir las misiones.
- Mantener el mecanismo existente de `sales_mission_completions` para ocultar y reactivar el seguimiento.
- Ajustar los textos del Motor para explicar que también muestra propuestas nuevas a prospectos.
- Agregar pruebas de asignación, deduplicación y reprogramación.

## Fuera de alcance

- Crear automáticamente clientes o leads.
- Cambiar la asignación histórica de presupuestos.
- Modificar el seguimiento de presupuestos asociados a clientes registrados.
