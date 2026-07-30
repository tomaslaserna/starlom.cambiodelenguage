# Auditoría de rendimiento - 2026-07-23

## Evidencia observada

- En producción, la navegación de Ventas a Presupuestos tardó aproximadamente 0,6 s y el regreso a Ventas llegó a 3,25 s.
- Las funciones de Vercel se estaban ejecutando en `iad1` (Virginia) y PostgreSQL/Supabase está en `sa-east-1` (São Paulo).
- Las pantallas operativas son dinámicas y personalizadas. Los `cache=MISS` de las rutas no son por sí mismos un error: el costo importante era ejecutar varias consultas protegidas por empresa a larga distancia.
- La carga de permisos e indicadores del menú tenía dos esperas consecutivas de hasta 60 ms.
- No existía un estado global de carga para los cambios de ruta, por lo que un clic podía parecer inactivo mientras el servidor trabajaba.

## Decisiones aplicadas

1. El segmento raíz declara `preferredRegion = "gru1"` para que páginas y handlers hereden una región próxima a la base.
2. Permisos e indicadores del menú se resuelven en paralelo.
3. Se agregó una barra de progreso inmediata para enlaces internos y navegación del historial.
4. Se agregó un `loading.tsx` accesible para que Next.js pueda mostrar una respuesta visual durante una transición.
5. Se mantiene el contexto de empresa dentro de transacciones. No se eliminan `BEGIN`, `set_config` ni RLS para ganar velocidad a costa de aislamiento o seguridad.

## Oportunidades posteriores

- La carga inicial de formularios de pedidos mueve cerca de 3.000 productos y sus precios. Las consultas observadas rondaron 0,2-0,25 s de ejecución en base antes de sumar red y serialización. Si esa pantalla sigue siendo lenta luego del cambio regional, el siguiente paso es reemplazar la carga completa por búsqueda paginada en servidor.
- Medir nuevamente en producción después del despliegue. La mejora de región sólo se materializa cuando Vercel construye y publica esta versión.

## Verificación local

- Suite: 79 pruebas aprobadas.
- ESLint: sin errores.
- Build de producción de Next.js: aprobado.
- Navegación visual: la barra aparece al hacer clic y se retira al completar la ruta.
- Regreso a una ruta local ya compilada: 40 ms en la medición de control.
