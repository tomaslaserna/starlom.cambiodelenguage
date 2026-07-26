# Presencia real + mensaje rápido a conectados

**Fecha:** 2026-07-26
**Estado:** aprobado (diseño)

## Problema

El badge "online" del header (`components/presence-indicator.tsx`) está
hardcodeado a `0` y marcado como "presencia desactivada para pruebas locales".
La API `/api/presence` es un stub que solo se devuelve al propio usuario y el
indicador ni la llama. Resultado: aunque el usuario tenga su sesión abierta,
figura "0 online", y no hay forma de ver quién está conectado ni de
contactarlo.

## Objetivo

1. El badge cuenta la presencia real de la empresa, **incluyendo al propio
   usuario** (nunca más "0" con la sesión abierta).
2. Al clickear el badge se despliega un panel con **quiénes están conectados**.
3. Cada conectado (salvo uno mismo) tiene un acceso directo para **mandarle un
   mensaje**, reutilizando el sistema de mensajería existente.

## Decisiones de alcance (acordadas)

- El panel muestra **solo los conectados** (sin lista de offline ni "última vez
  visto").
- "Mensaje" **navega a `/messages?contact=<username>`** (conversación
  precargada); no hay compositor inline.
- Enfoque **heartbeat + polling cada ~30s** (no tiempo real).
- Presencia **por empresa** (`empresa_id`); solo staff (el indicador vive dentro
  del layout autenticado).

## Componentes

### 1. Migración — tabla `user_presence`

```
empresa_id   bigint       not null
username     text         not null
display_name text
last_seen    timestamptz  not null default now()
PRIMARY KEY (empresa_id, username)
```

El latido hace *upsert* de `last_seen = now()`. No se limpian filas viejas: el
filtro por ventana temporal las ignora. Archivo en `supabase/migrations/` con
timestamp, siguiendo la convención del repo.

### 2. Lógica — `lib/presence.ts`

- Constante `PRESENCE_WINDOW_MS = 75_000` (online = activo en los últimos 75 s;
  con latido cada 30 s evita parpadeos).
- Helper **puro y testeable**:
  `isOnline(lastSeen: Date | string, now: Date, windowMs = PRESENCE_WINDOW_MS): boolean`.
- `touchPresence(session): Promise<PresenceSnapshot>` — upsert del usuario actual
  y devuelve la foto de conectados de su empresa.
- Tipos:
  - `OnlineUser = { username: string; displayName: string; isSelf: boolean }`
  - `PresenceSnapshot = { count: number; online: OnlineUser[] }`

`count` incluye al propio usuario. `online` viene ordenado con uno mismo primero
y luego por `displayName`.

### 3. API — `/api/presence` (reescribe el stub)

- `POST` = latido: `touchPresence(session)` y responde `{ data: PresenceSnapshot }`.
- Autenticado con `requireApiSession` (igual que hoy).

### 4. UI — `components/presence-indicator.tsx` (pasa a client component)

- Al montar y **cada 30 s**: `POST /api/presence`, actualiza `count` y `online`.
- Badge muestra `count` + "online" (respeta la prop `compact`).
- Click en el badge → **popover** con la lista de `online`:
  - Uno mismo aparece marcado como "(vos)", sin acción.
  - El resto, cada uno con botón/enlace **"Mensaje"** → `/messages?contact=<username>`.
  - Si `count === 1` (solo uno mismo): "Solo vos por ahora".
- Errores de red: conserva el último estado conocido, no rompe la UI.
- Cierra el popover al hacer click afuera / Escape.

## Flujo de datos

```
montaje → POST /api/presence → { count, online } → badge
  ↑ cada 30 s ─────────────────────────────────────┘
click badge → despliega panel con `online`
"Mensaje" → navega a /messages?contact=<username>
```

## Testing

- **Unitario (`node --test`)**: `isOnline` (dentro/fuera de ventana, límites) y
  el armado/orden de `online` con `isSelf`.
- **Manual autenticado**: dos sesiones distintas → el contador sube a 2, ambas se
  ven en el panel, "Mensaje" abre la conversación correcta.

## Despliegue

- Aplicar la migración `user_presence` a la base Supabase compartida (se hace
  durante la implementación, con aviso previo, vía acceso directo a la DB).
- El código requiere push + deploy para verse en producción.

## YAGNI (explícitamente fuera)

- Sin tiempo real, sin lista de offline, sin "última vez visto", sin compositor
  de mensajes inline, sin limpieza programada de filas de presencia.
