import { ApiError } from "@/lib/api-response";
import { hashLegacyPassword, type AuthSession } from "@/lib/auth";
import { queryWithCompanyContext, withCompanyContext } from "@/lib/db";
import { textField, type RequestBody } from "@/lib/request-body";

const ROLE_ALIASES: Record<string, string> = {
  Empleado1: "Empleado_1",
  Empleado2: "Empleado_2",
  Jefe0: "Jefe",
};

function normalizeRole(role: string) {
  return ROLE_ALIASES[role] ?? role;
}

function allowedRoles(currentRole: string) {
  const roles = ["Empleado", "Empleado_1", "Empleado_2", "Jefe"];
  if (currentRole === "Admin") roles.push("Jefe1", "Admin");
  return roles;
}

function permissionIdsFromBody(body: RequestBody) {
  const raw = body.permissionIds ?? body.permisos ?? [];
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

export function employeeInputFromBody(body: RequestBody, isCreate: boolean) {
  const name = textField(body, "name") || textField(body, "nombre");
  const lastName = textField(body, "lastName") || textField(body, "apellido");
  const email = textField(body, "email") || textField(body, "correo");
  const username = textField(body, "username") || textField(body, "usuario");
  const password = textField(body, "password") || textField(body, "contrasena");
  const role = normalizeRole(textField(body, "role") || textField(body, "rango") || "Empleado");

  if (!name || !username || !email) throw new ApiError(400, "Completa nombre, usuario y email");
  if (!email.includes("@")) throw new ApiError(400, "Email invalido");
  if (isCreate && password.length < 6) {
    throw new ApiError(400, "La contrasena debe tener al menos 6 caracteres");
  }
  if (!isCreate && password && password.length < 6) {
    throw new ApiError(400, "La nueva contrasena debe tener al menos 6 caracteres");
  }

  const phone = textField(body, "phone") || textField(body, "telefono");
  const document = textField(body, "document") || textField(body, "dni");
  if (phone.length > 30 || document.length > 30) {
    throw new ApiError(400, "DNI o telefono demasiado largo");
  }

  return {
    name,
    lastName,
    document,
    phone,
    email,
    username,
    role,
    active:
      body.active === undefined && body.activo === undefined
        ? true
        : Boolean(body.active ?? body.activo),
    title: textField(body, "title") || textField(body, "cargo"),
    hireDate: textField(body, "hireDate") || textField(body, "fecha_ingreso") || null,
    notes: textField(body, "notes") || textField(body, "observaciones"),
    password,
    permissionIds: permissionIdsFromBody(body),
  };
}

function mapEmployee(row: {
  id: number;
  nombre_completo: string;
  nombre: string;
  apellido: string;
  dni: string;
  telefono: string;
  correo: string;
  usuario: string;
  rango: string;
  cargo: string;
  activo: number;
  fecha_ingreso: string | null;
  observaciones: string;
  empresa_rango: string | null;
  empresa_activo: boolean | null;
}) {
  return {
    id: row.id,
    displayName: row.nombre_completo,
    name: row.nombre,
    lastName: row.apellido,
    document: row.dni,
    phone: row.telefono,
    email: row.correo,
    username: row.usuario,
    role: normalizeRole(row.empresa_rango || row.rango),
    title: row.cargo,
    active: Number(row.activo) !== 0 && row.empresa_activo !== false,
    hireDate: row.fecha_ingreso,
    notes: row.observaciones,
  };
}

export async function listEmployees(companyId: number) {
  const employees = await queryWithCompanyContext<Parameters<typeof mapEmployee>[0]>(
    companyId,
    `
      SELECT u.id, u.nombre_completo, u.nombre, u.apellido, u.dni, u.telefono,
             u.correo, u.usuario, u.rango, u.cargo, u.activo,
             u.fecha_ingreso::text, u.observaciones,
             ue.rango AS empresa_rango, ue.activo AS empresa_activo
      FROM usuarios u
      JOIN usuario_empresa ue ON ue.id_usuario = u.id AND ue.empresa_id = $1
      WHERE ue.empresa_id = $1
        AND u.rango NOT IN ('Minorista', 'Mayorista')
      ORDER BY u.nombre_completo ASC, u.usuario ASC
    `,
    [companyId],
  );

  const permissions = await queryWithCompanyContext<{ id_usuario: number; id_permiso: number }>(
    companyId,
    "SELECT id_usuario, id_permiso FROM app_usuario_permisos WHERE empresa_id = $1 ORDER BY id_usuario, id_permiso",
    [companyId],
  );
  const permissionMap = new Map<number, number[]>();
  for (const permission of permissions.rows) {
    const list = permissionMap.get(permission.id_usuario) ?? [];
    list.push(permission.id_permiso);
    permissionMap.set(permission.id_usuario, list);
  }

  return employees.rows.map((row) => ({
    ...mapEmployee(row),
    permissionIds: permissionMap.get(row.id) ?? [],
  }));
}

export async function listEmployeePermissions(companyId: number) {
  const result = await queryWithCompanyContext<{
    id: number;
    clave: string;
    modulo: string;
    accion: string;
    nombre: string;
  }>(
    companyId,
    `
      SELECT id, clave, modulo, accion, nombre
      FROM app_permisos
      ORDER BY modulo ASC, accion ASC, clave ASC
    `,
  );

  return result.rows.map((row) => ({
    id: row.id,
    key: row.clave,
    module: row.modulo,
    action: row.accion,
    name: row.nombre,
  }));
}

async function assertEmployeeEditable(
  session: AuthSession,
  targetId: number,
  currentUsername: string | null,
) {
  const result = await queryWithCompanyContext<{ usuario: string; rango: string }>(
    session.companyId,
    `
      SELECT u.usuario, COALESCE(ue.rango, u.rango) AS rango
      FROM usuarios u
      JOIN usuario_empresa ue ON ue.id_usuario = u.id AND ue.empresa_id = $2
      WHERE u.id = $1
      LIMIT 1
    `,
    [targetId, session.companyId],
  );
  const target = result.rows[0];
  if (!target) throw new ApiError(404, "Empleado no encontrado");
  if (currentUsername && target.usuario === currentUsername) {
    throw new ApiError(400, "No podes modificar tu propio estado desde esta accion");
  }
  if (target.rango === "Admin" && session.role !== "Admin") {
    throw new ApiError(403, "No tenes permiso para modificar un Admin");
  }
}

export async function createEmployee(session: AuthSession, body: RequestBody) {
  const input = employeeInputFromBody(body, true);
  const finalRole = allowedRoles(session.role).includes(input.role) ? input.role : "Empleado";

  return withCompanyContext(session.companyId, async (client) => {
    const duplicate = await client.query(
      "SELECT id FROM usuarios WHERE usuario = $1 OR correo = $2 LIMIT 1",
      [input.username, input.email],
    );
    if (duplicate.rows[0]) throw new ApiError(409, "Ya existe un empleado con ese usuario o email");

    const passwordHash = await hashLegacyPassword(input.password);
    const displayName = `${input.name} ${input.lastName}`.trim();
    const created = await client.query<{ id: number }>(
      `
        INSERT INTO usuarios (
          nombre_completo, nombre, apellido, dni, telefono, correo, usuario, contrasena,
          rango, cargo, activo, fecha_ingreso, observaciones
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
      `,
      [
        displayName,
        input.name,
        input.lastName,
        input.document,
        input.phone,
        input.email,
        input.username,
        passwordHash,
        finalRole,
        input.title,
        input.active ? 1 : 0,
        input.hireDate,
        input.notes,
      ],
    );
    const id = created.rows[0].id;

    await client.query(
      `
        INSERT INTO usuario_empresa (id_usuario, empresa_id, rango, activo)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id_usuario, empresa_id) DO UPDATE
        SET rango = EXCLUDED.rango, activo = EXCLUDED.activo, updated_at = CURRENT_TIMESTAMP
      `,
      [id, session.companyId, finalRole, input.active],
    );
    await syncEmployeeRole(client, session.companyId, id, finalRole);
    await saveEmployeePermissions(client, session.companyId, id, input.permissionIds);

    return { id };
  });
}

export async function updateEmployee(session: AuthSession, id: number, body: RequestBody) {
  await assertEmployeeEditable(session, id, null);
  const input = employeeInputFromBody(body, false);
  const finalRole = allowedRoles(session.role).includes(input.role) ? input.role : "Empleado";

  return withCompanyContext(session.companyId, async (client) => {
    const duplicate = await client.query(
      "SELECT id FROM usuarios WHERE (usuario = $1 OR correo = $2) AND id <> $3 LIMIT 1",
      [input.username, input.email, id],
    );
    if (duplicate.rows[0]) throw new ApiError(409, "Ya existe un empleado con ese usuario o email");

    const displayName = `${input.name} ${input.lastName}`.trim();
    const params: unknown[] = [
      displayName,
      input.name,
      input.lastName,
      input.document,
      input.phone,
      input.email,
      input.username,
      finalRole,
      input.title,
      input.active ? 1 : 0,
      input.hireDate,
      input.notes,
    ];
    let passwordSql = "";
    if (input.password) {
      params.push(await hashLegacyPassword(input.password));
      passwordSql = `, contrasena = $${params.length}`;
    }
    params.push(id);

    await client.query(
      `
        UPDATE usuarios
        SET nombre_completo = $1, nombre = $2, apellido = $3, dni = $4,
            telefono = $5, correo = $6, usuario = $7, rango = $8, cargo = $9,
            activo = $10, fecha_ingreso = $11, observaciones = $12
            ${passwordSql}
        WHERE id = $${params.length}
      `,
      params,
    );

    await client.query(
      `
        INSERT INTO usuario_empresa (id_usuario, empresa_id, rango, activo)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id_usuario, empresa_id) DO UPDATE
        SET rango = EXCLUDED.rango, activo = EXCLUDED.activo, updated_at = CURRENT_TIMESTAMP
      `,
      [id, session.companyId, finalRole, input.active],
    );
    await syncEmployeeRole(client, session.companyId, id, finalRole);
    await saveEmployeePermissions(client, session.companyId, id, input.permissionIds);

    return { id };
  });
}

export async function toggleEmployeeStatus(session: AuthSession, id: number) {
  await assertEmployeeEditable(session, id, session.username);
  const result = await queryWithCompanyContext<{ id: number; active: number }>(
    session.companyId,
    `
      UPDATE usuarios
      SET activo = CASE WHEN COALESCE(activo, 1) = 1 THEN 0 ELSE 1 END
      WHERE id = $1
      RETURNING id, activo AS active
    `,
    [id],
  );
  if (!result.rows[0]) throw new ApiError(404, "Empleado no encontrado");

  await queryWithCompanyContext(
    session.companyId,
    "UPDATE usuario_empresa SET activo = $1, updated_at = CURRENT_TIMESTAMP WHERE id_usuario = $2 AND empresa_id = $3",
    [Number(result.rows[0].active) !== 0, id, session.companyId],
  );

  return { id, active: Number(result.rows[0].active) !== 0 };
}

async function syncEmployeeRole(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  companyId: number,
  userId: number,
  role: string,
) {
  await client.query("DELETE FROM app_usuario_roles WHERE id_usuario = $1 AND empresa_id = $2", [
    userId,
    companyId,
  ]);
  await client.query(
    `
      INSERT INTO app_usuario_roles (id_usuario, empresa_id, id_rol)
      SELECT $1, $2, id FROM app_roles WHERE clave = $3
      ON CONFLICT DO NOTHING
    `,
    [userId, companyId, role],
  );
}

async function saveEmployeePermissions(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  companyId: number,
  userId: number,
  permissionIds: number[],
) {
  await client.query("DELETE FROM app_usuario_permisos WHERE id_usuario = $1 AND empresa_id = $2", [
    userId,
    companyId,
  ]);
  for (const permissionId of permissionIds) {
    await client.query(
      `
        INSERT INTO app_usuario_permisos (id_usuario, empresa_id, id_permiso)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
      `,
      [userId, companyId, permissionId],
    );
  }
}
