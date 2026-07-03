# Escritorio (dashboard de Inicio) — Diseño

Fecha: 2026-07-03
Módulo: Inicio › Escritorio (`/`)

## Objetivo

La página `/` (hoy solo accesible haciendo click en el logo, sin entrada en el
menú) ya muestra recordatorios y tareas pendientes del usuario. Se busca:

1. Exponerla en el menú de navegación como "Escritorio", dentro de la sección
   **Inicio**.
2. Sumarle una vista previa de mensajes internos sin leer, para que al entrar
   el usuario vea de un vistazo sus tareas, recordatorios y mensajes
   pendientes.

## Contexto técnico (ya existente)

- `src/app/page.tsx` (`Home`) ya llama a `listTasks(session)` y renderiza dos
  columnas: "Pendientes para vos" (recordatorios propios + tareas recibidas) y
  "Tareas delegadas" (tareas asignadas por el usuario, sin completar).
- `src/lib/messages.ts` expone `listMessageCenter(session)`, que ya trae
  `inbox` (hasta 100 mensajes, con `read: boolean`) y `meta.unread` (conteo).
  No hace falta una consulta nueva: se reutiliza esta función y se filtra en
  memoria.
- El menú (`src/lib/navigation.ts`) no tiene ninguna entrada con
  `active: "home"` hoy; la sección `Inicio` solo lista `Calendario` y
  `Mensajes`.

## Alcance (v1)

- Agregar el grupo `Escritorio` (link directo a `/`) a `navigationGroups` y
  sumarlo como primer ítem de la sección `Inicio`.
- En `Home`, agregar una tercera columna "Mensajes sin leer": lista compacta
  (remitente + asunto + fecha, sin cuerpo), tope 5 mensajes, botón "Ver
  todos" a `/messages`. Si no hay mensajes sin leer, `EmptyState` igual que
  las otras dos columnas.
- Grilla de 2 a 3 columnas en pantallas grandes.

Fuera de alcance: marcar mensajes como leídos desde esta vista (ya existe en
`/messages`); paginar o filtrar el preview; badges nuevos en el menú.

## Cambios

### 1. Navegación — `src/lib/navigation.ts`

Agregar a `navigationGroups` (sin `items`, es un link directo):

```ts
{
  href: "/",
  label: "Escritorio",
  active: "home",
},
```

En `navigationSections`, sección `Inicio`, agregarlo primero:

```ts
{
  label: "Inicio",
  groups: [groupByLabel("Escritorio"), groupByLabel("Calendario"), groupByLabel("Mensajes")],
},
```

Sin `permission` (igual que `Calendario`, visible para cualquier sesión de
staff) y sin `badge`: la sección `Inicio` ya suma el badge de `Calendario`
(`tasks`) y `Mensajes` (`messages`); agregar un badge acá duplicaría el
conteo en el total de la sección.

### 2. Página `/` — `src/app/page.tsx`

- Importar `listMessageCenter` desde `@/lib/messages` y `ButtonLink` desde
  `@/components/ui`.
- En `Home`, además de `listTasks`, llamar `listMessageCenter(session)` y
  calcular:
  ```ts
  const unreadMessages = center.inbox.filter((message) => !message.read).slice(0, 5);
  ```
- Cambiar la grilla de la sección de `xl:grid-cols-[1.35fr_0.85fr]` (2
  columnas) a tres columnas, por ejemplo `xl:grid-cols-[1.1fr_0.85fr_0.85fr]`.
- Nuevo componente `UnreadMessageRow` (mismo archivo, junto a
  `PendingTaskCard`/`AssignedTaskRow`): muestra `from`, `subject` y
  `formatDate(date)`, sin `bodyPreview` ni acciones.
- Nueva `Card` "Mensajes sin leer":
  - `CardHeader` con `CardTitle`/`CardDescription` (ej. "Mensajes internos
    que todavía no abriste").
  - Si `unreadMessages.length === 0`: `EmptyState` ("Sin mensajes sin leer").
  - Si hay mensajes: lista de `UnreadMessageRow` + un `ButtonLink` a
    `/messages` ("Ver todos los mensajes").

## Sin cambios

- `listTasks`, `completeCalendarTaskAction` y el resto de `Home` (columnas
  "Pendientes para vos" y "Tareas delegadas") quedan igual.
- `listMessageCenter` no cambia; se reutiliza tal cual (ya trae `read` y
  `inbox` ordenado por fecha descendente).
- No se agregan permisos nuevos: `Escritorio` queda accesible para cualquier
  sesión de staff, igual que `Calendario`.
- No se toca `/messages` ni la acción de marcar como leído.

## Manejo de errores / bordes

- Si `listMessageCenter` tarda o falla, sigue el mismo patrón que ya usa
  `Home` (no hay `withTimeout` hoy en esta página porque `requireStaffSession`
  ya bloquea sin sesión; si `listMessageCenter` lanza, el error sube igual
  que si fallara `listTasks` hoy — no se agrega manejo especial, es
  consistente con el resto de la página).
- Sesión sin mensajes en absoluto (usuario nuevo): `inbox` vacío →
  `unreadMessages` vacío → se muestra el `EmptyState`.
- Mensajes con `asunto` vacío: se muestra igual, sin texto (mismo
  comportamiento que la bandeja de `/messages`).

## Testing / verificación

No hay harness de tests unitarios para este flujo (los tests del proyecto son
estáticos + smoke). Verificación por flujo real autenticado:

1. El menú lateral, sección `Inicio`, ahora muestra `Escritorio` como primer
   ítem, antes de `Calendario` y `Mensajes`.
2. Entrar a `/` muestra tres columnas: pendientes, delegadas, mensajes sin
   leer.
3. Con mensajes sin leer en la bandeja: aparecen hasta 5, ordenados por fecha
   descendente, con remitente/asunto/fecha.
4. Marcar todos los mensajes como leídos desde `/messages` y volver a `/`: la
   columna muestra el `EmptyState`.
5. Sin sesión (`requireStaffSession` redirige a login): `/` no es accesible.

## Archivos afectados

- Editar: `src/lib/navigation.ts` (nuevo grupo `Escritorio` + sección
  `Inicio`)
- Editar: `src/app/page.tsx` (tercera columna de mensajes sin leer)
