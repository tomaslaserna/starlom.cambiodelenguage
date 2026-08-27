import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/app/employees/page.tsx", import.meta.url), "utf8");
const blocks = readFileSync(new URL("../src/app/employees/permission-blocks.tsx", import.meta.url), "utf8");

test("empleados usa un unico editor de permisos por bloques", () => {
  assert.match(page, /PermissionBlocks/);
  assert.doesNotMatch(page, /Object\.entries\(permissionGroups\)/);
});

test("los bloques cubren las funciones operativas principales", () => {
  for (const label of [
    "Comercial",
    "Cobranzas",
    "Fiscal",
    "Stock y logística",
    "Compras",
    "Administración y finanzas",
    "Personal y sistema",
  ]) {
    assert.match(blocks, new RegExp(label));
  }
});

test("cada bloque permite habilitar o retirar sus permisos", () => {
  assert.match(blocks, /Habilitar bloque/);
  assert.match(blocks, /Quitar bloque/);
  assert.match(blocks, /type="button"/);
});

test("las acciones sensibles quedan identificadas", () => {
  assert.match(blocks, /permission\.sensitive/);
  assert.match(blocks, /Sensible/);
});
