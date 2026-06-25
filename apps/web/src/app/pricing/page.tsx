import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import {
  Button,
  ButtonLink,
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
  Select,
  StatCard,
} from "@/components/ui";
import {
  createMarginAction,
  createPriceListAction,
  updateMultiplierAction,
  upsertRubricAction,
} from "@/app/pricing/actions";
import { listMargins, listPriceLists, listRubrics } from "@/lib/pricing";
import { requireStaffSession } from "@/lib/auth";
import { sessionCanReadProducts } from "@/lib/route-auth";

export default async function PricingPage() {
  const session = await requireStaffSession();
  if (!(await sessionCanReadProducts(session))) redirect("/");

  const [margins, priceLists, rubrics] = await Promise.all([
    listMargins(session.companyId),
    listPriceLists(session.companyId, true),
    listRubrics(session.companyId),
  ]);
  const activeLists = priceLists.filter((list) => list.active);

  return (
    <ModulePage
      active="pricing"
      description="Listas de precio, margenes, multiplicadores y rubros migrados a React."
      session={session}
      title="Precios y margenes"
    >
      <div className="grid gap-5">
        <PageHeader
          title="Precios y margenes"
          description="Gestion operativa de listas y categorias dentro de React."
          actions={
            <ButtonLink href="/api/pdfs/pricing/price-list?list=1" prefetch={false} size="sm" target="_blank">
              Lista PDF
            </ButtonLink>
          }
        />

        <div className="grid gap-3 md:grid-cols-3">
          <StatCard label="Categorias de margen" value={margins.length} />
          <StatCard label="Listas activas" value={activeLists.length} />
          <StatCard label="Rubros" value={rubrics.length} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Nuevo margen</CardTitle>
              <CardDescription>Alta rapida de categoria para productos nuevos.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createMarginAction} className="grid gap-3 md:grid-cols-2">
                <Field htmlFor="margin-code" label="Codigo">
                  <Input id="margin-code" name="code" placeholder="ABC" />
                </Field>
                <Field htmlFor="margin-name" label="Nombre">
                  <Input id="margin-name" name="name" placeholder="Categoria" />
                </Field>
                {["precio_0", "precio_1", "precio_2", "precio_3", "margen_minorista"].map((field) => (
                  <Field htmlFor={`margin-${field}`} key={field} label={field}>
                    <Input id={`margin-${field}`} name={field} defaultValue="1" inputMode="decimal" />
                  </Field>
                ))}
                <div className="md:col-span-2">
                  <Button type="submit">Crear margen</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Listas y rubros</CardTitle>
              <CardDescription>Configuracion base para precios y catalogo.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <form action={createPriceListAction} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <Field htmlFor="price-list-name" label="Nueva lista">
                  <Input id="price-list-name" name="name" placeholder="Mayorista" />
                </Field>
                <Button type="submit">Crear lista</Button>
              </form>

              <form action={upsertRubricAction} className="grid gap-3 md:grid-cols-[120px_1fr_auto] md:items-end">
                <Field htmlFor="rubric-code" label="Codigo rubro">
                  <Input id="rubric-code" name="code" placeholder="ABC" />
                </Field>
                <Field htmlFor="rubric-name" label="Nombre rubro">
                  <Input id="rubric-name" name="name" placeholder="Limpieza" />
                </Field>
                <Button type="submit" variant="secondary">
                  Guardar rubro
                </Button>
              </form>

              <form action={updateMultiplierAction} className="grid gap-3 md:grid-cols-3 md:items-end">
                <Field htmlFor="multiplier-code" label="Margen">
                  <Select id="multiplier-code" name="code">
                    {margins.map((margin) => (
                      <option key={margin.code} value={margin.code}>
                        {margin.code} - {margin.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field htmlFor="multiplier-list" label="Lista">
                  <Select id="multiplier-list" name="listId">
                    {activeLists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field htmlFor="multiplier-value" label="Multiplicador">
                  <Input id="multiplier-value" name="multiplier" defaultValue="1" inputMode="decimal" />
                </Field>
                <div className="md:col-span-3">
                  <Button type="submit">Actualizar multiplicador</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Margenes y multiplicadores configurados"
            className="rounded-none border-0 shadow-none"
            minWidth="880px"
            tableLabel="Margenes"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Codigo</DataTableHead>
                <DataTableHead>Nombre</DataTableHead>
                <DataTableHead align="right">P0</DataTableHead>
                <DataTableHead align="right">P1</DataTableHead>
                <DataTableHead align="right">P2</DataTableHead>
                <DataTableHead align="right">P3</DataTableHead>
                <DataTableHead align="right">Minorista</DataTableHead>
                <DataTableHead>Listas</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {margins.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={8}>
                    <EmptyState
                      title="No hay margenes cargados"
                      description="Crea una categoria de margen para empezar a cargar productos desde React."
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                margins.map((margin) => (
                  <DataTableRow key={margin.code}>
                    <DataTableCell className="whitespace-nowrap font-mono text-xs">{margin.code}</DataTableCell>
                    <DataTableCell className="font-medium">{margin.name}</DataTableCell>
                    <DataTableCell align="right">{margin.price0.toFixed(2)}</DataTableCell>
                    <DataTableCell align="right">{margin.price1.toFixed(2)}</DataTableCell>
                    <DataTableCell align="right">{margin.price2.toFixed(2)}</DataTableCell>
                    <DataTableCell align="right">{margin.price3.toFixed(2)}</DataTableCell>
                    <DataTableCell align="right">{margin.retailMargin.toFixed(2)}</DataTableCell>
                    <DataTableCell>
                      <div className="flex flex-wrap gap-1">
                        {margin.multipliers.length === 0
                          ? "-"
                          : margin.multipliers.map((item) => (
                              <span
                                className="rounded-[var(--radius-sm)] border border-[color:var(--border)] px-2 py-1 font-mono text-xs"
                                key={`${margin.code}-${item.listId}`}
                              >
                                L{item.listId}: {item.multiplier.toFixed(2)}
                              </span>
                            ))}
                      </div>
                    </DataTableCell>
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
