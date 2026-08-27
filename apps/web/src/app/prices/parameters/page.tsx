import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Select,
} from "@/components/ui";
import { listPriceListParameters, type PriceListParameters } from "@/lib/pricing";
import { isAdminRole, requireStaffSession } from "@/lib/auth";
import { sessionCanReadProducts } from "@/lib/route-auth";
import { savePriceListAction } from "@/app/prices/actions";

type ParametersPageProps = {
  searchParams: Promise<{ saved?: string }>;
};

const SELECTABLE_ROLES = ["administrador", "jefe", "deposito", "logistica", "operador", "vendedor"];

function ruleLabel(list: PriceListParameters, byId: Map<number, PriceListParameters>) {
  if (list.derivationType === "lista" && list.parentListId) {
    const parent = byId.get(list.parentListId);
    const sign = list.percentage >= 0 ? "+" : "";
    return `← ${parent?.name ?? "?"} ${sign}${list.percentage}%`;
  }
  const sign = list.percentage >= 0 ? "+" : "";
  return list.percentage ? `Costo (margen ${sign}${list.percentage}%)` : "Costo (margen por categoría)";
}

function PriceListForm({
  list,
  others,
}: {
  list: PriceListParameters | null;
  others: PriceListParameters[];
}) {
  const roles = list?.allowedRoles ?? [];
  return (
    <form action={savePriceListAction} className="grid gap-4">
      {list ? <input name="id" type="hidden" value={list.id} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field htmlFor={`name-${list?.id ?? "new"}`} label="Nombre de la lista" required>
          <Input defaultValue={list?.name ?? ""} id={`name-${list?.id ?? "new"}`} maxLength={50} name="name" required />
        </Field>
        <Field htmlFor={`deriv-${list?.id ?? "new"}`} label="Cómo calcula">
          <Select defaultValue={list?.derivationType ?? "costo"} id={`deriv-${list?.id ?? "new"}`} name="derivationType">
            <option value="costo">Sobre el costo (margen por categoría)</option>
            <option value="lista">Sobre otra lista</option>
          </Select>
        </Field>
        <Field
          htmlFor={`parent-${list?.id ?? "new"}`}
          label="Lista base (si deriva de otra)"
          description="Solo aplica si elegiste “Sobre otra lista”."
        >
          <Select defaultValue={list?.parentListId ? String(list.parentListId) : ""} id={`parent-${list?.id ?? "new"}`} name="parentListId">
            <option value="">—</option>
            {others.map((other) => (
              <option key={other.id} value={other.id}>
                {other.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field htmlFor={`pct-${list?.id ?? "new"}`} label="Porcentaje (%)" description="Sobre el margen base o sobre la lista base. Puede ser negativo.">
          <Input defaultValue={String(list?.percentage ?? 0)} id={`pct-${list?.id ?? "new"}`} inputMode="decimal" name="percentage" step="0.01" type="number" />
        </Field>
      </div>

      <fieldset className="grid gap-2 rounded-[10px] border border-[#d9e2ef] p-3">
        <legend className="erp-text-caption px-1 font-bold text-[#0f172a]">Acceso por rol</legend>
        <p className="erp-text-caption text-[#64748b]">Sin marcar ninguno = la ven todos los roles.</p>
        <div className="flex flex-wrap gap-3">
          {SELECTABLE_ROLES.map((role) => (
            <label className="flex items-center gap-1.5 text-sm" key={role}>
              <input defaultChecked={roles.includes(role)} name="roles" type="checkbox" value={role} />
              <span className="capitalize">{role}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field htmlFor={`blocked-${list?.id ?? "new"}`} label="Bloqueada hasta" description="Opcional. Se habilita automáticamente después de esta fecha.">
          <Input defaultValue={list?.blockedUntil ?? ""} id={`blocked-${list?.id ?? "new"}`} name="blockedUntil" type="date" />
        </Field>
        <Field htmlFor={`from-${list?.id ?? "new"}`} label="Vigencia desde (opcional)">
          <Input defaultValue={list?.validFrom ?? ""} id={`from-${list?.id ?? "new"}`} name="validFrom" type="date" />
        </Field>
        <Field htmlFor={`to-${list?.id ?? "new"}`} label="Vigencia hasta (opcional)">
          <Input defaultValue={list?.validTo ?? ""} id={`to-${list?.id ?? "new"}`} name="validTo" type="date" />
        </Field>
        <Field htmlFor={`floor-${list?.id ?? "new"}`} label="Piso (costo × factor)" description="Opcional. Ej: 1.05 = nunca por debajo de costo +5%.">
          <Input defaultValue={list?.floorFactor != null ? String(list.floorFactor) : ""} id={`floor-${list?.id ?? "new"}`} inputMode="decimal" name="floorFactor" step="0.01" type="number" />
        </Field>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <label className="flex items-center gap-1.5 text-sm">
            <input defaultChecked={list?.active ?? true} name="active" type="checkbox" />
            <span>Lista habilitada</span>
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input defaultChecked={list?.requiresAuthorization ?? false} name="requiresAuthorization" type="checkbox" />
            <span>Requiere autorización</span>
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input defaultChecked={list?.admitsOffers ?? true} name="admitsOffers" type="checkbox" />
            <span>Admite ofertas</span>
          </label>
        </div>
      </div>

      <div>
        <Button type="submit">{list ? "Guardar cambios" : "Crear lista"}</Button>
      </div>
    </form>
  );
}

export default async function PriceParametersPage({ searchParams }: ParametersPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanReadProducts(session))) redirect("/");
  if (!isAdminRole(session.role)) redirect("/prices");

  const params = await searchParams;
  const lists = await listPriceListParameters(session.companyId);
  const byId = new Map(lists.map((list) => [list.id, list]));

  return (
    <ModulePage
      active="prices"
      description="Definí cómo calcula cada lista, quién la usa y sus reglas."
      session={session}
      title="Parámetros de precios"
    >
      <div className="grid gap-4">
        <PageHeader
          description="Creá y configurá las listas: derivación (costo o sobre otra lista + %), acceso por rol y reglas de uso. Al guardar se recalculan los precios."
          moduleIntro
          title="Parámetros de precios"
        />

        {params.saved ? (
          <div className="rounded-[10px] border border-[#bbf7d0] bg-[#ecfdf5] px-4 py-3 text-sm font-semibold text-[#047857]">
            Lista guardada y precios recalculados.
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Nueva lista</CardTitle>
            <CardDescription>Creá una lista y definí bajo qué regla calcula sus precios.</CardDescription>
          </CardHeader>
          <CardContent>
            <PriceListForm list={null} others={lists} />
          </CardContent>
        </Card>

        <div className="grid gap-3">
          {lists.map((list) => (
            <Card className="overflow-hidden" key={list.id}>
              <details className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3">
                  <span aria-hidden="true" className="erp-text-caption w-3 shrink-0 text-center transition-transform group-open:rotate-90">&gt;</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-black">{list.name}</span>
                    {!list.active ? <span className="ml-2 text-xs font-bold text-[#dc2626]">(inactiva)</span> : null}
                    <span className="ml-2 text-xs text-[color:var(--muted)]">{ruleLabel(list, byId)}</span>
                  </span>
                  <span className="text-xs text-[color:var(--muted)]">
                    Roles: {list.allowedRoles.length ? list.allowedRoles.join(", ") : "todos"}
                    {list.requiresAuthorization ? " · requiere autorización" : ""}
                    {list.admitsOffers ? " · admite ofertas" : ""}
                  </span>
                </summary>
                <div className="border-t border-[color:var(--border)] p-4">
                  <PriceListForm list={list} others={lists.filter((other) => other.id !== list.id)} />
                </div>
              </details>
            </Card>
          ))}
        </div>
      </div>
    </ModulePage>
  );
}
