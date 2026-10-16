import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("treasury keeps bank statements as reconciliation evidence instead of double-counting cash", () => {
  const finance = read("src/lib/finance.ts");
  const treasuryStart = finance.indexOf("export async function getTreasuryBalances");
  const reconciliationStart = finance.indexOf("export type BankReconciliationSummary");
  const treasurySection = finance.slice(treasuryStart, reconciliationStart);
  const reconciliationSection = finance.slice(reconciliationStart);

  assert.ok(treasuryStart >= 0 && reconciliationStart > treasuryStart);
  assert.doesNotMatch(treasurySection, /admin_bank_statement_lines/);
  assert.match(reconciliationSection, /admin_bank_statement_lines/);
});

test("monthly closures are versioned, preserve reopened history, and cannot be deleted by the app role", () => {
  const migration = read("../../supabase/migrations/20261007133630_admin_finance_monthly_closures.sql");
  assert.match(migration, /UNIQUE \(empresa_id, month, version\)/);
  assert.match(migration, /WHERE status = 'closed'/);
  assert.match(migration, /status IN \('closed', 'reopened'\)/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE ON TABLE/);
  assert.doesNotMatch(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE/);
});

test("closing a month requires complete evidence and stores an immutable snapshot", () => {
  const closure = read("src/lib/administration-closure.ts");
  assert.match(closure, /checks\.every\(\(check\) => check\.ready\)/);
  assert.match(closure, /No se puede cerrar el período/);
  assert.match(closure, /JSON\.stringify\(preview\.snapshot\)/);
  assert.match(closure, /COALESCE\(MAX\(version\), 0\) \+ 1/);
});

test("legacy administration routes redirect reversibly to the unified module", () => {
  const config = read("next.config.ts");
  for (const [source, view] of [
    ["/balance", "results"],
    ["/cash", "treasury"],
    ["/rentabilidad", "results"],
    ["/treasury/cash-flow", "treasury"],
    ["/treasury/accounts-payable", "obligations"],
  ]) {
    assert.match(config, new RegExp(`source: "${source}"[\\s\\S]*?view=${view}[\\s\\S]*?permanent: false`));
  }
});

test("navigation exposes one administration module and keeps operations and collections intact", () => {
  const navigation = read("src/lib/navigation.ts");
  const administrationStart = navigation.indexOf('label: "Administración"');
  const humanResourcesStart = navigation.indexOf('label: "RR.HH."');
  const administration = navigation.slice(administrationStart, humanResourcesStart);

  assert.match(administration, /view=control/);
  assert.match(administration, /view=results/);
  assert.match(administration, /view=treasury/);
  assert.match(administration, /view=obligations/);
  assert.match(administration, /view=equity/);
  assert.doesNotMatch(administration, /href: "\/(balance|cash|rentabilidad|treasury\/cash-flow|treasury\/accounts-payable)"/);
  assert.match(navigation, /href: "\/payments\/accounts"/);
  assert.match(navigation, /label: "Operaciones"/);
});

test("administration stays operational and reads financial metrics without migration copy or stale cache", () => {
  const page = read("src/app/administration/page.tsx");
  const demo = read("src/app/administration/administration-demo.tsx");
  const metrics = read("src/lib/admin-metrics.ts");

  assert.doesNotMatch(page, /getAdministrationDataCoupling|Acoplamiento histórico|Migración controlada|Fuentes históricas/);
  assert.doesNotMatch(demo, /Acoplamiento al sistema actual|Nueva carga administrativa|historia de cobros/);
  assert.doesNotMatch(metrics, /ADMIN_METRICS_CACHE_TTL_MS/);
  assert.doesNotMatch(metrics, /adminMetricsCache = new Map/);
});

test("bank reconciliation certifies cash without creating accounting movements", () => {
  const finance = read("src/lib/finance.ts");
  const actions = read("src/app/administration/actions.ts");

  assert.match(finance, /createBankStatementLine/);
  assert.match(finance, /matchBankStatementLine/);
  assert.match(finance, /INSERT INTO admin_bank_reconciliation_matches/);
  assert.match(finance, /El extracto|admin_bank_statement_lines/);
  assert.doesNotMatch(finance.slice(finance.indexOf("export async function matchBankStatementLine")), /INSERT INTO current_account_movements/);
  assert.match(actions, /ADMIN_TREASURY_WRITE_PERMISSION/);
});

test("treasury separates liquid balances from accepted E-cheqs and settles them exactly once", () => {
  const finance = read("src/lib/finance.ts");
  const page = read("src/app/administration/page.tsx");
  const migration = read("../../supabase/migrations/20261011141827_treasury_accounts_and_echeq_portfolio.sql");

  assert.match(finance, /admin_treasury_reconciliations/);
  assert.match(finance, /admin_echeqs/);
  assert.match(finance, /export async function settleEcheq/);
  assert.match(finance, /source_type, source_id/);
  assert.match(page, /E-cheqs en cartera/);
  assert.match(page, /Marcar acreditado/);
  assert.match(migration, /idx_admin_treasury_movements_source_unique/);
  assert.match(migration, /status IN \('accepted', 'deposited', 'cleared', 'rejected', 'cancelled'\)/);
});

test("outgoing E-cheqs stay as future cash outflows until the bank debits them", () => {
  const finance = read("src/lib/finance.ts");
  const metrics = read("src/lib/admin-metrics.ts");
  const page = read("src/app/administration/page.tsx");
  const migration = read("../../supabase/migrations/20261016130345_outgoing_echeqs.sql");
  const reconciliation = read("../../supabase/reconciliations/maralimm-2026-10-16.sql");

  assert.match(finance, /admin_outgoing_echeqs/);
  assert.match(finance, /export async function settleOutgoingEcheq/);
  assert.match(finance, /outgoing_echeq_clearing/);
  assert.match(metrics, /cheque\.status IN \('issued', 'accepted'\)/);
  assert.match(page, /E-cheqs emitidos/);
  assert.match(page, /Confirmar débito/);
  assert.match(migration, /admin_outgoing_echeqs_company_number_unique/);
  assert.match(reconciliation, /se preservan compras, ítems y stock/i);
});
