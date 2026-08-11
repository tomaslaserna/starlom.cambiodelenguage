# Leads en el CRM — Diseño

**Fecha:** 2026-08-11
**Estado:** Aprobado, pendiente de plan de implementación

## Problema / objetivo

El CRM (segundo mundo para vendedores) hoy maneja clientes ya registrados. Falta
un paso previo: **leads** (prospectos que todavía no son clientes pero podrían
serlo). Se quiere una pestaña `/crm/leads` con un **tablero Kanban** por etapas,
scopeada por vendedor como el resto del CRM, con **conversión en un clic** al
alta de cliente normal.

## Decisiones tomadas (brainstorming)

- **Alcance:** pipeline con etapas + convertir (no solo lista).
- **Etapas:** `nuevo → contactado → interesado` (activas) + cierres `convertido` /
  `descartado`.
- **Campos por lead:** nombre (obligatorio) y teléfono fijos; además zona/localidad,
  origen, email, próximo seguimiento (fecha). Más notas libres.
- **Vista:** tablero Kanban (3 columnas activas) + sección "Cerrados" para
  convertidos/descartados.
- **Conversión:** en un clic — crea el cliente con los datos del lead (nombre
  alcanza) y marca el lead `convertido`; el CUIT/lista se completan después
  editando el cliente.
- **Scope:** por vendedor, igual que `getVendorClients` (via `sellerCandidates`).
- **Permiso:** reutiliza `crm.ver` (`CRM_READ_PERMISSION`). Sin permisos nuevos.

## Modelo de datos — tabla nueva `crm_leads`

Migración con timestamp (patrón de `20260804000000_crm_vendors_phase1.sql`):
`BEGIN…COMMIT`, `CREATE TABLE IF NOT EXISTS`, RLS habilitada, policy `FOR ALL TO
starlim_app` por `empresa_id` con `current_setting('app.current_empresa_id')`, y
`GRANT SELECT, INSERT, UPDATE, DELETE … TO starlim_app`.

```sql
CREATE TABLE IF NOT EXISTS public.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id bigint NOT NULL DEFAULT 1,
  assigned_seller text,                 -- vendedor dueño del lead
  name text NOT NULL,
  phone text,
  email text,
  locality text,                        -- zona / localidad
  source text,                          -- origen del lead
  stage text NOT NULL DEFAULT 'nuevo',  -- nuevo|contactado|interesado|convertido|descartado
  next_followup date,
  notes text,
  converted_client_id uuid,             -- link al cliente cuando se convierte
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_leads_tenant_seller_stage_idx
  ON public.crm_leads (empresa_id, assigned_seller, stage);
```

No se toca la tabla `clients`: los leads viven aparte, así **no** aparecen en
pedidos, presupuestos ni listados de clientes hasta convertirse.

## Backend — `apps/web/src/lib/leads.ts`

- `LEAD_STAGES` (`["nuevo","contactado","interesado","convertido","descartado"]`),
  `ACTIVE_LEAD_STAGES` (`["nuevo","contactado","interesado"]`), y
  `normalizeLeadStage(value): LeadStage` — puros y testeables (patrón de
  `order-status`/`collection-methods`).
- `leadInputFromBody(body): LeadInput` — valida `name` obligatorio; toma phone,
  email, locality, source, next_followup (fecha ISO válida o null), notes.
- `getVendorLeads(session)` — leads del vendedor (scope por `sellerCandidates`),
  agrupados por etapa: `{ active: Record<stage, Lead[]>, closed: Lead[], counts }`.
- `createLead(session, input)` — inserta con `assigned_seller` = identidad del
  vendedor de la sesión y `created_by`.
- `updateLead(session, id, input)` — edita campos del lead.
- `moveLeadStage(session, id, stage)` — cambia la etapa (valida stage; no permite
  pasar a `convertido` por acá — eso lo hace la conversión).
- `discardLead(session, id)` — etapa `descartado`.
- `convertLeadToClient(session, id)` — en una transacción: lee el lead (scope
  vendedor), crea el cliente con `createCustomer` mapeando
  name→name, phone→phone, locality→locality, assigned_seller→seller/assignedSeller,
  status `activo`, lista por defecto; email y origen del lead se guardan en las
  notas/observación del cliente si no hay columna dedicada. Luego marca el lead
  `stage='convertido'` y `converted_client_id`. Idempotente: si el lead ya está
  convertido, no crea otro cliente.

Todas las escrituras scopeadas por `empresa_id` y `assigned_seller ∈ sellerCandidates(session)`.

## UI — `apps/web/src/app/crm/leads/`

- `page.tsx` (server): valida sesión + `sessionCanUseCrm`; carga `getVendorLeads`;
  render con `ModulePage active="crm" title="CRM · Leads"`.
- `leads-board.tsx` (client): tablero Kanban.
  - 3 columnas activas: **Nuevo · Contactado · Interesado**. Cada lead es una
    tarjeta: nombre, zona, teléfono, y chip de "próximo seguimiento" cuando la
    fecha está vencida (rojo) o cae dentro de los próximos 3 días (ámbar).
  - **Arrastrar** una tarjeta a otra columna → `moveLeadStageAction`. Respaldo
    accesible: un `<select>` "Etapa" en cada tarjeta que hace lo mismo (fuente de
    verdad del cambio de etapa; el drag es azúcar visual encima).
  - Botón **"+ Nuevo lead"** → diálogo de alta (patrón de
    `register-collection-dialog.tsx`).
  - Acciones por tarjeta: **Editar**, **Convertir a cliente**, **Descartar**.
  - Sección **"Cerrados"** plegable debajo: lista de `convertido` (con link al
    cliente) y `descartado`.
- `actions.ts` (server actions): `createLeadAction`, `updateLeadAction`,
  `moveLeadStageAction`, `discardLeadAction`, `convertLeadAction`. Cada una
  `requireApiSession` con `crm.ver`, ejecuta el lib y `revalidatePath("/crm/leads")`.

## Navegación

Agregar en `apps/web/src/lib/navigation.ts`, en el bloque CRM (después de
"Clientes", línea ~241):

```ts
{ href: "/crm/leads", label: "Leads", active: "crm", permission: CRM_READ_PERMISSION },
```

## Manejo de errores

- Validación de entrada vía `ApiError(400, …)` (nombre obligatorio, fecha inválida,
  stage inválido), consistente con el resto del código.
- Conversión idempotente (lead ya convertido → no duplica cliente; devuelve el
  `converted_client_id` existente).
- Scope: toda lectura/escritura filtra por vendedor; un lead de otro vendedor no
  es accesible (se comporta como "no encontrado").

## Testing

- Unit (node:test, patrón `collection-methods.test.mjs`): `normalizeLeadStage`
  (mapea variantes/inválidos), `ACTIVE_LEAD_STAGES`/`LEAD_STAGES`, y
  `leadInputFromBody` (nombre obligatorio, fecha válida/null).
- Regresión de fuente: la migración crea `crm_leads` con RLS + grants a
  `starlim_app`; `navigation.ts` incluye el ítem `/crm/leads`.
- Verificación viva (`/crm/leads`) requiere login: se confirma en el deploy.

## Fuera de alcance (YAGNI)

- Etapas configurables por el usuario (se fijan las 5 definidas).
- Recordatorios con notificación push/mail (por ahora solo el chip visual de
  próximo seguimiento).
- Importación masiva de leads.
- Métricas/embudo de conversión (se puede agregar después).
- Reasignar un lead a otro vendedor desde la UI (se crea con el vendedor de la
  sesión).
