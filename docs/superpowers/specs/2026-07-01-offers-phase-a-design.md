# Ofertas (Fase A) — Diseño

Fecha: 2026-07-01
Módulo: Precios (`/pricing`) + Comercial › Pedidos › Cargar pedido (`/orders/new`)

## Objetivo

Un ABM de **ofertas descriptivas** (título + texto) que los comerciales pueden
seleccionar al armar un pedido para insertar la línea 💡 en la confirmación de
WhatsApp, reemplazando el campo manual actual. Fase A: solo descriptivo, sin
cálculo de descuentos y sin el gating por punto de equilibrio (esos son la
Fase B, un diseño aparte).

## Alcance (Fase A)

- Tabla nueva `offers` + capa de datos.
- Página ABM `/pricing/offers` (subpágina del área de Precios).
- Acceso desde la página de Precios (`/pricing`) con un link en el encabezado.
- Selector de ofertas activas en el generador de confirmación de WhatsApp.

Fuera de alcance (Fase B, futuro): motor de punto de equilibrio, habilitación
condicional de ofertas, cálculo/aplicación de descuentos a las líneas del pedido,
vigencia por fechas.

## Modelo de datos

Migración `migrations/033_create_offers.sql` (sigue la convención del esquema:
`id uuid`, `empresa_id bigint`, timestamps, FK a `products`/`profiles`):

```sql
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  description text not null default '',   -- texto de la línea 💡
  active boolean not null default true,
  product_id uuid references public.products(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  empresa_id bigint not null default 1
);
create index if not exists offers_empresa_active_idx on public.offers (empresa_id, active);
```

- "Vigente" = `active = true`. No hay rango de fechas.
- `product_id` es opcional (referencia/filtro; `on delete set null`).
- La migración es aditiva y de bajo riesgo. Se aplica a la base Supabase conectada
  (proyecto `tkpapbinlplqfhoxesuk`) con las credenciales de servicio, con OK del
  usuario. Debe quedar como archivo en `migrations/` (fuente de verdad) además de
  aplicarse en la base.

## Backend — `src/lib/offers.ts`

Módulo nuevo, con `queryWithCompanyContext`/`withCompanyContext` (patrón existente):

```ts
export type Offer = {
  id: string;
  title: string;
  description: string;
  active: boolean;
  productId: string | null;
  productName: string | null; // join a products para mostrar
};

export type OfferInput = {
  title: string;
  description: string;
  active: boolean;
  productId: string | null;
};

listOffers(companyId): Promise<Offer[]>           // ABM: todas
listActiveOffers(companyId): Promise<Offer[]>     // selector: active=true
createOffer(session, input): Promise<string>      // devuelve id
updateOffer(session, id, input): Promise<void>
setOfferActive(session, id, active): Promise<void>
offerInputFromBody(body): OfferInput              // parseo desde FormData
```

Validación en `offerInputFromBody`: `title` requerido (no vacío); `description`
requerido; `productId` opcional (uuid o null). Errores con `ApiError(400, ...)`.

## Página ABM — `/pricing/offers`

Nueva ruta `src/app/pricing/offers/page.tsx` + `actions.ts`. Sigue el patrón de
las pantallas ABM existentes (`ModulePage`, `PageHeader`, `DataTable`, `Card`,
`Field`, `Button`, componentes de `@/components/ui`):

- **Protección:** `requireStaffSession` + `requirePagePermission` con el permiso de
  precios existente (`{ resource: "productos", action: "ver" }` para leer; las
  acciones usan `requireApiSession` con `productos.editar`).
- **Tabla:** columnas Título, Producto (o "—"), Estado (badge activa/inactiva),
  Acciones (Editar, Activar/Desactivar).
- **Formulario de alta/edición:** título (`Input`), texto (`textarea`), producto
  (select opcional poblado con `listProducts(companyId)` de `@/lib/catalog`),
  activa (checkbox). El select de producto incluye una opción vacía "Sin producto".
- **Server actions** (`actions.ts`): `createOfferAction`, `updateOfferAction`,
  `toggleOfferActiveAction`, cada una con `requireApiSession(["productos.editar"])`,
  `revalidatePath("/pricing/offers")` y redirect/return al listado.
- **active prop del ModulePage:** `"pricing"` (queda resaltado el área de Precios).

`active="pricing"` mantiene la subpágina asociada al área de Precios en el menú.

## Acceso desde Precios — `src/app/pricing/page.tsx`

Agregar en el `PageHeader` de la página de Precios (donde está el botón
"Lista PDF") un `ButtonLink` a `/pricing/offers` con label "Ofertas". No se agrega
un ítem nuevo en la sección "Base de datos" del menú lateral (Ofertas vive dentro
de Precios).

## Integración con el generador de WhatsApp

- **Servidor:** `src/app/orders/new/page.tsx` carga `listActiveOffers(companyId)` y
  se lo pasa a `OrderEntryFields` → `OrderConfirmationPreview`.
- **Cliente:** `OrderConfirmationPreview` recibe una prop
  `offers: { id: string; title: string; description: string }[]`. Arriba del campo
  "Oferta (opcional)" agrega un `<Select>` "Elegir oferta vigente" con las opciones
  (título). Al elegir una, setea `offerText` con su `description`. El campo de texto
  sigue siendo editable (se puede ajustar o escribir una custom). Si no hay ofertas
  activas, el select no se muestra (o se muestra deshabilitado con "Sin ofertas
  vigentes") y queda solo el campo de texto.

Esto no cambia la función pura `buildWhatsappConfirmation` (sigue recibiendo
`offerText`).

## Navegación

Sin cambios en `navigation.ts`: el acceso a Ofertas es el link desde `/pricing`.
(La subpágina hereda `active="pricing"`.)

## Manejo de errores / bordes

- Crear/editar sin título o sin texto → `ApiError(400)` y la UI muestra el error.
- Producto asociado borrado → `on delete set null` deja la oferta sin producto (no
  rompe).
- Sin ofertas activas → el selector no aparece; el flujo de WhatsApp sigue con el
  campo de texto manual (comportamiento actual, sin regresión).
- Permiso insuficiente → las páginas/acciones rechazan con la lógica existente.

## Testing / verificación

- **Unitario:** `offerInputFromBody` es lógica pura → test unitario estilo
  `node --test` (título vacío → error; parseo correcto; productId vacío → null).
- **Funcional (autenticado):** crear una oferta activa en `/pricing/offers` →
  aparece en el selector de "Cargar pedido" → al elegirla, su texto entra en la
  confirmación 💡. Desactivarla → desaparece del selector.
- La migración se verifica confirmando que la tabla `offers` existe en la base tras
  aplicarla.

## Archivos afectados

- Crear: `migrations/033_create_offers.sql`
- Crear: `apps/web/src/lib/offers.ts`
- Crear: `apps/web/src/app/pricing/offers/page.tsx`
- Crear: `apps/web/src/app/pricing/offers/actions.ts`
- Crear: test unitario de `offerInputFromBody` en `apps/web/scripts/`
- Editar: `apps/web/src/app/pricing/page.tsx` (link "Ofertas")
- Editar: `apps/web/src/app/orders/new/page.tsx` (cargar ofertas activas)
- Editar: `apps/web/src/app/orders/new/order-entry-fields.tsx` (pasar `offers`)
- Editar: `apps/web/src/app/orders/new/order-confirmation-preview.tsx` (selector)
