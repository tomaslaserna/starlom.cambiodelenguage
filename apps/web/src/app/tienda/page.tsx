import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { listStorefrontProducts } from "@/lib/catalog";
import { Storefront } from "./storefront";

export const metadata: Metadata = { title: "Tienda | Starlim", description: "Armá tu pedido de productos Starlim. Un comercial te enviará la cotización." };
export const dynamic = "force-dynamic";

export default async function StorePage() {
  const products = (await listStorefrontProducts(1))
    .map(({ id, name, code, category, supplier, imageUrl }) => ({ id, name, code, category, brand: supplier, imageUrl }));
  return <main className="min-h-screen bg-[#f4f8fc] text-[#172033]">
    <header className="sticky top-0 z-30 border-b border-[#dbe5f1] bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:px-8"><div className="mx-auto flex max-w-[1380px] items-center justify-between gap-4"><Link href="/login"><Image alt="Starlim" className="h-auto w-[145px]" height={66} priority src="/starlim-logo.png" width={145} /></Link><Link className="rounded-[10px] border border-[#cbd8e8] px-4 py-2 text-sm font-bold text-[#315170] hover:bg-[#f4f8fc]" href="/login">Volver</Link></div></header>
    <section className="relative isolate overflow-hidden bg-[linear-gradient(115deg,#063779,#075ac7)] px-5 py-10 text-white sm:px-8 sm:py-14">
      <Image alt="" aria-hidden="true" className="storefront-brand-float pointer-events-none absolute h-auto select-none" height={855} priority src="/starlim-brand-variations.png" width={848} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(4,48,111,0.94)_0%,rgba(5,68,148,0.72)_52%,rgba(7,90,199,0.2)_100%)]" />
      <div className="relative z-10 mx-auto max-w-[1380px]"><span className="text-xs font-bold uppercase tracking-[0.12em] text-[#b8d8ff]">Tienda Starlim</span><h1 className="mt-3 max-w-3xl text-[clamp(2rem,5vw,4rem)] font-extrabold leading-tight tracking-[-0.045em]">Elegí los productos. Nosotros armamos tu cotización.</h1><p className="mt-4 max-w-2xl text-base font-medium leading-7 text-white/80">El catálogo no muestra precios. Indicá las cantidades y un comercial se contactará para preparar la mejor propuesta.</p></div>
    </section>
    <Storefront products={products} />
  </main>;
}
