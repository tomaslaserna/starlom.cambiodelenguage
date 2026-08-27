const CAPABILITIES = Object.freeze({
  seller: new Set([
    "customers:assigned:read",
    "orders:assigned:read",
    "sales:assigned:read",
    "stock:availability:read",
    "tasks:own:read",
    "tasks:own:resolve",
    "drafts:own:create",
  ]),
  operator: new Set([
    "customers:all:read",
    "orders:all:read",
    "sales:all:read",
    "stock:availability:read",
    "tasks:own:read",
    "tasks:own:resolve",
    "drafts:own:create",
  ]),
  warehouse: new Set([
    "orders:delivery:read",
    "stock:all:read",
    "tasks:own:read",
    "tasks:own:resolve",
  ]),
  admin: new Set(["*"]),
  manager: new Set(["*"]),
});

const ROLE_ALIASES = Object.freeze({
  vendedor: "seller",
  operador: "operator",
  deposito: "warehouse",
  logistica: "warehouse",
  administrador: "admin",
  jefe: "manager",
});

export function canonicalRole(role) {
  return ROLE_ALIASES[String(role ?? "").trim().toLowerCase()] ?? "unknown";
}

export function can(role, capability) {
  const granted = CAPABILITIES[canonicalRole(role)] ?? new Set();
  return granted.has("*") || granted.has(capability);
}

export function requireCapability(role, capability) {
  if (!can(role, capability)) {
    const error = new Error(`El rol ${role || "desconocido"} no puede ejecutar ${capability}`);
    error.code = "SUPERVISOR_FORBIDDEN";
    throw error;
  }
}

export function visibleCustomerScope(session) {
  const role = canonicalRole(session?.role);
  if (role === "admin" || role === "manager" || role === "operator") {
    return { kind: "company", companyId: Number(session.companyId) };
  }
  if (role === "seller") {
    return {
      kind: "seller",
      companyId: Number(session.companyId),
      sellerNames: [...new Set(
        [session.username, session.displayName]
          .filter(Boolean)
          .flatMap((name) => [String(name).trim().toUpperCase(), String(name).trim().split(/\s+/)[0].toUpperCase()]),
      )],
    };
  }
  return { kind: "none", companyId: Number(session?.companyId) };
}
