import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("supplier list links each active supplier and renders columns in header order", () => {
  const list = read("../src/app/suppliers/page.tsx");
  assert.match(list, /href=\{`\/suppliers\/\$\{supplier\.id\}`\}/);
  assert.match(list, /supplier\.rubric[\s\S]*supplier\.contactName[\s\S]*supplier\.phone[\s\S]*supplier\.email[\s\S]*supplier\.paymentTermDays/);
  assert.doesNotMatch(list, /supplier\.bank(?:Name|Account|Alias)/);
});

test("supplier detail is a protected dynamic page backed by the 360 read model", () => {
  const detail = read("../src/app/suppliers/[id]/page.tsx");
  assert.match(detail, /params: Promise<\{ id: string \}>/);
  assert.match(detail, /sessionCanReadSuppliers\(session\)/);
  assert.match(detail, /getSupplierDetail360\(session\.companyId, id\)/);
  assert.match(detail, /if \(!detail\) notFound\(\)/);
  assert.match(detail, /resource: "proveedores", action: "editar"/);
});

test("supplier detail presents five metrics, five master-data cards, and traceable tables", () => {
  const detail = read("../src/app/suppliers/[id]/page.tsx");
  for (const label of ["Total comprado", "Compras recibidas", "Saldo pendiente", "Última compra", "Productos asociados"]) {
    assert.match(detail, new RegExp(label));
  }
  for (const title of ["Identidad y datos fiscales", "Contacto y ubicación", "Condiciones y logística", "Cuenta bancaria", "Notas"]) {
    assert.match(detail, new RegExp(title));
  }
  assert.match(detail, /Sin registrar/);
  assert.match(detail, /tableLabel="Productos provistos"/);
  assert.match(detail, /tableLabel="Historial de compras"/);
  assert.match(detail, /href=\{`\/prices\?q=\$\{encodeURIComponent\(product\.sku/);
  assert.match(detail, /href=\{`\/purchases\?q=\$\{encodeURIComponent\(purchase\.purchaseNumber/);
  assert.match(detail, /Sin productos asociados/);
  assert.match(detail, /Sin compras registradas/);
  assert.doesNotMatch(detail, /Registrar pago|createPurchaseAction|stock_movements|updatePurchaseStatusAction/);
});

test("supplier editing is permission-gated, complete, and keeps recoverable form state", () => {
  const detail = read("../src/app/suppliers/[id]/page.tsx");
  const dialog = read("../src/app/suppliers/supplier-edit-dialog.tsx");
  const actions = read("../src/app/suppliers/actions.ts");
  assert.match(detail, /canEdit \? <SupplierEditDialog/);
  assert.match(detail, /searchParams: Promise<\{ updated\?: string \}>/);
  assert.match(detail, /Proveedor actualizado correctamente/);
  assert.match(dialog, /useActionState\(updateSupplierAction/);
  assert.match(dialog, /state\.status === "error"/);
  for (const name of ["name", "legalName", "contactName", "taxId", "fiscalCondition", "rubric", "phone", "email", "address", "locality", "province", "notes", "paymentTermDays", "deliveryLeadDays", "minimumOrderAmount", "shippingMethod", "bankName", "bankAccountType", "bankAccountHolder", "bankAccountIdentifier", "bankAlias"]) {
    assert.match(dialog, new RegExp(`name="${name}"`));
  }
  assert.match(dialog, /name="taxId"[\s\S]*inputMode="numeric"|inputMode="numeric"[\s\S]*name="taxId"/);
  assert.match(dialog, /name="email"[\s\S]*type="email"|type="email"[\s\S]*name="email"/);
  assert.match(dialog, /name="paymentTermDays"[\s\S]*min="0"|min="0"[\s\S]*name="paymentTermDays"/);
  assert.doesNotMatch(dialog, /name="active"/);
  assert.match(actions, /resource: "proveedores", action: "editar"/);
  assert.match(actions, /revalidatePath\("\/suppliers"\)/);
  assert.match(actions, /revalidatePath\(`\/suppliers\/\$\{id\}`\)/);
});

test("private supplier API keeps read/edit permissions and delegates audited PATCH with complete defaults", () => {
  const route = read("../src/app/api/suppliers/[id]/route.ts");
  assert.match(route, /resource: "proveedores", action: "ver"/);
  assert.match(route, /resource: "proveedores", action: "editar"/);
  assert.match(route, /uuidParam\(id, "Proveedor"\)/);
  assert.match(route, /updateSupplier\(\s*session,/);
  for (const field of ["legalName", "contactName", "taxId", "fiscalCondition", "deliveryLeadDays", "minimumOrderAmount", "bankAccountIdentifier", "bankAlias"]) {
    assert.match(route, new RegExp(`${field}: current\\.${field}`));
  }
  assert.doesNotMatch(route, /active: current|body\.active/);
});
