# Activación controlada del Supervisor Starlim

El código está preparado pero las funciones permanecen cerradas. No activar en producción hasta completar el piloto.

## Requisitos externos pendientes

1. Confirmar que el proyecto de Vercel tiene acceso y crédito disponible en AI Gateway. En Vercel se usa OIDC automáticamente.
2. Para ejecutar fuera de Vercel, crear una credencial y guardarla como `AI_GATEWAY_API_KEY` en el entorno; nunca pegarla en código ni enviarla por chat.
3. Aplicar la migración `supabase/migrations/20260826010121_supervisor_lab_tasks_audit.sql` primero en un entorno de prueba.

## Piloto de chat

1. Configurar `SUPERVISOR_AI_ENABLED=true` solo en el entorno de prueba.
2. Mantener `SUPERVISOR_TASKS_ENABLED=false` durante la primera evaluación.
3. Entrar directamente a `/supervisor-lab`; no agregarlo todavía a la navegación.
4. Seguir `EVALUATION.md`, ejecutar todos los casos de `evaluation-cases.json` y registrar cada resultado en `evaluation-results-template.csv`.
5. Confirmar que el vendedor no puede recuperar clientes ajenos y que ninguna respuesta afirma haber modificado datos.
6. Registrar precisión, fuentes, latencia y consumo por consulta.

## Piloto de recordatorios

1. Verificar la migración, RLS, grants e índices con los asesores de Supabase.
2. Configurar `SUPERVISOR_TASKS_ENABLED=true` solo en prueba.
3. Generar recordatorios desde el botón y comprobar que una segunda ejecución crea cero duplicados.
4. Probar completar, posponer y descartar con dos usuarios diferentes.
5. Confirmar que cada usuario solo puede leer y modificar sus propias tareas.

## Activación gradual

1. Habilitar primero a un único vendedor mediante una futura bandera por usuario.
2. Observar una semana laboral completa.
3. Incorporar el acceso a la navegación únicamente después de aprobar el piloto.
4. Mantener las acciones sobre pedidos, stock, cuentas corrientes y ARCA fuera del agente hasta diseñar confirmaciones específicas.

## Reversión

- Desactivar inmediatamente `SUPERVISOR_AI_ENABLED` y `SUPERVISOR_TASKS_ENABLED`.
- Las rutas vuelven a quedar cerradas sin afectar ventas, pedidos, stock ni facturación.
- No eliminar tareas ni historial durante la reversión; conservarlos para auditoría.
