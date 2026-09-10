# Reducción de Fluid Active CPU

El aviso de Vercel del 10 de septiembre de 2026 informó que el equipo gratuito
había consumido el 75% de las 4 horas incluidas de Fluid Active CPU. El aviso es
a nivel de equipo, no atribuye por sí solo el consumo a un proyecto.

## Política aplicada en StarLim

- La presencia de colaboradores tiene un único origen de datos compartido entre
  las vistas de escritorio y móvil. Consulta cada 60 segundos en vez de ejecutar
  dos consultas independientes cada 30 segundos.
- Todo polling compartido se suspende cuando la pestaña queda oculta y se ejecuta
  inmediatamente al volver a estar visible.
- La renovación de sesión conserva su intervalo de cuatro minutos, pero ya no
  consulta con la pestaña oculta.
- El portal conserva la verificación de pagos cada tres segundos durante el
  primer minuto. Después utiliza diez segundos hasta recibir un estado terminal;
  también se suspende cuando la pestaña está oculta.
- Ventas, pedidos, mensajes del portal y webhooks no dependen de la presencia y
  no cambian su comportamiento.

Con una pestaña visible del ERP, las solicitudes de presencia bajan del máximo
anterior de 240 por hora a 60 por hora. Las pestañas ocultas dejan de generar
estas solicitudes. El consumo ya acumulado en Vercel no se revierte: se debe
comparar la pendiente diaria posterior al despliegue con la anterior.

## Seguimiento

Revisar el desglose diario de Fluid Active CPU del equipo propietario y agrupar
por proyecto y ruta. Si StarLim sigue creciendo a un ritmo que proyecte alcanzar
el 90% antes del reinicio del período, inspeccionar primero `/api/presence`,
`/api/auth/refresh` y `/api/portal/checkout/*/status` antes de considerar un
cambio de plan.
