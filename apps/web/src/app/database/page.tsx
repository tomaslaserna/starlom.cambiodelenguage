import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { requireStaffSession } from "@/lib/auth";
import {
  CUSTOMERS_READ_PERMISSION,
  EMPLOYEES_READ_PERMISSION,
  PRODUCTS_READ_PERMISSION,
  SUPPLIERS_READ_PERMISSION,
  type Permission,
} from "@/lib/route-auth";
import {
  getNavigationAuthorization,
  navigationPermissionAllowed,
} from "@/lib/navigation";

const modules: Array<{
  href: string;
  label: string;
  detail: string;
  permission?: Permission;
}> = [
  { href: "/employees", label: "Empleados", detail: "Usuarios internos y permisos", permission: EMPLOYEES_READ_PERMISSION },
  { href: "/products", label: "Precios", detail: "Catalogo, costos y stock", permission: PRODUCTS_READ_PERMISSION },
  { href: "/customers", label: "Clientes", detail: "Base comercial", permission: CUSTOMERS_READ_PERMISSION },
  { href: "/suppliers", label: "Proveedores", detail: "Base de compras", permission: SUPPLIERS_READ_PERMISSION },
];

export default async function DatabasePage() {
  const session = await requireStaffSession();
  const navigationAuthorization = await getNavigationAuthorization(session);
  const visibleModules = modules.filter((module) =>
    navigationPermissionAllowed(navigationAuthorization, module.permission),
  );

  return (
    <ModulePage
      active="database"
      description="Bases de datos operativas como submodulos. La visualizacion sensible queda fuera de Usuarios y permisos."
      navigationAuthorization={navigationAuthorization}
      session={session}
      title="Base de datos"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {visibleModules.map((module) => (
          <Link className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4 hover:bg-[color:var(--panel-subtle)]" href={module.href} key={module.href}>
            <h2 className="font-semibold">{module.label}</h2>
            <p className="mt-2 text-sm text-[color:var(--muted)]">{module.detail}</p>
          </Link>
        ))}
      </div>
    </ModulePage>
  );
}
