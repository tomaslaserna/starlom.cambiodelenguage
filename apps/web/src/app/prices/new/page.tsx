import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import {
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Select,
} from "@/components/ui";
import { listMargins } from "@/lib/pricing";
import { requireStaffSession } from "@/lib/auth";
import { sessionAllows, PRODUCTS_CREATE_PERMISSION } from "@/lib/route-auth";
import { createPriceProductAction } from "@/app/prices/actions";

type NewProductPageProps = {
  searchParams: Promise<{ created?: string }>;
};

export default async function NewProductPage({ searchParams }: NewProductPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionAllows(session, [PRODUCTS_CREATE_PERMISSION]))) redirect("/prices");

  const params = await searchParams;
  const margins = await listMargins(session.companyId);

  return (
    <ModulePage
      active="prices"
      description="Alta de un producto nuevo con su categoría de precio y costo."
      session={session}
      title="Nuevo producto"
    >
      <div className="grid gap-4">
        <PageHeader description="Cargá un producto nuevo en el catálogo." moduleIntro title="Nuevo producto" />

        {params.created ? (
          <div className="rounded-[10px] border border-[#bbf7d0] bg-[#ecfdf5] px-4 py-3 text-sm font-semibold text-[#047857]">
            Producto creado correctamente. Podés cargar otro abajo.
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Datos del producto</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createPriceProductAction} className="grid gap-4 lg:grid-cols-2">
              <Field htmlFor="product-name" label="Nombre" required>
                <Input id="product-name" maxLength={255} name="name" required />
              </Field>
              <Field htmlFor="product-sku" label="Código / SKU" description="Debe ser único si se informa.">
                <Input id="product-sku" maxLength={80} name="sku" />
              </Field>
              <Field htmlFor="product-code" label="Categoría de precio" required>
                <Select id="product-code" name="code" required>
                  <option value="">Seleccionar categoría</option>
                  {margins.map((margin) => (
                    <option key={margin.code} value={margin.code}>
                      {margin.code} - {margin.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field htmlFor="product-cost" label="Costo" required>
                <Input id="product-cost" inputMode="decimal" name="cost" required step="0.01" type="number" />
              </Field>
              <Field className="lg:col-span-2" htmlFor="product-provider" label="Proveedor">
                <Input id="product-provider" maxLength={255} name="provider" />
              </Field>
              <div className="flex gap-2 lg:col-span-2">
                <Button type="submit">Crear producto</Button>
                <ButtonLink href="/prices" variant="outline">
                  Volver a la lista
                </ButtonLink>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </ModulePage>
  );
}
