# Gating de Ofertas por Punto de Equilibrio (Fase B.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En "Cargar pedido", habilitar la línea de oferta (selector + campo de texto) solo cuando la empresa alcanzó el punto de equilibrio del mes; si no, mostrar un aviso con el faltante.

**Architecture:** `orders/new/page.tsx` carga `getBreakEvenStatus(companyId, currentMonth())` (motor de B.1) y pasa `offersEnabled`/`offersRemaining` (y las ofertas solo si está alcanzado) a través de `OrderEntryFields` hasta `OrderConfirmationPreview`, que muestra u oculta la línea de oferta. Sin migración, sin lógica pura nueva.

**Tech Stack:** Next.js 16 (server component + client component), TypeScript.

## Global Constraints

- Se gatea TODA la línea de oferta (selector `<Select>` + campo "Oferta (opcional)").
- PE alcanzado = `getBreakEvenStatus(...).reached`; faltante = `.remaining`.
- Si no está alcanzado: no se envían ofertas al cliente (`offers = []`) y se muestra el aviso 🔒 con `formatCurrency(offersRemaining)`.
- `offersEnabled` en `OrderEntryFields` es opcional con default `true` (para no romper `/orders/[id]/edit`, que no computa PE y conserva su campo manual).
- No cambia la función pura `buildWhatsappConfirmation`. Con la línea oculta, `offerText` queda `""` → sin línea 💡.
- Tras los cambios, correr `node --test scripts/static.test.mjs` (12/12), `scripts/order-confirmation.test.mjs` (7/7), `scripts/month-range.test.mjs` (4/4).

## File Structure

- **Modify** `apps/web/src/app/orders/new/page.tsx` — cargar break-even, gatear ofertas.
- **Modify** `apps/web/src/app/orders/new/order-entry-fields.tsx` — threadear `offersEnabled`/`offersRemaining`.
- **Modify** `apps/web/src/app/orders/new/order-confirmation-preview.tsx` — mostrar/ocultar la línea de oferta + aviso.

---

### Task 1: Gating de la línea de oferta según punto de equilibrio

**Files:**
- Modify: `apps/web/src/app/orders/new/page.tsx`
- Modify: `apps/web/src/app/orders/new/order-entry-fields.tsx`
- Modify: `apps/web/src/app/orders/new/order-confirmation-preview.tsx`

**Interfaces:**
- Consumes: `getBreakEvenStatus(companyId, month): Promise<{ reached: boolean; remaining: number; ... }>` (`@/lib/profitability`), `currentMonth()` (`@/lib/month-range`), `formatCurrency` (`@/lib/format`).
- Produces: props `offersEnabled?: boolean` y `offersRemaining?: number` en `OrderEntryFields`; `offersEnabled: boolean` y `offersRemaining: number` en `OrderConfirmationPreview`.

- [ ] **Step 1: `orders/new/page.tsx` — cargar break-even y gatear ofertas**

Reemplazar los imports (líneas 1-9) para agregar `getBreakEvenStatus` y `currentMonth`:

```tsx
import { ModulePage } from "@/components/module-page";
import { createOrderAction } from "@/app/orders/new/actions";
import { OrderEntryFields } from "@/app/orders/new/order-entry-fields";
import { Button } from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { currentMonth } from "@/lib/month-range";
import { listActiveOffers } from "@/lib/offers";
import { getOrderFormData } from "@/lib/orders";
import { requirePagePermission } from "@/lib/page-auth";
import { getBreakEvenStatus } from "@/lib/profitability";
import { ORDERS_CREATE_PERMISSION } from "@/lib/route-auth";
```

Reemplazar la carga de datos:

```tsx
  const [formData, offers] = await Promise.all([
    getOrderFormData(session.companyId),
    listActiveOffers(session.companyId),
  ]);
```

por:

```tsx
  const [formData, offers, breakEven] = await Promise.all([
    getOrderFormData(session.companyId),
    listActiveOffers(session.companyId),
    getBreakEvenStatus(session.companyId, currentMonth()),
  ]);
```

Reemplazar el elemento `<OrderEntryFields ... />`:

```tsx
        <OrderEntryFields
          clients={formData.clients}
          offers={offers.map((offer) => ({ id: offer.id, title: offer.title, description: offer.description }))}
          products={formData.products}
        />
```

por:

```tsx
        <OrderEntryFields
          clients={formData.clients}
          offers={breakEven.reached ? offers.map((offer) => ({ id: offer.id, title: offer.title, description: offer.description })) : []}
          offersEnabled={breakEven.reached}
          offersRemaining={breakEven.remaining}
          products={formData.products}
        />
```

- [ ] **Step 2: `order-entry-fields.tsx` — threadear las props**

**2a.** Reemplazar el tipo `OrderEntryFieldsProps`:

```tsx
type OrderEntryFieldsProps = {
  clients: OrderFormClient[];
  products: OrderFormProduct[];
  initialValue?: OrderEntryInitialValue;
  offers?: { id: string; title: string; description: string }[];
};
```

por:

```tsx
type OrderEntryFieldsProps = {
  clients: OrderFormClient[];
  products: OrderFormProduct[];
  initialValue?: OrderEntryInitialValue;
  offers?: { id: string; title: string; description: string }[];
  offersEnabled?: boolean;
  offersRemaining?: number;
};
```

**2b.** Reemplazar la firma del componente:

```tsx
export function OrderEntryFields({ clients, products, initialValue, offers = [] }: OrderEntryFieldsProps) {
```

por:

```tsx
export function OrderEntryFields({
  clients,
  products,
  initialValue,
  offers = [],
  offersEnabled = true,
  offersRemaining = 0,
}: OrderEntryFieldsProps) {
```

**2c.** Reemplazar el elemento `<OrderConfirmationPreview ... />` (agregar dos props, mantener el resto):

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

por:

```tsx
      <OrderConfirmationPreview
        address={selectedClient?.address ?? ""}
        businessName={selectedClient?.name ?? ""}
        deliveryDate={date}
        lines={calculatedLines
          .filter((line) => line.quantity > 0)
          .map((line) => ({ quantity: line.quantity, name: line.product.name }))}
        offers={offers}
        offersEnabled={offersEnabled}
        offersRemaining={offersRemaining}
        phone={selectedClient?.phone ?? ""}
        ready={Boolean(selectedClient) && calculatedLines.some((line) => line.quantity > 0)}
      />
```

- [ ] **Step 3: `order-confirmation-preview.tsx` — mostrar/ocultar la línea de oferta**

**3a.** Agregar el import de `formatCurrency`. Reemplazar:

```tsx
import { Button, Field, Input, Select } from "@/components/ui";
import {
  buildWhatsappConfirmation,
  normalizePhoneForWhatsapp,
  type ConfirmationLine,
} from "@/lib/order-confirmation";
```

por:

```tsx
import { Button, Field, Input, Select } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import {
  buildWhatsappConfirmation,
  normalizePhoneForWhatsapp,
  type ConfirmationLine,
} from "@/lib/order-confirmation";
```

**3b.** Agregar las props al tipo. Reemplazar:

```tsx
type OrderConfirmationPreviewProps = {
  businessName: string;
  phone: string;
  address: string;
  lines: ConfirmationLine[];
  deliveryDate: string;
  ready: boolean;
  offers: { id: string; title: string; description: string }[];
};
```

por:

```tsx
type OrderConfirmationPreviewProps = {
  businessName: string;
  phone: string;
  address: string;
  lines: ConfirmationLine[];
  deliveryDate: string;
  ready: boolean;
  offers: { id: string; title: string; description: string }[];
  offersEnabled: boolean;
  offersRemaining: number;
};
```

**3c.** Recibir las props en la firma. Reemplazar:

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
  offersEnabled,
  offersRemaining,
}: OrderConfirmationPreviewProps) {
```

**3d.** Envolver el bloque de oferta con el gating. Reemplazar exactamente:

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

      <Field htmlFor="order-offer" label="Oferta (opcional)">
        <Input
          id="order-offer"
          placeholder="Ej: llevando 2 bobinas, la 2da 50% OFF"
          value={offerText}
          onChange={(event) => setOfferText(event.target.value)}
        />
      </Field>
```

por:

```tsx
      {offersEnabled ? (
        <>
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

          <Field htmlFor="order-offer" label="Oferta (opcional)">
            <Input
              id="order-offer"
              placeholder="Ej: llevando 2 bobinas, la 2da 50% OFF"
              value={offerText}
              onChange={(event) => setOfferText(event.target.value)}
            />
          </Field>
        </>
      ) : (
        <p className="erp-text-body-sm rounded-md border border-dashed border-[color:var(--border)] p-3 text-[color:var(--muted)]">
          🔒 Las ofertas se habilitan al alcanzar el punto de equilibrio del mes (faltan {formatCurrency(offersRemaining)}).
        </p>
      )}
```

- [ ] **Step 4: Lint + tests + compilación**

Desde `apps/web`:
- `npm run lint` → exit 0.
- `node --test scripts/static.test.mjs` → 12/12; `node --test scripts/order-confirmation.test.mjs` → 7/7; `node --test scripts/month-range.test.mjs` → 4/4.
- Dev server corriendo: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/orders/new` → 307/200; revisar el log del dev server, sin `⨯` para `orders/new`, `order-entry-fields`, `order-confirmation-preview`.

(La verificación funcional autenticada — estado bloqueado vs habilitado según el PE — la hace el controlador.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/orders/new/page.tsx apps/web/src/app/orders/new/order-entry-fields.tsx apps/web/src/app/orders/new/order-confirmation-preview.tsx
git commit -m "feat(comercial): gatear ofertas por punto de equilibrio en Cargar pedido"
```

---

## Verificación funcional (controlador)

Login `ftrdistribuciones@gmail.com`:
1. Con el costo de $850k cargado en el mes actual (PE **no** alcanzado): "Cargar pedido" muestra el aviso 🔒 "Las ofertas se habilitan..." con el faltante, y NO muestra el selector ni el campo "Oferta (opcional)".
2. Borrar temporalmente ese costo (o vía `/rentabilidad`) → `fixedCosts = 0` → `reached = true` → recargar "Cargar pedido": reaparecen el selector de ofertas vigentes y el campo de texto.
