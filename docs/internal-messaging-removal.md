# Retiro definitivo de mensajería interna

La mensajería interna se elimina del ERP: conversaciones, envío, borradores,
lecturas, adjuntos y los dos componentes de avisos. Las rutas `/messages` y
`/api/messages/*` dejan de existir. No se modifica el asistente LA TIRRA.

## Funciones conservadas

- `tasks.ts` conserva recordatorios, tareas asignadas, recurrencia, notas de cierre
  y autorización por empresa/usuario. Asignar y completar ya no crea mensajes.
- `customer-follow-up.ts` conserva el seguimiento comercial y las métricas de
  altas/bajas. Calendario obtiene los colaboradores mediante `listTaskAssignees`.
- El pizarrón conserva sus notas y menciones, sin enviar notificaciones internas.
- Presencia, renovación de sesión y comprobación de pagos del portal se conservan.
- El bucket compartido `uploads` sigue disponible para comprobantes de compras;
  se borran exclusivamente los objetos bajo `mensajes/`.

## Orden de publicación y eliminación

1. Compilar y ejecutar `npm run test:messaging-removal`, además de la suite general.
2. Publicar la aplicación y verificar que las rutas eliminadas devuelven 404.
3. Eliminar mediante Storage API los objetos cuyo nombre comienza por `mensajes/`.
4. Aplicar `remove_internal_messaging`: elimina `mensaje_adjuntos`,
   `mensaje_cargas`, `mensajes` y los permisos exactos `mensajes.ver`/`mensajes.crear`.
   La migración aborta si todavía hay archivos o dependencias no previstas; no usa
   `DROP CASCADE` y no borra tablas de tareas, clientes ni del portal.
5. Volver a consultar el esquema y comprobar calendario, inicio, CRM y portal.

El código histórico permanece en Git y las copias de seguridad existentes siguen
su retención habitual. La eliminación aplica al sistema activo; no purga backups
ni reescribe el historial del repositorio.

## Verificación de producción, 10 de septiembre de 2026

- Publicación del código `8886b32`: Vercel confirmó éxito; `/messages` y las cinco
  rutas de API retiradas devolvieron 404. `/portal` y `/api/health` devolvieron 200.
- Eliminados 46 mensajes, 2 registros de adjuntos, 3 cargas preparadas y los 3
  objetos de Storage (44.608 bytes en total). Las tres tablas ya no existen y
  quedan cero permisos y cero objetos de mensajería.
- Antes y después: 3.108 productos, 847 ventas, 96 imágenes de productos,
  1 tarea asignada, 10 recordatorios, 5 notas, 3 cuentas y 3 membresías del portal.
- Calendario y seguimiento de clientes verificados con sesión real después de
  eliminar las tablas. La lista de colaboradores del calendario sigue cargando.
- Compilación, TypeScript, lint de archivos modificados, análisis de seguridad y
  las 7 pruebas de retirada: correctos. La suite general conserva 3 fallos ajenos:
  mocks sin alias de `customer-receipt-types`/`month-range` y un fallback vacío en
  `customers/page.tsx`; los archivos que los provocan no fueron modificados.
