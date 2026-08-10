# Flujo de comprobantes del pedido — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar los comprobantes del movimiento de stock: al cargar/aprobar un pedido se emite un REMITO SIN PRECIOS (comercial, on-demand), una 2ª copia para el chofer al despachar, y recién al final se decide FACTURA (con datos fiscales) o REMITO CON PRECIOS, descontando stock.

**Architecture:** Enfoque A — el remito comercial se renderiza on-demand desde `sales`/`sale_items` (nuevo `buildOrderRemitoPdf`), sin registro `delivery_documents` nuevo. Usa el número comercial del pedido. El paso final reusa el flujo confirmar→entregado existente (descuento de stock) y gatea la factura con un helper puro `hasCompleteFiscalData`.

**Tech Stack:** Next.js 16 App Router (route handlers), TypeScript, `pg` vía `queryWithCompanyContext`, PDFKit vía `createPdfFile`/`pdf.*` helpers, node:test (guardrails estáticos + funciones puras).

## Global Constraints

- Next.js 16: leer `node_modules/next/dist/docs/` antes de tocar convenciones nuevas de rutas. Los route handlers usan `export const runtime = "nodejs"` y `context.params` es `Promise`.
- Permisos: los PDFs de pedido usan `requireApiSession([{ resource: "pedidos", action: "ver" }])`.
- Multiempresa: toda query pasa por `queryWithCompanyContext(companyId, sql, params)` con filtro `empresa_id = $N`.
- El remito comercial NO toca stock ni crea `delivery_documents`. El stock se descuenta solo en `entregado` (flujo existente).
- Tests del repo: `npm test` corre guardrails estáticos (`static.test.mjs`) y de dominio (`domain-behavior.test.mjs`). No hay tests de integración con DB; las rutas/PDF se cubren con guardrails estáticos y las funciones puras con `domain-behavior`.
- "Datos fiscales completos" = `tax_id` con ≥ 8 dígitos numéricos **y** `fiscal_condition` no vacío.

---

## File Structure

- Create: `apps/web/src/lib/client-fiscal.ts` — helper puro `hasCompleteFiscalData`.
- Modify: `apps/web/src/lib/pdf/documents.ts` — nuevo `buildOrderRemitoPdf`.
- Create: `apps/web/src/app/api/pdfs/orders/[id]/remito/route.ts` — ruta del remito comercial.
- Modify: `apps/web/src/app/orders/page.tsx` — botones de comprobante por estado + gating fiscal.
- Modify: `apps/web/src/app/quotes/actions.ts` — aprobar deja el pedido en `cargado` con el remito disponible (sin delivery valorizado ni redirect a `/billing`).
- Modify: `apps/web/scripts/static.test.mjs` — guardrails del flujo.
- Modify: `apps/web/scripts/domain-behavior.test.mjs` — unit test de `hasCompleteFiscalData`.

---

## Task 1: Helper puro `hasCompleteFiscalData`

**Files:**
- Create: `apps/web/src/lib/client-fiscal.ts`
- Test: `apps/web/scripts/domain-behavior.test.mjs`

**Interfaces:**
- Produces: `export type ClientFiscalData = { taxId?: string | null; fiscalCondition?: string | null }` y `export function hasCompleteFiscalData(client: ClientFiscalData): boolean`.

- [ ] **Step 1: Write the failing test**

En `apps/web/scripts/domain-behavior.test.mjs`, cerca de los otros `loadTypeScriptModule` del tope, agregá el import del módulo (tras la línea de `saleCommercialCode`):

```js
const clientFiscal = loadTypeScriptModule("../src/lib/client-fiscal.ts");
```

Y al final del archivo agregá el bloque de test:

```js
test("hasCompleteFiscalData gates fiscal invoices on CUIT + condición fiscal", () => {
  const { hasCompleteFiscalData } = clientFiscal;
  assert.equal(
    hasCompleteFiscalData({ taxId: "20-12345678-3", fiscalCondition: "Responsable Inscripto" }),
    true,
  );
  assert.equal(hasCompleteFiscalData({ taxId: "20123456783", fiscalCondition: "Monotributo" }), true);
  assert.equal(hasCompleteFiscalData({ taxId: "", fiscalCondition: "Responsable Inscripto" }), false);
  assert.equal(hasCompleteFiscalData({ taxId: "20-12345678-3", fiscalCondition: "" }), false);
  assert.equal(hasCompleteFiscalData({ taxId: "123", fiscalCondition: "Monotributo" }), false);
  assert.equal(hasCompleteFiscalData({ taxId: null, fiscalCondition: null }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && node --test --test-name-pattern="hasCompleteFiscalData" scripts/domain-behavior.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/client-fiscal.ts'` (o `hasCompleteFiscalData is not a function`).

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/lib/client-fiscal.ts`:

```ts
export type ClientFiscalData = {
  taxId?: string | null;
  fiscalCondition?: string | null;
};

// Un cliente puede recibir factura fiscal solo si tiene CUIT/DNI (>= 8 dígitos) y
// una condición fiscal declarada. Sin ambos, el paso final ofrece solo remito con precios.
export function hasCompleteFiscalData(client: ClientFiscalData): boolean {
  const taxIdDigits = (client.taxId ?? "").replace(/[^0-9]/g, "");
  const fiscalCondition = (client.fiscalCondition ?? "").trim();
  return taxIdDigits.length >= 8 && fiscalCondition.length > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && node --test --test-name-pattern="hasCompleteFiscalData" scripts/domain-behavior.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/client-fiscal.ts apps/web/scripts/domain-behavior.test.mjs
git commit -m "feat: hasCompleteFiscalData helper gating fiscal invoices"
```

---

## Task 2: Builder `buildOrderRemitoPdf`

**Files:**
- Modify: `apps/web/src/lib/pdf/documents.ts` (agregar función; imports ya presentes: `createPdfFile`, `pdfDate`, `pdfMoney`, `pdfNumber`, `safeFilename`, `formatSaleCommercialCode`, `queryWithCompanyContext`, `ApiError`)
- Test: `apps/web/scripts/static.test.mjs`

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces: `export async function buildOrderRemitoPdf(companyId: number, orderId: string, options?: { includePrices?: boolean; copia?: boolean }): Promise<PdfFile>` — renderiza el remito comercial desde `sales`/`sale_items`. `includePrices` alterna con/sin precios; `copia` estampa "COPIA".

- [ ] **Step 1: Write the failing test**

En `apps/web/scripts/static.test.mjs`, agregá al final del archivo:

```js
test("order comprobante flow separates the commercial remito from stock", () => {
  const documents = read("apps/web/src/lib/pdf/documents.ts");
  assert.match(documents, /export async function buildOrderRemitoPdf/);
  assert.match(documents, /FROM sale_items si/, "the commercial remito reads sale_items, not delivery_document_items");
  assert.match(documents, /includePrices \? "remito_con_precios" : "remito_sin_precios"/);
  assert.match(documents, /copia \? "COPIA" : "ORIGINAL"/);
  assert.doesNotMatch(documents, /buildOrderRemitoPdf[\s\S]*INSERT INTO/, "the commercial remito must not write to the database");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && node --test --test-name-pattern="separates the commercial remito" scripts/static.test.mjs`
Expected: FAIL — `did not match .../export async function buildOrderRemitoPdf/`.

- [ ] **Step 3: Write minimal implementation**

En `apps/web/src/lib/pdf/documents.ts`, justo **después** de `buildOrderRequestPdf` (que termina cerca de la línea 1156), agregá:

```ts
export async function buildOrderRemitoPdf(
  companyId: number,
  orderId: string,
  options: { includePrices?: boolean; copia?: boolean } = {},
) {
  const includePrices = options.includePrices ?? false;
  const copia = options.copia ?? false;

  const header = await queryWithCompanyContext<{
    commercial_number: string | null;
    sale_number: string;
    receipt_number: number | null;
    delivery_number: number | null;
    nombre_cliente: string;
    dni_cliente: string;
    fecha: string | null;
    condicion_pago: string;
    monto: string;
    vendedor: string;
    domicilio: string;
    ciudad: string;
    provincia: string;
    nro_id: string;
    observacion: string;
  }>(
    companyId,
    `
      SELECT s.commercial_number::text AS commercial_number,
             COALESCE(s.sale_number, '') AS sale_number,
             s.receipt_number,
             dd.delivery_number,
             COALESCE(s.client_name, c.display_name, '') AS nombre_cliente,
             COALESCE(s.client_document, c.tax_id, '') AS dni_cliente,
             s.sale_date::text AS fecha,
             COALESCE(s.payment_condition, '') AS condicion_pago,
             COALESCE(s.total_amount, 0)::text AS monto,
             COALESCE(s.seller_name, '') AS vendedor,
             COALESCE(c.delivery_address, c.address, '') AS domicilio,
             COALESCE(c.locality, '') AS ciudad,
             COALESCE(c.province, '') AS provincia,
             COALESCE(c.tax_id, s.client_document, '') AS nro_id,
             COALESCE(s.notes, '') AS observacion
      FROM sales s
      LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
      LEFT JOIN delivery_documents dd ON dd.sale_id = s.id AND dd.empresa_id = s.empresa_id
      WHERE s.id = $1::uuid AND s.empresa_id = $2
      LIMIT 1
    `,
    [orderId, companyId],
  );
  const order = header.rows[0];
  if (!order) throw new ApiError(404, "Pedido no encontrado");

  const detail = await queryWithCompanyContext<{
    product_code: string;
    nombre: string;
    cantidad: string;
    precio_unit: string;
    subtotal: string;
  }>(
    companyId,
    `
      SELECT COALESCE(p.sku, p.category_code, '') AS product_code,
             COALESCE(si.description, p.name, '(producto eliminado)') AS nombre,
             si.quantity::text AS cantidad,
             COALESCE(si.unit_price, 0)::text AS precio_unit,
             COALESCE(si.total_amount, 0)::text AS subtotal
      FROM sale_items si
      LEFT JOIN products p ON p.id = si.product_id AND p.empresa_id = si.empresa_id
      WHERE si.sale_id = $1::uuid AND si.empresa_id = $2
      ORDER BY si.id ASC
    `,
    [orderId, companyId],
  );

  const commercialCode = formatSaleCommercialCode({
    commercialNumber: order.commercial_number,
    saleNumber: order.sale_number,
    deliveryNumber: order.delivery_number,
    legacyRemittanceNumber: order.receipt_number,
  });
  const number = commercialCode === "Sin número" ? "Sin número" : commercialCode;
  const filenamePrefix = includePrices ? "remito_con_precios" : "remito_sin_precios";

  return createPdfFile(`${filenamePrefix}_${safeFilename(number)}.pdf`, ({ pdf }) => {
    pdf.drawHeader({
      title: "Remito",
      code: "R",
      number,
      date: pdfDate(order.fecha),
      extra: [includePrices ? "Documento valorizado" : "Control de mercaderia", copia ? "COPIA" : "ORIGINAL"],
      footerLeft: includePrices ? "Documento no valido como factura" : "Control de mercaderia - sin valores",
      footerRight: includePrices ? `Total ${pdfMoney(Number(order.monto))}` : "Deposito",
    });

    pdf.section("Destinatario");
    pdf.title(order.nombre_cliente || "Sin cliente", 11);
    pdf.muted(
      [
        order.domicilio,
        [order.ciudad, order.provincia].filter(Boolean).join(", "),
        `DNI/CUIT: ${order.nro_id || order.dni_cliente || "-"}`,
      ]
        .filter(Boolean)
        .join(" - "),
    );
    const infoY = pdf.y + 16;
    pdf.keyValue("Cond. vta.", order.condicion_pago || "-", 54, infoY, 74, 165);
    pdf.keyValue("Vendedor", order.vendedor || "-", 318, infoY, 64, 150);
    pdf.setY(infoY + 30);

    const columns = includePrices
      ? [
          { label: "Cant.", width: 54 },
          { label: "Codigo", width: 70 },
          { label: "Descripcion", width: 211 },
          { label: "P. unit.", width: 84, align: "right" as const },
          { label: "Importe", width: 85, align: "right" as const },
        ]
      : [
          { label: "Cant.", width: 54 },
          { label: "Codigo", width: 78 },
          { label: "Descripcion", width: 312 },
          { label: "Control", width: 60, align: "center" as const },
        ];
    const totalUnits = detail.rows.reduce((sum, row) => sum + Number(row.cantidad), 0);
    const totalAmount = detail.rows.reduce((sum, row) => sum + Number(row.subtotal), 0);
    pdf.table(
      columns,
      detail.rows.map((row) =>
        includePrices
          ? [pdfNumber(Number(row.cantidad)), row.product_code, row.nombre, pdfMoney(Number(row.precio_unit)), pdfMoney(Number(row.subtotal))]
          : [pdfNumber(Number(row.cantidad)), row.product_code, row.nombre, "[ ]"],
      ),
    );
    pdf.totals(
      [["Total de unidades", pdfNumber(totalUnits)]],
      includePrices ? "Total" : "Control",
      includePrices ? pdfMoney(totalAmount) : "",
    );
    pdf.note(order.observacion || "Verificar cantidades y estado de la mercaderia al momento de la recepcion.");
    pdf.signatures("Preparo / despacho", "Controlo / recibio");
  });
}
```

Nota: si el linter marca que alguna columna no existe (`c.delivery_address`, `c.locality`, `s.payment_condition`), verificá contra `buildDeliveryPdf` (mismas columnas) — todas se usan ahí.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && node --test --test-name-pattern="separates the commercial remito" scripts/static.test.mjs`
Expected: PASS.
Además: `cd apps/web && npx tsc --noEmit -p tsconfig.json` → sin errores nuevos en `documents.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/pdf/documents.ts apps/web/scripts/static.test.mjs
git commit -m "feat: buildOrderRemitoPdf renders the commercial remito on-demand from the sale"
```

---

## Task 3: Ruta `/api/pdfs/orders/[id]/remito`

**Files:**
- Create: `apps/web/src/app/api/pdfs/orders/[id]/remito/route.ts`
- Test: `apps/web/scripts/static.test.mjs`

**Interfaces:**
- Consumes: `buildOrderRemitoPdf` (Task 2).
- Produces: `GET /api/pdfs/orders/[id]/remito?precios=no|si&copia=1`.

- [ ] **Step 1: Write the failing test**

En `apps/web/scripts/static.test.mjs`, dentro del test `"order comprobante flow separates the commercial remito from stock"` agregado en Task 2, sumá estas líneas al final del bloque:

```js
  const remitoRoute = read("apps/web/src/app/api/pdfs/orders/[id]/remito/route.ts");
  assert.match(remitoRoute, /requireApiSession\(\[\{ resource: "pedidos", action: "ver" \}\]\)/);
  assert.match(remitoRoute, /buildOrderRemitoPdf/);
  assert.match(remitoRoute, /searchParams\.get\("precios"\) === "si"/);
  assert.match(remitoRoute, /searchParams\.get\("copia"\) === "1"/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && node --test --test-name-pattern="separates the commercial remito" scripts/static.test.mjs`
Expected: FAIL — `ENOENT ... /remito/route.ts`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/app/api/pdfs/orders/[id]/remito/route.ts`:

```ts
import { type NextRequest } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { buildOrderRemitoPdf } from "@/lib/pdf/documents";
import { pdfResponse } from "@/lib/pdf/renderer";
import { uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireApiSession([{ resource: "pedidos", action: "ver" }]);
    const { id } = await context.params;
    const searchParams = request.nextUrl.searchParams;
    const file = await buildOrderRemitoPdf(session.companyId, uuidParam(id, "Pedido"), {
      includePrices: searchParams.get("precios") === "si",
      copia: searchParams.get("copia") === "1",
    });
    return pdfResponse(file, searchParams.get("download") !== "1");
  } catch (error) {
    return handleApiError(error);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && node --test --test-name-pattern="separates the commercial remito" scripts/static.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/api/pdfs/orders/[id]/remito/route.ts" apps/web/scripts/static.test.mjs
git commit -m "feat: order remito route (precios/copia params)"
```

---

## Task 4: UI de comprobantes en el registro de pedidos

**Files:**
- Modify: `apps/web/src/app/orders/page.tsx` (menú de acciones, ~líneas 200-246; import de helper arriba)
- Test: `apps/web/scripts/static.test.mjs`

**Interfaces:**
- Consumes: `hasCompleteFiscalData` (Task 1); ruta `/api/pdfs/orders/[id]/remito` (Task 3). `order.orderStatus`, `order.customerDocument`, `order.customerFiscalCondition` ya existen en `OrderSummary`.

- [ ] **Step 1: Write the failing test**

En `apps/web/scripts/static.test.mjs`, agregá al final:

```js
test("orders register exposes the comprobante sequence with fiscal gating", () => {
  const ordersPage = read("apps/web/src/app/orders/page.tsx");
  assert.match(ordersPage, /hasCompleteFiscalData/);
  assert.match(ordersPage, /\/api\/pdfs\/orders\/\$\{order\.id\}\/remito/);
  assert.match(ordersPage, /Remito sin precios/);
  assert.match(ordersPage, /Copia \(chofer\)/);
  assert.match(ordersPage, /Remito con precios/);
  assert.match(ordersPage, /precios=si/);
  assert.match(ordersPage, /copia=1/);
  assert.match(ordersPage, /canInvoice \? /, "the fiscal invoice link must be gated by canInvoice");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && node --test --test-name-pattern="comprobante sequence with fiscal gating" scripts/static.test.mjs`
Expected: FAIL — `did not match .../hasCompleteFiscalData/`.

- [ ] **Step 3: Write minimal implementation**

3a. Al tope de `apps/web/src/app/orders/page.tsx`, junto a los otros imports de `@/lib`, agregá:

```tsx
import { hasCompleteFiscalData } from "@/lib/client-fiscal";
```

3b. Dentro del `.map` que renderiza cada fila del pedido, **antes** del `return (` de la fila (cerca de donde se calcula `orderNumberLabel`), agregá:

```tsx
const canInvoice = hasCompleteFiscalData({
  taxId: order.customerDocument,
  fiscalCondition: order.customerFiscalCondition,
});
```

3c. Reemplazá el bloque del link "Ver PDF" (líneas ~237-245) por la secuencia de comprobantes:

```tsx
                          <a
                            aria-label={`Remito sin precios del pedido ${orderNumberLabel}`}
                            className={tableActionItemClass}
                            href={`/api/pdfs/orders/${order.id}/remito`}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Remito sin precios
                          </a>
                          <a
                            aria-label={`Copia del remito para el chofer del pedido ${orderNumberLabel}`}
                            className={tableActionItemClass}
                            href={`/api/pdfs/orders/${order.id}/remito?copia=1`}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Copia (chofer)
                          </a>
                          <a
                            aria-label={`Remito con precios del pedido ${orderNumberLabel}`}
                            className={tableActionItemClass}
                            href={`/api/pdfs/orders/${order.id}/remito?precios=si`}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Remito con precios
                          </a>
                          {canInvoice ? (
                            <a
                              aria-label={`Factura fiscal del pedido ${orderNumberLabel}`}
                              className={tableActionItemClass}
                              href={`/api/pdfs/orders/${order.id}/document`}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Factura
                            </a>
                          ) : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && node --test --test-name-pattern="comprobante sequence with fiscal gating" scripts/static.test.mjs`
Expected: PASS.
Además verificá que no rompiste el guardrail existente que pedía `Ver PDF`: correr `cd apps/web && node --test scripts/static.test.mjs` y, si el test `"reported ERP controls..."` o `"orders lifecycle..."` falla por `Ver PDF`/`/document`, ajustá ese guardrail para que apunte a `Factura`/`remito` (ese guardrail quedó viejo con este cambio; actualizalo a la nueva realidad, igual que se hizo con los guardrails de refactors previos).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/orders/page.tsx apps/web/scripts/static.test.mjs
git commit -m "feat: orders register shows remito sin/con precios + fiscal-gated factura"
```

---

## Task 5: Aprobar presupuesto deja el pedido en `cargado` con remito disponible

**Files:**
- Modify: `apps/web/src/app/quotes/actions.ts` (`acceptQuoteAndRemitAction`, ~líneas 18-31)
- Test: `apps/web/scripts/static.test.mjs`

**Interfaces:**
- Consumes: `acceptQuote` (sin cambios). Ya no usa `createDeliveryDocumentFromSale`.

- [ ] **Step 1: Write the failing test**

En `apps/web/scripts/static.test.mjs`, agregá al final:

```js
test("approving a quote leaves the order loaded with its commercial remito, not a priced delivery", () => {
  const quoteActions = read("apps/web/src/app/quotes/actions.ts");
  assert.match(quoteActions, /export async function acceptQuoteAndRemitAction/);
  assert.doesNotMatch(quoteActions, /createDeliveryDocumentFromSale/, "approval must not create a priced delivery document");
  assert.doesNotMatch(quoteActions, /redirect\("\/billing/, "approval must not jump to billing to build a remito by hand");
  assert.match(quoteActions, /redirect\("\/orders\?status=cargado"\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && node --test --test-name-pattern="leaves the order loaded with its commercial remito" scripts/static.test.mjs`
Expected: FAIL — encuentra `createDeliveryDocumentFromSale` / `redirect("/billing...`.

- [ ] **Step 3: Write minimal implementation**

En `apps/web/src/app/quotes/actions.ts`:

3a. Borrá el import ya innecesario (si no lo usa otra función del archivo):

```tsx
import { createDeliveryDocumentFromSale } from "@/lib/deliveries";
```

3b. Reemplazá el cuerpo de `acceptQuoteAndRemitAction` por:

```tsx
export async function acceptQuoteAndRemitAction(formData: FormData) {
  const session = await requireApiSession([
    { resource: "presupuestos", action: "aprobar" },
    { resource: "ventas", action: "editar" },
  ]);
  const id = String(formData.get("id") ?? "").trim();
  await acceptQuote(session, id);
  revalidatePath("/quotes");
  revalidatePath("/orders");
  redirect("/orders?status=cargado");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && node --test --test-name-pattern="leaves the order loaded with its commercial remito" scripts/static.test.mjs`
Expected: PASS.
Verificá que `createDeliveryDocumentFromSale` no quede importado sin uso: `cd apps/web && npx eslint src/app/quotes/actions.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/quotes/actions.ts apps/web/scripts/static.test.mjs
git commit -m "feat: approving a quote leaves the order loaded with its commercial remito"
```

---

## Task 6: Verificación integral y cobertura del spec

**Files:** ninguno nuevo (solo corridas).

- [ ] **Step 1: Correr el suite completo**

Run: `cd apps/web && npm test`
Expected: `pass` == total, `fail 0`. Si algún guardrail viejo choca con la nueva secuencia de comprobantes (p.ej. asumía `Ver PDF` como única acción), actualizarlo a la realidad nueva y volver a correr.

- [ ] **Step 2: Typecheck y lint**

Run: `cd apps/web && npx tsc --noEmit && npx eslint src`
Expected: sin errores.

- [ ] **Step 3: Chequeo de cobertura del spec (manual)**

Confirmá contra `docs/superpowers/specs/2026-08-02-flujo-comprobantes-pedido-design.md`:
- Remito sin precios disponible desde `cargado` (Tasks 2-4). ✔
- 2ª copia con sello COPIA (Tasks 2-4). ✔
- Remito con precios y factura al final, factura gateada por datos fiscales (Tasks 1, 4). ✔
- Stock intacto hasta `entregado` — el remito no escribe DB (Task 2 guardrail) y el descuento sigue en el flujo confirmar→entregado existente (sin cambios). ✔
- Aprobar presupuesto no arma remito valorizado a mano (Task 5). ✔

- [ ] **Step 4: Commit final (si hubo ajustes de guardrails)**

```bash
git add -A
git commit -m "test: realign guardrails with the new comprobante sequence"
```

---

## Self-Review

- **Cobertura del spec:** roles de documento (Task 2), ruta con precios/copia (Task 3), gating fiscal (Tasks 1+4), secuencia por estado (Task 4), stock sin tocar hasta entregado (Task 2 guardrail + flujo existente), aprobación sin remito valorizado (Task 5). Sin huecos.
- **Placeholders:** ninguno — todo el código está completo.
- **Consistencia de tipos:** `buildOrderRemitoPdf(companyId, orderId, { includePrices, copia })` se define en Task 2 y se consume idéntico en Task 3; `hasCompleteFiscalData({ taxId, fiscalCondition })` se define en Task 1 y se consume idéntico en Task 4 con `order.customerDocument`/`order.customerFiscalCondition`.
