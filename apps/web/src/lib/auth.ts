import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDbPool } from "@/lib/db";
import { envValue } from "@/lib/env";
import { ApiError } from "@/lib/api-response";
import {
  SESSION_COOKIE,
  decodeSession,
  newSessionExpiry,
  type AuthSession,
} from "@/lib/session-token";

export {
  SESSION_COOKIE,
  encodeSession,
  decodeSession,
  sessionCookieOptions,
  type AuthSession,
} from "@/lib/session-token";

const STAFF_ROLES = new Set([
  "administrador",
  "jefe",
  "deposito",
  "logistica",
  "operador",
  "vendedor",
  "Empleado",
  "Empleado_1",
  "Empleado_2",
  "Jefe",
  "Jefe1",
  "Admin",
]);

type DbUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  username: string | null;
  role: string;
  active: boolean;
  company_id: string | null;
  company_name: string | null;
  company_role: string | null;
};

function normalizeRole(role: string) {
  return (
    {
      Admin: "administrador",
      Jefe1: "jefe",
      Jefe: "jefe",
      Empleado: "operador",
      Empleado1: "operador",
      Empleado2: "vendedor",
      Empleado_1: "operador",
      Empleado_2: "vendedor",
      Jefe0: "jefe",
    }[role] ?? role
  );
}

function supabaseUrl() {
  const value = envValue("SUPABASE_URL") || envValue("NEXT_PUBLIC_SUPABASE_URL");
  if (!value) throw new Error("Missing SUPABASE_URL");
  return value.replace(/\/+$/, "");
}

function supabaseAnonKey() {
  const value =
    envValue("SUPABASE_ANON_KEY") ||
    envValue("SUPABASE_PUBLISHABLE_KEY") ||
    envValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ||
    envValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!value) throw new Error("Missing SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY");
  return value;
}

export function supabaseServiceRoleKey() {
  const value = envValue("SUPABASE_SERVICE_ROLE_KEY");
  if (!value) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return value;
}

export function isStaffRole(role: string) {
  return STAFF_ROLES.has(normalizeRole(role));
}

async function signInWithPassword(email: string, password: string) {
  const key = supabaseAnonKey();
  const response = await fetch(`${supabaseUrl()}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) return null;
  const body = (await response.json()) as { user?: { id?: string; email?: string } };
  return body.user?.id ? body.user : null;
}

export async function authenticateUser(identifier: string, password: string): Promise<AuthSession | null> {
  const normalizedIdentifier = identifier.trim();
  if (!normalizedIdentifier || !password) return null;

  const userResult = await getDbPool().query<DbUser>(
    `
      SELECT p.id::text,
             p.full_name,
             p.email,
             p.username,
             p.role::text AS role,
             p.active,
             e.id::text AS company_id,
             e.nombre AS company_name,
             ue.role::text AS company_role
      FROM profiles p
      LEFT JOIN usuario_empresa ue ON ue.id_usuario = p.id AND ue.activo = TRUE
      LEFT JOIN empresas e ON e.id = ue.empresa_id AND e.activa = TRUE
      WHERE lower(p.email) = lower($1)
         OR lower(COALESCE(p.username, '')) = lower($1)
      ORDER BY e.id NULLS LAST
      LIMIT 1
    `,
    [normalizedIdentifier],
  );

  const user = userResult.rows[0];
  if (!user || !user.active || !user.email) return null;

  const authUser = await signInWithPassword(user.email, password);
  if (!authUser || authUser.id !== user.id) return null;

  const role = normalizeRole(user.company_role || user.role);

  return {
    userId: user.id,
    username: user.username || user.email,
    email: user.email,
    displayName: user.full_name || user.username || user.email,
    role,
    companyId: Number(user.company_id ?? 1),
    companyName: user.company_name || "Starlim",
    expiresAt: newSessionExpiry(),
  };
}

export async function registerPublicUser(input: {
  displayName: string;
  email: string;
  username: string;
  password: string;
}) {
  void input;
  throw new ApiError(403, "El registro publico esta deshabilitado. Un administrador debe crear el usuario.");
}

export async function currentSession() {
  const cookieStore = await cookies();
  return decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireSession() {
  const session = await currentSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireStaffSession() {
  const session = await requireSession();
  if (!isStaffRole(session.role)) redirect("/");
  return session;
}
