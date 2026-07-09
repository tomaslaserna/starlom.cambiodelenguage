import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dirname, "../../..");
const webRoot = join(repoRoot, "apps/web");

const trackedFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  cwd: repoRoot,
  encoding: "utf8",
})
  .split(/\r?\n/)
  .map((path) => path.trim())
  .filter(Boolean)
  .filter((path) => path.startsWith("apps/web/") || path.startsWith(".github/") || path.startsWith("migrations/"))
  .filter((path) => !path.includes("/node_modules/") && !path.includes("/.next/") && !path.endsWith("package-lock.json"));

const checks = [
  {
    label: "Supabase secret key",
    pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/,
  },
  {
    label: "private key material",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/,
  },
  {
    label: "non-empty service role env assignment",
    pattern: /(?:^|\n)[^\S\r\n]*(?:NEXT_PUBLIC_)?SUPABASE_SERVICE_ROLE_KEY[^\S\r\n]*=[^\S\r\n]*["']?[^"'\s<#][^"'\n#]*/i,
  },
  {
    label: "non-empty database password env assignment",
    pattern: /(?:^|\n)[^\S\r\n]*(?:NEXT_PUBLIC_)?SUPABASE_DB_PASS[^\S\r\n]*=[^\S\r\n]*["']?[^"'\s<#][^"'\n#]*/i,
  },
  {
    label: "non-empty session secret env assignment",
    pattern: /(?:^|\n)[^\S\r\n]*STARLIM_SESSION_SECRET[^\S\r\n]*=[^\S\r\n]*["']?[^"'\s<#][^"'\n#]*/i,
  },
  {
    label: "hardcoded Postgres URL",
    pattern: /postgres(?:ql)?:\/\/[^:\s/$]+:[^@\s$]+@/i,
  },
];

const findings = [];
for (const path of trackedFiles) {
  const content = readFileSync(join(repoRoot, path), "utf8");
  for (const check of checks) {
    if (check.pattern.test(content)) {
      findings.push(`${path}: ${check.label}`);
    }
  }
}

const packageJson = JSON.parse(readFileSync(join(webRoot, "package.json"), "utf8"));
for (const [name, version] of Object.entries({ ...packageJson.dependencies, ...packageJson.devDependencies })) {
  if (typeof version !== "string") continue;
  if (/^(latest|\*|workspace:\*|file:|git\+|https?:)/.test(version)) {
    findings.push(`package.json: unsafe dependency spec for ${name}: ${version}`);
  }
}

if (findings.length) {
  console.error("Security scan failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("Security scan passed.");
