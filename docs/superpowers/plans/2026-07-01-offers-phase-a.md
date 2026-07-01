# Ofertas (Fase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ABM de ofertas descriptivas (título + texto + activa + producto opcional) en `/pricing/offers`, y selección de ofertas activas en el generador de confirmación de WhatsApp.

**Architecture:** Tabla nueva `offers` (migración 033) + `lib/offers.ts` (CRUD sobre `queryWithCompanyContext`) + página ABM bajo el área de Precios + integración como `<Select>` en el preview de WhatsApp. Sigue los patrones ABM existentes (pricing/catalog).

**Tech Stack:** Next.js 16 (server components + server actions), TypeScript, Postgres (pg). Sin dependencias nuevas.

## Global Constraints

- Oferta descriptiva: "vigente" = `active = true` (sin rango de fechas, sin cálculo de descuentos — eso es Fase B).
- La migración `033_create_offers.sql` es aditiva (`CREATE TABLE IF NOT EXISTS`); debe quedar como archivo en `migrations/` **y** aplicarse a la base Supabase conectada con OK del usuario.
- Reutilizar auth del módulo de Precios: lectura con `sessionCanReadProducts`; acciones con `requireAdminApiSession`.
- Reusar componentes de `@/components/ui`. No agregar ítem en la sección "Base de datos" del menú (Ofertas vive dentro de Precios, accesible por link desde `/pricing`; hereda `active="pricing"`).
- `order-entry-fields.tsx` lo usan tanto `/orders/new` como `/orders/[id]/edit`: la prop `offers` debe ser opcional con default `[]`.
- Tras cambios de código, correr el suite completo `node --test scripts/static.test.mjs` (además del propio), porque hace pattern-match sobre el fuente.

## File Structure

- **Create** `migrations/033_create_offers.sql` — tabla `offers` + índice.
- **Create** `apps/web/src/lib/offers.ts` — tipos `Offer`/`OfferInput`, `listOffers`, `listActiveOffers`, `getOffer`, `createOffer`, `updateOffer`, `setOfferActive`, `offerInputFromBody`.
- **Create** `apps/web/src/app/pricing/offers/page.tsx` — ABM (form alta/edición + tabla + toggle).
- **Create** `apps/web/src/app/pricing/offers/actions.ts` — server actions.
- **Modify** `apps/web/src/app/pricing/page.tsx` — link "Ofertas" en el header.
- **Modify** `apps/web/src/app/orders/new/page.tsx` — cargar ofertas activas y pasarlas.
- **Modify** `apps/web/src/app/orders/new/order-entry-fields.tsx` — prop `offers` → preview.
- **Modify** `apps/web/src/app/orders/new/order-confirmation-preview.tsx` — `<Select>` de ofertas.

---

### Task 1: Ofertas ABM (migración + lib + página + link)

**Files:**
- Create: `migrations/033_create_offers.sql`
- Create: `apps/web/src/lib/offers.ts`
- Create: `apps/web/src/app/pricing/offers/page.tsx`
- Create: `apps/web/src/app/pricing/offers/actions.ts`
- Modify: `apps/web/src/app/pricing/page.tsx`

**Interfaces:**
- Consumes: `queryWithCompanyContext` (`@/lib/db`), `ApiError` (`@/lib/api-response`), `requireStaffSession`/`sessionCanReadProducts`/`requireAdminApiSession` (auth), `stringFieldsFromFormData` (`@/lib/storage`), `uuidParam` (`@/lib/request-body`), `getOrderFormData` (`@/lib/orders`, para la lista completa de productos), componentes de `@/components/ui`.
- Produces (lo usa la Task 2): `listActiveOffers(companyId): Promise<Offer[]>` y `type Offer = { id: string; title: string; description: string; active: boolean; productId: string | null; productName: string | null }`.

- [ ] **Step 1: Crear la migración**

Create `migrations/033_create_offers.sql`:

```sql
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  description text not null default '',
  active boolean not null default true,
  product_id uuid references public.products(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  empresa_id bigint not null default 1
);

create index if not exists offers_empresa_active_idx on public.offers (empresa_id, active);
```

- [ ] **Step 2: Crear `lib/offers.ts`**

Create `apps/web/src/lib/offers.ts`:

```ts
import { ApiError } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";

export type Offer = {
  id: string;
  title: string;
  description: string;
  active: boolean;
  productId: string | null;
  productName: string | null;
};

export type OfferInput = {
  title: string;
  description: string;
  active: boolean;
  productId: string | null;
};

type OfferRow = {
  id: string;
  title: string;
  description: string;
  active: boolean;
  product_id: string | null;
  product_name: string | null;
};

function mapOffer(row: OfferRow): Offer {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    active: row.active,
    productId: row.product_id,
    productName: row.product_name,
  };
}

const OFFER_SELECT = `
  SELECT o.id::text AS id, o.title, o.description, o.active,
         o.product_id::text AS product_id, p.name AS product_name
  FROM offers o
  LEFT JOIN products p ON p.id = o.product_id AND p.empresa_id = o.empresa_id
`;

export async function listOffers(companyId: number): Promise<Offer[]> {
  const result = await queryWithCompanyContext<OfferRow>(
    companyId,
    `${OFFER_SELECT} WHERE o.empresa_id = $1 ORDER BY o.active DESC, o.title ASC`,
    [companyId],
  );
  return result.rows.map(mapOffer);
}

export async function listActiveOffers(companyId: number): Promise<Offer[]> {
  const result = await queryWithCompanyContext<OfferRow>(
    companyId,
    `${OFFER_SELECT} WHERE o.empresa_id = $1 AND o.active = true ORDER BY o.title ASC`,
    [companyId],
  );
  return result.rows.map(mapOffer);
}

export async function getOffer(companyId: number, id: string): Promise<Offer> {
  const result = await queryWithCompanyContext<OfferRow>(
    companyId,
    `${OFFER_SELECT} WHERE o.id = $1::uuid AND o.empresa_id = $2 LIMIT 1`,
    [id, companyId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "Oferta no encontrada");
  return mapOffer(row);
}

export async function createOffer(companyId: number, input: OfferInput): Promise<string> {
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    `INSERT INTO offers (title, description, active, product_id, empresa_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id::text AS id`,
    [input.title, input.description, input.active, input.productId, companyId],
  );
  return result.rows[0].id;
}

export async function updateOffer(companyId: number, id: string, input: OfferInput): Promise<void> {
  const result = await queryWithCompanyContext(
    companyId,
    `UPDATE offers
       SET title = $1, description = $2, active = $3, product_id = $4, updated_at = now()
     WHERE id = $5::uuid AND empresa_id = $6`,
    [input.title, input.description, input.active, input.productId, id, companyId],
  );
  if (result.rowCount === 0) throw new ApiError(404, "Oferta no encontrada");
}

export async function setOfferActive(companyId: number, id: string, active: boolean): Promise<void> {
  const result = await queryWithCompanyContext(
    companyId,
    `UPDATE offers SET active = $1, updated_at = now() WHERE id = $2::uuid AND empresa_id = $3`,
    [active, id, companyId],
  );
  if (result.rowCount === 0) throw new ApiError(404, "Oferta no encontrada");
}

export function offerInputFromBody(body: Record<string, string>): OfferInput {
  const title = (body.title ?? "").trim();
  const description = (body.description ?? "").trim();
  if (!title) throw new ApiError(400, "El titulo es obligatorio");
  if (!description) throw new ApiError(400, "El texto de la oferta es obligatorio");
  const productId = (body.productId ?? "").trim() || null;
  const active = (body.active ?? "activa") !== "inactiva";
  return { title, description, active, productId };
}
```

- [ ] **Step 3: Crear las server actions**

Create `apps/web/src/app/pricing/offers/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createOffer, offerInputFromBody, setOfferActive, updateOffer } from "@/lib/offers";
import { uuidParam } from "@/lib/request-body";
import { requireAdminApiSession } from "@/lib/route-auth";
import { stringFieldsFromFormData } from "@/lib/storage";

export async function createOfferAction(formData: FormData) {
  const session = await requireAdminApiSession();
  await createOffer(session.companyId, offerInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/pricing/offers");
  redirect("/pricing/offers?created=1");
}

export async function updateOfferAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const id = uuidParam(String(formData.get("id") ?? ""), "Oferta");
  await updateOffer(session.companyId, id, offerInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/pricing/offers");
  redirect("/pricing/offers?updated=1");
}

export async function toggleOfferActiveAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const id = uuidParam(String(formData.get("id") ?? ""), "Oferta");
  const active = String(formData.get("active") ?? "") !== "inactiva";
  await setOfferActive(session.companyId, id, active);
  revalidatePath("/pricing/offers");
  redirect("/pricing/offers");
}
```

- [ ] **Step 4: Crear la página ABM**

Create `apps/web/src/app/pricing/offers/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import {
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  StatusBadge,
} from "@/components/ui";
import {
  createOfferAction,
  toggleOfferActiveAction,
  updateOfferAction,
} from "@/app/pricing/offers/actions";
import { requireStaffSession } from "@/lib/auth";
import { getOffer, listOffers } from "@/lib/offers";
import { getOrderFormData } from "@/lib/orders";
import { sessionCanReadProducts } from "@/lib/route-auth";

type OffersPageProps = {
  searchParams: Promise<{ edit?: string }>;
};

export default async function OffersPage({ searchParams }: OffersPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanReadProducts(session))) redirect("/");
  const { edit } = await searchParams;

  const [offers, formData] = await Promise.all([
    listOffers(session.companyId),
    getOrderFormData(session.companyId),
  ]);
  const products = formData.products;
  const editing = edit ? await getOffer(session.companyId, edit).catch(() => null) : null;

  return (
    <ModulePage
      active="pricing"
      description="Ofertas para sumar a las confirmaciones de pedido."
      session={session}
      title="Ofertas"
    >
      <div className="grid gap-5">
        <PageHeader
          title="Ofertas"
          description="Alta y gestion de ofertas vigentes para el generador de WhatsApp."
          actions={
            <ButtonLink href="/pricing" size="sm" variant="secondary">
              Volver a Precios
            </ButtonLink>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle>{editing ? "Editar oferta" : "Nueva oferta"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={editing ? updateOfferAction : createOfferAction} className="grid gap-3">
              {editing ? <input name="id" type="hidden" value={editing.id} /> : null}
              <Field htmlFor="offer-title" label="Titulo">
                <Input
                  id="offer-title"
                  name="title"
                  defaultValue={editing?.title ?? ""}
                  placeholder="Oferta de la semana"
                  required
                />
              </Field>
              <Field htmlFor="offer-description" label="Texto (linea de la confirmacion)">
                <textarea
                  className="erp-text-body-sm min-h-20 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--field)] px-3 py-2 text-[color:var(--foreground)] outline-none focus:border-[color:var(--accent)]"
                  id="offer-description"
                  name="description"
                  defaultValue={editing?.description ?? ""}
                  placeholder="Llevando 2 bobinas, la 2da unidad 50% OFF"
                  required
                />
              </Field>
              <div className="grid gap-3 md:grid-cols-2">
                <Field htmlFor="offer-product" label="Producto (opcional)">
                  <Select id="offer-product" name="productId" defaultValue={editing?.productId ?? ""}>
                    <option value="">Sin producto</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field htmlFor="offer-active" label="Estado">
                  <Select
                    id="offer-active"
                    name="active"
                    defaultValue={editing && !editing.active ? "inactiva" : "activa"}
                  >
                    <option value="activa">Activa</option>
                    <option value="inactiva">Inactiva</option>
                  </Select>
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit">{editing ? "Guardar cambios" : "Crear oferta"}</Button>
                {editing ? (
                  <ButtonLink href="/pricing/offers" variant="secondary">
                    Cancelar
                  </ButtonLink>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <DataTable caption="Listado de ofertas" tableLabel="Ofertas">
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Titulo</DataTableHead>
                <DataTableHead>Producto</DataTableHead>
                <DataTableHead>Estado</DataTableHead>
                <DataTableHead align="right">Acciones</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {offers.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={4}>
                    <EmptyState
                      description="Crea la primera oferta con el formulario de arriba."
                      title="No hay ofertas"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                offers.map((offer) => (
                  <DataTableRow key={offer.id}>
                    <DataTableCell>
                      <div className="font-medium">{offer.title}</div>
                      <div className="line-clamp-2 text-xs text-[color:var(--muted)]">{offer.description}</div>
                    </DataTableCell>
                    <DataTableCell>{offer.productName ?? "—"}</DataTableCell>
                    <DataTableCell>
                      <StatusBadge tone={offer.active ? "success" : "neutral"}>
                        {offer.active ? "Activa" : "Inactiva"}
                      </StatusBadge>
                    </DataTableCell>
                    <DataTableCell align="right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <ButtonLink href={`/pricing/offers?edit=${offer.id}`} size="sm" variant="secondary">
                          Editar
                        </ButtonLink>
                        <form action={toggleOfferActiveAction}>
                          <input name="id" type="hidden" value={offer.id} />
                          <input name="active" type="hidden" value={offer.active ? "inactiva" : "activa"} />
                          <Button size="sm" type="submit" variant="secondary">
                            {offer.active ? "Desactivar" : "Activar"}
                          </Button>
                        </form>
                      </div>
                    </DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
        </Card>
      </div>
    </ModulePage>
  );
}
```

- [ ] **Step 5: Link "Ofertas" en la página de Precios**

En `apps/web/src/app/pricing/page.tsx`, reemplazar el bloque `actions` del `PageHeader`:

```tsx
          actions={
            <ButtonLink href="/api/pdfs/pricing/price-list?list=1" prefetch={false} size="sm" target="_blank">
              Lista PDF
            </ButtonLink>
          }
```

por:

```tsx
          actions={
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/pricing/offers" size="sm" variant="secondary">
                Ofertas
              </ButtonLink>
              <ButtonLink href="/api/pdfs/pricing/price-list?list=1" prefetch={false} size="sm" target="_blank">
                Lista PDF
              </ButtonLink>
            </div>
          }
```

- [ ] **Step 6: Aplicar la migración a la base (con OK del usuario)**

El controlador aplica `migrations/033_create_offers.sql` a la base Supabase conectada
(usando las credenciales de `apps/web/.env.local`), **previa confirmación del usuario**.
Verificar que la tabla existe:
`SELECT to_regclass('public.offers');` debe devolver `offers` (no null).

- [ ] **Step 7: Lint + tests + compilación**

Desde `apps/web`:
- `npm run lint` → exit 0.
- `node --test scripts/static.test.mjs` → sigue verde (12/12), y `node --test scripts/order-confirmation.test.mjs` → 7/7.
- Con el dev server corriendo: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/pricing/offers` → 307/200 y sin `⨯` en el log para `pricing/offers`.

- [ ] **Step 8: Verificación funcional (autenticada) + commit**

Login `ftrdistribuciones@gmail.com`: en `/pricing` el header muestra "Ofertas" → entra a `/pricing/offers` → crear una oferta activa (título + texto) → aparece en la tabla como Activa → Desactivar/Activar funciona → Editar precarga el formulario.

Commit (los archivos de esta task):

```bash
git add migrations/033_create_offers.sql apps/web/src/lib/offers.ts apps/web/src/app/pricing/offers/page.tsx apps/web/src/app/pricing/offers/actions.ts apps/web/src/app/pricing/page.tsx
git commit -m "feat(comercial): ABM de ofertas en Precios (/pricing/offers)"
```

---

### Task 2: Integración de ofertas en el generador de WhatsApp

**Files:**
- Modify: `apps/web/src/app/orders/new/page.tsx`
- Modify: `apps/web/src/app/orders/new/order-entry-fields.tsx`
- Modify: `apps/web/src/app/orders/new/order-confirmation-preview.tsx`

**Interfaces:**
- Consumes de Task 1: `listActiveOffers(companyId)` y el tipo `Offer`.
- Produces: la prop `offers?: { id: string; title: string; description: string }[]` en `OrderEntryFields` y en `OrderConfirmationPreview`.

- [ ] **Step 1: Cargar ofertas activas en la página de Cargar pedido**

En `apps/web/src/app/orders/new/page.tsx`:

**1a.** Agregar el import:

```tsx
import { listActiveOffers } from "@/lib/offers";
```

**1b.** Reemplazar la carga de datos:

```tsx
  const formData = await getOrderFormData(session.companyId);
```

por:

```tsx
  const [formData, offers] = await Promise.all([
    getOrderFormData(session.companyId),
    listActiveOffers(session.companyId),
  ]);
```

**1c.** Pasar `offers` al componente. Reemplazar:

```tsx
        <OrderEntryFields clients={formData.clients} products={formData.products} />
```

por:

```tsx
        <OrderEntryFields
          clients={formData.clients}
          offers={offers.map((offer) => ({ id: offer.id, title: offer.title, description: offer.description }))}
          products={formData.products}
        />
```

- [ ] **Step 2: Pasar `offers` a través de `order-entry-fields.tsx`**

En `apps/web/src/app/orders/new/order-entry-fields.tsx`:

**2a.** Agregar el tipo de la prop en `OrderEntryFieldsProps`:

```tsx
type OrderEntryFieldsProps = {
  clients: OrderFormClient[];
  products: OrderFormProduct[];
  initialValue?: OrderEntryInitialValue;
  offers?: { id: string; title: string; description: string }[];
};
```

**2b.** Recibir la prop en la firma del componente (con default `[]`):

```tsx
export function OrderEntryFields({ clients, products, initialValue, offers = [] }: OrderEntryFieldsProps) {
```

**2c.** Pasarla al preview. Reemplazar la línea del `<OrderConfirmationPreview ... />`
agregando la prop `offers={offers}` (mantener las demás props existentes tal cual):

```tsx
      <OrderConfirmationPreview
        address={selectedClient?.address ?? ""}
        businessName={selectedClient?.name ?? ""}
        deliveryDate={date}
        lines={calculatedLines
          .filter((line) => line.quantity > 0)
          .map((line) => ({ quantity: line.quantity, name: line.product.name }))}
        offers={offers}
        phone={selectedClient?.phone ?? ""}
        ready={Boolean(selectedClient) && calculatedLines.some((line) => line.quantity > 0)}
      />
```

- [ ] **Step 3: Selector de ofertas en `order-confirmation-preview.tsx`**

En `apps/web/src/app/orders/new/order-confirmation-preview.tsx`:

**3a.** Agregar `Select` al import de UI:

```tsx
import { Button, Field, Input, Select } from "@/components/ui";
```

**3b.** Agregar la prop al tipo `OrderConfirmationPreviewProps`:

```tsx
  offers: { id: string; title: string; description: string }[];
```

**3c.** Recibirla en la firma del componente. Reemplazar:

```tsx
export function OrderConfirmationPreview({
  businessName,
  phone,
  address,
  lines,
  deliveryDate,
  ready,
}: OrderConfirmationPreviewProps) {
```

por:

```tsx
export function OrderConfirmationPreview({
  businessName,
  phone,
  address,
  lines,
  deliveryDate,
  ready,
  offers,
}: OrderConfirmationPreviewProps) {
```

**3d.** Renderizar el selector JUSTO ANTES del `<Field htmlFor="order-offer" ...>` existente:

```tsx
      {offers.length > 0 ? (
        <Field htmlFor="offer-picker" label="Elegir oferta vigente">
          <Select
            id="offer-picker"
            value=""
            onChange={(event) => {
              const selected = offers.find((offer) => offer.id === event.target.value);
              if (selected) setOfferText(selected.description);
            }}
          >
            <option value="">— Elegir oferta —</option>
            {offers.map((offer) => (
              <option key={offer.id} value={offer.id}>
                {offer.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
```

(El campo de texto "Oferta (opcional)" sigue igual y editable; el selector solo lo rellena.)

- [ ] **Step 4: Lint + tests + compilación**

Desde `apps/web`:
- `npm run lint` → exit 0.
- `node --test scripts/static.test.mjs` → 12/12; `node --test scripts/order-confirmation.test.mjs` → 7/7.
- `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/orders/new` → 307/200, sin `⨯`.

- [ ] **Step 5: Verificación funcional + commit**

Login: en "Cargar pedido", con al menos una oferta activa creada, el panel de confirmación
muestra "Elegir oferta vigente"; al elegir una, su texto entra en el campo 💡 y en el mensaje.
El editor `/orders/[id]/edit` sigue funcionando (offers default `[]`, sin selector).

```bash
git add apps/web/src/app/orders/new/page.tsx apps/web/src/app/orders/new/order-entry-fields.tsx apps/web/src/app/orders/new/order-confirmation-preview.tsx
git commit -m "feat(comercial): seleccionar ofertas vigentes en la confirmacion de WhatsApp"
```
