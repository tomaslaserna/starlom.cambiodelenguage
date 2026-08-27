# Starlim Supervisor — prototipo aislado

Prototipo navegable para validar la experiencia del asistente operativo antes de integrarlo al ERP.

## Seguridad del aislamiento

- No importa código de `apps/web`.
- No utiliza variables de entorno.
- No se conecta a Supabase, ARCA, WhatsApp ni servicios de IA.
- Todos los clientes, montos y estados visibles son datos simulados.
- Ninguna acción modifica pedidos, ventas, stock o cuentas corrientes.

## Cómo abrirlo

Abrir `index.html` en un navegador o servir esta carpeta con cualquier servidor HTTP estático.

## Funcionalidades demostradas

- Chat con consultas de ejemplo y fuentes visibles.
- Recordatorios proactivos priorizados.
- Acciones rápidas para resolver o posponer tareas.
- Bandeja filtrable de tareas.
- Historial de auditoría en memoria.
- Simulación de permisos para el rol Vendedor.
- Diseño adaptable a escritorio y móvil.
- Ranking explicable de clientes recomendados para contactar.
- Patrones simulados de frecuencia y productos habituales.
- Intérprete de mensajes desordenados de WhatsApp.
- Borradores con nivel de confianza, evidencia y ambigüedades visibles.

## Qué falta antes de integrar

1. Definir matriz de permisos por rol.
2. Definir reglas exactas y horarios de cada recordatorio.
3. Crear consultas de solo lectura contra vistas seguras del ERP.
4. Incorporar el proveedor de IA y herramientas tipadas.
5. Persistir tareas, respuestas y auditoría.
6. Probar respuestas con un conjunto de preguntas reales.
7. Agregar confirmaciones explícitas antes de cualquier mutación.

## Arquitectura futura propuesta

```text
Interfaz de chat
  -> API del supervisor
    -> Control de sesión y permisos
      -> Herramientas de consulta de solo lectura
        -> Vistas seguras de Supabase

Evaluador programado
  -> Reglas deterministas
    -> Tareas deduplicadas
      -> Bandeja y notificaciones
```

La IA interpreta preguntas y redacta respuestas. Las reglas deterministas detectan tareas. Las operaciones fiscales, financieras, de inventario y entrega permanecen bajo confirmación humana.

## Estado de implementación

### Etapa 1 — núcleo seguro: completada

- Matriz de capacidades por rol.
- Alcance por empresa y vendedor.
- Cálculo de frecuencia, demora y confianza.
- Ranking explicable de oportunidades comerciales.
- Productos habituales y cantidades promedio.
- Motor determinista de recordatorios.
- Claves de deduplicación para evitar avisos repetidos.
- Intérprete contextual que separa sugerencias y ambigüedades.
- Prohibición explícita de enviar pedidos automáticamente.
- Guardia que rechaza SQL de escritura.
- Suite automatizada del núcleo.

Ejecutar las pruebas con:

```powershell
npm test
```

### Etapa 2 — conexión real de solo lectura: núcleo completado

- Adaptador de servidor hacia las tablas actuales del ERP: implementado en `apps/web/src/lib/supervisor-lab/read-model.ts`.
- Consultas siempre limitadas por `empresa_id`.
- Alcance de vendedor aplicado antes de recuperar datos.
- Normalización oficial de estados operativos reutilizada.
- Validación de columnas y consultas contra el esquema real usando únicamente `SELECT`.
- Sin tablas expuestas directamente al navegador.
- Los datos se entregan al agente con identificadores y enlaces internos de origen.

La consulta operativa medida sobre el volumen actual se ejecutó en aproximadamente 1,7 ms. No se agregaron índices porque el plan actual es suficiente; se volverá a medir cuando crezca el volumen.

### Etapa 3 — asistente con IA: núcleo completado, ejecución pendiente

- Agente de servidor con herramientas tipadas y lista blanca.
- Búsqueda por nombre, razón social o CUIT antes de abrir un historial.
- Herramientas reales para historial, comprobantes y pendientes operativos.
- Modelo configurable mediante AI Gateway; modelo predeterminado verificado: `google/gemini-3.5-flash`.
- Respuestas obligadas a distinguir hechos e inferencias, citar fuentes y respetar permisos.
- Endpoint experimental protegido por sesión, límites de entrada e interruptor de activación.
- El endpoint permanece cerrado mientras `SUPERVISOR_AI_ENABLED` no sea `true`.
- Pantalla experimental construida en `/supervisor-lab`, oculta mediante `notFound()` mientras la bandera no esté activa.
- Sin acceso en la navegación del ERP todavía.
- Pendiente: confirmar acceso/crédito de AI Gateway y ejecutar el banco de preguntas reales. Vercel usa OIDC; fuera de Vercel se configura `AI_GATEWAY_API_KEY`.
- Banco inicial de evaluación en `evaluation-cases.json`.

### Etapa 4 — tareas persistentes

- Migración preparada para tareas y ejecuciones, todavía no aplicada.
- Acceso exclusivo del servidor, RLS por empresa y roles públicos revocados.
- Clave única parcial para deduplicar tareas activas.
- API protegida para listar, completar, descartar o posponer tareas propias.
- Motor determinístico manual con deduplicación estable por tipo y entidad.
- Bandeja visual integrada al laboratorio, condicionada por bandera independiente.
- Funcionalidad cerrada mientras `SUPERVISOR_TASKS_ENABLED` no sea `true`.
- Pendiente después del piloto: generación programada y escalamiento automático.
- Horarios laborales, pausa y escalamiento.

### Etapa 5 — acciones confirmables

- Borradores de pedido.
- Confirmaciones de entrega.
- Preparación de solicitudes fiscales.
- Ninguna modificación financiera, fiscal o de stock sin confirmación explícita.

La secuencia completa de prueba, activación y reversión está documentada en `ACTIVATION.md`.
