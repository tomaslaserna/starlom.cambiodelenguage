import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../migrations/20260811000000_crm_leads.sql", import.meta.url),
  "utf8",
);

test("la migración crea crm_leads con RLS y grants a starlim_app", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.crm_leads/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /FOR ALL TO starlim_app/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.crm_leads TO starlim_app/);
  assert.match(migration, /stage text NOT NULL DEFAULT 'nuevo'/);
});

const leadsSource = readFileSync(new URL("../src/lib/leads.ts", import.meta.url), "utf8");

test("leads.ts scopea por vendedor y la conversión reutiliza createCustomer", () => {
  assert.match(leadsSource, /sellerCandidates\(/);
  assert.match(leadsSource, /UPPER\(BTRIM\(COALESCE\(assigned_seller/);
  assert.match(leadsSource, /createCustomer\(/);
  assert.match(leadsSource, /stage='convertido'/);
  assert.match(leadsSource, /converted_client_id/);
});

const navSource = readFileSync(new URL("../src/lib/navigation.ts", import.meta.url), "utf8");

test("navigation incluye el ítem de Leads del CRM", () => {
  assert.match(navSource, /href: "\/crm\/leads", label: "Leads", active: "crm"/);
});
