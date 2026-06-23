import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getDatabaseEnv } from "@/lib/env";

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (!pool) {
    const { connectionString } = getDatabaseEnv();

    pool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      ssl: {
        rejectUnauthorized: false,
      },
    });
  }

  return pool;
}

export async function checkDatabaseConnection() {
  const startedAt = Date.now();
  const result = await getDbPool().query<{ ok: number; server_time: string }>(
    "select 1 as ok, now()::text as server_time",
  );

  return {
    ok: result.rows[0]?.ok === 1,
    serverTime: result.rows[0]?.server_time ?? null,
    latencyMs: Date.now() - startedAt,
  };
}

export async function queryWithCompanyContext<T extends QueryResultRow>(
  companyId: number,
  sql: string,
  params: unknown[] = [],
) {
  return withCompanyContext(companyId, (client) => client.query<T>(sql, params));
}

export async function withCompanyContext<T>(
  companyId: number,
  callback: (client: PoolClient) => Promise<T>,
) {
  const client = await getDbPool().connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_empresa_id', $1, true)", [
      String(companyId),
    ]);
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
