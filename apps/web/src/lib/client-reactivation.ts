import type { PoolClient } from "pg";

/**
 * Reactiva un cliente si está inactivo. No hace nada si ya está activo o no
 * existe. Corre sobre el `client` de la transacción del llamador, por lo que
 * participa de su transacción.
 */
export async function reactivateClientIfInactive(
  client: PoolClient,
  companyId: number,
  clientId: string,
): Promise<void> {
  await client.query(
    `
      UPDATE clients
      SET active = true, updated_at = now()
      WHERE id = $1::uuid AND empresa_id = $2 AND active = false
    `,
    [clientId, companyId],
  );
}
