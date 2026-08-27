import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { Button, ButtonLink, Card, CardContent, CardHeader, CardTitle, Field, Input, Select } from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { sessionAllows } from "@/lib/route-auth";
import { getProduct } from "@/lib/catalog-management";
import { listMargins } from "@/lib/pricing";
import { uuidParam } from "@/lib/request-body";
import { updatePriceProductAction } from "@/app/prices/actions";

type EditProductPageProps = { params: Promise<{ id: string }> };

export default async function EditProductPage({ params }: EditProductPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionAllows(session, [{ resource: "productos", action: "editar" }]))) redirect("/prices");
  const { id } = await params;
  const productId = uuidParam(id, "Producto");
  const [product, margins] = await Promise.all([
    getProduct(session.companyId, productId),
    listMargins(session.companyId),
  ]);

  return (
    <ModulePage active="prices" description="Modificá los datos comerciales del artículo sin alterar su stock." session={session} title="Editar producto">
      <Card>
        <CardHeader><CardTitle>{product.name}</CardTitle></CardHeader>
        <CardContent>
          <form action={updatePriceProductAction} className="grid gap-4 md:grid-cols-2">
            <input name="productId" type="hidden" value={product.id} />
            <Field htmlFor="edit-product-name" label="Nombre" required>
              <Input defaultValue={product.name} id="edit-product-name" maxLength={255} name="name" required />
            </Field>
            <Field htmlFor="edit-product-cost" label="Costo" required>
              <Input defaultValue={product.cost} id="edit-product-cost" min="0" name="cost" required step="0.01" type="number" />
            </Field>
            <Field htmlFor="edit-product-rule" label="Categoría y margen" description="Si cambiás la categoría se asignará un SKU nuevo y se conservará el anterior." required>
              <Select defaultValue={product.code} id="edit-product-rule" name="code" required>
                {margins.map((margin) => <option key={margin.code} value={margin.code}>{margin.name} ({margin.code})</option>)}
              </Select>
            </Field>
            <Field htmlFor="edit-product-presentation" label="Presentación" description="Cantidad de unidades por paquete o bulto.">
              <Input defaultValue={product.presentationUnits} id="edit-product-presentation" max="9999" min="1" name="presentationUnits" required step="1" type="number" />
            </Field>
            <Field htmlFor="edit-product-justification" label="Motivo del cambio" required>
              <Input id="edit-product-justification" maxLength={300} name="justification" placeholder="Ej.: actualización de costo del proveedor" required />
            </Field>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit">Guardar cambios</Button>
              <ButtonLink href="/prices" variant="outline">Cancelar</ButtonLink>
            </div>
          </form>
        </CardContent>
      </Card>
    </ModulePage>
  );
}
