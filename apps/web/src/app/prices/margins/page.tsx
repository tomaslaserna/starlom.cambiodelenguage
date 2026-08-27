import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  PageHeader,
} from "@/components/ui";
import { listMargins } from "@/lib/pricing";
import { isAdminRole, requireStaffSession } from "@/lib/auth";
import { sessionCanReadProducts } from "@/lib/route-auth";
import { createMarginAction, deleteMarginAction, updateMarginAction } from "@/app/prices/actions";

export const dynamic = "force-dynamic";

export default async function MarginsPage() {
  const session = await requireStaffSession();
  if (!(await sessionCanReadProducts(session))) redirect("/");

  const margins = await listMargins(session.companyId);
  const canEdit = isAdminRole(session.role);

  return (
    <ModulePage
      active="prices"
      description="Margen ideal de Lista 2 y variaciones derivadas."
      session={session}
      title="Márgenes"
    >
      <div className="grid gap-4">
        <PageHeader
          description="Definí el multiplicador ideal sobre costo para Lista 2 (ANCLA). Las demás listas se calculan automáticamente como variaciones porcentuales del ancla."
          moduleIntro
          title="Márgenes"
        />

        {canEdit ? (
          <Card>
            <CardHeader>
              <CardTitle>Nueva categoría de margen</CardTitle>
              <CardDescription>Código, nombre y multiplicador ideal de Lista 2 sobre el costo.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createMarginAction} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
                <Field htmlFor="margin-code" label="Código">
                  <Input id="margin-code" maxLength={40} name="code" placeholder="Ej: 1.10" required />
                </Field>
                <Field htmlFor="margin-name" label="Nombre">
                  <Input id="margin-name" maxLength={100} name="name" placeholder="Ej: Limpieza" required />
                </Field>
                <Field htmlFor="margin-base" label="Multiplicador ancla">
                  <Input id="margin-base" inputMode="decimal" name="precio_1" placeholder="Ej: 1.45" required step="0.01" type="number" />
                </Field>
                <Button type="submit">Agregar</Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {margins.length === 0 ? (
          <Card><CardContent><EmptyState description="Cuando cargues categorías de margen aparecerán acá." title="No hay categorías de margen" /></CardContent></Card>
        ) : (
          <div className="grid gap-4">
            {margins.map((margin) => (
              <Card key={margin.code}>
                <CardHeader>
                  <CardTitle>{margin.name}</CardTitle>
                  <CardDescription>Código de categoría y SKU: {margin.code} · Lista 2 es la referencia ideal</CardDescription>
                </CardHeader>
                <CardContent>
                  {canEdit ? (
                    <form action={updateMarginAction} className="grid gap-4">
                      <input name="code" type="hidden" value={margin.code} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field htmlFor={`name-${margin.code}`} label="Nombre">
                          <Input defaultValue={margin.name} id={`name-${margin.code}`} name="name" required />
                        </Field>
                        <Field htmlFor={`base-${margin.code}`} label="Lista 2 · multiplicador ideal" description={`Equivale a ${((1 - 1 / margin.price1) * 100).toFixed(1)}% de margen sobre la venta.`}>
                          <Input defaultValue={margin.price1} id={`base-${margin.code}`} min="1" name="precio_1" step="0.01" type="number" />
                        </Field>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                        {margin.multipliers.map((list) => {
                          const variation = margin.price1 > 0 ? (list.multiplier / margin.price1 - 1) * 100 : 0;
                          return (
                            <div className={`rounded-[10px] border p-3 ${list.listName.includes("ANCLA") ? "border-[#2563eb] bg-[#eff6ff]" : "border-[#e2e8f0] bg-[#f8fafc]"}`} key={list.listId}>
                              <div className="text-xs font-bold text-[#64748b]">{list.listName}</div>
                              <div className="mt-1 text-lg font-black">× {list.multiplier.toFixed(2)}</div>
                              <div className="text-xs text-[#64748b]">{variation === 0 ? "ANCLA" : `${variation > 0 ? "+" : ""}${variation.toFixed(0)}% sobre ancla`}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit">Guardar cambios</Button>
                        <Button formAction={deleteMarginAction} type="submit" variant="danger">Eliminar categoría</Button>
                      </div>
                    </form>
                  ) : <p className="text-sm">Margen base: {margin.price1.toFixed(2)}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ModulePage>
  );
}
