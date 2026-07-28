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
import { createMarginAction, updateMarginAction } from "@/app/prices/actions";

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
          description="Cada categoría tiene un margen base que multiplica el costo. Las diferencias por lista se configuran en Parámetros."
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
              <form action={createMarginAction} className="grid gap-3 sm:grid-cols-[160px_minmax(200px,1fr)_160px_auto] sm:items-end">
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
                <DataTableHead align="right">Margen base</DataTableHead>
                {canEdit ? <DataTableHead align="right">Modificar</DataTableHead> : null}
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
                    <DataTableCell>
                      <div className="max-w-[280px] break-words font-medium">{margin.name}</div>
                    </DataTableCell>
                    <DataTableCell align="right" className="whitespace-nowrap font-mono text-sm font-bold">
                      {margin.price1.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </DataTableCell>
                    {canEdit ? (
                      <DataTableCell align="right">
                        <form action={updateMarginAction} className="flex items-center justify-end gap-2">
                          <input name="code" type="hidden" value={margin.code} />
                          <Input
                            aria-label={`Nuevo margen base para ${margin.name}`}
                            className="w-24 text-right"
                            defaultValue={margin.price1}
                            inputMode="decimal"
                            name="precio_1"
                            step="0.01"
                            type="number"
                          />
                          <Button size="sm" type="submit" variant="secondary">
                            Guardar
                          </Button>
                        </form>
                      </DataTableCell>
                    ) : null}
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
