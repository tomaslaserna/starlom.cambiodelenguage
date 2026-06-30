import { existsSync, readFileSync } from "node:fs";

loadEnvFile("../../.env");
loadEnvFile(".env.local");
loadEnvFile(".env");

const missing = [];
const dangerous = [];
const warnings = [];

required("NEXT_PUBLIC_SUPABASE_URL");
requiredAny(
  ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"],
  "Supabase publishable/anon key",
);
required("SUPABASE_SERVICE_ROLE_KEY");
required("STARLIM_SESSION_SECRET");

if (!value("DATABASE_URL")) {
  required("SUPABASE_DB_HOST");
  required("SUPABASE_DB_USER");
  required("SUPABASE_DB_PASS");
}

if (value("STARLIM_SESSION_SECRET") && value("STARLIM_SESSION_SECRET").length < 32) {
  warnings.push("STARLIM_SESSION_SECRET should be at least 32 characters.");
}

for (const key of ["STARLIM_API_KEY", "STARLIM_WEBHOOK_URL", "SUPABASE_SERVICE_KEY"]) {
  if (value(key)) warnings.push(`${key} is obsolete and can be removed.`);
}

for (const key of ["NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_SERVICE_KEY", "NEXT_PUBLIC_SUPABASE_DB_PASS"]) {
  if (value(key)) dangerous.push(`${key} must never be public.`);
}

if (missing.length || dangerous.length) {
  if (missing.length) {
    console.error("Missing required environment variables:");
    for (const item of missing) console.error(`- ${item}`);
  }
  if (dangerous.length) {
    console.error("Dangerous public environment variables:");
    for (const item of dangerous) console.error(`- ${item}`);
  }
  process.exitCode = 1;
} else {
  console.log("Environment check passed.");
}

if (warnings.length) {
  console.warn("Environment warnings:");
  for (const item of warnings) console.warn(`- ${item}`);
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2]
      .replace(/\s+#.*$/, "")
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
}

function value(key) {
  return process.env[key]?.trim() || "";
}

function required(key) {
  if (!value(key)) missing.push(key);
}

function requiredAny(keys, label) {
  if (!keys.some((key) => value(key))) missing.push(`${label}: ${keys.join(" or ")}`);
}
