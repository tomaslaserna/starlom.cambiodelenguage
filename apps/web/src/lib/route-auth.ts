import { currentSession, isStaffRole, type AuthSession } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import { ApiError } from "@/lib/api-response";

export type Permission = {
  resource: string;
  action: string;
};

export const CUSTOMERS_READ_PERMISSION = {
  resource: "clientes",
  action: "ver",
} satisfies Permission;

export const SUPPLIERS_READ_PERMISSION = {
  resource: "proveedores",
  action: "ver",
} satisfies Permission;

const LEGACY_ROLE_PERMISSIONS: Record<string, string[]> = {
  Empleado: ["pedidos.ver", "stock.ver"],
  Empleado_1: ["pedidos.ver", "pedidos.editar", "stock.ver", "stock.editar", "productos.ver"],
  Empleado_2: [
    "ventas.ver",
    "ventas.crear",
    "presupuestos.ver",
    "presupuestos.crear",
    "pedidos.ver",
    "clientes.ver",
    "stock.ver",
  ],
  Jefe: [
    "ventas.ver",
    "ventas.crear",
    "ventas.editar",
    "presupuestos.ver",
    "presupuestos.crear",
    "presupuestos.editar",
    "presupuestos.aprobar",
    "pedidos.ver",
    "pedidos.editar",
    "pedidos.administrar",
    "cobranzas.ver",
    "compras.ver",
    "compras.crear",
    "stock.ver",
    "stock.editar",
    "clientes.ver",
    "proveedores.ver",
    "empleados.ver",
  ],
  Jefe1: [
    "ventas.ver",
    "ventas.crear",
    "ventas.editar",
    "ventas.exportar",
    "presupuestos.ver",
    "presupuestos.crear",
    "presupuestos.editar",
    "presupuestos.aprobar",
    "presupuestos.cancelar",
    "pedidos.ver",
    "pedidos.editar",
    "pedidos.cancelar",
    "pedidos.administrar",
    "cobranzas.ver",
    "cobranzas.crear",
    "cobranzas.editar",
    "cobranzas.aprobar",
    "compras.ver",
    "compras.crear",
    "compras.editar",
    "compras.aprobar",
    "compras.cancelar",
    "stock.ver",
    "stock.editar",
    "stock.administrar",
    "productos.ver",
    "productos.crear",
    "productos.editar",
    "clientes.ver",
    "clientes.crear",
    "clientes.editar",
    "proveedores.ver",
    "proveedores.crear",
    "proveedores.editar",
    "empleados.ver",
    "empleados.crear",
    "empleados.editar",
    "empleados.administrar",
    "reportes.ver",
    "reportes.exportar",
  ],
};

function permissionKey(permission: Permission) {
  return `${permission.resource.trim()}.${permission.action.trim()}`;
}

function legacyRoleAllows(session: AuthSession, permissions: Permission[]) {
  if (session.role === "Admin") return true;
  const allowed = new Set(LEGACY_ROLE_PERMISSIONS[session.role] ?? []);
  return permissions.some((permission) => allowed.has(permissionKey(permission)));
}

async function databaseAllows(session: AuthSession, permissions: Permission[]) {
  if (session.role === "Admin") return true;
  if (!permissions.length) return true;

  const keys = permissions.map(permissionKey);
  const result = await getDbPool().query<{ allowed: number }>(
    `
      SELECT 1 AS allowed
      FROM app_usuario_permisos up
      JOIN app_permisos p ON p.id = up.id_permiso
      WHERE up.id_usuario = $1
        AND up.empresa_id = $2
        AND p.clave = ANY($3)
      UNION
      SELECT 1 AS allowed
      FROM app_usuario_roles ur
      JOIN app_rol_permisos rp ON rp.id_rol = ur.id_rol
      JOIN app_permisos p ON p.id = rp.id_permiso
      WHERE ur.id_usuario = $1
        AND ur.empresa_id = $2
        AND p.clave = ANY($3)
      LIMIT 1
    `,
    [session.userId, session.companyId, keys],
  );

  return Boolean(result.rows[0]);
}

export async function sessionAllows(session: AuthSession, permissions: Permission[] = []) {
  if (!isStaffRole(session.role)) return false;
  if (!permissions.length) return true;
  return legacyRoleAllows(session, permissions) || (await databaseAllows(session, permissions));
}

export async function sessionCanReadCustomers(session: AuthSession) {
  return sessionAllows(session, [CUSTOMERS_READ_PERMISSION]);
}

export async function sessionCanReadSuppliers(session: AuthSession) {
  return sessionAllows(session, [SUPPLIERS_READ_PERMISSION]);
}

export async function requireSessionPermission(session: AuthSession, permissions: Permission[]) {
  const allowed = await sessionAllows(session, permissions);
  if (!allowed) throw new ApiError(403, "Sin permiso");
  return session;
}

export async function requireApiSession(permissions: Permission[] = []) {
  const session = await currentSession();
  if (!session) throw new ApiError(401, "No autenticado");
  if (!isStaffRole(session.role)) throw new ApiError(403, "Sin permiso");

  await requireSessionPermission(session, permissions);

  return session;
}

export async function requireAdminApiSession() {
  const session = await requireApiSession();
  if (session.role !== "Admin") throw new ApiError(403, "Solo Admin");
  return session;
}
