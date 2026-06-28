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

export const PRODUCTS_READ_PERMISSION = {
  resource: "productos",
  action: "ver",
} satisfies Permission;

export const EMPLOYEES_READ_PERMISSION = {
  resource: "empleados",
  action: "ver",
} satisfies Permission;

export const COLLECTIONS_READ_PERMISSION = {
  resource: "cobranzas",
  action: "ver",
} satisfies Permission;

export const COLLECTIONS_APPROVE_PERMISSION = {
  resource: "cobranzas",
  action: "aprobar",
} satisfies Permission;

const LEGACY_ROLE_PERMISSIONS: Record<string, string[]> = {
  administrador: ["*"],
  jefe: [
    "pedidos.ver",
    "pedidos.crear",
    "pedidos.editar",
    "pedidos.cancelar",
    "pedidos.administrar",
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
    "presupuestos.ver",
    "presupuestos.crear",
    "presupuestos.editar",
    "empleados.ver",
    "empleados.crear",
    "empleados.editar",
  ],
  deposito: ["pedidos.ver", "pedidos.editar", "pedidos.administrar", "stock.ver", "stock.editar", "productos.ver"],
  logistica: ["pedidos.ver", "pedidos.editar", "pedidos.administrar"],
  operador: ["pedidos.ver", "pedidos.crear", "stock.ver", "productos.ver"],
  vendedor: [
    "clientes.ver",
    "clientes.crear",
    "clientes.editar",
    "pedidos.ver",
    "pedidos.crear",
    "presupuestos.ver",
    "presupuestos.crear",
  ],
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

const DATABASE_PERMISSION_CACHE_TTL_MS = 60_000;
const databasePermissionCache = new Map<string, { expiresAt: number; allowed: boolean }>();

function permissionKey(permission: Permission) {
  return `${permission.resource.trim()}.${permission.action.trim()}`;
}

function legacyRoleAllows(session: AuthSession, permissions: Permission[]) {
  if (session.role === "Admin" || session.role === "administrador") return true;
  const allowed = new Set(LEGACY_ROLE_PERMISSIONS[session.role] ?? []);
  if (allowed.has("*")) return true;
  return permissions.some((permission) => allowed.has(permissionKey(permission)));
}

async function databaseAllows(session: AuthSession, permissions: Permission[]) {
  if (session.role === "Admin" || session.role === "administrador") return true;
  if (!permissions.length) return true;

  const keys = permissions.map(permissionKey);
  const cacheKey = `${session.userId}:${session.companyId}:${keys.sort().join("|")}`;
  const cached = databasePermissionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.allowed;

  const result = await getDbPool().query<{ allowed: number }>(
    `
      SELECT 1 AS allowed
      FROM profile_permissions pp
      WHERE pp.profile_id = $1::uuid
        AND pp.empresa_id = $2
        AND pp.permission_key = ANY($3)
      UNION
      SELECT 1 AS allowed
      FROM usuario_empresa ue
      JOIN role_permissions rp ON rp.role = ue.role
      WHERE ue.id_usuario = $1::uuid
        AND ue.empresa_id = $2
        AND ue.activo = TRUE
        AND rp.permission_key = ANY($3)
      LIMIT 1
    `,
    [session.userId, session.companyId, keys],
  );

  const allowed = Boolean(result.rows[0]);
  databasePermissionCache.set(cacheKey, {
    expiresAt: Date.now() + DATABASE_PERMISSION_CACHE_TTL_MS,
    allowed,
  });

  return allowed;
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

export async function sessionCanReadProducts(session: AuthSession) {
  return sessionAllows(session, [PRODUCTS_READ_PERMISSION]);
}

export async function sessionCanReadEmployees(session: AuthSession) {
  return sessionAllows(session, [EMPLOYEES_READ_PERMISSION]);
}

export async function sessionCanReadCollections(session: AuthSession) {
  return sessionAllows(session, [COLLECTIONS_READ_PERMISSION]);
}

export async function sessionCanApproveCollections(session: AuthSession) {
  return sessionAllows(session, [COLLECTIONS_APPROVE_PERMISSION]);
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
  if (session.role !== "Admin" && session.role !== "administrador") throw new ApiError(403, "Solo Admin");
  return session;
}
