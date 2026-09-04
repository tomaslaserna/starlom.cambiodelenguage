import { ApiError } from "@/lib/api-response";
import { withCompanyContext } from "@/lib/db";
import type { PoolClient } from "pg";

// Tablas con FK a clients (verificado en information_schema). Lista fija (no input
// del usuario), por eso es seguro interpolarla en el SQL.
export const CUSTOMER_LINKED_TABLES = [
  "sales",
  "orders",
  "quotes",
  "payments",
  "current_account_movements",
  "sale_documents",
] as const;

// Esta relación usa customer_id en lugar de client_id. Se mantiene separada
// para que eliminar o fusionar una ficha nunca deje actividades del CRM atrás.
const CUSTOMER_CRM_LINKED_TABLES = ["crm_sales_activities"] as const;

export async function customerLinkTotal(
  client: PoolClient,
  companyId: number,
  id: string,
): Promise<number> {
  let total = 0;
  for (const table of CUSTOMER_LINKED_TABLES) {
    const result = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ${table} WHERE empresa_id = $1 AND client_id = $2::uuid`,
      [companyId, id],
    );
    total += Number(result.rows[0]?.n ?? 0);
  }
  for (const table of CUSTOMER_CRM_LINKED_TABLES) {
    const result = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ${table} WHERE empresa_id = $1 AND customer_id = $2::uuid`,
      [companyId, id],
    );
    total += Number(result.rows[0]?.n ?? 0);
  }
  return total;
}

async function assertClientExists(client: PoolClient, companyId: number, id: string): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM clients WHERE id = $1::uuid AND empresa_id = $2 LIMIT 1`,
    [id, companyId],
  );
  if (!result.rows[0]) throw new ApiError(404, "Cliente no encontrado");
}

export async function deleteCustomer(companyId: number, id: string): Promise<void> {
  await withCompanyContext(companyId, async (client) => {
    await assertClientExists(client, companyId, id);
    const total = await customerLinkTotal(client, companyId, id);
    if (total > 0) {
      throw new ApiError(
        409,
        "El cliente tiene historial (ventas/movimientos) y no puede eliminarse. Usá Fusionar.",
      );
    }
    await client.query(`DELETE FROM clients WHERE id = $1::uuid AND empresa_id = $2`, [id, companyId]);
  });
}

export async function mergeCustomers(
  companyId: number,
  keepId: string,
  duplicateId: string,
): Promise<void> {
  if (keepId === duplicateId) throw new ApiError(400, "No se puede fusionar un cliente consigo mismo");
  await withCompanyContext(companyId, async (client) => {
    await assertClientExists(client, companyId, keepId);
    await assertClientExists(client, companyId, duplicateId);
    for (const table of CUSTOMER_LINKED_TABLES) {
      await client.query(
        `UPDATE ${table} SET client_id = $1::uuid WHERE client_id = $2::uuid AND empresa_id = $3`,
        [keepId, duplicateId, companyId],
      );
    }
    for (const table of CUSTOMER_CRM_LINKED_TABLES) {
      await client.query(
        `UPDATE ${table} SET customer_id = $1::uuid WHERE customer_id = $2::uuid AND empresa_id = $3`,
        [keepId, duplicateId, companyId],
      );
    }
    await client.query(`DELETE FROM clients WHERE id = $1::uuid AND empresa_id = $2`, [duplicateId, companyId]);
  });
}
