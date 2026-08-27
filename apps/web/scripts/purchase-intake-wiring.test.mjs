import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const purchases = readFileSync(new URL("../src/lib/purchases.ts", import.meta.url), "utf8");
const entry = readFileSync(new URL("../src/app/purchases/purchase-entry-fields.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/purchases/page.tsx", import.meta.url), "utf8");
const suppliers = readFileSync(new URL("../src/lib/catalog-management.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../../supabase/migrations/20260827193610_purchase_intake_automation.sql", import.meta.url), "utf8");

test("Nueva compra registra costo, stock e IVA sin habilitar una segunda recepción", () => {
  assert.match(purchases, /isSupplierIntake/);
  assert.match(purchases, /UPDATE products SET cost/);
  assert.match(purchases, /purchase-intake:\$\{purchaseId\}:\$\{item\.productId\}/);
  assert.match(purchases, /ON CONFLICT \(empresa_id, idempotency_key\)/);
  assert.match(purchases, /La mercadería de esta compra ya fue ingresada al stock/);
});

test("las solicitudes MRP siguen pendientes y no ingresan stock automáticamente", () => {
  assert.match(purchases, /isSupplierIntake \? "recibida" : input\.status/);
  assert.match(purchases, /isSupplierIntake \? "revisado" : "pendiente"/);
  assert.match(purchases, /if \(isSupplierIntake\) \{[\s\S]*UPDATE products SET cost/);
});

test("el formulario filtra productos, muestra imagen, costo, IVA y efectos", () => {
  assert.match(entry, /Costo unitario s\/IVA/);
  assert.match(entry, /imageUrl/);
  assert.match(entry, /Agregar producto nuevo/);
  assert.match(page, /Una carga actualiza cuatro sectores/);
  assert.match(page, /cuenta por pagar/);
  assert.match(entry, /Se completa con el costo actual y queda disponible para corregirlo/);
  const productQuery = purchases.slice(purchases.indexOf("export async function listPurchaseFormProducts"), purchases.indexOf("export async function listPurchases"));
  assert.doesNotMatch(productQuery, /LIMIT 300/);
});

test("proveedores guardan plazo y las compras calculan su vencimiento", () => {
  assert.match(suppliers, /paymentTermDays/);
  assert.match(migration, /payment_term_days/);
  assert.match(migration, /due_date/);
  assert.match(purchases, /\$4::date \+ \$10::int/);
});
