import type { AuthSession } from "@/lib/auth";
import { queryWithCompanyContext } from "@/lib/db";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import {
  ADMIN_ACCOUNTS_PAYABLE_READ_PERMISSION,
  ADMIN_BALANCE_READ_PERMISSION,
  ADMIN_CASHFLOW_READ_PERMISSION,
  ADMIN_DIVIDENDS_READ_PERMISSION,
  ADMIN_METRICS_READ_PERMISSION,
  ADMIN_MOVEMENTS_READ_PERMISSION,
  ADMIN_SALARIES_READ_PERMISSION,
  ADMIN_TREASURY_READ_PERMISSION,
  COLLECTIONS_APPROVE_PERMISSION,
  COLLECTIONS_READ_PERMISSION,
  CUSTOMERS_READ_PERMISSION,
  EMPLOYEES_READ_PERMISSION,
  ORDERS_CREATE_PERMISSION,
  ORDERS_READ_PERMISSION,
  PRODUCTS_READ_PERMISSION,
  PURCHASES_READ_PERMISSION,
  QUOTES_READ_PERMISSION,
  REPORTS_READ_PERMISSION,
  SALES_READ_PERMISSION,
  SUPPLIERS_READ_PERMISSION,
  sessionAllows,
  sessionCanApproveCollections,
  sessionCanReadCollections,
  type Permission,
} from "@/lib/route-auth";

export type NavigationBadgeKey =
  | "approvals"
  | "collectionApprovals"
  | "messages"
  | "tasks"
  | "ordersLoaded"
  | "ordersConfirmed"
  | "quotes"
  | "payables"
  | "purchases";

export type NavigationItem = {
  href: string;
  label: string;
  active: string;
  badge?: NavigationBadgeKey;
  permission?: Permission;
};

export type NavigationGroup = {
  label: string;
  href?: string;
  active: string;
  badge?: NavigationBadgeKey;
  items?: NavigationItem[];
  permission?: Permission;
};

export type NavigationAuthorization = {
  allowedPermissionKeys: Set<string>;
};

export const navigationGroups: NavigationGroup[] = [
  { href: "/", label: "Inicio", active: "home" },
  {
    label: "Balance",
    active: "balance",
    items: [
      { href: "/balance", label: "Resumen", active: "balance", permission: ADMIN_BALANCE_READ_PERMISSION },
      { href: "/balance/salaries", label: "Sueldos", active: "balance", permission: ADMIN_SALARIES_READ_PERMISSION },
      { href: "/balance/dividends", label: "Dividendos", active: "balance", permission: ADMIN_DIVIDENDS_READ_PERMISSION },
    ],
  },
  {
    label: "Tesoreria",
    active: "treasury",
    badge: "payables",
    items: [
      { href: "/treasury", label: "Saldos actuales", active: "treasury", permission: ADMIN_TREASURY_READ_PERMISSION },
      { href: "/treasury/cash-flow", label: "Cash Flow", active: "treasury", permission: ADMIN_CASHFLOW_READ_PERMISSION },
      {
        href: "/treasury/accounts-payable",
        label: "Cuentas por pagar",
        active: "treasury",
        badge: "payables",
        permission: ADMIN_ACCOUNTS_PAYABLE_READ_PERMISSION,
      },
      {
        href: "/treasury/movements",
        label: "Registro de movimientos",
        active: "treasury",
        permission: ADMIN_MOVEMENTS_READ_PERMISSION,
      },
    ],
  },
  {
    label: "Pedidos",
    active: "orders",
    badge: "ordersConfirmed",
    items: [
      { href: "/orders", label: "Dashboard", active: "orders", permission: ORDERS_READ_PERMISSION },
      {
        href: "/orders?status=cargado",
        label: "Cargados",
        active: "orders",
        badge: "ordersLoaded",
        permission: ORDERS_READ_PERMISSION,
      },
      {
        href: "/orders?status=confirmado",
        label: "Confirmados",
        active: "orders",
        badge: "ordersConfirmed",
        permission: ORDERS_READ_PERMISSION,
      },
      {
        href: "/orders?status=entregado",
        label: "Entregados",
        active: "orders",
        permission: ORDERS_READ_PERMISSION,
      },
    ],
  },
  {
    label: "Presupuestador",
    active: "quotes",
    badge: "quotes",
    items: [
      { href: "/orders/new", label: "Cargar pedido", active: "orders", permission: ORDERS_CREATE_PERMISSION },
      {
        href: "/quotes",
        label: "Presupuestador",
        active: "quotes",
        badge: "quotes",
        permission: QUOTES_READ_PERMISSION,
      },
    ],
  },
  { href: "/sales", label: "Registro de ventas", active: "sales", permission: SALES_READ_PERMISSION },
  {
    label: "Base de datos",
    active: "database",
    items: [
      { href: "/products", label: "Precios", active: "database", permission: PRODUCTS_READ_PERMISSION },
      { href: "/pricing", label: "Margenes y listas", active: "pricing", permission: PRODUCTS_READ_PERMISSION },
      { href: "/customers", label: "Clientes", active: "database", permission: CUSTOMERS_READ_PERMISSION },
      { href: "/suppliers", label: "Proveedores", active: "database", permission: SUPPLIERS_READ_PERMISSION },
    ],
  },
  {
    label: "Stock",
    active: "stock",
    items: [
      { href: "/products", label: "Cambiar stock", active: "stock", permission: PRODUCTS_READ_PERMISSION },
      { href: "/products?mode=new", label: "Nuevo stock", active: "stock", permission: PRODUCTS_READ_PERMISSION },
      { href: "/products?mode=bulk", label: "Carga masiva", active: "stock", permission: PRODUCTS_READ_PERMISSION },
    ],
  },
  {
    label: "Compras",
    active: "purchases",
    badge: "purchases",
    items: [
      { href: "/purchases", label: "Nueva compra", active: "purchases", permission: PURCHASES_READ_PERMISSION },
      {
        href: "/purchases?type=urgente",
        label: "Urgentes",
        active: "purchases",
        badge: "purchases",
        permission: PURCHASES_READ_PERMISSION,
      },
      {
        href: "/purchases?type=anticipada",
        label: "Anticipadas",
        active: "purchases",
        permission: PURCHASES_READ_PERMISSION,
      },
      {
        href: "/purchases?type=solicitud",
        label: "Solicitudes de compra",
        active: "purchases",
        permission: PURCHASES_READ_PERMISSION,
      },
    ],
  },
  {
    label: "Cobros y pagos",
    active: "collections",
    badge: "collectionApprovals",
    items: [
      {
        href: "/collections",
        label: "Cobros",
        active: "collections",
        badge: "collectionApprovals",
        permission: COLLECTIONS_READ_PERMISSION,
      },
      {
        href: "/treasury/current-accounts",
        label: "Cuentas corrientes",
        active: "collections",
        permission: COLLECTIONS_READ_PERMISSION,
      },
      {
        href: "/treasury/movements?type=pago",
        label: "Pagos proveedores",
        active: "treasury",
        permission: ADMIN_MOVEMENTS_READ_PERMISSION,
      },
    ],
  },
  {
    label: "Usuarios y permisos",
    active: "employees",
    items: [
      { href: "/employees", label: "Empleados", active: "employees", permission: EMPLOYEES_READ_PERMISSION },
      { href: "/employees/vendors", label: "Gestion de vendedores", active: "employees", permission: EMPLOYEES_READ_PERMISSION },
      {
        href: "/treasury/movements",
        label: "Registro de movimientos",
        active: "employees",
        permission: ADMIN_MOVEMENTS_READ_PERMISSION,
      },
    ],
  },
  {
    label: "Administrador",
    active: "admin",
    badge: "approvals",
    items: [
      { href: "/admin", label: "Panel admin", active: "admin", permission: REPORTS_READ_PERMISSION },
      { href: "/metrics", label: "Metricas", active: "metrics", permission: ADMIN_METRICS_READ_PERMISSION },
      {
        href: "/admin/approvals",
        label: "Solicitudes y aprobaciones",
        active: "admin",
        badge: "approvals",
        permission: COLLECTIONS_APPROVE_PERMISSION,
      },
    ],
  },
  { href: "/calendar", label: "Calendario", active: "calendar", badge: "tasks" },
  {
    label: "Mensajes",
    active: "messages",
    badge: "messages",
    items: [
      { href: "/messages", label: "Recibidos", active: "messages", badge: "messages" },
      { href: "/messages?box=sent", label: "Enviados", active: "messages" },
      { href: "/messages?box=drafts", label: "Borradores", active: "messages" },
    ],
  },
];

export type NavigationSection = {
  label: string;
  groups: NavigationGroup[];
};

function groupByLabel(label: string) {
  const group = navigationGroups.find((item) => item.label === label);
  if (!group) throw new Error(`Missing navigation group: ${label}`);
  return group;
}

export const navigationSections: NavigationSection[] = [
  {
    label: "Inicio / Panel",
    groups: [groupByLabel("Inicio")],
  },
  {
    label: "Operaciones",
    groups: [groupByLabel("Pedidos"), groupByLabel("Registro de ventas"), groupByLabel("Presupuestador")],
  },
  {
    label: "Datos",
    groups: [groupByLabel("Base de datos"), groupByLabel("Stock")],
  },
  {
    label: "Compras",
    groups: [groupByLabel("Compras")],
  },
  {
    label: "Administracion",
    groups: [
      groupByLabel("Usuarios y permisos"),
      groupByLabel("Administrador"),
      groupByLabel("Calendario"),
      groupByLabel("Mensajes"),
    ],
  },
  {
    label: "Finanzas",
    groups: [groupByLabel("Balance")],
  },
  {
    label: "Tesoreria",
    groups: [groupByLabel("Tesoreria"), groupByLabel("Cobros y pagos")],
  },
];

export type NavigationIndicators = Record<NavigationBadgeKey, number>;

const AUTHORIZATION_CACHE_TTL_MS = 60_000;
const INDICATORS_CACHE_TTL_MS = 20_000;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const authorizationCache = new Map<string, CacheEntry<NavigationAuthorization>>();
const indicatorsCache = new Map<string, CacheEntry<NavigationIndicators>>();

export function clearNavigationCaches() {
  authorizationCache.clear();
  indicatorsCache.clear();
}

function navigationPermissionKey(permission: Permission) {
  return `${permission.resource.trim()}.${permission.action.trim()}`;
}

function collectRequiredNavigationPermissions() {
  const permissions = new Map<string, Permission>();
  for (const group of navigationGroups) {
    if (group.permission) permissions.set(navigationPermissionKey(group.permission), group.permission);
    for (const item of group.items ?? []) {
      if (item.permission) permissions.set(navigationPermissionKey(item.permission), item.permission);
    }
  }
  return Array.from(permissions.values());
}

export function navigationPermissionAllowed(
  authorization: NavigationAuthorization,
  permission: Permission | undefined,
) {
  if (!permission) return true;
  return authorization.allowedPermissionKeys.has(navigationPermissionKey(permission));
}

export async function getNavigationAuthorization(session: AuthSession): Promise<NavigationAuthorization> {
  const cacheKey = `${session.userId}:${session.companyId}:${session.role}`;
  const cached = authorizationCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const allowedPermissionKeys = new Set<string>();
  await Promise.all(
    collectRequiredNavigationPermissions().map(async (permission) => {
      if (await sessionAllows(session, [permission])) {
        allowedPermissionKeys.add(navigationPermissionKey(permission));
      }
    }),
  );

  const authorization = { allowedPermissionKeys };
  authorizationCache.set(cacheKey, {
    expiresAt: Date.now() + AUTHORIZATION_CACHE_TTL_MS,
    value: authorization,
  });

  return authorization;
}

function authorizedNavigationItem(
  item: NavigationItem,
  authorization: NavigationAuthorization,
): NavigationItem | null {
  if (!navigationPermissionAllowed(authorization, item.permission)) return null;
  const authorizedItem: NavigationItem = {
    href: item.href,
    label: item.label,
    active: item.active,
  };
  if (item.badge) authorizedItem.badge = item.badge;
  return authorizedItem;
}

function authorizedNavigationGroup(
  group: NavigationGroup,
  authorization: NavigationAuthorization,
): NavigationGroup | null {
  if (!navigationPermissionAllowed(authorization, group.permission)) return null;

  const authorizedItems = (group.items ?? [])
    .map((item) => authorizedNavigationItem(item, authorization))
    .filter((item): item is NavigationItem => Boolean(item));

  if (!group.href && group.items && authorizedItems.length === 0) return null;

  const authorizedGroup: NavigationGroup = {
    label: group.label,
    active: group.active,
  };
  if (group.href) authorizedGroup.href = group.href;
  if (group.badge) authorizedGroup.badge = group.badge;
  if (group.items) authorizedGroup.items = authorizedItems;
  return authorizedGroup;
}

export function authorizedNavigationSections(authorization: NavigationAuthorization) {
  return navigationSections
    .map((section) => ({
      ...section,
      groups: section.groups
        .map((group) => authorizedNavigationGroup(group, authorization))
        .filter((group): group is NavigationGroup => Boolean(group)),
    }))
    .filter((section) => section.groups.length > 0);
}

export function emptyNavigationIndicators(): NavigationIndicators {
  return {
    approvals: 0,
    collectionApprovals: 0,
    messages: 0,
    tasks: 0,
    ordersLoaded: 0,
    ordersConfirmed: 0,
    quotes: 0,
    payables: 0,
    purchases: 0,
  };
}

export async function getNavigationIndicators(session: AuthSession): Promise<NavigationIndicators> {
  const cacheKey = `${session.userId}:${session.companyId}:${session.role}`;
  const cached = indicatorsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const [canReadCollections, canApproveCollections] = await Promise.all([
    sessionCanReadCollections(session),
    sessionCanApproveCollections(session),
  ]);
  const shouldCountCollectionApprovals = canReadCollections || canApproveCollections;
  const collectionApprovalsSelect = shouldCountCollectionApprovals
    ? `(SELECT COUNT(*) FROM sales
         WHERE empresa_id = $1
           AND COALESCE(collection_status,'pendiente') IN ('pendiente_aprobacion','en_proceso')
           AND ${normalizedOrderStatusSql("sales")} = 'entregado')::text`
    : `'0'::text`;

  const result = await queryWithCompanyContext<{
    collection_approvals: string;
    messages: string;
    personal_tasks: string;
    assigned_tasks: string;
    orders_loaded: string;
    orders_confirmed: string;
    quotes: string;
    payables: string;
    purchases: string;
  }>(
    session.companyId,
    `
      SELECT
        ${collectionApprovalsSelect} AS collection_approvals,
        (SELECT COUNT(*) FROM mensajes
         WHERE empresa_id = $1 AND para = $2 AND leido = 0)::text AS messages,
        (SELECT COUNT(*) FROM recordatorios
         WHERE empresa_id = $1
           AND completado = 0
           AND (usuario = '' OR usuario = $2)
           AND (fecha_envio IS NULL OR fecha_envio <= NOW()))::text AS personal_tasks,
        (SELECT COUNT(*) FROM tareas_asignadas
         WHERE empresa_id = $1
           AND asignado_a = $2
           AND completado = 0
           AND (fecha_envio IS NULL OR fecha_envio <= NOW()))::text AS assigned_tasks,
        (SELECT COUNT(*) FROM sales
         WHERE empresa_id = $1 AND ${normalizedOrderStatusSql("sales")} = 'cargado')::text AS orders_loaded,
        (SELECT COUNT(*) FROM sales
         WHERE empresa_id = $1 AND ${normalizedOrderStatusSql("sales")} = 'confirmado')::text AS orders_confirmed,
        (SELECT COUNT(*) FROM quotes
         WHERE empresa_id = $1 AND status = 'pendiente')::text AS quotes,
        (SELECT COUNT(*) FROM purchases
         WHERE empresa_id = $1
           AND status <> 'cancelada'
           AND GREATEST(total_amount - COALESCE(paid_amount, 0), 0) > 0)::text AS payables,
        (SELECT COUNT(*) FROM purchases
         WHERE empresa_id = $1
           AND status <> 'cancelada'
           AND (purchase_type ILIKE '%urg%' OR status = 'pendiente'))::text AS purchases
    `,
    [session.companyId, session.username],
  );

  const row = result.rows[0];
  if (!row) return emptyNavigationIndicators();
  const collectionApprovals = Number(row.collection_approvals);
  const indicators = {
    approvals: canApproveCollections ? collectionApprovals : 0,
    collectionApprovals: canReadCollections ? collectionApprovals : 0,
    messages: Number(row.messages),
    tasks: Number(row.personal_tasks) + Number(row.assigned_tasks),
    ordersLoaded: Number(row.orders_loaded),
    ordersConfirmed: Number(row.orders_confirmed),
    quotes: Number(row.quotes),
    payables: Number(row.payables),
    purchases: Number(row.purchases),
  };

  indicatorsCache.set(cacheKey, {
    expiresAt: Date.now() + INDICATORS_CACHE_TTL_MS,
    value: indicators,
  });

  return indicators;
}
