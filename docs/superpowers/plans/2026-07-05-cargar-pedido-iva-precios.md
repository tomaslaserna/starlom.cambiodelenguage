# Cargar pedido: IVA visual y precios en el mensaje — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplanar "Ventas" en el menú, agregar un selector de IVA visual (Sin IVA / 21% / 10.5%) en Cargar pedido y un toggle opcional para mostrar precios por línea + resumen en el mensaje de WhatsApp.

**Architecture:** Toda la lógica de IVA/precios del mensaje vive en la función pura `lib/order-confirmation.ts` (testeable, sin React ni DB). El form `order-entry-fields.tsx` maneja el estado del IVA (solo UI, no persiste) y le pasa las líneas con precio al preview. El preview `order-confirmation-preview.tsx` agrega el toggle "Mostrar precios" y arma el mensaje. El menú se aplana en `lib/navigation.ts`.

**Tech Stack:** Next.js App Router (client components), tests estáticos con `node --test` (pattern-matching sobre el fuente).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-05-cargar-pedido-iva-precios-design.md`.
- Sin cambios de base de datos ni del cálculo fiscal. El IVA es solo visual/mensaje; el pedido se sigue guardando en neto.
- El mensaje con `showPrices` apagado debe quedar **idéntico al actual** (regresión cero).
- IVA 10.5% se implementa como tasa directa `10.5`, no como "21/2".
- Textos de UI sin tildes en identificadores nuevos si el archivo vecino los evita; el mensaje de WhatsApp sí usa tildes (es cara al cliente), siguiendo el estilo actual de `order-confirmation.ts`.
- Tras cada tarea: `node --test scripts/static.test.mjs` (desde `apps/web`), `npx tsc --noEmit -p .` (limpio), `npx eslint <archivos tocados>`.
- Commits con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Aplanar "Ventas" en el menú

**Files:**
- Modify: `apps/web/src/lib/navigation.ts`
- Test: `apps/web/scripts/static.test.mjs:229-241`

**Interfaces:**
- Produces: grupo de navegación de link directo `{ href: "/sales", label: "Registro de ventas", active: "sales", permission: SALES_READ_PERMISSION }`, referenciado en la sección "Comercial" vía `groupByLabel("Registro de ventas")`.

- [ ] **Step 1: Update the assertions to expect the flattened menu (will fail)**

En `apps/web/scripts/static.test.mjs`, reemplazar la línea 231 (dentro del `assert.match` de "Comercial"):
```js
    /label: "Comercial"[\s\S]*groupByLabel\("Pedidos"\)[\s\S]*groupByLabel\("Registro de ventas"\)[\s\S]*groupByLabel\("Presupuestos"\)[\s\S]*groupByLabel\("Facturacion"\)/,
```
Y reemplazar la línea 241:
```js
  assert.match(navigation, /href: "\/sales",\s*label: "Registro de ventas",\s*active: "sales"/);
```

- [ ] **Step 2: Run tests to verify the navigation test fails**

Run (desde `apps/web`): `node --test scripts/static.test.mjs`
Expected: FAIL en el test que lee navegación (aún existe el grupo `label: "Ventas"` con items y la sección usa `groupByLabel("Ventas")`).

- [ ] **Step 3: Flatten the Ventas group in navigation.ts**

En `apps/web/src/lib/navigation.ts`, reemplazar el grupo:
```ts
  {
    label: "Ventas",
    active: "sales",
    items: [
      { href: "/sales", label: "Registro de ventas", active: "sales", permission: SALES_READ_PERMISSION },
    ],
  },
```
por:
```ts
  {
    href: "/sales",
    label: "Registro de ventas",
    active: "sales",
    permission: SALES_READ_PERMISSION,
  },
```

En `navigationSections`, sección "Comercial", reemplazar `groupByLabel("Ventas")` por `groupByLabel("Registro de ventas")`:
```ts
  {
    label: "Comercial",
    groups: [
      groupByLabel("Pedidos"),
      groupByLabel("Registro de ventas"),
      groupByLabel("Presupuestos"),
      groupByLabel("Facturacion"),
    ],
  },
```

- [ ] **Step 4: Run the full suite + type-check + lint**

Run (desde `apps/web`):
- `node --test scripts/static.test.mjs` → todos PASS.
- `npx tsc --noEmit -p .` → limpio.
- `npx eslint src/lib/navigation.ts` → sin salida.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/navigation.ts apps/web/scripts/static.test.mjs
git commit -m "feat: flatten Ventas menu group into Registro de ventas"
```

### Task 2: Lógica de IVA y precios en el mensaje (lib puro)

**Files:**
- Modify: `apps/web/src/lib/order-confirmation.ts`
- Test: `apps/web/scripts/static.test.mjs` (nuevo bloque `test(...)`)

**Interfaces:**
- Produces:
  - `export type IvaRate = 0 | 21 | 10.5;`
  - `export type ConfirmationPricedLine = { quantity: number; name: string; unitPrice: number; subtotal: number };`
  - `export function ivaAmount(net: number, rate: IvaRate): number`
  - `export function formatConfirmationMoney(value: number): string`
  - `ConfirmationInput` extendido con `showPrices?: boolean`, `pricedLines?: ConfirmationPricedLine[]`, `ivaRate?: IvaRate`.

- [ ] **Step 1: Write the failing static test**

En `apps/web/scripts/static.test.mjs`, agregar al final del archivo un bloque `test(...)` independiente:
```js
test("order confirmation message supports optional prices and iva", () => {
  const oc = read("apps/web/src/lib/order-confirmation.ts");
  assert.match(oc, /export type IvaRate = 0 \| 21 \| 10\.5/);
  assert.match(oc, /export function ivaAmount/);
  assert.match(oc, /export type ConfirmationPricedLine/);
  assert.match(oc, /showPrices/);
  assert.match(oc, /pricedLines/);
  assert.match(oc, /ivaRate/);
});
```

- [ ] **Step 2: Run tests to verify the new test fails**

Run (desde `apps/web`): `node --test scripts/static.test.mjs`
Expected: FAIL solo el bloque nuevo (los símbolos no existen aún).

- [ ] **Step 3: Extend order-confirmation.ts**

En `apps/web/src/lib/order-confirmation.ts`, reemplazar el tipo `ConfirmationInput` (líneas 6-12) por:
```ts
export type IvaRate = 0 | 21 | 10.5;

export type ConfirmationPricedLine = {
  quantity: number;
  name: string;
  unitPrice: number;
  subtotal: number;
};

export type ConfirmationInput = {
  businessName: string;
  lines: ConfirmationLine[];
  deliveryLocation: string;
  deliveryDate: string; // YYYY-MM-DD
  offerText?: string;
  showPrices?: boolean;
  pricedLines?: ConfirmationPricedLine[];
  ivaRate?: IvaRate;
};
```

Agregar los helpers después de `formatConfirmationQuantity` (después de la línea 27):
```ts
export function ivaAmount(net: number, rate: IvaRate): number {
  return Math.round((net * (rate / 100) + Number.EPSILON) * 100) / 100;
}

export function formatConfirmationMoney(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `$${safe.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
```

Reemplazar `buildWhatsappConfirmation` (líneas 46-71) por:
```ts
export function buildWhatsappConfirmation(input: ConfirmationInput): string {
  const priced = input.pricedLines ?? [];
  const showPrices = Boolean(input.showPrices && priced.length > 0);

  const items = showPrices
    ? priced
        .map(
          (line) =>
            `• ${formatConfirmationQuantity(line.quantity)} x ${line.name} — ${formatConfirmationMoney(line.unitPrice)} (subtotal ${formatConfirmationMoney(line.subtotal)})`,
        )
        .join("\n")
    : input.lines
        .map((line) => `• ${formatConfirmationQuantity(line.quantity)} x ${line.name}`)
        .join("\n");

  const parts = [
    "*CONFIRMACIÓN DE TU PEDIDO – STARLIM* ✅",
    "",
    `*${input.businessName}*, te confirmamos antes de preparar:`,
    "",
    "*Pedido:*",
    items,
  ];

  if (showPrices) {
    const net = priced.reduce((sum, line) => sum + line.subtotal, 0);
    const rate = input.ivaRate ?? 0;
    const iva = ivaAmount(net, rate);
    parts.push("", `*Subtotal:* ${formatConfirmationMoney(net)}`);
    if (rate > 0) {
      parts.push(`*IVA (${rate}%):* ${formatConfirmationMoney(iva)}`);
    }
    parts.push(`*Total:* ${formatConfirmationMoney(net + iva)}`);
  }

  parts.push(
    "",
    `🚚 *Entrega:* ${input.deliveryLocation}`,
    `📅 *Entrega estimada:* ${formatDeliveryDate(input.deliveryDate)}`,
    "",
    "¿Está todo correcto? Respondé *SÍ* para confirmar, o decinos qué corregir.",
  );

  const offer = (input.offerText ?? "").trim();
  if (offer) {
    parts.push("", `💡 ${offer}`);
  }

  return parts.join("\n");
}
```

- [ ] **Step 4: Run the full suite + type-check + lint**

Run (desde `apps/web`):
- `node --test scripts/static.test.mjs` → todos PASS.
- `npx tsc --noEmit -p .` → limpio.
- `npx eslint src/lib/order-confirmation.ts` → sin salida.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/order-confirmation.ts apps/web/scripts/static.test.mjs
git commit -m "feat: support optional prices and iva in whatsapp confirmation builder"
```

### Task 3: Selector de IVA en el form y toggle de precios en el preview

**Files:**
- Modify: `apps/web/src/app/orders/new/order-entry-fields.tsx`
- Modify: `apps/web/src/app/orders/new/order-confirmation-preview.tsx`
- Test: `apps/web/scripts/static.test.mjs` (nuevo bloque `test(...)`)

**Interfaces:**
- Consumes de Task 2: `IvaRate`, `ivaAmount`, `ConfirmationPricedLine`.
- Produces: `OrderConfirmationPreview` recibe props nuevas `pricedLines: ConfirmationPricedLine[]` e `ivaRate: IvaRate`.

- [ ] **Step 1: Write the failing static test**

En `apps/web/scripts/static.test.mjs`, agregar al final:
```js
test("cargar pedido exposes iva selector and price message toggle", () => {
  const fields = read("apps/web/src/app/orders/new/order-entry-fields.tsx");
  assert.match(fields, /ivaRate/);
  assert.match(fields, /Subtotal neto/);
  assert.match(fields, /Sin IVA/);
  assert.match(fields, /value="10.5"/);
  assert.match(fields, /pricedLines/);

  const preview = read("apps/web/src/app/orders/new/order-confirmation-preview.tsx");
  assert.match(preview, /Mostrar precios/);
  assert.match(preview, /showPrices/);
  assert.match(preview, /ivaRate/);
});
```

- [ ] **Step 2: Run tests to verify the new test fails**

Run (desde `apps/web`): `node --test scripts/static.test.mjs`
Expected: FAIL solo el bloque nuevo.

- [ ] **Step 3: Add the IVA selector and pricedLines in order-entry-fields.tsx**

En `apps/web/src/app/orders/new/order-entry-fields.tsx`:

3a. Extender el import de `@/lib/order-confirmation` (no existe hoy en este archivo). Agregar junto a los imports superiores:
```ts
import { ivaAmount, type IvaRate } from "@/lib/order-confirmation";
```

3b. Después de `const [documentOverride, setDocumentOverride] = useState(...)` (línea 68), agregar:
```ts
  const [ivaRate, setIvaRate] = useState<IvaRate>(0);
```

3c. Después de `const totalAmount = calculatedLines.reduce(...)` (línea 98), agregar:
```ts
  const ivaValue = ivaAmount(totalAmount, ivaRate);
  const totalWithIva = totalAmount + ivaValue;
  const pricedLines = calculatedLines
    .filter((line) => line.quantity > 0)
    .map((line) => ({
      quantity: line.quantity,
      name: line.product.name,
      unitPrice: line.unitPrice,
      subtotal: line.subtotal,
    }));
```

3d. Reemplazar el bloque de totales (el `<div className="rounded-lg border ... bg-white p-4">` con "Subtotal productos"/"Total", líneas 363-376) por:
```tsx
        <div className="rounded-lg border border-[color:var(--border)] bg-white p-4">
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <span className="erp-text-body-sm text-[color:var(--muted)]">Subtotal neto</span>
              <span className="font-mono font-bold">{formatCurrency(totalAmount)}</span>
            </div>
            <Field htmlFor="order-iva" label="IVA (visual)">
              <Select
                id="order-iva"
                value={String(ivaRate)}
                onChange={(event) => setIvaRate(Number(event.target.value) as IvaRate)}
              >
                <option value="0">Sin IVA</option>
                <option value="21">21%</option>
                <option value="10.5">10.5%</option>
              </Select>
            </Field>
            {ivaRate > 0 ? (
              <div className="flex items-center justify-between">
                <span className="erp-text-body-sm text-[color:var(--muted)]">IVA ({ivaRate}%)</span>
                <span className="font-mono font-bold">{formatCurrency(ivaValue)}</span>
              </div>
            ) : null}
            <div className="border-t border-[color:var(--border)] pt-3">
              <div className="flex items-center justify-between">
                <span className="erp-text-body font-black">Total</span>
                <span className="font-mono text-xl font-black">{formatCurrency(totalWithIva)}</span>
              </div>
            </div>
          </div>
        </div>
```

3e. En el `<OrderConfirmationPreview ... />` (líneas 379-391), agregar dos props junto a las existentes:
```tsx
        ivaRate={ivaRate}
        pricedLines={pricedLines}
```

- [ ] **Step 4: Wire the toggle in order-confirmation-preview.tsx**

En `apps/web/src/app/orders/new/order-confirmation-preview.tsx`:

4a. Extender el import de `@/lib/order-confirmation` (líneas 6-10) para incluir los tipos nuevos:
```ts
import {
  buildWhatsappConfirmation,
  normalizePhoneForWhatsapp,
  type ConfirmationLine,
  type ConfirmationPricedLine,
  type IvaRate,
} from "@/lib/order-confirmation";
```

4b. Agregar a `OrderConfirmationPreviewProps` (después de `lines: ConfirmationLine[];`):
```ts
  pricedLines: ConfirmationPricedLine[];
  ivaRate: IvaRate;
```

4c. Agregar `pricedLines` e `ivaRate` a los parámetros desestructurados de la función `OrderConfirmationPreview({ ... })`.

4d. Agregar el estado del toggle junto a `const [offerText, setOfferText] = useState("");`:
```ts
  const [showPrices, setShowPrices] = useState(false);
```

4e. Reemplazar el `useMemo` del `message` (líneas 39-49) por:
```tsx
  const message = useMemo(
    () =>
      buildWhatsappConfirmation({
        businessName,
        lines,
        deliveryLocation: address,
        deliveryDate,
        offerText,
        showPrices,
        pricedLines,
        ivaRate,
      }),
    [businessName, lines, address, deliveryDate, offerText, showPrices, pricedLines, ivaRate],
  );
```

4f. Agregar el toggle antes del bloque `{ready ? (<pre>...` (antes de la línea 107). Insertar:
```tsx
      <label className="erp-text-body-sm flex items-center gap-2 font-medium">
        <input
          checked={showPrices}
          onChange={(event) => setShowPrices(event.target.checked)}
          type="checkbox"
        />
        Mostrar precios al cliente
      </label>
```

- [ ] **Step 5: Run the full suite + type-check + lint**

Run (desde `apps/web`):
- `node --test scripts/static.test.mjs` → todos PASS.
- `npx tsc --noEmit -p .` → limpio.
- `npx eslint src/app/orders/new/order-entry-fields.tsx src/app/orders/new/order-confirmation-preview.tsx` → sin salida.

- [ ] **Step 6: Verify in the local preview**

Con el server en `localhost:3000`: entrar a Cargar pedido, elegir cliente y agregar un producto; cambiar el selector IVA a 21% y verificar que el bloque muestra Subtotal neto / IVA (21%) / Total; activar "Mostrar precios al cliente" y verificar que el mensaje de WhatsApp incluye precio por línea y el resumen. Apagar el toggle y confirmar que el mensaje vuelve a ser el actual.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/orders/new/order-entry-fields.tsx apps/web/src/app/orders/new/order-confirmation-preview.tsx apps/web/scripts/static.test.mjs
git commit -m "feat: iva selector and optional customer prices in cargar pedido"
```
