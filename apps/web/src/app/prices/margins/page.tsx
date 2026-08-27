import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
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
      description="Categorías de margen y su margen base."
      session={session}
      title="Márgenes"
    >
      <div className="grid gap-4">
        <PageHeader
          description="Editá el nombre, el margen base y el multiplicador final de cada categoría para cada lista. Solo se puede eliminar una categoría sin productos asociados."
          moduleIntro
          title="Márgenes"
        />

        {canEdit ? (
          <Card>
            <CardHeader>
              <CardTitle>Nueva categoría de margen</CardTitle>
              <CardDescription>Código, nombre y margen base (multiplicador sobre el costo).</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createMarginAction} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
                <Field htmlFor="margin-code" label="Código">
                  <Input id="margin-code" maxLength={40} name="code" placeholder="Ej: 1.10" required />
                </Field>
                <Field htmlFor="margin-name" label="Nombre">
                  <Input id="margin-name" maxLength={100} name="name" placeholder="Ej: Limpieza" required />
                </Field>
                <Field htmlFor="margin-base" label="Margen base">
                  <Input id="margin-base" inputMode="decimal" name="precio_1" placeholder="Ej: 1.45" required step="0.01" type="number" />
                </Field>
                <Button type="submit">Agregar</Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Card className="overflow-hidden">
          <DataTable
            caption="Categorías de margen"
            className="rounded-none border-0 shadow-none"
            minWidth="640px"
            tableLabel="Márgenes"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Código</DataTableHead>
                <DataTableHead>Categoría</DataTableHead>
                <DataTableHead align="right">Margen base y listas</DataTableHead>
                {canEdit ? <DataTableHead align="right">Acciones</DataTableHead> : null}
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {margins.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={canEdit ? 4 : 3}>
                    <EmptyState
                      description="Cuando cargues categorías de margen aparecerán acá."
                      title="No hay categorías de margen"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                margins.map((margin) => (
                  <DataTableRow key={margin.code}>
                    <DataTableCell className="whitespace-nowrap font-mono text-xs font-bold">{margin.code}</DataTableCell>
                    <DataTableCell>{margin.name}</DataTableCell>
                    {canEdit ? (
                      <DataTableCell colSpan={2}>
                        <form action={updateMarginAction} className="grid gap-3 lg:grid-cols-[minmax(160px,1fr)_repeat(3,minmax(100px,0.6fr))_auto] lg:items-end">
                          <input name="code" type="hidden" value={margin.code} />
                          <Field htmlFor={`name-${margin.code}`} label="Nombre">
                            <Input defaultValue={margin.name} id={`name-${margin.code}`} name="name" required />
                          </Field>
                          <Field htmlFor={`base-${margin.code}`} label="Base">
                          <Input
                            defaultValue={margin.price1}
                            id={`base-${margin.code}`}
                            inputMode="decimal"
                            name="precio_1"
                            step="0.01"
                            type="number"
                          />
                          </Field>
                          {margin.multipliers.map((list) => (
                            <Field htmlFor={`list-${margin.code}-${list.listId}`} key={list.listId} label={list.listName}>
                              <Input defaultValue={list.multiplier} id={`list-${margin.code}-${list.listId}`} min="0.01" name={`list_${list.listId}`} step="0.01" type="number" />
                            </Field>
                          ))}
                          <div className="flex gap-2">
                          <Button size="sm" type="submit" variant="secondary">
                            Guardar
                          </Button>
                          <Button formAction={deleteMarginAction} size="sm" type="submit" variant="danger">
                            Eliminar
                          </Button>
                          </div>
                        </form>
                      </DataTableCell>
                    ) : <DataTableCell align="right">{margin.price1.toFixed(2)}</DataTableCell>}
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
        </Card>
      </div>
    </ModulePage>
  );
}
