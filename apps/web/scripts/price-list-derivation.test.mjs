import assert from "node:assert/strict";
import { test } from "node:test";
import { computeListMultipliers } from "../src/lib/price-list-derivation.ts";

const baseMargins = new Map([
  ["LIMPIEZA", 1.5],
  ["BEBIDAS", 2.0],
]);

test("lista sobre costo con % 0 = margen base", () => {
  const out = computeListMultipliers([{ id: 1, derivationType: "costo", parentId: null, percentage: 0 }], baseMargins);
  assert.equal(out.get(1).get("LIMPIEZA"), 1.5);
  assert.equal(out.get(1).get("BEBIDAS"), 2.0);
});

test("lista sobre costo con % aplica el porcentaje", () => {
  const out = computeListMultipliers([{ id: 1, derivationType: "costo", parentId: null, percentage: 10 }], baseMargins);
  assert.equal(out.get(1).get("LIMPIEZA"), 1.65);
});

test("lista derivada de otra + % = multiplicador del padre x (1+%)", () => {
  const out = computeListMultipliers(
    [
      { id: 1, derivationType: "costo", parentId: null, percentage: 0 },
      { id: 2, derivationType: "lista", parentId: 1, percentage: 25 },
    ],
    baseMargins,
  );
  assert.equal(out.get(2).get("LIMPIEZA"), 1.875); // 1.5 * 1.25
  assert.equal(out.get(2).get("BEBIDAS"), 2.5); // 2.0 * 1.25
});

test("cadena de derivaciones compone", () => {
  const out = computeListMultipliers(
    [
      { id: 1, derivationType: "costo", parentId: null, percentage: 0 },
      { id: 2, derivationType: "lista", parentId: 1, percentage: 20 },
      { id: 3, derivationType: "lista", parentId: 2, percentage: 10 },
    ],
    baseMargins,
  );
  // 1.5 * 1.2 * 1.1 = 1.98
  assert.equal(out.get(3).get("LIMPIEZA"), 1.98);
});

test("porcentaje negativo (descuento)", () => {
  const out = computeListMultipliers(
    [
      { id: 1, derivationType: "costo", parentId: null, percentage: 0 },
      { id: 2, derivationType: "lista", parentId: 1, percentage: -10 },
    ],
    baseMargins,
  );
  assert.equal(out.get(2).get("LIMPIEZA"), 1.35); // 1.5 * 0.9
});

test("detecta ciclo entre listas", () => {
  assert.throws(
    () =>
      computeListMultipliers(
        [
          { id: 1, derivationType: "lista", parentId: 2, percentage: 10 },
          { id: 2, derivationType: "lista", parentId: 1, percentage: 10 },
        ],
        baseMargins,
      ),
    /ciclo/i,
  );
});

test("rechaza derivada sin padre", () => {
  assert.throws(
    () => computeListMultipliers([{ id: 1, derivationType: "lista", parentId: null, percentage: 10 }], baseMargins),
    /padre/i,
  );
});
