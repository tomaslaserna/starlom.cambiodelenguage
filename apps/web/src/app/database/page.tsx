import Link from "next/link";
import { ModulePage } from "@/components/module-page";
import { requireStaffSession } from "@/lib/auth";

const modules = [
  { href: "/employees", label: "Empleados", detail: "Usuarios internos y permisos" },
  { href: "/products", label: "Precios", detail: "Catalogo, costos y stock" },
  { href: "/customers", label: "Clientes", detail: "Base comercial" },
  { href: "/suppliers", label: "Proveedores", detail: "Base de compras" },
];

export default async function DatabasePage() {
  const session = await requireStaffSession();

  return (
    <ModulePage
      active="database"
      description="Bases de datos operativas como submodulos. La visualizacion sensible queda fuera de Usuarios y permisos."
      session={session}
      title="Base de datos"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {modules.map((module) => (
          <Link className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4 hover:bg-[color:var(--panel-subtle)]" href={module.href} key={module.href}>
            <h2 className="font-semibold">{module.label}</h2>
            <p className="mt-2 text-sm text-[color:var(--muted)]">{module.detail}</p>
          </Link>
        ))}
      </div>
    </ModulePage>
  );
}
