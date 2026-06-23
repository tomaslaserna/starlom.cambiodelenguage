export type DatabaseEnv = {
  connectionString: string;
  source: "DATABASE_URL" | "SUPABASE_DB";
};

export function envValue(key: string): string | undefined {
  const value = process.env[key]?.trim();
  if (value) return value;
}

export function getDatabaseEnv(): DatabaseEnv {
  const databaseUrl = envValue("DATABASE_URL");
  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      source: "DATABASE_URL",
    };
  }

  const host = envValue("SUPABASE_DB_HOST");
  const port = envValue("SUPABASE_DB_PORT") || "6543";
  const database = envValue("SUPABASE_DB_NAME") || "postgres";
  const user = envValue("SUPABASE_DB_USER");
  const password = envValue("SUPABASE_DB_PASS") ?? "";

  const missing = [
    ["SUPABASE_DB_HOST", host],
    ["SUPABASE_DB_USER", user],
    ["SUPABASE_DB_PASS", password],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing database environment variables: ${missing.join(", ")}`);
  }

  const encodedUser = encodeURIComponent(user as string);
  const encodedPassword = encodeURIComponent(password);

  return {
    connectionString: `postgres://${encodedUser}:${encodedPassword}@${host}:${port}/${database}`,
    source: "SUPABASE_DB",
  };
}
