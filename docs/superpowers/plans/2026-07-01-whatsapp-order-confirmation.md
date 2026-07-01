# WhatsApp Order Confirmation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el comercial vea en vivo, dentro de "Cargar pedido", la confirmación del pedido formateada para WhatsApp, con botones Copiar y Abrir en WhatsApp.

**Architecture:** Una función pura en `src/lib/order-confirmation.ts` arma el texto a partir de los datos del pedido; un componente cliente `OrderConfirmationPreview` la consume y la muestra en vivo dentro de `OrderEntryFields`. Sin backend nuevo ni cambios de base de datos.

**Tech Stack:** Next.js 16 (React 19, client components), TypeScript, `node --test` (Node 24 type-stripping para importar `.ts` desde tests `.mjs`), Tailwind v4.

## Global Constraints

- Formato de negrita: WhatsApp nativo con **un** asterisco (`*texto*`), nunca `**`.
- `src/lib/order-confirmation.ts` NO debe importar nada con alias `@/` ni usar sintaxis TS no borrable (sin `enum`, sin `namespace`) — así Node puede type-stripearlo en los tests.
- Los tests `.mjs` importan el módulo con la extensión explícita `.ts`.
- Sin cambios de base de datos. Sin persistencia del texto.
- Fecha de entrega en formato `DD.MM.YY (DíaSemana)`, día en español capitalizado.
- Reusar componentes existentes de `@/components/ui` (`Button`, `Field`, `Input`).

## File Structure

- **Create** `apps/web/src/lib/order-confirmation.ts` — lógica pura: `buildWhatsappConfirmation`, `normalizePhoneForWhatsapp`, `formatDeliveryDate`, `formatConfirmationQuantity`, tipos. Sin React ni DB.
- **Create** `apps/web/scripts/order-confirmation.test.mjs` — tests unitarios de la lógica pura.
- **Create** `apps/web/src/app/orders/new/order-confirmation-preview.tsx` — componente cliente de vista previa + botones + campo oferta.
- **Modify** `apps/web/src/app/orders/new/order-entry-fields.tsx` — montar el preview, renombrar label de fecha a "Fecha de entrega".

---

### Task 1: Lógica pura de confirmación + tests

**Files:**
- Create: `apps/web/src/lib/order-confirmation.ts`
- Test: `apps/web/scripts/order-confirmation.test.mjs`

**Interfaces:**
- Consumes: nada (módulo autocontenido).
- Produces:
  - `type ConfirmationLine = { quantity: number; name: string }`
  - `type ConfirmationInput = { businessName: string; lines: ConfirmationLine[]; deliveryLocation: string; deliveryDate: string; offerText?: string }`
  - `buildWhatsappConfirmation(input: ConfirmationInput): string`
  - `normalizePhoneForWhatsapp(phone: string): string | null`
  - `formatDeliveryDate(iso: string): string`
  - `formatConfirmationQuantity(value: number): string`

- [ ] **Step 1: Escribir el test que falla**

Create `apps/web/scripts/order-confirmation.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildWhatsappConfirmation,
  formatDeliveryDate,
  normalizePhoneForWhatsapp,
} from "../src/lib/order-confirmation.ts";

const baseInput = {
  businessName: "EL HORNITO SANTIAGUEÑO – POETA",
  lines: [
    { quantity: 1, name: "HIPOCLORITO DE SODIO 33GR/L X 5 LTS" },
    { quantity: 3, name: "DESOD. P/PISOS ARPEGE X 5 LTS" },
  ],
  deliveryLocation: "Poeta",
  deliveryDate: "2026-06-30",
};

test("encabezado, cliente y una linea por producto", () => {
  const text = buildWhatsappConfirmation(baseInput);
  assert.match(text, /^\*CONFIRMACIÓN DE TU PEDIDO – STARLIM\* ✅/);
  assert.ok(text.includes("*EL HORNITO SANTIAGUEÑO – POETA*, te confirmamos antes de preparar:"));
  assert.ok(text.includes("• 1 x HIPOCLORITO DE SODIO 33GR/L X 5 LTS"));
  assert.ok(text.includes("• 3 x DESOD. P/PISOS ARPEGE X 5 LTS"));
  assert.ok(text.includes("🚚 *Entrega:* Poeta"));
  assert.ok(text.includes("📅 *Entrega estimada:* 30.06.26 (Martes)"));
  assert.ok(text.includes("Respondé *SÍ* para confirmar"));
});

test("sin offerText no agrega linea de oferta", () => {
  assert.ok(!buildWhatsappConfirmation(baseInput).includes("💡"));
});

test("con offerText agrega la linea de oferta", () => {
  const text = buildWhatsappConfirmation({ ...baseInput, offerText: "2da unidad 50% OFF" });
  assert.ok(text.includes("💡 2da unidad 50% OFF"));
});

test("formatDeliveryDate: DD.MM.YY con dia en espanol", () => {
  assert.equal(formatDeliveryDate("2026-06-30"), "30.06.26 (Martes)");
  assert.equal(formatDeliveryDate(""), "");
});

test("normalizePhoneForWhatsapp normaliza y valida", () => {
  assert.equal(normalizePhoneForWhatsapp("3855 123-456"), "543855123456");
  assert.equal(normalizePhoneForWhatsapp("+54 385 5123456"), "543855123456");
  assert.equal(normalizePhoneForWhatsapp("123"), null);
  assert.equal(normalizePhoneForWhatsapp(""), null);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run (desde `apps/web`): `node --test scripts/order-confirmation.test.mjs`
Expected: FALLA — error de resolución de módulo (`Cannot find module '../src/lib/order-confirmation.ts'`), porque el archivo aún no existe.

- [ ] **Step 3: Implementar el módulo**

Create `apps/web/src/lib/order-confirmation.ts`:

```ts
export type ConfirmationLine = {
  quantity: number;
  name: string;
};

export type ConfirmationInput = {
  businessName: string;
  lines: ConfirmationLine[];
  deliveryLocation: string;
  deliveryDate: string; // YYYY-MM-DD
  offerText?: string;
};

const DAYS_ES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

export function formatConfirmationQuantity(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

export function formatDeliveryDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  if (!match) return "";
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const dayName = DAYS_ES[date.getDay()];
  return `${day}.${month}.${year.slice(2)} (${dayName})`;
}

export function normalizePhoneForWhatsapp(phone: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length < 8) return null;
  return digits.startsWith("54") ? digits : `54${digits}`;
}

export function buildWhatsappConfirmation(input: ConfirmationInput): string {
  const items = input.lines
    .map((line) => `• ${formatConfirmationQuantity(line.quantity)} x ${line.name}`)
    .join("\n");

  const parts = [
    "*CONFIRMACIÓN DE TU PEDIDO – STARLIM* ✅",
    "",
    `*${input.businessName}*, te confirmamos antes de preparar:`,
    "",
    "*Pedido:*",
    items,
    "",
    `🚚 *Entrega:* ${input.deliveryLocation}`,
    `📅 *Entrega estimada:* ${formatDeliveryDate(input.deliveryDate)}`,
    "",
    "¿Está todo correcto? Respondé *SÍ* para confirmar, o decinos qué corregir.",
  ];

  const offer = (input.offerText ?? "").trim();
  if (offer) {
    parts.push("", `💡 ${offer}`);
  }

  return parts.join("\n");
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run (desde `apps/web`): `node --test scripts/order-confirmation.test.mjs`
Expected: PASS — `tests 5`, `pass 5`, `fail 0`. (Puede aparecer un warning `MODULE_TYPELESS_PACKAGE_JSON`; es inofensivo.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/order-confirmation.ts apps/web/scripts/order-confirmation.test.mjs
git commit -m "feat(comercial): logica pura de confirmacion WhatsApp con tests"
```

---

### Task 2: Componente de vista previa + integración en Cargar pedido

**Files:**
- Create: `apps/web/src/app/orders/new/order-confirmation-preview.tsx`
- Modify: `apps/web/src/app/orders/new/order-entry-fields.tsx`

**Interfaces:**
- Consumes de Task 1: `buildWhatsappConfirmation`, `normalizePhoneForWhatsapp`, `type ConfirmationLine` desde `@/lib/order-confirmation`.
- Produces: componente `OrderConfirmationPreview` con props `{ businessName: string; phone: string; address: string; lines: ConfirmationLine[]; deliveryDate: string; ready: boolean }`.

- [ ] **Step 1: Crear el componente de preview**

Create `apps/web/src/app/orders/new/order-confirmation-preview.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import {
  buildWhatsappConfirmation,
  normalizePhoneForWhatsapp,
  type ConfirmationLine,
} from "@/lib/order-confirmation";

type OrderConfirmationPreviewProps = {
  businessName: string;
  phone: string;
  address: string;
  lines: ConfirmationLine[];
  deliveryDate: string;
  ready: boolean;
};

export function OrderConfirmationPreview({
  businessName,
  phone,
  address,
  lines,
  deliveryDate,
  ready,
}: OrderConfirmationPreviewProps) {
  const [offerText, setOfferText] = useState("");
  const [copied, setCopied] = useState(false);

  const message = useMemo(
    () =>
      buildWhatsappConfirmation({
        businessName,
        lines,
        deliveryLocation: address,
        deliveryDate,
        offerText,
      }),
    [businessName, lines, address, deliveryDate, offerText],
  );

  const waPhone = normalizePhoneForWhatsapp(phone);
  const waUrl = ready && waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}` : null;

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border border-[color:var(--border)] bg-white p-4">
      <h3 className="erp-text-body font-black">Confirmación para WhatsApp</h3>

      <Field htmlFor="order-offer" label="Oferta (opcional)">
        <Input
          id="order-offer"
          placeholder="Ej: llevando 2 bobinas, la 2da 50% OFF"
          value={offerText}
          onChange={(event) => setOfferText(event.target.value)}
        />
      </Field>

      {ready ? (
        <pre className="erp-text-body-sm max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-3 font-sans">
          {message}
        </pre>
      ) : (
        <p className="erp-text-body-sm rounded-md border border-dashed border-[color:var(--border)] p-3 text-[color:var(--muted)]">
          Seleccioná un cliente y agregá productos para ver la confirmación.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button disabled={!ready} type="button" variant="secondary" onClick={copyMessage}>
          {copied ? "Copiado ✓" : "📋 Copiar"}
        </Button>
        {waUrl ? (
          <a
            className="inline-flex min-h-10 items-center rounded-[10px] bg-[#25D366] px-4 font-semibold text-white hover:brightness-95"
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            🟢 Abrir en WhatsApp
          </a>
        ) : (
          <Button
            disabled
            title={ready ? "Cliente sin teléfono válido" : "Completá cliente y productos"}
            type="button"
            variant="secondary"
          >
            🟢 Abrir en WhatsApp
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Montar el preview y renombrar la fecha en `order-entry-fields.tsx`**

En `apps/web/src/app/orders/new/order-entry-fields.tsx`:

**2a.** Agregar el import (junto a los imports existentes de tipos/orders):

```tsx
import { OrderConfirmationPreview } from "@/app/orders/new/order-confirmation-preview";
```

**2b.** Renombrar el label del campo de fecha. Cambiar:

```tsx
        <Field htmlFor="order-date" label="Fecha">
```

por:

```tsx
        <Field htmlFor="order-date" label="Fecha de entrega">
```

**2c.** Montar el preview como último hijo del `<div className="grid gap-4">` que envuelve todo el return. Insertar, justo antes del cierre de ese div (después del bloque de totales que termina en `</div>` de `grid gap-4 xl:grid-cols-[minmax(260px,1fr)_320px]`):

```tsx
      <OrderConfirmationPreview
        address={selectedClient?.address ?? ""}
        businessName={selectedClient?.name ?? ""}
        deliveryDate={date}
        lines={calculatedLines.map((line) => ({ quantity: line.quantity, name: line.product.name }))}
        phone={selectedClient?.phone ?? ""}
        ready={Boolean(selectedClient) && calculatedLines.length > 0}
      />
```

- [ ] **Step 3: Verificar lint y compilación**

Run (desde `apps/web`): `npm run lint`
Expected: sin errores (exit 0). Si eslint reporta orden de imports o props, corregir según su indicación y re-correr.

Luego, con el dev server corriendo (`npm run dev`), forzar compilación de la ruta:
Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/orders/new`
Expected: `307` (redirige a login) o `200`, y en el log del dev server NO debe aparecer `⨯` ni errores de compilación para `orders/new` ni `order-confirmation-preview`.

- [ ] **Step 4: Verificación manual en la app**

Con sesión iniciada (`ftrdistribuciones@gmail.com` / `Starlim2026!`):
1. Ir a **Comercial › Pedidos › Cargar pedido**.
2. El panel "Confirmación para WhatsApp" muestra el texto guía (sin cliente).
3. Seleccionar un cliente y agregar 1+ productos → el panel muestra la confirmación armada, con el nombre del cliente, las líneas `• cant x producto`, la dirección en 🚚 Entrega y la fecha en 📅 Entrega estimada.
4. Escribir algo en "Oferta (opcional)" → aparece la línea `💡` al final.
5. Click **📋 Copiar** → cambia a "Copiado ✓"; pegar en un editor confirma el texto.
6. Click **🟢 Abrir en WhatsApp** → abre `wa.me` con el mensaje precargado (si el cliente tiene teléfono válido; si no, el botón está deshabilitado).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/orders/new/order-confirmation-preview.tsx apps/web/src/app/orders/new/order-entry-fields.tsx
git commit -m "feat(comercial): vista previa de confirmacion WhatsApp en Cargar pedido"
```

---

## Notas de ejecución

- Estamos sobre la rama `main` (de Tomás) con cambios locales sin commitear (navegación + specs). Antes de ejecutar, confirmar con el usuario si se crea una rama (`feat/whatsapp-order-confirmation`) o se sigue sobre `main`. No pushear sin OK del usuario.
- El dev server ya corre en `http://localhost:3000` conectado a la base nueva.
