import { PGlite } from "@electric-sql/pglite";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { obligationFixtureSql } from "./cost-obligations-fixture";
const scope = globalThis as typeof globalThis & {
  costObligationDemo?: Promise<PGlite>;
};
export function localObligationDb() {
  if (process.env.NODE_ENV !== "development") throw Error("Local only");
  return (scope.costObligationDemo ??= (async () => {
    const dir = path.join(process.cwd(), ".local", "administration-lifecycle-pg");
    await mkdir(dir, { recursive: true });
    const db = new PGlite(dir);
    const ready = await db.query<{ ready: string | null }>(
      "SELECT to_regclass('public.admin_cost_obligations')::text AS ready",
    );
    if (!ready.rows[0]?.ready) {
      await db.exec(obligationFixtureSql);
      await db.exec(
        await readFile(
          path.resolve(
            process.cwd(),
            "../../supabase/migrations/20261124195400_monthly_cost_obligations.sql",
          ),
          "utf8",
        ),
      );
    }
    const extended = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='admin_cost_obligations' AND column_name='salary_note'");
    if(!extended.rows.length) await db.exec(await readFile(path.resolve(process.cwd(),"../../supabase/migrations/20261125135907_administration_payment_lifecycle.sql"),"utf8"));
    return db;
  })());
}
