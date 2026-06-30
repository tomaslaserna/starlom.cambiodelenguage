import { ModulePage } from "@/components/module-page";
import {
  ButtonLink,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { fastOr } from "@/lib/fast-data";
import {
  CUSTOMERS_READ_PERMISSION,
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
  { href: "/products", label: "Precios", detail: "Catalogo, costos y stock", permission: PRODUCTS_READ_PERMISSION },
  { href: "/pricing", label: "Margenes y listas", detail: "Categorias, multiplicadores y listas de precio", permission: PRODUCTS_READ_PERMISSION },
  { href: "/customers", label: "Clientes", detail: "Base comercial", permission: CUSTOMERS_READ_PERMISSION },
  { href: "/suppliers", label: "Proveedores", detail: "Base de compras", permission: SUPPLIERS_READ_PERMISSION },
];

export default async function DatabasePage() {
  const session = await requireStaffSession();
  const navigationAuthorization = await fastOr(
    getNavigationAuthorization(session),
    { allowedPermissionKeys: new Set<string>() },
    60,
  );
  const visibleModules = modules.filter((module) =>
    navigationPermissionAllowed(navigationAuthorization, module.permission),
  );

  return (
    <ModulePage
      active="database"
      description="Datos maestros operativos. Usuarios y permisos se gestionan desde Administracion."
      navigationAuthorization={navigationAuthorization}
      session={session}
      title="Base de datos"
    >
      <div className="grid gap-5">
        <PageHeader
          title="Base de datos"
          description="Accesos a directorios operativos y datos maestros segun los permisos de lectura del usuario."
        />

        {visibleModules.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                title="No hay directorios disponibles"
                description="Tu usuario no tiene accesos de lectura habilitados para esta seccion."
                action={
                  <ButtonLink href="/" size="sm" variant="secondary">
                    Volver al inicio
                  </ButtonLink>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {visibleModules.map((module) => (
              <Card key={module.href}>
                <CardContent className="grid h-full gap-4">
                  <div>
                    <h2 className="font-semibold">{module.label}</h2>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{module.detail}</p>
                  </div>
                  <ButtonLink
                    aria-label={`Abrir ${module.label}`}
                    className="w-fit"
                    href={module.href}
                    size="sm"
                    variant="secondary"
                  >
                    Abrir
                  </ButtonLink>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ModulePage>
  );
}
