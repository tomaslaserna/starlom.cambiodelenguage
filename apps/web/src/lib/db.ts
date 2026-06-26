import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { getDatabaseEnv } from "@/lib/env";

let pool: Pool | null = null;

const READ_CACHE_TTL_MS = 90_000;
const readQueryCache = new Map<string, { expiresAt: number; result: QueryResult<QueryResultRow> }>();
const inFlightReadQueries = new Map<string, Promise<QueryResult<QueryResultRow>>>();

function isCacheableRead(sql: string) {
  const normalized = sql.trim();
  if (!/^(select|with)\b/i.test(normalized)) return false;
  return !/\b(insert|update|delete|alter|create|drop|truncate)\b/i.test(normalized);
}

function readCacheKey(companyId: number, sql: string, params: unknown[]) {
  return JSON.stringify([companyId, sql.replace(/\s+/g, " ").trim(), params]);
}

function cloneQueryResult<T extends QueryResultRow>(result: QueryResult<QueryResultRow>): QueryResult<T> {
  return {
    ...result,
    rows: result.rows.map((row) => ({ ...row })) as T[],
  };
}

export function clearReadQueryCache() {
  readQueryCache.clear();
}

export function getDbPool(): Pool {
  if (!pool) {
    const { connectionString } = getDatabaseEnv();

    pool = new Pool({
      connectionString,
      max: 8,
      idleTimeoutMillis: 30_000,
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
  const cacheable = isCacheableRead(sql);
  const key = cacheable ? readCacheKey(companyId, sql, params) : "";

  if (cacheable) {
    const cached = readQueryCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cloneQueryResult<T>(cached.result);
    }

    const inFlight = inFlightReadQueries.get(key);
    if (inFlight) {
      return cloneQueryResult<T>(await inFlight);
    }
  } else {
    clearReadQueryCache();
  }

  const queryPromise = withCompanyContext(companyId, (client) => client.query<T>(sql, params)) as Promise<
    QueryResult<QueryResultRow>
  >;

  if (cacheable) inFlightReadQueries.set(key, queryPromise);

  let result: QueryResult<T>;
  try {
    result = (await queryPromise) as QueryResult<T>;
  } finally {
    if (cacheable) inFlightReadQueries.delete(key);
  }

  if (cacheable) {
    readQueryCache.set(key, {
      expiresAt: Date.now() + READ_CACHE_TTL_MS,
      result: cloneQueryResult<QueryResultRow>(result),
    });
  }

  return result;
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
