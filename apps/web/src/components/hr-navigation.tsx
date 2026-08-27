import { ButtonLink } from "@/components/ui";

type HrView = "employees" | "vendors" | "audit";

type HrNavigationProps = {
  active: HrView;
  canAudit?: boolean;
  canReadEmployees?: boolean;
};

export function HrNavigation({
  active,
  canAudit = false,
  canReadEmployees = true,
}: HrNavigationProps) {
  return (
    <nav aria-label="Secciones de Recursos Humanos" className="flex flex-wrap gap-2">
      {canReadEmployees ? (
        <>
          <ButtonLink href="/employees" size="sm" variant={active === "employees" ? "primary" : "secondary"}>
            Empleados
          </ButtonLink>
          <ButtonLink
            href="/employees/vendors"
            size="sm"
            variant={active === "vendors" ? "primary" : "secondary"}
          >
            Gestión de vendedores
          </ButtonLink>
        </>
      ) : null}
      {canAudit ? (
        <ButtonLink href="/admin/audit" size="sm" variant={active === "audit" ? "primary" : "secondary"}>
          Auditoría
        </ButtonLink>
      ) : null}
    </nav>
  );
}
