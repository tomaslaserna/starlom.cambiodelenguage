import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("registerCrmCollectionAction gatea por crm.ver y verifica propiedad", () => {
  const src = read("../src/app/crm/cobros/actions.ts");
  assert.match(src, /export async function registerCrmCollectionAction/);
  assert.match(src, /CRM_READ_PERMISSION/);
  assert.match(src, /assertVendorOwnsSale/);
  assert.match(src, /registerCollection\(/);
  assert.doesNotMatch(src, /COLLECTIONS_CREATE_PERMISSION/); // no usa el permiso global
  assert.match(src, /revalidatePath\("\/crm\/cobros"\)/);
});

test("nav CRM incluye /crm/cobros con crm.ver", () => {
  const nav = read("../src/lib/navigation.ts");
  assert.match(nav, /href: "\/crm\/cobros"/);
  const line = nav.split("\n").find((l) => l.includes('"/crm/cobros"'));
  assert.match(line, /active: "crm"/);
  assert.match(line, /CRM_READ_PERMISSION/);
});

test("pagina /crm/cobros usa getVendorCollections y la accion CRM", () => {
  const src = read("../src/app/crm/cobros/page.tsx");
  assert.match(src, /getVendorCollections/);
  assert.match(src, /registerCrmCollectionAction/);
  assert.match(src, /RegisterCollectionDialog/);
  assert.match(src, /sessionCanUseCrm/);
});
