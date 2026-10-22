import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/20261022155028_sales_mission_completion_cycles.sql", import.meta.url),
  "utf8",
);
const source = readFileSync(new URL("../src/lib/sales-missions.ts", import.meta.url), "utf8");
const actions = readFileSync(new URL("../src/app/sales-engine/actions.ts", import.meta.url), "utf8");
const missions = readFileSync(new URL("../src/app/sales-engine/daily-missions.tsx", import.meta.url), "utf8");

test("las misiones guardan un historial multiempresa y su próxima fecha", () => {
  assert.match(migration, /CREATE TABLE public\.sales_mission_completions/);
  assert.match(migration, /completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/);
  assert.match(migration, /next_followup_on DATE NOT NULL/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /TO starlim_app/);
  assert.match(migration, /empresa_id = NULLIF\(current_setting\('app\.current_empresa_id'/);
});

test("marcar realizada exige casilla, registra operador y reprograma siete días por defecto", () => {
  assert.match(actions, /formData\.get\("completed"\) !== "yes"/);
  assert.match(actions, /completeSalesMission\(session/);
  assert.match(missions, /name="completed" required type="checkbox"/);
  assert.match(missions, /Volver a sugerir/);
  assert.match(missions, /name="nextFollowupOn" required type="date"/);
  assert.match(source, /seller_id, mission_key, mission_kind/);
  assert.match(source, /UPDATE crm_leads[\s\S]*next_followup/);
  assert.match(source, /UPDATE price_list_shares[\s\S]*follow_up_on/);
});

test("una compra posterior impide que vuelva a aparecer el recontacto", () => {
  assert.match(source, /s\.created_at > latest\.completed_at/);
  assert.match(source, /purchase_after_completion/);
  assert.match(source, /normalizedOrderStatusSql\("s"\)/);
  assert.match(source, /<> 'cancelado'/);
});
