import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
test("daily attendance reminder and delayed absence alert are wired", () => {
  const service = read("src/lib/attendance-automation.ts");
  const reminder = read("src/app/api/cron/attendance-reminder/route.ts");
  const check = read("src/app/api/cron/attendance-check/route.ts");
  const config = JSON.parse(read("vercel.json"));
  assert.match(reminder, /CRON_SECRET[\s\S]*authorization/);
  assert.match(check, /CRON_SECRET[\s\S]*authorization/);
  assert.match(service, /Idempotency-Key/);
  assert.match(service, /last_seen >= date_trunc\('day', NOW\(\)\) \+ interval '16 hours'/);
  assert.match(service, /Francisco no inició su jornada/);
  assert.match(service, /WHERE NOT EXISTS/);
  assert.deepEqual(config.crons, [
    { path: "/api/cron/attendance-reminder", schedule: "0 19 * * *" },
    { path: "/api/cron/attendance-check", schedule: "30 19 * * *" },
  ]);
});
