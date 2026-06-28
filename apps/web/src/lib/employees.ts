import { ApiError } from "@/lib/api-response";
import { supabaseServiceRoleKey, type AuthSession } from "@/lib/auth";
import { clearReadQueryCache, queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { envValue } from "@/lib/env";
import { textField, type RequestBody } from "@/lib/request-body";

const APP_ROLES = ["administrador", "jefe", "deposito", "logistica", "operador", "vendedor"] as const;
type AppRole = (typeof APP_ROLES)[number];

const LEGACY_ROLE_MAP: Record<string, AppRole> = {
  Admin: "administrador",
  Jefe1: "jefe",
  Jefe: "jefe",
  Empleado: "operador",
  Empleado_1: "operador",
  Empleado_2: "vendedor",
};

function normalizeRole(value: string): AppRole {
  const mapped = LEGACY_ROLE_MAP[value] ?? value;
  return APP_ROLES.includes(mapped as AppRole) ? (mapped as AppRole) : "operador";
}

function supabaseUrl() {
  const value = envValue("SUPABASE_URL") || envValue("NEXT_PUBLIC_SUPABASE_URL");
  if (!value) throw new Error("Missing SUPABASE_URL");
  return value.replace(/\/+$/, "");
}

function serviceHeaders() {
  const key = supabaseServiceRoleKey();
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  };
}

function assignableRolesFor(sessionRole: string): AppRole[] {
  const role = normalizeRole(sessionRole);
  if (role === "administrador") return [...APP_ROLES];
  if (role === "jefe") return ["deposito", "logistica", "operador", "vendedor"];
  return [];
}

function permissionKeysFromBody(body: RequestBody) {
  const raw = body.permissionKeys ?? body.permissionIds ?? body.permisos ?? [];
  const values = Array.isArray(raw) ? raw : [raw];
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))];
}

export function employeeInputFromBody(body: RequestBody, isCreate: boolean) {
  const name = textField(body, "name") || textField(body, "nombre");
  const lastName = textField(body, "lastName") || textField(body, "apellido");
  const email = textField(body, "email") || textField(body, "correo");
  const username = textField(body, "username") || textField(body, "usuario");
  const password = textField(body, "password") || textField(body, "contrasena");
  const role = normalizeRole(textField(body, "role") || textField(body, "rango") || "operador");

  if (!name || !username || !email) throw new ApiError(400, "Completa nombre, usuario y email");
  if (!email.includes("@")) throw new ApiError(400, "Email invalido");
  if (isCreate && password.length < 6) throw new ApiError(400, "La contrasena debe tener al menos 6 caracteres");
  if (!isCreate && password && password.length < 6) {
    throw new ApiError(400, "La nueva contrasena debe tener al menos 6 caracteres");
  }

  return {
    displayName: `${name} ${lastName}`.trim(),
    name,
    lastName,
    email,
    username,
    role,
    active:
      body.active === undefined && body.activo === undefined
        ? true
        : Boolean(body.active ?? body.activo),
    title: textField(body, "title") || textField(body, "cargo"),
    password,
    permissionKeys: permissionKeysFromBody(body),
  };
}

async function createAuthUser(input: ReturnType<typeof employeeInputFromBody>) {
  const response = await fetch(`${supabaseUrl()}/auth/v1/admin/users`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        full_name: input.displayName,
        username: input.username,
        title: input.title,
      },
    }),
  });

  const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string; msg?: string };
  if (!response.ok || !body.id) {
    throw new ApiError(response.status || 500, body.error || body.msg || "No se pudo crear el usuario en Supabase Auth");
  }
  return body.id;
}

async function updateAuthUser(id: string, input: ReturnType<typeof employeeInputFromBody>) {
  const payload: Record<string, unknown> = {
    email: input.email,
    user_metadata: {
      full_name: input.displayName,
      username: input.username,
      title: input.title,
    },
  };
  if (input.password) payload.password = input.password;

  const response = await fetch(`${supabaseUrl()}/auth/v1/admin/users/${id}`, {
    method: "PUT",
    headers: serviceHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string; msg?: string };
    throw new ApiError(response.status, body.error || body.msg || "No se pudo actualizar el usuario en Supabase Auth");
  }
}

async function assertEmployeeEditable(session: AuthSession, targetId: string, currentUserId?: string) {
  if (currentUserId && targetId === currentUserId) {
    throw new ApiError(400, "No podes modificar tu propio estado desde esta accion");
  }

  const result = await queryWithCompanyContext<{ role: string }>(
    session.companyId,
    `
      SELECT ue.role::text AS role
      FROM usuario_empresa ue
      WHERE ue.id_usuario = $1::uuid AND ue.empresa_id = $2
      LIMIT 1
    `,
    [targetId, session.companyId],
  );
  const target = result.rows[0];
  if (!target) throw new ApiError(404, "Empleado no encontrado");

  if (normalizeRole(target.role) === "administrador" && normalizeRole(session.role) !== "administrador") {
    throw new ApiError(403, "No tenes permiso para modificar un administrador");
  }
}

async function filterPermissionKeysForActor(session: AuthSession, keys: string[]) {
  if (!keys.length) return [];
  const role = normalizeRole(session.role);
  const result = await queryWithCompanyContext<{ key: string; sensitive: boolean }>(
    session.companyId,
    `
      SELECT key, sensitive
      FROM app_permissions
      WHERE key = ANY($1)
      ORDER BY key
    `,
    [keys],
  );

  if (role === "administrador") return result.rows.map((row) => row.key);
  if (role === "jefe") return result.rows.filter((row) => !row.sensitive).map((row) => row.key);
  return [];
}

async function saveEmployeePermissions(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  companyId: number,
  userId: string,
  grantedBy: string,
  permissionKeys: string[],
) {
  await client.query("DELETE FROM profile_permissions WHERE profile_id = $1::uuid AND empresa_id = $2", [
    userId,
    companyId,
  ]);
  for (const permissionKey of permissionKeys) {
    await client.query(
      `
        INSERT INTO profile_permissions (profile_id, empresa_id, permission_key, granted_by)
        VALUES ($1::uuid, $2, $3, $4::uuid)
        ON CONFLICT DO NOTHING
      `,
      [userId, companyId, permissionKey, grantedBy],
    );
  }
}

export async function listEmployees(companyId: number) {
  const employees = await queryWithCompanyContext<{
    id: string;
    full_name: string | null;
    email: string | null;
    username: string | null;
    title: string | null;
    role: string;
    active: boolean;
    created_at: string | null;
    permission_keys: string[] | null;
  }>(
    companyId,
    `
      SELECT p.id::text,
             p.full_name,
             p.email,
             p.username,
             p.title,
             ue.role::text AS role,
             p.active AND ue.activo AS active,
             p.created_at::text,
             COALESCE(
               ARRAY_AGG(DISTINCT perm.permission_key) FILTER (WHERE perm.permission_key IS NOT NULL),
               ARRAY[]::text[]
             ) AS permission_keys
      FROM profiles p
      JOIN usuario_empresa ue ON ue.id_usuario = p.id AND ue.empresa_id = $1
      LEFT JOIN (
        SELECT profile_id, empresa_id, permission_key FROM profile_permissions
        UNION
        SELECT ue2.id_usuario AS profile_id, ue2.empresa_id, rp.permission_key
        FROM usuario_empresa ue2
        JOIN role_permissions rp ON rp.role = ue2.role
      ) perm ON perm.profile_id = p.id AND perm.empresa_id = ue.empresa_id
      WHERE ue.empresa_id = $1
      GROUP BY p.id, p.full_name, p.email, p.username, p.title, ue.role, p.active, ue.activo, p.created_at
      ORDER BY p.full_name ASC NULLS LAST, p.email ASC
    `,
    [companyId],
  );

  return employees.rows.map((row) => ({
    id: row.id,
    displayName: row.full_name || row.username || row.email || row.id,
    name: row.full_name || row.username || "",
    lastName: "",
    document: "",
    phone: "",
    email: row.email || "",
    username: row.username || row.email || "",
    role: normalizeRole(row.role),
    title: row.title || "",
    active: row.active,
    hireDate: row.created_at,
    notes: "",
    permissionIds: row.permission_keys ?? [],
  }));
}

export async function listEmployeePermissions(companyId: number) {
  const result = await queryWithCompanyContext<{
    key: string;
    module: string;
    action: string;
    label: string;
    sensitive: boolean;
  }>(
    companyId,
    `
      SELECT key, module, action, label, sensitive
      FROM app_permissions
      ORDER BY sensitive ASC, module ASC, action ASC, key ASC
    `,
  );

  return result.rows.map((row) => ({
    id: row.key,
    key: row.key,
    module: row.module,
    action: row.action,
    name: row.label,
    sensitive: row.sensitive,
  }));
}

export async function createEmployee(session: AuthSession, body: RequestBody) {
  const input = employeeInputFromBody(body, true);
  const assignableRoles = assignableRolesFor(session.role);
  if (!assignableRoles.includes(input.role)) throw new ApiError(403, "No podes asignar ese rol");

  const permissionKeys = await filterPermissionKeysForActor(session, input.permissionKeys);
  const userId = await createAuthUser(input);

  return withCompanyContext(session.companyId, async (client) => {
    await client.query(
      `
        INSERT INTO profiles (id, full_name, email, username, title, role, active)
        VALUES ($1::uuid, $2, $3, $4, $5, $6::user_role, $7)
        ON CONFLICT (id) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            email = EXCLUDED.email,
            username = EXCLUDED.username,
            title = EXCLUDED.title,
            role = EXCLUDED.role,
            active = EXCLUDED.active,
            updated_at = now()
      `,
      [userId, input.displayName, input.email, input.username, input.title, input.role, input.active],
    );
    await client.query(
      `
        INSERT INTO usuario_empresa (id_usuario, empresa_id, role, activo)
        VALUES ($1::uuid, $2, $3::user_role, $4)
        ON CONFLICT (id_usuario, empresa_id) DO UPDATE
        SET role = EXCLUDED.role, activo = EXCLUDED.activo, updated_at = now()
      `,
      [userId, session.companyId, input.role, input.active],
    );
    await saveEmployeePermissions(client, session.companyId, userId, session.userId, permissionKeys);
    clearReadQueryCache();
    return { id: userId };
  });
}

export async function updateEmployee(session: AuthSession, id: string, body: RequestBody) {
  await assertEmployeeEditable(session, id);
  const input = employeeInputFromBody(body, false);
  const assignableRoles = assignableRolesFor(session.role);
  if (!assignableRoles.includes(input.role)) throw new ApiError(403, "No podes asignar ese rol");

  const permissionKeys = await filterPermissionKeysForActor(session, input.permissionKeys);
  await updateAuthUser(id, input);

  return withCompanyContext(session.companyId, async (client) => {
    await client.query(
      `
        UPDATE profiles
        SET full_name = $1,
            email = $2,
            username = $3,
            title = $4,
            role = $5::user_role,
            active = $6,
            updated_at = now()
        WHERE id = $7::uuid
      `,
      [input.displayName, input.email, input.username, input.title, input.role, input.active, id],
    );
    await client.query(
      `
        INSERT INTO usuario_empresa (id_usuario, empresa_id, role, activo)
        VALUES ($1::uuid, $2, $3::user_role, $4)
        ON CONFLICT (id_usuario, empresa_id) DO UPDATE
        SET role = EXCLUDED.role, activo = EXCLUDED.activo, updated_at = now()
      `,
      [id, session.companyId, input.role, input.active],
    );
    await saveEmployeePermissions(client, session.companyId, id, session.userId, permissionKeys);
    clearReadQueryCache();
    return { id };
  });
}

export async function toggleEmployeeStatus(session: AuthSession, id: string) {
  await assertEmployeeEditable(session, id, session.userId);
  const result = await queryWithCompanyContext<{ id: string; active: boolean }>(
    session.companyId,
    `
      UPDATE profiles
      SET active = NOT active, updated_at = now()
      WHERE id = $1::uuid
      RETURNING id::text, active
    `,
    [id],
  );
  if (!result.rows[0]) throw new ApiError(404, "Empleado no encontrado");

  await queryWithCompanyContext(
    session.companyId,
    "UPDATE usuario_empresa SET activo = $1, updated_at = now() WHERE id_usuario = $2::uuid AND empresa_id = $3",
    [result.rows[0].active, id, session.companyId],
  );
  clearReadQueryCache();

  return { id, active: result.rows[0].active };
}
