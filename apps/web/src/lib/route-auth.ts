import { currentSession, isStaffRole, normalizeRole, type AuthSession } from "@/lib/auth";
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

export const COLLECTIONS_CREATE_PERMISSION = {
  resource: "cobranzas",
  action: "crear",
} satisfies Permission;

export const COLLECTIONS_APPROVE_PERMISSION = {
  resource: "cobranzas",
  action: "aprobar",
} satisfies Permission;

export const ORDERS_READ_PERMISSION = {
  resource: "pedidos",
  action: "ver",
} satisfies Permission;

export const ORDERS_CREATE_PERMISSION = {
  resource: "pedidos",
  action: "crear",
} satisfies Permission;

export const SALES_READ_PERMISSION = {
  resource: "ventas",
  action: "ver",
} satisfies Permission;

export const QUOTES_READ_PERMISSION = {
  resource: "presupuestos",
  action: "ver",
} satisfies Permission;

export const QUOTES_CREATE_PERMISSION = {
  resource: "presupuestos",
  action: "crear",
} satisfies Permission;

export const QUOTES_APPROVE_PERMISSION = {
  resource: "presupuestos",
  action: "aprobar",
} satisfies Permission;

export const PURCHASES_READ_PERMISSION = {
  resource: "compras",
  action: "ver",
} satisfies Permission;

export const PURCHASES_CREATE_PERMISSION = {
  resource: "compras",
  action: "crear",
} satisfies Permission;

export const PURCHASES_EDIT_PERMISSION = {
  resource: "compras",
  action: "editar",
} satisfies Permission;

export const REPORTS_READ_PERMISSION = {
  resource: "reportes",
  action: "ver",
} satisfies Permission;

export const ADMIN_METRICS_READ_PERMISSION = {
  resource: "admin.metricas",
  action: "ver",
} satisfies Permission;

export const ADMIN_TREASURY_READ_PERMISSION = {
  resource: "admin.tesoreria",
  action: "ver",
} satisfies Permission;

export const ADMIN_CASHFLOW_READ_PERMISSION = {
  resource: "admin.cashflow",
  action: "ver",
} satisfies Permission;

export const ADMIN_ACCOUNTS_PAYABLE_READ_PERMISSION = {
  resource: "admin.cuentas_por_pagar",
  action: "ver",
} satisfies Permission;

export const ADMIN_BALANCE_READ_PERMISSION = {
  resource: "admin.balance",
  action: "ver",
} satisfies Permission;

export const ADMIN_SALARIES_READ_PERMISSION = {
  resource: "admin.sueldos",
  action: "ver",
} satisfies Permission;

export const ADMIN_DIVIDENDS_READ_PERMISSION = {
  resource: "admin.dividendos",
  action: "ver",
} satisfies Permission;

export const ADMIN_MOVEMENTS_READ_PERMISSION = {
  resource: "admin.movimientos",
  action: "ver",
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
};

const DATABASE_PERMISSION_CACHE_TTL_MS = 60_000;
const databasePermissionCache = new Map<string, { expiresAt: number; allowed: boolean }>();

export function clearPermissionCache() {
  databasePermissionCache.clear();
}

function permissionKey(permission: Permission) {
  return `${permission.resource.trim()}.${permission.action.trim()}`;
}

function permissionKeyAliases(permission: Permission) {
  const key = permissionKey(permission);
  const resource = permission.resource.trim();
  if (resource.startsWith("admin.") && permission.action.trim() === "ver") {
    return [key, resource];
  }
  return [key];
}

function permissionKeys(permissions: Permission[]) {
  return [...new Set(permissions.flatMap(permissionKeyAliases))];
}

function legacyRoleAllows(session: AuthSession, permissions: Permission[]) {
  const role = normalizeRole(session.role);
  if (role === "administrador") return true;
  const allowed = new Set(LEGACY_ROLE_PERMISSIONS[role] ?? []);
  if (allowed.has("*")) return true;
  return permissions.some((permission) => permissionKeyAliases(permission).some((key) => allowed.has(key)));
}

async function databaseAllows(session: AuthSession, permissions: Permission[]) {
  const role = normalizeRole(session.role);
  if (role === "administrador") return true;
  if (!permissions.length) return true;

  const keys = permissionKeys(permissions);
  const cacheKey = `${session.userId}:${session.companyId}:${role}:${keys.sort().join("|")}`;
  const cached = databasePermissionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.allowed;

  const result = await getDbPool().query<{ allowed: number }>(
    `
      SELECT 1 AS allowed
      FROM profile_permissions pp
      JOIN app_permissions ap ON ap.key = pp.permission_key AND ap.sensitive = FALSE
      WHERE pp.profile_id = $1::uuid
        AND pp.empresa_id = $2
        AND pp.permission_key = ANY($4)
      UNION
      SELECT 1 AS allowed
      FROM usuario_empresa ue
      JOIN role_permissions rp ON rp.role::text = $3
      JOIN app_permissions ap ON ap.key = rp.permission_key AND ap.sensitive = FALSE
      WHERE ue.id_usuario = $1::uuid
        AND ue.empresa_id = $2
        AND ue.activo = TRUE
        AND rp.permission_key = ANY($4)
      LIMIT 1
    `,
    [session.userId, session.companyId, role, keys],
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
  if (normalizeRole(session.role) !== "administrador") throw new ApiError(403, "Solo Admin");
  return session;
}
