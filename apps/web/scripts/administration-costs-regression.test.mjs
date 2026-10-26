import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
function load(file, aliases = {}) {
  const js = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} }; Function("require", "module", "exports", js)((name) => aliases[name] ?? require(name), mod, mod.exports); return mod.exports;
}
const source = load("src/lib/operating-cost-source.ts");
const schedule = load("src/lib/operating-cost-schedule.ts");
function fixture() {
  // Execute the actual matching SQL. Register the PostgreSQL text functions in
  // SQLite solely for this offline regression; production still uses Postgres.
  const db = new DatabaseSync(":memory:");
  db.function("btrim", (s) => s.trim());
  db.function("translate", (s, from, to) => [...s].map((c) => from.includes(c) ? to[from.indexOf(c)] ?? "" : c).join(""));
  db.function("regexp_replace", (s, pattern, replacement, flags) => s.replace(new RegExp(pattern, flags), replacement));
  db.function("split_part", (s, delimiter, index) => s.split(delimiter)[index - 1] ?? "");
  db.exec(`CREATE TABLE profiles(id TEXT,full_name TEXT,username TEXT);
    CREATE TABLE admin_sueldos_config(empresa_id INTEGER,profile_id TEXT,employee_name TEXT,sueldo_mensual NUMERIC,activo BOOLEAN);
    CREATE TABLE costs(id INTEGER,empresa_id INTEGER,concepto TEXT,monto NUMERIC);
    INSERT INTO profiles VALUES ('a','Ana López','ana'),('b','Bruno Díaz','bruno'),('c','Carla Pérez','carla');
    INSERT INTO admin_sueldos_config VALUES (1,'a',NULL,2000000,true),(1,'b',NULL,800000,true),(1,'c',NULL,1000000,true),(1,NULL,'Otro empleado',400000,true);
    INSERT INTO costs VALUES (1,1,'Sueldo Ana',2000000),(2,1,'Sueldo Bruno',800000),(3,1,'Sueldo Carla',1000000),
    (4,1,'Marketing',185000),(5,1,'Alquiler',800000),(6,1,'Contador',120000),(7,1,'Logística',100000);`);
  return db;
}
test("real matcher excludes only the three redundant base salaries, leaving every source row intact", () => {
  const db = fixture();
  const rows = db.prepare(`SELECT c.*, ${source.payrollDuplicateEmployeeSql("c")} AS payroll_employee FROM costs c`).all();
  assert.equal(rows.filter((r) => r.payroll_employee).length, 3);
  const scheduled = rows.filter((r) => !r.payroll_employee).reduce((sum, r) => sum + r.monto, 0);
  assert.equal(scheduled, 1205000);
  const payrollWithOtherEmployeeAndBonus = 2000000 + 800000 + 1000000 + 800000 + 400000 + 400000 / 12;
  assert.equal(Math.round((scheduled + payrollWithOtherEmployeeAndBonus) * 100), 623833333);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM costs").get().count, 7);
  db.close();
});
test("unknown names, salary extras, different amounts, inactive plans and other companies are never discarded", () => {
  const db = fixture();
  db.exec(`INSERT INTO admin_sueldos_config VALUES (1,NULL,'Suspendido',500,false),(2,NULL,'Externo',500,true);
    INSERT INTO costs VALUES (10,1,'Sueldo desconocido',800000),(11,1,'Sueldo adicional Ana',2000000),
    (12,1,'Sueldo Ana',2100000),(13,1,'Sueldo Suspendido',500),(14,1,'Sueldo Externo',500);`);
  const rows = db.prepare(`SELECT ${source.payrollDuplicateEmployeeSql("c")} AS duplicate FROM costs c WHERE c.id>=10`).all();
  assert.ok(rows.every((r) => r.duplicate === null)); db.close();
});
test("ambiguous matches require review; accents and full names are normalized", () => {
  const db = fixture();
  db.exec(`INSERT INTO costs VALUES (10,1,'Salario Ana Lopez',2000000);
    INSERT INTO admin_sueldos_config VALUES (1,NULL,'Bruno Gomez',800000,true);`);
  const rows = db.prepare(`SELECT c.id, ${source.payrollDuplicateEmployeeSql("c")} AS duplicate FROM costs c WHERE c.id IN (2,10)`).all();
  assert.equal(rows.find((r) => r.id === 2).duplicate, null);
  assert.equal(rows.find((r) => r.id === 10).duplicate, "Ana López"); db.close();
});
test("cost list preserves duplicate records as excluded and ordinary monthly inclusion rules", async () => {
  const db = fixture();
  const rows = db.prepare(`SELECT c.id, c.concepto, c.monto, ${source.payrollDuplicateEmployeeSql("c")} AS payroll_employee FROM costs c`).all().map((r) => ({ ...r, id: String(r.id), categoria: "fijo", fecha: "2026-10-01", start_month: "2026-10-01", duration_months: null, override_included: null, cost_type: "fijo" }));
  let sql;
  const profitability = load("src/lib/profitability.ts", {
    "@/lib/api-response": {}, "@/lib/db": { queryWithCompanyContext: async (company, query) => { assert.equal(company, 1); sql = query; return { rows }; } },
    "@/lib/month-range": {}, "@/lib/order-status": {}, "@/lib/operating-cost-schedule": schedule,
    "@/lib/sales-source-sql": {}, "@/lib/sales-vat": {}, "@/lib/operating-cost-source": source,
  });
  const result = await profitability.listScheduledOperatingCosts(1, "2026-10");
  assert.equal(result.length, 7); assert.equal(result.filter((c) => c.included).length, 4);
  assert.equal(result.filter((c) => c.included).reduce((sum, c) => sum + c.amount, 0), 1205000);
  assert.match(sql, /payroll_employee/); assert.ok(result.filter((c) => c.payrollEmployee).every((c) => !c.included)); db.close();
});
test("current, accumulated and break-even totals use the same source guard; closure agrees with UI", () => {
  const metrics = read("src/lib/admin-metrics.ts"), profitability = read("src/lib/profitability.ts");
  assert.equal((metrics.match(/payrollDuplicateEmployeeSql\("c"\)/g) ?? []).length, 2);
  assert.match(metrics, /scheduled_costs_current/); assert.match(metrics, /payroll_costs_current/);
  assert.equal((profitability.match(/payrollDuplicateEmployeeSql\("c"\)/g) ?? []).length, 2);
  assert.match(profitability, /FROM admin_sueldos_config WHERE empresa_id = \$1 AND activo = true/);
  for (const file of ["src/lib/administration-closure.ts", "src/app/administration/page.tsx"]) assert.match(read(file), /!cost\.included && !cost\.payrollEmployee/);
});
test("controls wrap without fixed six-column widths; summaries have compact cards and explicit cost breakdown", () => {
  const page = read("src/app/administration/page.tsx");
  assert.match(page, /grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4/);
  assert.doesNotMatch(page, /minmax\(220px,1\.4fr\)_160px/);
  assert.match(page, /grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5/);
  assert.match(page, /Contado en RRHH/); assert.match(page, /Gastos incluidos/);
  assert.match(page, /Sueldos, aguinaldo y cargas/);
  assert.doesNotMatch(page, /Costos completos\./);
});
