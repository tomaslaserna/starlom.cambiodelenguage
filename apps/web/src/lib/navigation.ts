import type { AuthSession } from "@/lib/auth";
import { queryWithCompanyContext } from "@/lib/db";
import {
  COLLECTIONS_APPROVE_PERMISSION,
  COLLECTIONS_READ_PERMISSION,
  CUSTOMERS_READ_PERMISSION,
  EMPLOYEES_READ_PERMISSION,
  PRODUCTS_READ_PERMISSION,
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
  | "ordersReceived"
  | "ordersInProcess"
  | "ordersPendingDelivery"
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
  { href: "/metrics", label: "Metricas", active: "metrics" },
  {
    label: "Balance",
    active: "balance",
    items: [
      { href: "/balance", label: "Resumen", active: "balance" },
      { href: "/balance/income-statement", label: "Estado de resultados", active: "balance" },
      { href: "/balance/salaries", label: "Sueldos", active: "balance" },
      { href: "/balance/dividends", label: "Dividendos", active: "balance" },
    ],
  },
  {
    label: "Tesoreria",
    active: "treasury",
    badge: "payables",
    items: [
      { href: "/treasury", label: "Saldos actuales", active: "treasury" },
      { href: "/treasury/cash-flow", label: "Cash Flow", active: "treasury" },
      { href: "/treasury/accounts-payable", label: "Cuentas por pagar", active: "treasury", badge: "payables" },
      { href: "/treasury/movements", label: "Registro de movimientos", active: "treasury" },
    ],
  },
  {
    label: "Pedidos",
    active: "orders",
    badge: "ordersInProcess",
    items: [
      { href: "/orders", label: "Dashboard", active: "orders" },
      { href: "/orders?status=recibido", label: "Recibidos", active: "orders", badge: "ordersReceived" },
      { href: "/orders?status=en_proceso", label: "En proceso", active: "orders", badge: "ordersInProcess" },
      {
        href: "/orders?status=pendiente_entrega",
        label: "Pendiente entrega",
        active: "orders",
        badge: "ordersPendingDelivery",
      },
    ],
  },
  {
    label: "Ventas",
    active: "sales",
    badge: "quotes",
    items: [
      { href: "/sales", label: "Ventas", active: "sales" },
      { href: "/orders/new", label: "Cargar pedido", active: "sales" },
      { href: "/quotes", label: "Presupuestos", active: "sales", badge: "quotes" },
      { href: "/billing", label: "Facturacion", active: "billing" },
    ],
  },
  {
    label: "Base de datos",
    active: "database",
    items: [
      { href: "/database", label: "Resumen", active: "database" },
      { href: "/employees", label: "Empleados", active: "database", permission: EMPLOYEES_READ_PERMISSION },
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
      { href: "/purchases", label: "Nueva compra", active: "purchases" },
      { href: "/purchases?type=urgente", label: "Urgentes", active: "purchases", badge: "purchases" },
      { href: "/purchases?type=anticipada", label: "Anticipadas", active: "purchases" },
      { href: "/purchases?type=solicitud", label: "Solicitudes de compra", active: "purchases" },
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
      { href: "/treasury/current-accounts", label: "Cuentas corrientes", active: "collections" },
      { href: "/treasury/movements?type=pago", label: "Pagos proveedores", active: "treasury" },
    ],
  },
  {
    label: "Usuarios y permisos",
    active: "employees",
    items: [
      { href: "/employees", label: "Empleados", active: "employees", permission: EMPLOYEES_READ_PERMISSION },
      { href: "/employees/vendors", label: "Gestion de vendedores", active: "employees", permission: EMPLOYEES_READ_PERMISSION },
      { href: "/treasury/movements", label: "Registro de movimientos", active: "employees" },
    ],
  },
  {
    label: "Administrador",
    active: "admin",
    badge: "approvals",
    items: [
      { href: "/admin", label: "Panel admin", active: "admin" },
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
  { href: "/messages", label: "Mensajes", active: "messages", badge: "messages" },
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
    groups: [groupByLabel("Inicio"), groupByLabel("Metricas")],
  },
  {
    label: "Finanzas",
    groups: [groupByLabel("Balance")],
  },
  {
    label: "Tesoreria",
    groups: [groupByLabel("Tesoreria"), groupByLabel("Cobros y pagos")],
  },
  {
    label: "Comercial",
    groups: [groupByLabel("Pedidos"), groupByLabel("Ventas")],
  },
  {
    label: "Datos",
    groups: [groupByLabel("Base de datos"), groupByLabel("Stock")],
  },
  {
    label: "Operaciones",
    groups: [groupByLabel("Compras"), groupByLabel("Calendario"), groupByLabel("Mensajes")],
  },
  {
    label: "Administracion",
    groups: [groupByLabel("Usuarios y permisos"), groupByLabel("Administrador")],
  },
];

export type NavigationIndicators = Record<NavigationBadgeKey, number>;

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
  const allowedPermissionKeys = new Set<string>();
  await Promise.all(
    collectRequiredNavigationPermissions().map(async (permission) => {
      if (await sessionAllows(session, [permission])) {
        allowedPermissionKeys.add(navigationPermissionKey(permission));
      }
    }),
  );
  return { allowedPermissionKeys };
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
    ordersReceived: 0,
    ordersInProcess: 0,
    ordersPendingDelivery: 0,
    quotes: 0,
    payables: 0,
    purchases: 0,
  };
}

export async function getNavigationIndicators(session: AuthSession): Promise<NavigationIndicators> {
  const [canReadCollections, canApproveCollections] = await Promise.all([
    sessionCanReadCollections(session),
    sessionCanApproveCollections(session),
  ]);
  const shouldCountCollectionApprovals = canReadCollections || canApproveCollections;
  const collectionApprovalsSelect = shouldCountCollectionApprovals
    ? `(SELECT COUNT(*) FROM ventas
         WHERE empresa_id = $1
           AND COALESCE(estado_cobro,'pendiente') IN ('pendiente_aprobacion','en_proceso')
           AND COALESCE(estado_pedido,'entregado') = 'entregado')::text`
    : `'0'::text`;

  const result = await queryWithCompanyContext<{
    collection_approvals: string;
    messages: string;
    personal_tasks: string;
    assigned_tasks: string;
    orders_received: string;
    orders_in_process: string;
    orders_pending_delivery: string;
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
        (SELECT COUNT(*) FROM ventas
         WHERE empresa_id = $1 AND COALESCE(estado_pedido,'recibido') = 'recibido')::text AS orders_received,
        (SELECT COUNT(*) FROM ventas
         WHERE empresa_id = $1 AND COALESCE(estado_pedido,'recibido') = 'en_proceso')::text AS orders_in_process,
        (SELECT COUNT(*) FROM ventas
         WHERE empresa_id = $1 AND COALESCE(estado_pedido,'recibido') = 'pendiente_entrega')::text AS orders_pending_delivery,
        (SELECT COUNT(*) FROM presupuestos
         WHERE empresa_id = $1 AND estado = 'pendiente')::text AS quotes,
        (SELECT COUNT(*) FROM compras_registro
         WHERE empresa_id = $1
           AND COALESCE(pagado,0) = 0
           AND estado <> 'cancelada'
           AND GREATEST(total - COALESCE(monto_pagado, 0), 0) > 0)::text AS payables,
        (SELECT COUNT(*) FROM compras_registro
         WHERE empresa_id = $1
           AND estado <> 'cancelada'
           AND (tipo ILIKE '%urg%' OR estado = 'pendiente'))::text AS purchases
    `,
    [session.companyId, session.username],
  );

  const row = result.rows[0];
  if (!row) return emptyNavigationIndicators();
  const collectionApprovals = Number(row.collection_approvals);
  return {
    approvals: canApproveCollections ? collectionApprovals : 0,
    collectionApprovals: canReadCollections ? collectionApprovals : 0,
    messages: Number(row.messages),
    tasks: Number(row.personal_tasks) + Number(row.assigned_tasks),
    ordersReceived: Number(row.orders_received),
    ordersInProcess: Number(row.orders_in_process),
    ordersPendingDelivery: Number(row.orders_pending_delivery),
    quotes: Number(row.quotes),
    payables: Number(row.payables),
    purchases: Number(row.purchases),
  };
}
