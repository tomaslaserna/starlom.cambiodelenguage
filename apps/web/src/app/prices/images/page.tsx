import Link from "next/link";
import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { requireStaffSession } from "@/lib/auth";
import { withCompanyContext } from "@/lib/db";
import { VERIFIED_PRODUCT_IMAGE_SOURCES } from "@/lib/product-image-sources";
import { publicProductImageUrl } from "@/lib/storage";
import { PRODUCTS_CREATE_PERMISSION, sessionAllows } from "@/lib/route-auth";
import { ImportButtons } from "./import-buttons";

export const dynamic = "force-dynamic";

export default async function ProductImagesPage() {
  const session = await requireStaffSession();
  if (!(await sessionAllows(session, [PRODUCTS_CREATE_PERMISSION]))) redirect("/prices");

  const productIds = VERIFIED_PRODUCT_IMAGE_SOURCES.map((source) => source.productId);
  const products = await withCompanyContext(session.companyId, async (client) => {
    const result = await client.query<{ id: string; name: string; image_path: string | null }>(
      "SELECT id, name, image_path FROM products WHERE empresa_id = $1 AND id = ANY($2::uuid[])",
      [session.companyId, productIds],
    );
    return result.rows;
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  const rows = VERIFIED_PRODUCT_IMAGE_SOURCES.map((source) => ({
    ...source,
    product: byId.get(source.productId) ?? null,
  }));

  return (
    <ModulePage
      active="prices"
      description="Importación controlada de fotografías oficiales verificadas."
      session={session}
      title="Imágenes de productos"
    >
      <div className="grid gap-5">
        <div className="flex flex-col gap-3 rounded-2xl border border-[#dbe5f2] bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link className="text-sm font-bold text-[#145bd7] hover:underline" href="/prices">
              ← Volver a precios
            </Link>
            <h1 className="mt-2 text-2xl font-black text-[#10213d]">Fotografías verificadas</h1>
            <p className="mt-1 max-w-3xl text-sm text-[#64748b]">
              Esta pantalla solo usa fuentes oficiales previamente revisadas. Nunca reemplaza una foto ya cargada y cada producto se valida por marca, variedad y presentación.
            </p>
          </div>
          <ImportButtons
            sources={rows.map((row) => ({
              productId: row.productId,
              productName: row.productName,
              existing: Boolean(row.product?.image_path),
            }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const imageUrl = row.product?.image_path
              ? publicProductImageUrl(row.product.image_path)
              : row.sourceUrl;
            return (
              <article className="overflow-hidden rounded-2xl border border-[#dbe5f2] bg-white shadow-sm" key={row.productId}>
                <div className="flex h-56 items-center justify-center bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={row.productName} className="h-full w-full object-contain" src={imageUrl} />
                </div>
                <div className="border-t border-[#edf2f7] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-black uppercase tracking-wide text-[#145bd7]">{row.brand}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.product?.image_path ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#fff7dd] text-[#9a6700]"}`}>
                      {row.product?.image_path ? "Cargada" : "Lista para cargar"}
                    </span>
                  </div>
                  <h2 className="mt-2 text-sm font-extrabold leading-snug text-[#10213d]">{row.product?.name ?? row.productName}</h2>
                  <a className="mt-3 inline-block text-xs font-bold text-[#64748b] hover:text-[#145bd7] hover:underline" href={row.sourcePage} rel="noreferrer" target="_blank">
                    Ver fuente oficial ↗
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </ModulePage>
  );
}
