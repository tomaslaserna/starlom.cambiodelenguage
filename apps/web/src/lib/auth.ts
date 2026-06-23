import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac } from "node:crypto";
import bcrypt from "bcryptjs";
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

const STAFF_ROLES = new Set(["Empleado", "Empleado_1", "Empleado_2", "Jefe", "Jefe1", "Admin"]);

type DbUser = {
  id: number;
  nombre_completo: string;
  correo: string;
  usuario: string;
  contrasena: string;
  rango: string;
  activo: number;
};

function normalizeRole(role: string) {
  return (
    {
      Empleado1: "Empleado_1",
      Empleado2: "Empleado_2",
      Jefe0: "Jefe",
    }[role] ?? role
  );
}

function pepper() {
  return envValue("STARLIM_PEPPER") || "57@r_L1m:---(2026)";
}

function passwordDigest(password: string) {
  return createHmac("sha256", pepper()).update(password).digest("hex");
}

export function isStaffRole(role: string) {
  return STAFF_ROLES.has(normalizeRole(role));
}

export async function verifyLegacyPassword(password: string, hash: string) {
  return bcrypt.compare(passwordDigest(password), hash);
}

export async function hashLegacyPassword(password: string) {
  return bcrypt.hash(passwordDigest(password), 10);
}

export async function authenticateUser(identifier: string, password: string): Promise<AuthSession | null> {
  const normalizedIdentifier = identifier.trim();
  if (!normalizedIdentifier || !password) return null;

  const userResult = await getDbPool().query<DbUser>(
    `
      SELECT id, nombre_completo, correo, usuario, contrasena, rango, activo
      FROM usuarios
      WHERE correo = $1 OR usuario = $1
      LIMIT 1
    `,
    [normalizedIdentifier],
  );

  const user = userResult.rows[0];
  if (!user || Number(user.activo) === 0) return null;

  const validPassword = await verifyLegacyPassword(password, user.contrasena);
  if (!validPassword) return null;

  const membershipResult = await getDbPool().query<{
    id: string;
    nombre: string;
    rango: string;
  }>(
    `
      SELECT e.id::text, e.nombre, ue.rango
      FROM usuario_empresa ue
      JOIN empresas e ON e.id = ue.empresa_id
      WHERE ue.id_usuario = $1
        AND ue.activo = TRUE
        AND e.activa = TRUE
      ORDER BY e.id
      LIMIT 1
    `,
    [user.id],
  );

  const membership = membershipResult.rows[0];
  const role = normalizeRole(membership?.rango || user.rango);

  return {
    userId: user.id,
    username: user.usuario,
    email: user.correo,
    displayName: user.nombre_completo || user.usuario,
    role,
    companyId: Number(membership?.id ?? 1),
    companyName: membership?.nombre || "Starlim",
    expiresAt: newSessionExpiry(),
  };
}

export async function registerPublicUser(input: {
  displayName: string;
  email: string;
  username: string;
  password: string;
}) {
  const displayName = input.displayName.trim();
  const email = input.email.trim();
  const username = input.username.trim();
  if (!displayName || !email || !username || !input.password) {
    throw new ApiError(400, "Completa todos los campos");
  }
  if (!email.includes("@")) throw new ApiError(400, "Email invalido");
  if (input.password.length < 6) {
    throw new ApiError(400, "La contrasena debe tener al menos 6 caracteres");
  }

  const poolClient = await getDbPool().connect();
  try {
    await poolClient.query("BEGIN");
    const duplicateEmail = await poolClient.query(
      "SELECT id FROM usuarios WHERE lower(correo) = lower($1) LIMIT 1",
      [email],
    );
    if (duplicateEmail.rows[0]) throw new ApiError(409, "email_exists");

    const duplicateUsername = await poolClient.query(
      "SELECT id FROM usuarios WHERE lower(usuario) = lower($1) LIMIT 1",
      [username],
    );
    if (duplicateUsername.rows[0]) throw new ApiError(409, "user_exists");

    const passwordHash = await hashLegacyPassword(input.password);
    const created = await poolClient.query<{ id: number }>(
      `
        INSERT INTO usuarios (nombre_completo, correo, usuario, contrasena, rango)
        VALUES ($1, $2, $3, $4, 'Minorista')
        RETURNING id
      `,
      [displayName, email, username, passwordHash],
    );
    const userId = created.rows[0].id;
    const companyId = 1;
    await poolClient.query(
      `
        INSERT INTO usuario_empresa (id_usuario, empresa_id, rango, activo)
        VALUES ($1, $2, 'Minorista', TRUE)
        ON CONFLICT (id_usuario, empresa_id) DO UPDATE
        SET rango = EXCLUDED.rango, activo = TRUE, updated_at = CURRENT_TIMESTAMP
      `,
      [userId, companyId],
    );
    await poolClient.query("COMMIT");

    return {
      userId,
      username,
      email,
      displayName,
      role: "Minorista",
      companyId,
      companyName: "Starlim",
      expiresAt: newSessionExpiry(),
    } satisfies AuthSession;
  } catch (error) {
    await poolClient.query("ROLLBACK");
    throw error;
  } finally {
    poolClient.release();
  }
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
