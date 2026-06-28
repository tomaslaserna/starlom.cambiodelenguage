import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { getDatabaseEnv } from "@/lib/env";

let pool: Pool | null = null;

const READ_CACHE_TTL_MS = 90_000;
const readQueryCache = new Map<string, { expiresAt: number; result: QueryResult<QueryResultRow>; tables: Set<string> }>();
const inFlightReadQueries = new Map<string, Promise<QueryResult<QueryResultRow>>>();

function isCacheableRead(sql: string) {
  const normalized = sql.trim();
  if (!/^(select|with)\b/i.test(normalized)) return false;
  return !/\b(insert|update|delete|alter|create|drop|truncate)\b/i.test(normalized);
}

function readCacheKey(companyId: number, sql: string, params: unknown[]) {
  return JSON.stringify([companyId, sql.replace(/\s+/g, " ").trim(), params]);
}

function extractSqlTables(sql: string) {
  const tables = new Set<string>();
  const normalized = sql.replace(/"([^"]+)"/g, "$1");
  const patterns = [
    /\bfrom\s+([a-z_][a-z0-9_\.]*)/gi,
    /\bjoin\s+([a-z_][a-z0-9_\.]*)/gi,
    /\binsert\s+into\s+([a-z_][a-z0-9_\.]*)/gi,
    /\bupdate\s+([a-z_][a-z0-9_\.]*)/gi,
    /\bdelete\s+from\s+([a-z_][a-z0-9_\.]*)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const table = match[1]?.split(".").pop();
      if (table && !["select", "values", "lateral"].includes(table.toLowerCase())) {
        tables.add(table.toLowerCase());
      }
    }
  }

  return tables;
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

function clearReadQueryCacheForTables(tables: Set<string>) {
  if (!tables.size) {
    clearReadQueryCache();
    return;
  }

  for (const [key, entry] of readQueryCache) {
    for (const table of tables) {
      if (entry.tables.has(table)) {
        readQueryCache.delete(key);
        break;
      }
    }
  }
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
    clearReadQueryCacheForTables(extractSqlTables(sql));
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
      tables: extractSqlTables(sql),
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
