import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getDbPool } from "@/lib/db";
import { envValue } from "@/lib/env";
import { ApiError } from "@/lib/api-response";
import {
  SESSION_COOKIE,
  SESSION_REVALIDATE_SECONDS,
  decodeSession,
  encodeSession,
  newSessionTiming,
  sessionCookieOptions,
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

export function normalizeRole(role: string) {
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

const ADMIN_ROLES = new Set(["administrador", "jefe"]);

// True for the administration roles (jefe / administrador). Used to gate writes
// on shared company resources.
export function isAdminRole(role: string) {
  return ADMIN_ROLES.has(normalizeRole(role));
}

export function publicSessionUser(session: AuthSession) {
  return {
    userId: session.userId,
    username: session.username,
    email: session.email,
    displayName: session.displayName,
    role: session.role,
    companyId: session.companyId,
    companyName: session.companyName,
  };
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

export type PasswordRecoveryRequestResult = "sent" | "rate_limited" | "unavailable";

export async function requestPasswordRecoveryEmail(
  email: string,
  redirectTo: string,
): Promise<PasswordRecoveryRequestResult> {
  const supabase = createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "implicit",
      persistSession: false,
    },
  });
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  if (!error) return "sent";
  if (error.status === 429) return "rate_limited";

  console.error("[Starlim Auth] Password recovery request failed", {
    code: error.code,
    status: error.status,
  });
  return error.status && error.status >= 500 ? "unavailable" : "sent";
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
  if (!user || !user.active || !user.email || !user.company_id || !user.company_name) return null;

  const authUser = await signInWithPassword(user.email, password);
  if (!authUser || authUser.id !== user.id) return null;

  const role = normalizeRole(user.company_role || user.role);

  return {
    userId: user.id,
    username: user.username || user.email,
    email: user.email,
    displayName: user.full_name || user.username || user.email,
    role,
    companyId: Number(user.company_id),
    companyName: user.company_name,
    ...newSessionTiming(),
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

export function sessionNeedsIdentityValidation(session: AuthSession, now = Math.floor(Date.now() / 1000)) {
  return !session.validatedAt || now - session.validatedAt >= SESSION_REVALIDATE_SECONDS;
}

export async function validateSessionIdentity(session: AuthSession): Promise<AuthSession | null> {
  const result = await getDbPool().query<DbUser>(
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
      JOIN usuario_empresa ue
        ON ue.id_usuario = p.id
       AND ue.empresa_id = $2
       AND ue.activo = TRUE
      JOIN empresas e
        ON e.id = ue.empresa_id
       AND e.activa = TRUE
      WHERE p.id = $1::uuid
      LIMIT 1
    `,
    [session.userId, session.companyId],
  );
  const user = result.rows[0];
  if (!user || !user.active || !user.email || !user.company_id || !user.company_name) return null;

  return {
    ...session,
    username: user.username || user.email,
    email: user.email,
    displayName: user.full_name || user.username || user.email,
    role: normalizeRole(user.company_role || user.role),
    companyId: Number(user.company_id),
    companyName: user.company_name,
    validatedAt: Math.floor(Date.now() / 1000),
  };
}

export async function persistSession(session: AuthSession) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, encodeSession(session), sessionCookieOptions());
}

export async function requireSession() {
  let session = await currentSession();
  if (!session) redirect("/login");
  if (sessionNeedsIdentityValidation(session)) {
    const validated = await validateSessionIdentity(session);
    if (!validated) redirect("/login?expired=1");
    session = validated;
  }
  return session;
}

export async function requireStaffSession() {
  const session = await requireSession();
  if (!isStaffRole(session.role)) redirect("/");
  return session;
}
