"use server";

import { redirect } from "next/navigation";
import { getDbPool } from "@/lib/db";
import { requireAdminApiSession } from "@/lib/route-auth";

export async function applyProductPresentationMigrationAction() {
  await requireAdminApiSession();
  const client = await getDbPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      ALTER TABLE public.products ADD COLUMN IF NOT EXISTS presentation_units integer NOT NULL DEFAULT 1;
      ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_presentation_units_check;
      ALTER TABLE public.products ADD CONSTRAINT products_presentation_units_check
        CHECK (presentation_units BETWEEN 1 AND 9999) NOT VALID;
      ALTER TABLE public.products VALIDATE CONSTRAINT products_presentation_units_check;
    `);
    const verification = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'presentation_units'
      ) AS exists
    `);
    if (verification.rows[0]?.exists !== true) throw new Error("No se pudo verificar la migración");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  redirect("/admin/migrations/product-presentation?applied=1");
}
