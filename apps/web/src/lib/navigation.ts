import type { AppIconName } from "@/components/ui/app-icon";
import { type AuthSession } from "@/lib/auth";
import { queryWithCompanyContext } from "@/lib/db";
import { normalizedOrderStatusSql } from "@/lib/order-status";
import {
  ADMIN_ACCOUNTS_PAYABLE_READ_PERMISSION,
  ADMIN_BALANCE_READ_PERMISSION,
  ADMIN_CASHFLOW_READ_PERMISSION,
  ADMIN_METRICS_READ_PERMISSION,
  ADMIN_MOVEMENTS_READ_PERMISSION,
  ADMIN_TREASURY_READ_PERMISSION,
  COLLECTIONS_APPROVE_PERMISSION,
  COLLECTIONS_READ_PERMISSION,
  CRM_READ_PERMISSION,
  CUSTOMERS_READ_PERMISSION,
  EMPLOYEES_READ_PERMISSION,
  ORDERS_MANAGE_PERMISSION,
  ORDERS_READ_PERMISSION,
  PRODUCTS_READ_PERMISSION,
  PURCHASES_READ_PERMISSION,
  QUOTES_READ_PERMISSION,
  SALES_READ_PERMISSION,
  STOCK_EDIT_PERMISSION,
  SUPPLIERS_READ_PERMISSION,
  sessionAllows,
  sessionAllowedPermissionKeys,
  sessionCanApproveCollections,
  sessionCanReadCollections,
  type Permission,
} from "@/lib/route-auth";

export type NavigationBadgeKey =
  | "approvals"
  | "collectionApprovals"
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
  {
    href: "/",
    label: "Escritorio",
    active: "home",
  },
  {
    href: "/balance",
    label: "Balance",
    active: "balance",
    permission: ADMIN_BALANCE_READ_PERMISSION,
  },
  {
    href: "/balance/remunerations",
    label: "Sueldos y dividendos",
    active: "balance-remunerations",
    permission: ADMIN_BALANCE_READ_PERMISSION,
  },
  {
    href: "/cash",
    label: "Caja",
    active: "cash",
    permission: ADMIN_TREASURY_READ_PERMISSION,
  },
  {
    href: "/treasury/cash-flow",
    label: "Cash Flow",
    active: "cash-flow",
    permission: ADMIN_CASHFLOW_READ_PERMISSION,
  },
  {
    href: "/treasury/accounts-payable",
    label: "Cuentas por pagar",
    active: "accounts-payable",
    badge: "payables",
    permission: ADMIN_ACCOUNTS_PAYABLE_READ_PERMISSION,
  },
  {
    href: "/orders",
    label: "Pedidos",
    active: "orders",
    badge: "ordersConfirmed",
    permission: ORDERS_READ_PERMISSION,
  },
  {
    href: "/sales",
    label: "Registro de ventas",
    active: "sales",
    permission: SALES_READ_PERMISSION,
  },
  {
    href: "/quotes",
    label: "Presupuestos",
    active: "quotes",
    badge: "quotes",
    permission: QUOTES_READ_PERMISSION,
  },
  {
    href: "/billing",
    label: "Fiscal",
    active: "billing",
    permission: SALES_READ_PERMISSION,
  },
  {
    label: "Precios",
    active: "prices",
    items: [
      { href: "/prices", label: "Lista de precios", active: "prices", permission: PRODUCTS_READ_PERMISSION },
      { href: "/prices/margins", label: "Margenes", active: "prices", permission: PRODUCTS_READ_PERMISSION },
      { href: "/prices/offers", label: "Ofertas", active: "prices", permission: PRODUCTS_READ_PERMISSION },
    ],
  },
  {
    label: "Base de datos",
    active: "database",
    items: [
      { href: "/customers", label: "Clientes", active: "database", permission: CUSTOMERS_READ_PERMISSION },
      { href: "/customers/follow-up", label: "Seguimiento clientes", active: "database", permission: CUSTOMERS_READ_PERMISSION },
      { href: "/suppliers", label: "Proveedores", active: "database", permission: SUPPLIERS_READ_PERMISSION },
    ],
  },
  {
    label: "Stock",
    active: "stock",
    items: [
      { href: "/stock", label: "Modificar productos", active: "stock", permission: PRODUCTS_READ_PERMISSION },
      { href: "/products", label: "Información de stock", active: "stock", permission: PRODUCTS_READ_PERMISSION },
      { href: "/stock?mode=bulk", label: "Carga masiva", active: "stock", permission: STOCK_EDIT_PERMISSION },
    ],
  },
  {
    label: "Compras",
    active: "purchases",
    badge: "purchases",
    items: [
      { href: "/purchases?view=nueva", label: "Nueva compra", active: "purchases", permission: PURCHASES_READ_PERMISSION },
      {
        href: "/purchases/replenishment",
        label: "Recompra MRP",
        active: "purchases",
        permission: PURCHASES_READ_PERMISSION,
      },
      {
        href: "/purchases",
        label: "Registro de compras",
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
        href: "/payments",
        label: "Resumen de cobranzas",
        active: "collections",
        badge: "collectionApprovals",
        permission: COLLECTIONS_READ_PERMISSION,
      },
      {
        href: "/payments/accounts",
        label: "Cuentas corrientes",
        active: "collections",
        permission: COLLECTIONS_READ_PERMISSION,
      },
      {
        href: "/treasury/movements?type=pago",
        label: "Registro de pagos",
        active: "treasury",
        permission: ADMIN_MOVEMENTS_READ_PERMISSION,
      },
    ],
  },
  {
    href: "/employees",
    label: "RR.HH.",
    active: "employees",
    permission: EMPLOYEES_READ_PERMISSION,
  },
  { href: "/metrics", label: "Metricas", active: "metrics", permission: ADMIN_METRICS_READ_PERMISSION },
  { href: "/rentabilidad", label: "Rentabilidad", active: "admin", permission: ADMIN_METRICS_READ_PERMISSION },
  {
    href: "/admin/approvals",
    label: "Solicitudes y aprobaciones",
    active: "admin",
    badge: "approvals",
    permission: COLLECTIONS_APPROVE_PERMISSION,
  },
  { href: "/calendar", label: "Calendario", active: "calendar", badge: "tasks" },
  { href: "/bank", label: "Banco", active: "bank" },
  { href: "/supervisor-lab", label: "LA TIRRA ia.1.1", active: "supervisor-lab", permission: CRM_READ_PERMISSION },
  // CRM (segundo mundo para vendedores). active: "crm" agrupa estos en la seccion CRM.
  { href: "/crm/perfil", label: "Perfil", active: "crm", permission: CRM_READ_PERMISSION },
  { href: "/crm/clientes", label: "Clientes", active: "crm", permission: CRM_READ_PERMISSION },
  { href: "/crm/cobros", label: "Cobros", active: "crm", permission: CRM_READ_PERMISSION },
  { href: "/crm/leads", label: "Leads", active: "crm", permission: CRM_READ_PERMISSION },
  { href: "/crm/presupuestos", label: "Presupuestos", active: "crm", permission: CRM_READ_PERMISSION },
  { href: "/crm/listas", label: "Listas de precios", active: "crm", permission: CRM_READ_PERMISSION },
];

export type NavigationSection = {
  label: string;
  href?: string;
  icon?: AppIconName;
  groups: NavigationGroup[];
};

function groupByLabel(label: string) {
  const group = navigationGroups.find((item) => item.label === label);
  if (!group) throw new Error(`Missing navigation group: ${label}`);
  return group;
}

export const navigationSections: NavigationSection[] = [
  {
    label: "Inicio",
    icon: "chart",
    groups: [
      groupByLabel("Escritorio"),
      groupByLabel("LA TIRRA ia.1.1"),
      groupByLabel("Calendario"),
      groupByLabel("Banco"),
    ],
  },
  {
    label: "CRM",
    icon: "clock",
    groups: navigationGroups.filter((group) => group.active === "crm"),
  },
  {
    label: "Operaciones",
    icon: "cart",
    groups: [
      groupByLabel("Pedidos"),
      groupByLabel("Registro de ventas"),
      groupByLabel("Presupuestos"),
      groupByLabel("Fiscal"),
    ],
  },
  {
    label: "Datos",
    icon: "package",
    groups: [groupByLabel("Precios"), groupByLabel("Base de datos"), groupByLabel("Stock")],
  },
  {
    label: "Compras",
    icon: "receipt",
    groups: [groupByLabel("Compras")],
  },
  {
    label: "Administracion",
    icon: "trend",
    groups: [
      groupByLabel("Balance"),
      groupByLabel("Metricas"),
      groupByLabel("Rentabilidad"),
      groupByLabel("Solicitudes y aprobaciones"),
    ],
  },
  {
    label: "RR.HH.",
    href: "/employees",
    icon: "user",
    groups: [groupByLabel("RR.HH.")],
  },
  {
    label: "Finanzas",
    icon: "money",
    groups: [
      groupByLabel("Sueldos y dividendos"),
      groupByLabel("Caja"),
      groupByLabel("Cash Flow"),
      groupByLabel("Cuentas por pagar"),
    ],
  },
  {
    label: "Cobros y pagos",
    icon: "wallet",
    groups: [groupByLabel("Cobros y pagos")],
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

  const allowedPermissionKeys = await sessionAllowedPermissionKeys(
    session,
    collectRequiredNavigationPermissions(),
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
  const canResolveRequests = await sessionAllows(session, [ORDERS_MANAGE_PERMISSION]);
  const shouldCountCollectionApprovals = canReadCollections || canApproveCollections;
  const collectionApprovalsSelect = shouldCountCollectionApprovals
    ? `(SELECT COUNT(*) FROM sales
         WHERE empresa_id = $1
           AND COALESCE(collection_status,'pendiente') IN ('pendiente_aprobacion','en_proceso')
           AND ${normalizedOrderStatusSql("sales")} = 'entregado')::text`
    : `'0'::text`;

  const result = await queryWithCompanyContext<{
    collection_approvals: string;
    personal_tasks: string;
    assigned_tasks: string;
    orders_loaded: string;
    orders_confirmed: string;
    quotes: string;
    payables: string;
    purchases: string;
    internal_requests: string;
    purchase_requests: string;
  }>(
    session.companyId,
    `
      SELECT
        ${collectionApprovalsSelect} AS collection_approvals,
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
           AND LOWER(REPLACE(purchase_type, '-', '_')) <> ALL(ARRAY['solicitud','solicitud_compra','solicitud de compra']::text[])
           AND GREATEST(total_amount - COALESCE(paid_amount, 0), 0) > 0)::text AS payables,
        (SELECT COUNT(*) FROM purchases
         WHERE empresa_id = $1
           AND status <> 'cancelada'
           AND status = 'pendiente'
           AND LOWER(REPLACE(purchase_type, '-', '_')) <> ALL(ARRAY['solicitud','solicitud_compra','solicitud de compra']::text[]))::text AS purchases,
        (SELECT COUNT(*) FROM app_solicitudes
         WHERE empresa_id = $1 AND estado = 'pendiente')::text AS internal_requests,
        (SELECT COUNT(*) FROM purchases
         WHERE empresa_id = $1
           AND status = 'pendiente'
           AND LOWER(REPLACE(purchase_type, '-', '_')) = ANY(ARRAY['solicitud','solicitud_compra','solicitud de compra']::text[]))::text AS purchase_requests,
        '0'::text AS fiscal_approvals
    `,
    [session.companyId, session.username],
  );

  const row = result.rows[0];
  if (!row) return emptyNavigationIndicators();
  const collectionApprovals = Number(row.collection_approvals);
  const requestApprovals = canResolveRequests
    ? Number(row.internal_requests) + Number(row.purchase_requests)
    : 0;
  const indicators = {
    approvals: (canApproveCollections ? collectionApprovals : 0) + requestApprovals,
    collectionApprovals: canReadCollections ? collectionApprovals : 0,
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
