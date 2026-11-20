import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const migrationsUrl = new URL("../../../supabase/migrations/", import.meta.url);
const matches = readdirSync(migrationsUrl).filter((name) => name.endsWith("_supplier_360_fields.sql"));

test("supplier 360 has one additive, backwards-compatible migration", () => {
  assert.equal(matches.length, 1, `expected one supplier 360 migration, found ${matches.length}`);
  const sql = readFileSync(new URL(matches[0], migrationsUrl), "utf8");

  const textColumns = [
    "contact_name",
    "fiscal_condition",
    "locality",
    "province",
    "shipping_method",
    "bank_name",
    "bank_account_type",
    "bank_account_holder",
    "bank_account_identifier",
    "bank_alias",
  ];
  for (const column of textColumns) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${column} text NOT NULL DEFAULT ''`, "i"));
  }

  assert.match(sql, /ADD COLUMN IF NOT EXISTS delivery_lead_days integer NOT NULL DEFAULT 0/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS minimum_order_amount numeric\(14,\s*2\) NOT NULL DEFAULT 0/i);
  assert.match(sql, /CHECK \(delivery_lead_days BETWEEN 0 AND 3650\)/i);
  assert.match(sql, /CHECK \(minimum_order_amount >= 0\)/i);
  assert.doesNotMatch(sql, /UPDATE\s+(?:public\.)?suppliers\s+SET\s+legal_name/i);
  assert.doesNotMatch(sql, /(?:total_purchased|purchase_count|outstanding_balance|active_product_count)/i);
});
