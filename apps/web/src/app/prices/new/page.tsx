import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "@/components/ui";
import { listMargins } from "@/lib/pricing";
import { requireStaffSession } from "@/lib/auth";
import { sessionAllows, PRODUCTS_CREATE_PERMISSION } from "@/lib/route-auth";
import { createPriceProductAction } from "@/app/prices/actions";
import { NewProductForm } from "@/app/prices/new-product-form";
import { listProductCategories } from "@/lib/catalog";

type NewProductPageProps = {
  searchParams: Promise<{ created?: string }>;
};

export default async function NewProductPage({ searchParams }: NewProductPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionAllows(session, [PRODUCTS_CREATE_PERMISSION]))) redirect("/prices");

  const params = await searchParams;
  const [margins, categories] = await Promise.all([
    listMargins(session.companyId),
    listProductCategories(session.companyId),
  ]);

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
            <NewProductForm
              action={createPriceProductAction}
              categories={categories}
              margins={margins.map((margin) => ({ code: margin.code, name: margin.name }))}
            />
          </CardContent>
        </Card>
      </div>
    </ModulePage>
  );
}
